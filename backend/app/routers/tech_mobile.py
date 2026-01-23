"""
Tech Mobile API Router
Endpoints for technician mobile app - uses authenticated user's tech record
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional, List
from datetime import datetime, timedelta
from pydantic import BaseModel, Field

from app.database import get_database
from app.models.technician import (
    Technician, TechnicianResponse, TechStatus, TechLocation
)
from app.models.common import utc_now
from app.middleware.auth import BusinessContext, get_business_context
from app.schemas.common import SingleResponse, ListResponse, MessageResponse


router = APIRouter()


# Request/Response Models
class LocationUpdate(BaseModel):
    """Location update from mobile device"""
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    heading: Optional[float] = Field(None, ge=0, le=360)
    speed: Optional[float] = Field(None, ge=0)  # m/s
    accuracy: Optional[float] = Field(None, ge=0)


class JobCompletionData(BaseModel):
    """Data for completing a job"""
    notes: Optional[str] = None
    photos: Optional[List[str]] = None  # Base64 or URLs
    signature: Optional[str] = None  # Base64
    final_price: Optional[float] = None
    materials_used: Optional[List[dict]] = None
    labor_hours: Optional[float] = None


class TechJobResponse(BaseModel):
    """Job response for tech mobile app"""
    job_id: str
    business_id: str
    client: dict
    address: dict
    service_type: str
    service_name: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    scheduled_date: str
    scheduled_time: str
    end_time: Optional[str] = None
    estimated_duration: Optional[int] = None
    status: str
    priority: Optional[str] = None
    route_order: Optional[int] = None
    equipment_needed: Optional[List[str]] = None
    special_instructions: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    completion_notes: Optional[str] = None
    photos: Optional[List[str]] = None
    signature_url: Optional[str] = None
    estimated_price: Optional[float] = None
    final_price: Optional[float] = None


async def get_tech_from_user(
    ctx: BusinessContext,
    db: AsyncIOMotorDatabase
) -> dict:
    """Get technician record for authenticated user"""
    # Find tech by user email or linked user_id
    tech = await db.technicians.find_one({
        "business_id": ctx.business_id,
        "deleted_at": None,
        "$or": [
            {"user_id": ctx.user_id},
            {"email": ctx.user_email.lower() if ctx.user_email else None}
        ]
    })

    if not tech:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "TECH_NOT_FOUND",
                "message": "No technician profile found for this user"
            }
        )

    return tech


# Profile Endpoints
@router.get(
    "/me",
    response_model=SingleResponse[TechnicianResponse],
    summary="Get my tech profile"
)
async def get_my_profile(
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get authenticated technician's profile"""
    tech = await get_tech_from_user(ctx, db)
    return SingleResponse(data=TechnicianResponse(**tech))


