"""
Follow-Up Router
Post-job follow-up calls and review solicitation endpoints
"""

import logging
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field
from enum import Enum

from app.database import get_database
from app.models.user import User
from app.models.common import generate_id
from app.middleware.auth import BusinessContext, get_business_context, get_current_user
from app.services.followup_service import (
    get_followup_service, FollowUpStatus, FollowUpType
)
from app.services.call_service import get_call_service
from app.services.ai_service import get_ai_service
from app.services.sms_service import get_sms_service
from app.schemas.common import SingleResponse, PaginatedResponse, MessageResponse, create_pagination_meta
from app.tasks.followup_tasks import handle_followup_call_complete

router = APIRouter()
logger = logging.getLogger(__name__)


class FollowUpCreate(BaseModel):
    """Create a new follow-up"""
    job_id: str
    client_id: str
    followup_type: FollowUpType = FollowUpType.SATISFACTION
    scheduled_for: Optional[datetime] = None
    delay_hours: Optional[int] = None
    notes: Optional[str] = None


class FollowUpUpdate(BaseModel):
    """Update a follow-up"""
    status: Optional[FollowUpStatus] = None
    scheduled_for: Optional[datetime] = None
    notes: Optional[str] = None
    sentiment: Optional[str] = None
    concerns: Optional[List[str]] = None
    transcript: Optional[str] = None


class FollowUpResponse(BaseModel):
    """Follow-up response"""
    followup_id: str
    business_id: str
    job_id: str
    client_id: str
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    followup_type: str
    status: str
    scheduled_for: datetime
    completed_at: Optional[datetime] = None
    call_id: Optional[str] = None
    sentiment: Optional[str] = None
    satisfied: Optional[bool] = None
    concerns: List[str] = []
    notes: Optional[str] = None
    created_at: datetime


class FollowUpScriptResponse(BaseModel):
    """Follow-up script response"""
    greeting: str
    satisfaction_question: str
    positive_response: str
    negative_response: str
    review_request: str
    closing: str


class ReviewRequestResponse(BaseModel):
    """Review request response"""
    message: str
    review_url: Optional[str] = None


class FollowUpStats(BaseModel):
    """Follow-up statistics"""
    total_scheduled: int
    completed: int
    positive: int
    negative: int
    no_answer: int
    satisfaction_rate: float
    avg_response_rate: float


