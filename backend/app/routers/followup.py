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
from app.schemas.common import SingleResponse, PaginatedResponse, MessageResponse, create_pagination_meta

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