@router.put(
    "/me",
    response_model=SingleResponse[TechnicianResponse],
    summary="Update my tech profile"
)
async def update_my_profile(
    updates: dict = Body(...),
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Update authenticated technician's profile"""
    tech = await get_tech_from_user(ctx, db)

    # Only allow certain fields to be updated by tech
    allowed_fields = {"phone", "avatar_url"}
    update_data = {k: v for k, v in updates.items() if k in allowed_fields}
    update_data["updated_at"] = utc_now()

    result = await db.technicians.find_one_and_update(
        {"tech_id": tech["tech_id"]},
        {"$set": update_data},
        return_document=True
    )

    return SingleResponse(data=TechnicianResponse(**result))


# Status & Location Endpoints
@router.patch(
    "/me/status",
    response_model=SingleResponse[TechnicianResponse],
    summary="Update my status"
)
async def update_my_status(
    new_status: TechStatus = Query(...),
    job_id: Optional[str] = Query(None),
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Update authenticated technician's dispatch status"""
    tech = await get_tech_from_user(ctx, db)

    update_data = {
        "status": new_status.value,
        "updated_at": utc_now()
    }

    # Update job references based on status
    if new_status == TechStatus.ENROUTE and job_id:
        update_data["current_job_id"] = job_id
    elif new_status == TechStatus.COMPLETE or new_status == TechStatus.AVAILABLE:
        update_data["current_job_id"] = None
    elif new_status == TechStatus.OFF_DUTY:
        update_data["current_job_id"] = None
        update_data["next_job_id"] = None

    result = await db.technicians.find_one_and_update(
        {"tech_id": tech["tech_id"]},
        {"$set": update_data},
        return_document=True
    )

    # Trigger SMS notifications based on status change
    current_job_id = job_id or tech.get("current_job_id")
    if current_job_id and new_status in [TechStatus.ENROUTE, TechStatus.ON_SITE, TechStatus.COMPLETE]:
        try:
            from app.services.sms_service import get_sms_service
            from app.models.sms import SMSTriggerType

            job = await db.hvac_quotes.find_one({"quote_id": current_job_id})
            if job and job.get("client", {}).get("client_id"):
                customer_id = job["client"]["client_id"]
                sms_service = get_sms_service(db)

                trigger_map = {
                    TechStatus.ENROUTE: SMSTriggerType.ENROUTE,
                    TechStatus.ON_SITE: SMSTriggerType.ARRIVED,
                    TechStatus.COMPLETE: SMSTriggerType.COMPLETE,
                }

                await sms_service.send_triggered_sms(
                    business_id=ctx.business_id,
                    trigger_type=trigger_map[new_status],
                    customer_id=customer_id,
                    job_id=current_job_id,
                    tech_id=tech["tech_id"]
                )
        except Exception as e:
            import logging
            logging.warning(f"Failed to send SMS for status change: {e}")

    return SingleResponse(data=TechnicianResponse(**result))


@router.post(
    "/me/location",
    response_model=MessageResponse,
    summary="Update my location"
)
async def update_my_location(
    location: LocationUpdate,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Update authenticated technician's GPS location"""
    tech = await get_tech_from_user(ctx, db)

    location_data = {
        "type": "Point",
        "coordinates": [location.longitude, location.latitude],
        "timestamp": utc_now(),
        "accuracy": location.accuracy,
        "heading": location.heading,
        "speed": location.speed
    }

    await db.technicians.update_one(
        {"tech_id": tech["tech_id"]},
        {"$set": {
            "location": location_data,
            "updated_at": utc_now()
        }}
    )

    # Store in location history
    history_entry = {
        "tech_id": tech["tech_id"],
        "business_id": ctx.business_id,
        "location": {"type": "Point", "coordinates": [location.longitude, location.latitude]},
        "accuracy": location.accuracy,
        "heading": location.heading,
        "speed": location.speed,
        "timestamp": utc_now()
    }
    await db.tech_locations.insert_one(history_entry)

    return MessageResponse(message="Location updated")


# Jobs Endpoints
@router.get(
    "/me/jobs",
    response_model=ListResponse[TechJobResponse],
    summary="Get my jobs"
)
async def get_my_jobs(
    date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    start_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    days: int = Query(1, ge=1, le=30),
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get authenticated technician's jobs"""
    tech = await get_tech_from_user(ctx, db)

    # Build date filter
    if date:
        start = date
        end = date
    elif start_date:
        start = start_date
        end_dt = datetime.strptime(start_date, "%Y-%m-%d") + timedelta(days=days-1)
        end = end_dt.strftime("%Y-%m-%d")
    else:
        start = datetime.now().strftime("%Y-%m-%d")
        end = start

    # Get schedule entries for this tech
    entries = await db.schedule_entries.find({
        "business_id": ctx.business_id,
        "tech_id": tech["tech_id"],
        "scheduled_date": {"$gte": start, "$lte": end},
        "deleted_at": None
    }).sort([("scheduled_date", 1), ("start_time", 1)]).to_list(length=100)

    jobs = []
    for entry in entries:
        # Get job details
        job = await db.hvac_quotes.find_one({"quote_id": entry.get("job_id")})

        if job:
            # Get client info
            client = await db.clients.find_one({"client_id": job.get("client", {}).get("client_id")})

            # Build address from job or client
            address = job.get("service_address") or (client.get("address") if client else {})

            job_response = TechJobResponse(
                job_id=entry.get("job_id") or entry.get("schedule_entry_id"),
                schedule_entry_id=entry.get("schedule_entry_id"),
                business_id=ctx.business_id,
                client={
                    "client_id": job.get("client", {}).get("client_id", ""),
                    "name": job.get("client", {}).get("name", "Unknown"),
                    "phone": client.get("phone") if client else None,
                    "email": client.get("email") if client else None
                },
                address={
                    "street": address.get("street", ""),
                    "city": address.get("city", ""),
                    "state": address.get("state", ""),
                    "zip": address.get("zip", ""),
                    "latitude": address.get("latitude"),
                    "longitude": address.get("longitude")
                },
                service_type=job.get("service_type", "service"),
                service_name=job.get("service_name"),
                description=job.get("description"),
                notes=entry.get("notes") or job.get("notes"),
                scheduled_date=entry.get("scheduled_date"),
                scheduled_time=entry.get("start_time", "09:00"),
                end_time=entry.get("end_time"),
                estimated_duration=entry.get("duration") or job.get("estimated_duration"),
                status=entry.get("status", "scheduled"),
                priority=entry.get("priority") or job.get("priority"),
                route_order=entry.get("route_order"),
                equipment_needed=job.get("equipment_needed"),
                special_instructions=job.get("special_instructions") or entry.get("special_instructions"),
                started_at=entry.get("started_at"),
                completed_at=entry.get("completed_at"),
                completion_notes=entry.get("completion_notes"),
                photos=entry.get("photos"),
                signature_url=entry.get("signature_url"),
                estimated_price=job.get("estimated_total") or job.get("total"),
                final_price=entry.get("final_price")
            )
            jobs.append(job_response)

    return ListResponse(data=jobs, count=len(jobs))


@router.get(
    "/me/jobs/{job_id}",
    response_model=SingleResponse[TechJobResponse],
    summary="Get job details"
)
async def get_my_job(
    job_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get specific job details for authenticated technician"""
    tech = await get_tech_from_user(ctx, db)

    # Find schedule entry
    entry = await db.schedule_entries.find_one({
        "business_id": ctx.business_id,
        "tech_id": tech["tech_id"],
        "$or": [
            {"job_id": job_id},
            {"schedule_entry_id": job_id}
        ],
        "deleted_at": None
    })

    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "JOB_NOT_FOUND", "message": "Job not found"}
        )

    # Get job details
    job = await db.hvac_quotes.find_one({"quote_id": entry.get("job_id")})

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "JOB_NOT_FOUND", "message": "Job details not found"}
        )

    # Get client info
    client = await db.clients.find_one({"client_id": job.get("client", {}).get("client_id")})
    address = job.get("service_address") or (client.get("address") if client else {})

    job_response = TechJobResponse(
        job_id=entry.get("job_id") or entry.get("schedule_entry_id"),
        schedule_entry_id=entry.get("schedule_entry_id"),
        business_id=ctx.business_id,
        client={
            "client_id": job.get("client", {}).get("client_id", ""),
            "name": job.get("client", {}).get("name", "Unknown"),
            "phone": client.get("phone") if client else None,
            "email": client.get("email") if client else None
        },
        address={
            "street": address.get("street", ""),
            "city": address.get("city", ""),
            "state": address.get("state", ""),
            "zip": address.get("zip", ""),
            "latitude": address.get("latitude"),
            "longitude": address.get("longitude")
        },
        service_type=job.get("service_type", "service"),
        service_name=job.get("service_name"),
        description=job.get("description"),
        notes=entry.get("notes") or job.get("notes"),
        scheduled_date=entry.get("scheduled_date"),
        scheduled_time=entry.get("start_time", "09:00"),
        end_time=entry.get("end_time"),
        estimated_duration=entry.get("duration") or job.get("estimated_duration"),
        status=entry.get("status", "scheduled"),
        priority=entry.get("priority") or job.get("priority"),
        route_order=entry.get("route_order"),
        equipment_needed=job.get("equipment_needed"),
        special_instructions=job.get("special_instructions") or entry.get("special_instructions"),
        started_at=entry.get("started_at"),
        completed_at=entry.get("completed_at"),
        completion_notes=entry.get("completion_notes"),
        photos=entry.get("photos"),
        signature_url=entry.get("signature_url"),
        estimated_price=job.get("estimated_total") or job.get("total"),
        final_price=entry.get("final_price")
    )

    return SingleResponse(data=job_response)


# Job Actions
@router.post(
    "/me/jobs/{job_id}/start",
    response_model=SingleResponse[TechJobResponse],
    summary="Start a job"
)
async def start_my_job(
    job_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Mark job as started (en route)"""
    tech = await get_tech_from_user(ctx, db)

    # Update schedule entry
    result = await db.schedule_entries.find_one_and_update(
        {
            "business_id": ctx.business_id,
            "tech_id": tech["tech_id"],
            "$or": [{"job_id": job_id}, {"schedule_entry_id": job_id}],
            "deleted_at": None
        },
        {"$set": {
            "status": "in_progress",
            "started_at": utc_now().isoformat(),
            "updated_at": utc_now()
        }},
        return_document=True
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "JOB_NOT_FOUND", "message": "Job not found"}
        )

    # Update tech status
    await db.technicians.update_one(
        {"tech_id": tech["tech_id"]},
        {"$set": {
            "status": TechStatus.ENROUTE.value,
            "current_job_id": job_id,
            "updated_at": utc_now()
        }}
    )

    # Return updated job
    return await get_my_job(job_id, ctx, db)


@router.post(
    "/me/jobs/{job_id}/arrive",
    response_model=SingleResponse[TechJobResponse],
    summary="Mark arrival at job"
)
async def arrive_at_my_job(
    job_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Mark tech as arrived at job site"""
    tech = await get_tech_from_user(ctx, db)

    # Update tech status
    await db.technicians.update_one(
        {"tech_id": tech["tech_id"]},
        {"$set": {
            "status": TechStatus.ON_SITE.value,
            "updated_at": utc_now()
        }}
    )

    # Return updated job
    return await get_my_job(job_id, ctx, db)


@router.post(
    "/me/jobs/{job_id}/complete",
    response_model=SingleResponse[TechJobResponse],
    summary="Complete a job"
)
async def complete_my_job(
    job_id: str,
    completion: JobCompletionData,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Complete a job with notes, photos, signature"""
    tech = await get_tech_from_user(ctx, db)

    update_data = {
        "status": "completed",
        "completed_at": utc_now().isoformat(),
        "updated_at": utc_now()
    }

    if completion.notes:
        update_data["completion_notes"] = completion.notes
    if completion.photos:
        update_data["photos"] = completion.photos
    if completion.signature:
        update_data["signature_url"] = completion.signature
    if completion.final_price is not None:
        update_data["final_price"] = completion.final_price
    if completion.materials_used:
        update_data["materials_used"] = completion.materials_used
    if completion.labor_hours is not None:
        update_data["labor_hours"] = completion.labor_hours

    # Update schedule entry
    result = await db.schedule_entries.find_one_and_update(
        {
            "business_id": ctx.business_id,
            "tech_id": tech["tech_id"],
            "$or": [{"job_id": job_id}, {"schedule_entry_id": job_id}],
            "deleted_at": None
        },
        {"$set": update_data},
        return_document=True
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "JOB_NOT_FOUND", "message": "Job not found"}
        )

    # Update job/quote status
    await db.hvac_quotes.update_one(
        {"quote_id": result.get("job_id")},
        {"$set": {"status": "completed", "updated_at": utc_now()}}
    )

    # Update tech status
    await db.technicians.update_one(
        {"tech_id": tech["tech_id"]},
        {"$set": {
            "status": TechStatus.AVAILABLE.value,
            "current_job_id": None,
            "updated_at": utc_now()
        }}
    )

    # Return updated job
    return await get_my_job(job_id, ctx, db)


# Route Endpoint
@router.get(
    "/me/route",
    summary="Get my route for a date"
)
async def get_my_route(
    date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get authenticated technician's route for a date"""
    tech = await get_tech_from_user(ctx, db)
    target_date = date or datetime.now().strftime("%Y-%m-%d")

    # Get jobs for this date
    jobs_response = await get_my_jobs(date=target_date, ctx=ctx, db=db)

    stops = []
    for idx, job in enumerate(jobs_response.data):
        stops.append({
            "job_id": job.job_id,
            "client_name": job.client.get("name", "Unknown"),
            "address": f"{job.address.get('street', '')}, {job.address.get('city', '')}",
            "scheduled_time": job.scheduled_time,
            "service_type": job.service_type,
            "status": job.status,
            "latitude": job.address.get("latitude"),
            "longitude": job.address.get("longitude"),
            "route_order": job.route_order or idx + 1,
            "estimated_duration": job.estimated_duration
        })

    # Sort by route order
    stops.sort(key=lambda x: x["route_order"])

    return {
        "tech_id": tech["tech_id"],
        "date": target_date,
        "stops": stops,
        "total_stops": len(stops),
        "optimized": any(j.route_order for j in jobs_response.data)
    }


# Clock In/Out
@router.post(
    "/me/clock-in",
    response_model=MessageResponse,
    summary="Clock in"
)
async def clock_in(
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Clock in for the day"""
    tech = await get_tech_from_user(ctx, db)

    # Create timesheet entry
    today = datetime.now().strftime("%Y-%m-%d")

    await db.timesheets.update_one(
        {
            "tech_id": tech["tech_id"],
            "date": today
        },
        {
            "$set": {
                "clock_in": utc_now().isoformat(),
                "business_id": ctx.business_id
            }
        },
        upsert=True
    )

    # Update tech status
    await db.technicians.update_one(
        {"tech_id": tech["tech_id"]},
        {"$set": {
            "status": TechStatus.AVAILABLE.value,
            "updated_at": utc_now()
        }}
    )

    return MessageResponse(message="Clocked in successfully")


@router.post(
    "/me/clock-out",
    response_model=MessageResponse,
    summary="Clock out"
)
async def clock_out(
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Clock out for the day"""
    tech = await get_tech_from_user(ctx, db)

    # Update timesheet entry
    today = datetime.now().strftime("%Y-%m-%d")

    await db.timesheets.update_one(
        {
            "tech_id": tech["tech_id"],
            "date": today
        },
        {
            "$set": {
                "clock_out": utc_now().isoformat()
            }
        }
    )

    # Update tech status
    await db.technicians.update_one(
        {"tech_id": tech["tech_id"]},
        {"$set": {
            "status": TechStatus.OFF_DUTY.value,
            "current_job_id": None,
            "updated_at": utc_now()
        }}
    )

    return MessageResponse(message="Clocked out successfully")


@router.get(
    "/me/timesheet",
    summary="Get my timesheet"
)
async def get_my_timesheet(
    start: str = Query(..., description="Start date YYYY-MM-DD"),
    end: str = Query(..., description="End date YYYY-MM-DD"),
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get timesheet entries for date range"""
    tech = await get_tech_from_user(ctx, db)

    entries = await db.timesheets.find({
        "tech_id": tech["tech_id"],
        "date": {"$gte": start, "$lte": end}
    }).sort("date", 1).to_list(length=100)

    result = []
    for entry in entries:
        hours = 0
        if entry.get("clock_in") and entry.get("clock_out"):
            clock_in = datetime.fromisoformat(entry["clock_in"].replace("Z", "+00:00"))
            clock_out = datetime.fromisoformat(entry["clock_out"].replace("Z", "+00:00"))
            hours = (clock_out - clock_in).total_seconds() / 3600

        result.append({
            "date": entry.get("date"),
            "clock_in": entry.get("clock_in"),
            "clock_out": entry.get("clock_out"),
            "hours_worked": round(hours, 2)
        })

    return result


# Push Token Registration
@router.post(
    "/me/push-token",
    response_model=MessageResponse,
    summary="Register push token"
)
async def register_push_token(
    token: str = Body(..., embed=True),
    platform: str = Body(..., embed=True),
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Register push notification token"""
    tech = await get_tech_from_user(ctx, db)

    await db.technicians.update_one(
        {"tech_id": tech["tech_id"]},
        {"$set": {
            "push_token": token,
            "push_platform": platform,
            "updated_at": utc_now()
        }}
    )

    return MessageResponse(message="Push token registered")