@router.post(
    "",
    response_model=SingleResponse[FollowUpResponse],
    summary="Schedule a follow-up"
)
async def create_followup(
    request: FollowUpCreate,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Schedule a follow-up call for a completed job.

    Provide either scheduled_for datetime or delay_hours (default 24).
    """
    # Get job info
    job = await db.hvac_quotes.find_one({
        "quote_id": request.job_id,
        "business_id": ctx.business_id
    })

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "JOB_NOT_FOUND", "message": "Job not found"}
        )

    # Get client info
    client = await db.clients.find_one({
        "client_id": request.client_id,
        "business_id": ctx.business_id
    })

    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CLIENT_NOT_FOUND", "message": "Client not found"}
        )

    # Calculate scheduled time
    service = get_followup_service()

    if request.scheduled_for:
        scheduled_for = request.scheduled_for
    else:
        completed_at = job.get("completed_at", datetime.utcnow())
        scheduled_for = service.calculate_followup_time(
            completed_at=completed_at,
            delay_hours=request.delay_hours,
            followup_type=request.followup_type
        )

    # Create follow-up record
    followup = {
        "followup_id": generate_id("fup"),
        "business_id": ctx.business_id,
        "job_id": request.job_id,
        "client_id": request.client_id,
        "client_name": f"{client.get('first_name', '')} {client.get('last_name', '')}".strip(),
        "client_phone": client.get("phone"),
        "followup_type": request.followup_type.value,
        "status": FollowUpStatus.SCHEDULED.value,
        "scheduled_for": scheduled_for,
        "notes": request.notes,
        "concerns": [],
        "created_by": current_user.user_id,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }

    await db.followups.insert_one(followup)

    logger.info(f"Follow-up {followup['followup_id']} scheduled for {scheduled_for}")

    return SingleResponse(data=FollowUpResponse(
        followup_id=followup["followup_id"],
        business_id=followup["business_id"],
        job_id=followup["job_id"],
        client_id=followup["client_id"],
        client_name=followup["client_name"],
        client_phone=followup["client_phone"],
        followup_type=followup["followup_type"],
        status=followup["status"],
        scheduled_for=followup["scheduled_for"],
        concerns=followup["concerns"],
        notes=followup.get("notes"),
        created_at=followup["created_at"]
    ))


@router.get(
    "",
    response_model=PaginatedResponse[FollowUpResponse],
    summary="List follow-ups"
)
async def list_followups(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status_filter: Optional[FollowUpStatus] = Query(None, alias="status"),
    followup_type: Optional[FollowUpType] = None,
    scheduled_after: Optional[datetime] = None,
    scheduled_before: Optional[datetime] = None,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """List follow-ups for the business"""
    query = {"business_id": ctx.business_id}

    if status_filter:
        query["status"] = status_filter.value
    if followup_type:
        query["followup_type"] = followup_type.value
    if scheduled_after:
        query["scheduled_for"] = {"$gte": scheduled_after}
    if scheduled_before:
        if "scheduled_for" in query:
            query["scheduled_for"]["$lte"] = scheduled_before
        else:
            query["scheduled_for"] = {"$lte": scheduled_before}

    total = await db.followups.count_documents(query)

    followups = await db.followups.find(query).sort(
        "scheduled_for", 1
    ).skip((page - 1) * per_page).limit(per_page).to_list(length=per_page)

    meta = create_pagination_meta(total, page, per_page)

    return PaginatedResponse(
        data=[
            FollowUpResponse(
                followup_id=f["followup_id"],
                business_id=f["business_id"],
                job_id=f["job_id"],
                client_id=f["client_id"],
                client_name=f.get("client_name"),
                client_phone=f.get("client_phone"),
                followup_type=f["followup_type"],
                status=f["status"],
                scheduled_for=f["scheduled_for"],
                completed_at=f.get("completed_at"),
                call_id=f.get("call_id"),
                sentiment=f.get("sentiment"),
                satisfied=f.get("satisfied"),
                concerns=f.get("concerns", []),
                notes=f.get("notes"),
                created_at=f["created_at"]
            )
            for f in followups
        ],
        meta=meta
    )


@router.get(
    "/pending",
    summary="Get pending follow-ups"
)
async def get_pending_followups(
    limit: int = Query(50, le=100),
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get follow-ups that are due to be made"""
    now = datetime.utcnow()

    followups = await db.followups.find({
        "business_id": ctx.business_id,
        "status": FollowUpStatus.SCHEDULED.value,
        "scheduled_for": {"$lte": now}
    }).sort("scheduled_for", 1).limit(limit).to_list(length=limit)

    return {
        "data": [
            {
                "followup_id": f["followup_id"],
                "job_id": f["job_id"],
                "client_id": f["client_id"],
                "client_name": f.get("client_name"),
                "client_phone": f.get("client_phone"),
                "followup_type": f["followup_type"],
                "scheduled_for": f["scheduled_for"],
                "overdue_hours": (now - f["scheduled_for"]).total_seconds() / 3600
            }
            for f in followups
        ],
        "count": len(followups)
    }


@router.get(
    "/{followup_id}",
    response_model=SingleResponse[FollowUpResponse],
    summary="Get follow-up by ID"
)
async def get_followup(
    followup_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get a specific follow-up"""
    followup = await db.followups.find_one({
        "followup_id": followup_id,
        "business_id": ctx.business_id
    })

    if not followup:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "FOLLOWUP_NOT_FOUND", "message": "Follow-up not found"}
        )

    return SingleResponse(data=FollowUpResponse(
        followup_id=followup["followup_id"],
        business_id=followup["business_id"],
        job_id=followup["job_id"],
        client_id=followup["client_id"],
        client_name=followup.get("client_name"),
        client_phone=followup.get("client_phone"),
        followup_type=followup["followup_type"],
        status=followup["status"],
        scheduled_for=followup["scheduled_for"],
        completed_at=followup.get("completed_at"),
        call_id=followup.get("call_id"),
        sentiment=followup.get("sentiment"),
        satisfied=followup.get("satisfied"),
        concerns=followup.get("concerns", []),
        notes=followup.get("notes"),
        created_at=followup["created_at"]
    ))


@router.put(
    "/{followup_id}",
    response_model=SingleResponse[FollowUpResponse],
    summary="Update a follow-up"
)
async def update_followup(
    followup_id: str,
    update: FollowUpUpdate,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Update a follow-up record"""
    followup = await db.followups.find_one({
        "followup_id": followup_id,
        "business_id": ctx.business_id
    })

    if not followup:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "FOLLOWUP_NOT_FOUND", "message": "Follow-up not found"}
        )

    update_data = {"updated_at": datetime.utcnow()}

    if update.status is not None:
        update_data["status"] = update.status.value
        if update.status in [FollowUpStatus.COMPLETED, FollowUpStatus.POSITIVE, FollowUpStatus.NEGATIVE]:
            update_data["completed_at"] = datetime.utcnow()

    if update.scheduled_for is not None:
        update_data["scheduled_for"] = update.scheduled_for
    if update.notes is not None:
        update_data["notes"] = update.notes
    if update.sentiment is not None:
        update_data["sentiment"] = update.sentiment
    if update.concerns is not None:
        update_data["concerns"] = update.concerns
    if update.transcript is not None:
        update_data["transcript"] = update.transcript

    await db.followups.update_one(
        {"followup_id": followup_id},
        {"$set": update_data}
    )

    updated = await db.followups.find_one({"followup_id": followup_id})

    return SingleResponse(data=FollowUpResponse(
        followup_id=updated["followup_id"],
        business_id=updated["business_id"],
        job_id=updated["job_id"],
        client_id=updated["client_id"],
        client_name=updated.get("client_name"),
        client_phone=updated.get("client_phone"),
        followup_type=updated["followup_type"],
        status=updated["status"],
        scheduled_for=updated["scheduled_for"],
        completed_at=updated.get("completed_at"),
        call_id=updated.get("call_id"),
        sentiment=updated.get("sentiment"),
        satisfied=updated.get("satisfied"),
        concerns=updated.get("concerns", []),
        notes=updated.get("notes"),
        created_at=updated["created_at"]
    ))


