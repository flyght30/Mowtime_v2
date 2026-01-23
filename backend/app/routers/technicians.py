"""
Technicians API Router
Dispatch technician management with GPS tracking
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional
from datetime import datetime

from app.database import get_database
from app.models.technician import (
    Technician, TechnicianCreate, TechnicianUpdate, TechnicianResponse,
    TechStatus, TechLocation, TechLocationHistory, TechnicianBrief
)
from app.models.common import utc_now
from app.middleware.auth import BusinessContext, get_business_context
from app.schemas.common import (
    PaginatedResponse, SingleResponse, ListResponse, MessageResponse,
    create_pagination_meta
)

router = APIRouter()


@router.get(
    "",
    response_model=PaginatedResponse[TechnicianResponse],
    summary="List technicians"
)
async def list_technicians(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status_filter: Optional[TechStatus] = Query(None, alias="status"),
    active_only: bool = Query(True),
    include_location: bool = Query(True),
    search: Optional[str] = None,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """List technicians for the current business"""
    query = ctx.filter_query({"deleted_at": None})

    if active_only:
        query["is_active"] = True

    if status_filter:
        query["status"] = status_filter.value

    if search:
        query["$or"] = [
            {"first_name": {"$regex": search, "$options": "i"}},
            {"last_name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}}
        ]

    total = await db.technicians.count_documents(query)
    skip = (page - 1) * per_page

    cursor = db.technicians.find(query).sort("first_name", 1).skip(skip).limit(per_page)
    docs = await cursor.to_list(length=per_page)

    # Optionally strip location data
    techs = []
    for doc in docs:
        if not include_location:
            doc.pop("location", None)
        techs.append(TechnicianResponse(**doc))

    meta = create_pagination_meta(total, page, per_page)
    return PaginatedResponse(data=techs, meta=meta)


@router.get(
    "/active",
    response_model=ListResponse[TechnicianBrief],
    summary="List active technicians (brief)"
)
async def list_active_technicians(
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get brief list of active technicians for dropdowns"""
    query = ctx.filter_query({
        "deleted_at": None,
        "is_active": True,
        "status": {"$ne": TechStatus.OFF_DUTY.value}
    })

    docs = await db.technicians.find(
        query,
        {"tech_id": 1, "first_name": 1, "last_name": 1, "status": 1, "current_job_id": 1}
    ).sort("first_name", 1).to_list(length=50)

    techs = [TechnicianBrief(**doc) for doc in docs]
    return ListResponse(data=techs, count=len(techs))


@router.post(
    "",
    response_model=SingleResponse[TechnicianResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create technician"
)
async def create_technician(
    data: TechnicianCreate,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Create a new technician"""
    # Check for duplicate phone in same business
    existing = await db.technicians.find_one({
        "business_id": ctx.business_id,
        "phone": data.phone,
        "deleted_at": None
    })
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "PHONE_EXISTS", "message": "A technician with this phone already exists"}
        )

    tech_data = data.model_dump(exclude_unset=True)
    tech = Technician(
        business_id=ctx.business_id,
        **tech_data
    )

    if tech.email:
        tech.email = tech.email.lower()

    await db.technicians.insert_one(tech.model_dump())

    return SingleResponse(data=TechnicianResponse(**tech.model_dump()))


@router.get(
    "/{tech_id}",
    response_model=SingleResponse[TechnicianResponse],
    summary="Get technician by ID"
)
async def get_technician(
    tech_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get technician by ID"""
    doc = await db.technicians.find_one(ctx.filter_query({
        "tech_id": tech_id,
        "deleted_at": None
    }))

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "TECH_NOT_FOUND", "message": "Technician not found"}
        )

    return SingleResponse(data=TechnicianResponse(**doc))


@router.put(
    "/{tech_id}",
    response_model=SingleResponse[TechnicianResponse],
    summary="Update technician"
)
async def update_technician(
    tech_id: str,
    data: TechnicianUpdate,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Update technician by ID"""
    update_data = data.model_dump(exclude_unset=True)

    if "email" in update_data and update_data["email"]:
        update_data["email"] = update_data["email"].lower()

    update_data["updated_at"] = utc_now()

    result = await db.technicians.find_one_and_update(
        ctx.filter_query({"tech_id": tech_id, "deleted_at": None}),
        {"$set": update_data},
        return_document=True
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "TECH_NOT_FOUND", "message": "Technician not found"}
        )

    return SingleResponse(data=TechnicianResponse(**result))


@router.delete(
    "/{tech_id}",
    response_model=MessageResponse,
    summary="Delete technician"
)
async def delete_technician(
    tech_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Soft delete technician"""
    # Check for active assignments
    active_jobs = await db.schedule_entries.count_documents({
        "business_id": ctx.business_id,
        "tech_id": tech_id,
        "status": {"$in": ["scheduled", "in_progress"]},
        "deleted_at": None
    })

    if active_jobs > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "TECH_HAS_JOBS",
                "message": f"Cannot delete - technician has {active_jobs} scheduled jobs"
            }
        )

    result = await db.technicians.update_one(
        ctx.filter_query({"tech_id": tech_id, "deleted_at": None}),
        {"$set": {"deleted_at": utc_now(), "updated_at": utc_now()}}
    )

    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "TECH_NOT_FOUND", "message": "Technician not found"}
        )

    return MessageResponse(message="Technician deleted successfully")