@router.post(
    "/{followup_id}/complete",
    response_model=SingleResponse[FollowUpResponse],
    summary="Mark follow-up as completed"
)
async def complete_followup(
    followup_id: str,
    outcome: str = Query(..., regex="^(positive|negative|no_answer)$"),
    notes: Optional[str] = None,
    concerns: Optional[List[str]] = None,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Mark a follow-up as completed with outcome.

    Args:
        outcome: positive, negative, or no_answer
        notes: Optional notes about the call
        concerns: List of concerns raised (if any)
    """
    followup = await db.followups.find_one({
        "followup_id": followup_id,
        "business_id": ctx.business_id
    })

    if not followup:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "FOLLOWUP_NOT_FOUND", "message": "Follow-up not found"}
        )

    # Map outcome to status
    status_map = {
        "positive": FollowUpStatus.POSITIVE,
        "negative": FollowUpStatus.NEGATIVE,
        "no_answer": FollowUpStatus.NO_ANSWER
    }

    update_data = {
        "status": status_map[outcome].value,
        "completed_at": datetime.utcnow(),
        "completed_by": current_user.user_id,
        "sentiment": outcome,
        "satisfied": outcome == "positive",
        "updated_at": datetime.utcnow()
    }

    if notes:
        update_data["notes"] = notes
    if concerns:
        update_data["concerns"] = concerns

    await db.followups.update_one(
        {"followup_id": followup_id},
        {"$set": update_data}
    )

    updated = await db.followups.find_one({"followup_id": followup_id})

    return SingleResponse(data=FollowUpResponse(
        followup_id=updated["followup_id"],
        business_id=updated["business_id"],
        job_id=updated["job_id"],
        client_id=updated["client_id"],
        client_name=updated.get("client_name"),
        client_phone=updated.get("client_phone"),
        followup_type=updated["followup_type"],
        status=updated["status"],
        scheduled_for=updated["scheduled_for"],
        completed_at=updated.get("completed_at"),
        call_id=updated.get("call_id"),
        sentiment=updated.get("sentiment"),
        satisfied=updated.get("satisfied"),
        concerns=updated.get("concerns", []),
        notes=updated.get("notes"),
        created_at=updated["created_at"]
    ))


@router.delete(
    "/{followup_id}",
    response_model=MessageResponse,
    summary="Cancel a follow-up"
)
async def cancel_followup(
    followup_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Cancel a scheduled follow-up"""
    result = await db.followups.update_one(
        {
            "followup_id": followup_id,
            "business_id": ctx.business_id,
            "status": FollowUpStatus.SCHEDULED.value
        },
        {
            "$set": {
                "status": FollowUpStatus.CANCELLED.value,
                "cancelled_by": current_user.user_id,
                "cancelled_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
        }
    )

    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "FOLLOWUP_NOT_FOUND", "message": "Follow-up not found or already completed"}
        )

    return MessageResponse(message="Follow-up cancelled")


@router.post(
    "/{followup_id}/script",
    response_model=SingleResponse[FollowUpScriptResponse],
    summary="Generate follow-up call script"
)
async def generate_script(
    followup_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Generate a personalized call script for a follow-up"""
    followup = await db.followups.find_one({
        "followup_id": followup_id,
        "business_id": ctx.business_id
    })

    if not followup:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "FOLLOWUP_NOT_FOUND", "message": "Follow-up not found"}
        )

    # Get job details
    job = await db.hvac_quotes.find_one({"quote_id": followup["job_id"]})
    service_type = job.get("service_type", "HVAC service") if job else "HVAC service"

    # Get tech name
    tech_name = "our technician"
    if job and job.get("assigned_tech_id"):
        tech = await db.users.find_one({"user_id": job["assigned_tech_id"]})
        if tech:
            tech_name = f"{tech.get('first_name', '')} {tech.get('last_name', '')}".strip() or "our technician"

    # Get business name
    business = await db.businesses.find_one({"business_id": ctx.business_id})
    business_name = business.get("name", "our company") if business else "our company"

    service = get_followup_service()

    script = await service.generate_followup_script(
        customer_name=followup.get("client_name", "valued customer"),
        service_type=service_type,
        tech_name=tech_name,
        business_name=business_name,
        followup_type=FollowUpType(followup["followup_type"])
    )

    return SingleResponse(data=FollowUpScriptResponse(
        greeting=script.greeting,
        satisfaction_question=script.satisfaction_question,
        positive_response=script.positive_response,
        negative_response=script.negative_response,
        review_request=script.review_request,
        closing=script.closing
    ))


@router.post(
    "/review-request",
    response_model=SingleResponse[ReviewRequestResponse],
    summary="Generate review request message"
)
async def generate_review_request(
    client_id: str,
    job_id: str,
    review_url: Optional[str] = None,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Generate a personalized review request message"""
    # Get client
    client = await db.clients.find_one({
        "client_id": client_id,
        "business_id": ctx.business_id
    })

    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CLIENT_NOT_FOUND", "message": "Client not found"}
        )

    # Get job
    job = await db.hvac_quotes.find_one({
        "quote_id": job_id,
        "business_id": ctx.business_id
    })

    service_type = job.get("service_type", "service") if job else "service"

    # Get business
    business = await db.businesses.find_one({"business_id": ctx.business_id})
    business_name = business.get("name", "our company") if business else "our company"

    # Use business review URL if not provided
    if not review_url and business:
        review_url = business.get("review_url") or business.get("google_review_url")

    service = get_followup_service()

    message = await service.generate_review_request_message(
        customer_name=f"{client.get('first_name', '')}".strip() or "valued customer",
        service_type=service_type,
        business_name=business_name,
        review_url=review_url
    )

    return SingleResponse(data=ReviewRequestResponse(
        message=message,
        review_url=review_url
    ))


class SendReviewSMSRequest(BaseModel):
    """Request to send review SMS"""
    client_id: str
    job_id: str
    message: Optional[str] = None
    review_url: Optional[str] = None


class SendReviewSMSResponse(BaseModel):
    """Response from sending review SMS"""
    sent: bool
    message_id: Optional[str] = None
    error: Optional[str] = None