@router.patch(
    "/{tech_id}/status",
    response_model=SingleResponse[TechnicianResponse],
    summary="Update technician status"
)
async def update_tech_status(
    tech_id: str,
    new_status: TechStatus,
    job_id: Optional[str] = None,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Update technician dispatch status"""
    update_data = {
        "status": new_status.value,
        "updated_at": utc_now()
    }

    # Update job references based on status
    if new_status == TechStatus.ENROUTE and job_id:
        update_data["current_job_id"] = job_id
    elif new_status == TechStatus.COMPLETE:
        update_data["current_job_id"] = None
    elif new_status == TechStatus.OFF_DUTY:
        update_data["current_job_id"] = None
        update_data["next_job_id"] = None
    elif new_status == TechStatus.AVAILABLE:
        update_data["current_job_id"] = None

    result = await db.technicians.find_one_and_update(
        ctx.filter_query({"tech_id": tech_id, "deleted_at": None}),
        {"$set": update_data},
        return_document=True
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "TECH_NOT_FOUND", "message": "Technician not found"}
        )

    return SingleResponse(data=TechnicianResponse(**result))


@router.post(
    "/{tech_id}/location",
    response_model=MessageResponse,
    summary="Update technician location"
)
async def update_tech_location(
    tech_id: str,
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    accuracy: Optional[float] = Query(None, ge=0),
    timestamp: Optional[datetime] = None,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Update technician GPS location"""
    ts = timestamp or utc_now()

    location_data = {
        "type": "Point",
        "coordinates": [lng, lat],
        "timestamp": ts,
        "accuracy": accuracy
    }

    # Update current location
    result = await db.technicians.update_one(
        ctx.filter_query({"tech_id": tech_id, "deleted_at": None}),
        {
            "$set": {
                "location": location_data,
                "updated_at": utc_now()
            }
        }
    )

    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "TECH_NOT_FOUND", "message": "Technician not found"}
        )

    # Store in location history (for tracking/replay)
    history_entry = {
        "tech_id": tech_id,
        "business_id": ctx.business_id,
        "location": {"type": "Point", "coordinates": [lng, lat]},
        "accuracy": accuracy,
        "timestamp": ts
    }
    await db.tech_locations.insert_one(history_entry)

    return MessageResponse(message="Location updated")


@router.get(
    "/{tech_id}/location/history",
    summary="Get technician location history"
)
async def get_tech_location_history(
    tech_id: str,
    hours: int = Query(24, ge=1, le=168),
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get technician location history for the past N hours"""
    from datetime import timedelta

    # Verify tech exists
    tech = await db.technicians.find_one(ctx.filter_query({
        "tech_id": tech_id,
        "deleted_at": None
    }))

    if not tech:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "TECH_NOT_FOUND", "message": "Technician not found"}
        )

    cutoff = utc_now() - timedelta(hours=hours)

    locations = await db.tech_locations.find({
        "tech_id": tech_id,
        "business_id": ctx.business_id,
        "timestamp": {"$gte": cutoff}
    }).sort("timestamp", 1).to_list(length=1000)

    # Convert to simple format
    points = [
        {
            "lat": loc["location"]["coordinates"][1],
            "lng": loc["location"]["coordinates"][0],
            "timestamp": loc["timestamp"].isoformat(),
            "accuracy": loc.get("accuracy")
        }
        for loc in locations
    ]

    return {
        "success": True,
        "data": {
            "tech_id": tech_id,
            "hours": hours,
            "points": points,
            "count": len(points)
        }
    }


@router.patch(
    "/{tech_id}/toggle-active",
    response_model=SingleResponse[TechnicianResponse],
    summary="Toggle technician active status"
)
async def toggle_tech_active(
    tech_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Toggle whether a technician is active"""
    doc = await db.technicians.find_one(ctx.filter_query({
        "tech_id": tech_id,
        "deleted_at": None
    }))

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "TECH_NOT_FOUND", "message": "Technician not found"}
        )

    new_status = not doc.get("is_active", True)

    # If deactivating, set to off duty
    update_data = {"is_active": new_status, "updated_at": utc_now()}
    if not new_status:
        update_data["status"] = TechStatus.OFF_DUTY.value

    result = await db.technicians.find_one_and_update(
        {"tech_id": tech_id},
        {"$set": update_data},
        return_document=True
    )

    return SingleResponse(data=TechnicianResponse(**result))