@router.post(
    "/send-review-sms",
    response_model=SingleResponse[SendReviewSMSResponse],
    summary="Send review request SMS"
)
async def send_review_sms(
    request: SendReviewSMSRequest,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Send a review request SMS to a client.

    If no message is provided, one will be generated automatically.
    """
    # Get client
    client = await db.clients.find_one({
        "client_id": request.client_id,
        "business_id": ctx.business_id
    })

    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CLIENT_NOT_FOUND", "message": "Client not found"}
        )

    if not client.get("phone"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "NO_PHONE", "message": "Client has no phone number"}
        )

    # Check SMS opt-out
    if client.get("sms_opt_out"):
        return SingleResponse(data=SendReviewSMSResponse(
            sent=False,
            error="Client has opted out of SMS"
        ))

    # Get or generate message
    if request.message:
        message = request.message
    else:
        # Get job for service type
        job = await db.hvac_quotes.find_one({
            "quote_id": request.job_id,
            "business_id": ctx.business_id
        })
        service_type = job.get("service_type", "service") if job else "service"

        # Get business
        business = await db.businesses.find_one({"business_id": ctx.business_id})
        business_name = business.get("name", "our company") if business else "our company"

        # Use provided review URL or business default
        review_url = request.review_url
        if not review_url and business:
            review_url = business.get("review_url") or business.get("google_review_url")

        # Generate message
        service = get_followup_service()
        message = await service.generate_review_request_message(
            customer_name=f"{client.get('first_name', '')}".strip() or "valued customer",
            service_type=service_type,
            business_name=business_name,
            review_url=review_url
        )

    # Send SMS
    sms_service = get_sms_service(db)
    result = await sms_service.send_sms(
        to_number=client["phone"],
        message=message
    )

    if result.success:
        # Log the review request
        await db.review_requests.insert_one({
            "request_id": generate_id("rev"),
            "business_id": ctx.business_id,
            "client_id": request.client_id,
            "job_id": request.job_id,
            "message_id": result.message_id,
            "message": message,
            "sent_by": current_user.user_id,
            "created_at": datetime.utcnow()
        })

        logger.info(f"Review SMS sent to {client['phone']}")

        return SingleResponse(data=SendReviewSMSResponse(
            sent=True,
            message_id=result.message_id
        ))
    else:
        return SingleResponse(data=SendReviewSMSResponse(
            sent=False,
            error=result.error
        ))


@router.post(
    "/{followup_id}/send-review-sms",
    response_model=SingleResponse[SendReviewSMSResponse],
    summary="Send review SMS for follow-up"
)
async def send_followup_review_sms(
    followup_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Send a review request SMS for a completed positive follow-up.
    """
    followup = await db.followups.find_one({
        "followup_id": followup_id,
        "business_id": ctx.business_id
    })

    if not followup:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "FOLLOWUP_NOT_FOUND", "message": "Follow-up not found"}
        )

    if followup.get("review_request_sent"):
        return SingleResponse(data=SendReviewSMSResponse(
            sent=False,
            error="Review request already sent for this follow-up"
        ))

    if not followup.get("client_phone"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "NO_PHONE", "message": "No phone number for follow-up"}
        )

    # Get business for review URL
    business = await db.businesses.find_one({"business_id": ctx.business_id})
    review_url = business.get("google_review_url") if business else None
    business_name = business.get("name", "our company") if business else "our company"

    # Get job for service type
    job = await db.hvac_quotes.find_one({"quote_id": followup.get("job_id")})
    service_type = job.get("service_type", "service") if job else "service"

    # Generate message
    service = get_followup_service()
    message = await service.generate_review_request_message(
        customer_name=followup.get("client_name", "valued customer"),
        service_type=service_type,
        business_name=business_name,
        review_url=review_url
    )

    # Send SMS
    sms_service = get_sms_service(db)
    result = await sms_service.send_sms(
        to_number=followup["client_phone"],
        message=message
    )

    if result.success:
        # Update follow-up
        await db.followups.update_one(
            {"followup_id": followup_id},
            {"$set": {
                "review_request_sent": True,
                "review_request_sent_at": datetime.utcnow(),
                "review_request_message_id": result.message_id,
                "updated_at": datetime.utcnow()
            }}
        )

        logger.info(f"Review SMS sent for follow-up {followup_id}")

        return SingleResponse(data=SendReviewSMSResponse(
            sent=True,
            message_id=result.message_id
        ))
    else:
        return SingleResponse(data=SendReviewSMSResponse(
            sent=False,
            error=result.error
        ))


@router.get(
    "/stats/summary",
    response_model=SingleResponse[FollowUpStats],
    summary="Get follow-up statistics"
)
async def get_followup_stats(
    days: int = Query(30, ge=1, le=365),
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get follow-up statistics for the business"""
    since = datetime.utcnow() - timedelta(days=days)

    pipeline = [
        {
            "$match": {
                "business_id": ctx.business_id,
                "created_at": {"$gte": since}
            }
        },
        {
            "$group": {
                "_id": "$status",
                "count": {"$sum": 1}
            }
        }
    ]

    results = await db.followups.aggregate(pipeline).to_list(length=100)

    # Initialize counts
    counts = {
        "scheduled": 0,
        "completed": 0,
        "positive": 0,
        "negative": 0,
        "no_answer": 0,
        "cancelled": 0
    }

    for r in results:
        status_val = r["_id"]
        counts[status_val] = r["count"]

    total_scheduled = sum(counts.values())
    completed = counts["positive"] + counts["negative"] + counts["completed"]
    total_attempted = completed + counts["no_answer"]

    satisfaction_rate = 0.0
    if counts["positive"] + counts["negative"] > 0:
        satisfaction_rate = counts["positive"] / (counts["positive"] + counts["negative"])

    response_rate = 0.0
    if total_attempted > 0:
        response_rate = completed / total_attempted

    return SingleResponse(data=FollowUpStats(
        total_scheduled=total_scheduled,
        completed=completed,
        positive=counts["positive"],
        negative=counts["negative"],
        no_answer=counts["no_answer"],
        satisfaction_rate=round(satisfaction_rate, 2),
        avg_response_rate=round(response_rate, 2)
    ))


@router.post(
    "/job/{job_id}/auto-schedule",
    response_model=SingleResponse[FollowUpResponse],
    summary="Auto-schedule follow-up for job"
)
async def auto_schedule_followup(
    job_id: str,
    followup_type: FollowUpType = FollowUpType.SATISFACTION,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Automatically schedule a follow-up for a completed job"""
    # Get job
    job = await db.hvac_quotes.find_one({
        "quote_id": job_id,
        "business_id": ctx.business_id
    })

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "JOB_NOT_FOUND", "message": "Job not found"}
        )

    # Check if follow-up already exists
    existing = await db.followups.find_one({
        "job_id": job_id,
        "followup_type": followup_type.value,
        "status": {"$ne": FollowUpStatus.CANCELLED.value}
    })

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "FOLLOWUP_EXISTS", "message": "Follow-up already scheduled for this job"}
        )

    # Get client
    client_id = job.get("client_id")
    client = await db.clients.find_one({"client_id": client_id}) if client_id else None

    if not client:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "NO_CLIENT", "message": "Job has no associated client"}
        )

    # Calculate schedule time
    service = get_followup_service()
    completed_at = job.get("completed_at", datetime.utcnow())
    scheduled_for = service.calculate_followup_time(
        completed_at=completed_at,
        followup_type=followup_type
    )

    # Create follow-up
    followup = {
        "followup_id": generate_id("fup"),
        "business_id": ctx.business_id,
        "job_id": job_id,
        "client_id": client_id,
        "client_name": f"{client.get('first_name', '')} {client.get('last_name', '')}".strip(),
        "client_phone": client.get("phone"),
        "followup_type": followup_type.value,
        "status": FollowUpStatus.SCHEDULED.value,
        "scheduled_for": scheduled_for,
        "concerns": [],
        "auto_scheduled": True,
        "created_by": current_user.user_id,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }

    await db.followups.insert_one(followup)

    logger.info(f"Auto-scheduled follow-up {followup['followup_id']} for job {job_id}")

    return SingleResponse(data=FollowUpResponse(
        followup_id=followup["followup_id"],
        business_id=followup["business_id"],
        job_id=followup["job_id"],
        client_id=followup["client_id"],
        client_name=followup["client_name"],
        client_phone=followup["client_phone"],
        followup_type=followup["followup_type"],
        status=followup["status"],
        scheduled_for=followup["scheduled_for"],
        concerns=followup["concerns"],
        created_at=followup["created_at"]
    ))


# ============== Webhook Endpoints for AI Calls ==============

@router.post(
    "/webhook/{followup_id}",
    include_in_schema=False,
    summary="Twilio call status webhook"
)
async def followup_call_webhook(
    followup_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncIOMotorDatabase = Depends(get_database),
    CallStatus: Optional[str] = None,
    CallSid: Optional[str] = None,
    CallDuration: Optional[str] = None,
    AnsweredBy: Optional[str] = None,
):
    """
    Handle Twilio call status webhook for follow-up calls.
    Updates follow-up status based on call outcome.
    """
    logger.info(f"Follow-up webhook: {followup_id}, Status: {CallStatus}, AnsweredBy: {AnsweredBy}")

    followup = await db.followups.find_one({"followup_id": followup_id})
    if not followup:
        logger.warning(f"Follow-up not found: {followup_id}")
        return {"status": "not_found"}

    # Update call SID if provided
    if CallSid:
        await db.followups.update_one(
            {"followup_id": followup_id},
            {"$set": {"call_sid": CallSid, "updated_at": datetime.utcnow()}}
        )

    # Handle call completion
    if CallStatus == "completed":
        duration = int(CallDuration) if CallDuration else 0

        # Check if it was voicemail
        if AnsweredBy in ["machine_end_beep", "machine_end_silence", "machine_end_other"]:
            # Voicemail - mark as no_answer for retry
            await db.followups.update_one(
                {"followup_id": followup_id},
                {"$set": {
                    "status": FollowUpStatus.NO_ANSWER.value,
                    "notes": "Went to voicemail",
                    "call_duration": duration,
                    "updated_at": datetime.utcnow()
                }}
            )
        elif duration < 10:
            # Very short call - likely hung up immediately
            await db.followups.update_one(
                {"followup_id": followup_id},
                {"$set": {
                    "status": FollowUpStatus.NO_ANSWER.value,
                    "notes": "Call too short (hung up)",
                    "call_duration": duration,
                    "updated_at": datetime.utcnow()
                }}
            )

        # Note: If the call had conversation, the gather endpoint handles the outcome

    elif CallStatus in ["busy", "no-answer", "failed", "canceled"]:
        await db.followups.update_one(
            {"followup_id": followup_id},
            {"$set": {
                "status": FollowUpStatus.NO_ANSWER.value,
                "notes": f"Call status: {CallStatus}",
                "updated_at": datetime.utcnow()
            }}
        )

    return {"status": "ok"}


@router.post(
    "/webhook/{followup_id}/gather",
    include_in_schema=False,
    summary="Twilio gather speech webhook"
)
async def followup_gather_webhook(
    followup_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncIOMotorDatabase = Depends(get_database),
    SpeechResult: Optional[str] = None,
    Confidence: Optional[str] = None,
):
    """
    Handle Twilio gather webhook for follow-up call speech input.
    Analyzes customer response and returns appropriate TwiML.
    """
    from fastapi.responses import Response

    logger.info(f"Follow-up gather: {followup_id}, Speech: {SpeechResult}, Confidence: {Confidence}")

    followup = await db.followups.find_one({"followup_id": followup_id})
    if not followup:
        # Return generic closing TwiML
        twiml = '''<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">Thank you for your time. Have a great day!</Say>
    <Hangup/>
</Response>'''
        return Response(content=twiml, media_type="application/xml")

    # Analyze the speech response
    speech_text = SpeechResult or ""
    is_positive = await _analyze_customer_response(speech_text)

    # Get follow-up service and call service
    followup_service = get_followup_service()
    call_service = get_call_service()

    # Get business info
    business = await db.businesses.find_one({"business_id": followup["business_id"]})
    business_name = business.get("name", "our company") if business else "our company"

    # Get job info for service type
    job = await db.hvac_quotes.find_one({"quote_id": followup.get("job_id")})
    service_type = job.get("service_type", "service") if job else "service"

    # Get tech name
    tech_name = "our technician"
    if job and job.get("assigned_tech_id"):
        tech = await db.users.find_one({"user_id": job["assigned_tech_id"]})
        if tech:
            tech_name = f"{tech.get('first_name', '')} {tech.get('last_name', '')}".strip() or "our technician"

    # Generate script
    script = await followup_service.generate_followup_script(
        customer_name=followup.get("client_name", "valued customer"),
        service_type=service_type,
        tech_name=tech_name,
        business_name=business_name,
        followup_type=FollowUpType(followup["followup_type"])
    )

    # Determine outcome
    outcome = "positive" if is_positive else "negative"
    concerns = []

    # Extract concerns if negative
    if not is_positive:
        concerns = await _extract_concerns(speech_text)

    # Update follow-up record
    await db.followups.update_one(
        {"followup_id": followup_id},
        {"$set": {
            "transcript": speech_text,
            "sentiment": outcome,
            "satisfied": is_positive,
            "concerns": concerns,
            "updated_at": datetime.utcnow()
        }}
    )

    # Schedule post-call processing
    background_tasks.add_task(
        handle_followup_call_complete,
        db,
        followup_id,
        outcome,
        speech_text,
        None,  # rating
        concerns
    )

    # Generate response TwiML
    callback_url = f"{get_settings().API_BASE_URL}/api/v1/followups/webhook/{followup_id}"
    twiml = call_service.generate_followup_response_twiml(
        is_positive=is_positive,
        script=script,
        callback_url=callback_url,
        include_review_request=is_positive
    )

    return Response(content=twiml, media_type="application/xml")


async def _analyze_customer_response(speech_text: str) -> bool:
    """
    Analyze customer speech to determine if response is positive.
    Uses AI if available, otherwise keyword matching.
    """
    speech_lower = speech_text.lower()

    # Check for explicit negative indicators
    negative_keywords = [
        "not satisfied", "unhappy", "problem", "issue", "complaint",
        "didn't work", "broken", "still", "worse", "terrible", "bad",
        "disappointed", "no", "nope", "not really", "not good"
    ]

    for keyword in negative_keywords:
        if keyword in speech_lower:
            return False

    # Check for explicit positive indicators
    positive_keywords = [
        "great", "good", "happy", "satisfied", "excellent", "perfect",
        "wonderful", "amazing", "yes", "yeah", "yep", "absolutely",
        "definitely", "love", "fantastic", "awesome", "pleased"
    ]

    for keyword in positive_keywords:
        if keyword in speech_lower:
            return True

    # Try AI analysis if available
    try:
        ai_service = get_ai_service()
        if ai_service.is_configured:
            result = await ai_service.generate_text(
                f"""Analyze this customer response to a satisfaction check call.
Is the customer expressing satisfaction (positive) or dissatisfaction (negative)?

Customer said: "{speech_text}"

Respond with ONLY "positive" or "negative".""",
                max_tokens=10
            )
            if result.success:
                return "positive" in result.content.lower()
    except Exception as e:
        logger.error(f"AI analysis failed: {e}")

    # Default to positive if unclear (better customer experience)
    return True


async def _extract_concerns(speech_text: str) -> List[str]:
    """
    Extract specific concerns from negative customer feedback.
    """
    concerns = []

    concern_patterns = {
        "noise": ["noise", "loud", "noisy", "sound"],
        "temperature": ["cold", "hot", "temperature", "cooling", "heating", "warm"],
        "leak": ["leak", "water", "dripping", "wet"],
        "odor": ["smell", "odor", "stink", "burning"],
        "performance": ["slow", "weak", "not working", "stopped", "broken"],
        "price": ["expensive", "cost", "price", "charge", "bill"],
        "service": ["rude", "late", "mess", "cleanup", "unprofessional"]
    }

    speech_lower = speech_text.lower()

    for concern_type, keywords in concern_patterns.items():
        for keyword in keywords:
            if keyword in speech_lower:
                concerns.append(concern_type)
                break

    # If no specific concerns found but response was negative
    if not concerns:
        concerns.append("general_dissatisfaction")

    return list(set(concerns))  # Remove duplicates


def get_settings():
    """Import settings here to avoid circular imports"""
    from app.config import get_settings as _get_settings
    return _get_settings()
