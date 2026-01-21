"""
Availability API Router
Staff time-off and schedule override management
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional
from datetime import date

from app.database import get_database
from app.models.availability import (
    Availability, AvailabilityCreate, AvailabilityUpdate,
    AvailabilityResponse, AvailabilityType
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
    response_model=PaginatedResponse[AvailabilityResponse],
    summary="List availability entries"
)
async def list_availability(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    staff_id: Optional[str] = None,
    type_filter: Optional[AvailabilityType] = Query(None, alias="type"),
    date_from: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """List availability entries for the business"""
    query = ctx.filter_query({"deleted_at": None})

    if staff_id:
        query["staff_id"] = staff_id

    if type_filter:
        query["type"] = type_filter.value

    if date_from:
        query["end_date"] = {"$gte": date_from}

    if date_to:
        if "start_date" not in query:
            query["start_date"] = {}
        query["start_date"]["$lte"] = date_to

    total = await db.availability.count_documents(query)
    skip = (page - 1) * per_page

    cursor = db.availability.find(query).sort("start_date", 1).skip(skip).limit(per_page)
    docs = await cursor.to_list(length=per_page)

    entries = [AvailabilityResponse(**doc) for doc in docs]
    meta = create_pagination_meta(total, page, per_page)

    return PaginatedResponse(data=entries, meta=meta)


@router.get(
    "/calendar",
    summary="Get availability for calendar view"
)
async def get_availability_calendar(
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    staff_id: Optional[str] = None,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get availability entries for calendar display"""
    query = ctx.filter_query({
        "deleted_at": None,
        "$or": [
            # Entries that overlap with the date range
            {"start_date": {"$lte": end_date}, "end_date": {"$gte": start_date}}
        ]
    })

    if staff_id:
        query["staff_id"] = staff_id

    cursor = db.availability.find(query).sort("start_date", 1)
    docs = await cursor.to_list(length=100)

    return {"success": True, "data": docs}


@router.post(
    "",
    response_model=SingleResponse[AvailabilityResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create availability entry"
)
async def create_availability(
    data: AvailabilityCreate,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Create a new availability entry (time off, modified hours, etc.)"""
    # Verify staff exists
    staff = await db.staff.find_one(ctx.filter_query({
        "staff_id": data.staff_id,
        "deleted_at": None
    }))

    if not staff:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "STAFF_NOT_FOUND", "message": "Staff member not found"}
        )

    # Check for overlapping entries of conflicting types
    overlap_query = ctx.filter_query({
        "staff_id": data.staff_id,
        "deleted_at": None,
        "start_date": {"$lte": data.end_date.isoformat()},
        "end_date": {"$gte": data.start_date.isoformat()}
    })

    existing = await db.availability.find_one(overlap_query)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "OVERLAP_EXISTS",
                "message": "An availability entry already exists for this date range"
            }
        )

    # Warn if there are scheduled appointments
    if data.type in [AvailabilityType.UNAVAILABLE, AvailabilityType.VACATION,
                      AvailabilityType.SICK, AvailabilityType.PERSONAL]:
        conflicting_appointments = await db.appointments.count_documents({
            "business_id": ctx.business_id,
            "staff_ids": data.staff_id,
            "scheduled_date": {
                "$gte": data.start_date.isoformat(),
                "$lte": data.end_date.isoformat()
            },
            "status": {"$in": ["scheduled", "confirmed"]},
            "deleted_at": None
        })

        # We'll still create the entry but include a warning
        has_conflicts = conflicting_appointments > 0
    else:
        has_conflicts = False

    availability = Availability(
        business_id=ctx.business_id,
        **data.model_dump(mode="json")
    )

    await db.availability.insert_one(availability.model_dump(mode="json"))

    response_data = AvailabilityResponse(**availability.model_dump())

    if has_conflicts:
        return {
            "success": True,
            "data": response_data.model_dump(),
            "warning": f"Staff has {conflicting_appointments} scheduled appointment(s) during this period"
        }

    return SingleResponse(data=response_data)


@router.get(
    "/{availability_id}",
    response_model=SingleResponse[AvailabilityResponse],
    summary="Get availability entry by ID"
)
async def get_availability(
    availability_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get availability entry by ID"""
    doc = await db.availability.find_one(ctx.filter_query({
        "availability_id": availability_id,
        "deleted_at": None
    }))

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "AVAILABILITY_NOT_FOUND", "message": "Availability entry not found"}
        )

    return SingleResponse(data=AvailabilityResponse(**doc))


@router.put(
    "/{availability_id}",
    response_model=SingleResponse[AvailabilityResponse],
    summary="Update availability entry"
)
async def update_availability(
    availability_id: str,
    data: AvailabilityUpdate,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Update availability entry"""
    existing = await db.availability.find_one(ctx.filter_query({
        "availability_id": availability_id,
        "deleted_at": None
    }))

    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "AVAILABILITY_NOT_FOUND", "message": "Availability entry not found"}
        )

    update_data = data.model_dump(exclude_unset=True, mode="json")
    update_data["updated_at"] = utc_now()

    result = await db.availability.find_one_and_update(
        {"availability_id": availability_id},
        {"$set": update_data},
        return_document=True
    )

    return SingleResponse(data=AvailabilityResponse(**result))


@router.delete(
    "/{availability_id}",
    response_model=MessageResponse,
    summary="Delete availability entry"
)
async def delete_availability(
    availability_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Delete availability entry"""
    result = await db.availability.update_one(
        ctx.filter_query({"availability_id": availability_id, "deleted_at": None}),
        {"$set": {"deleted_at": utc_now(), "updated_at": utc_now()}}
    )

    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "AVAILABILITY_NOT_FOUND", "message": "Availability entry not found"}
        )

    return MessageResponse(message="Availability entry deleted successfully")


@router.post(
    "/bulk",
    response_model=MessageResponse,
    summary="Create multiple availability entries"
)
async def create_bulk_availability(
    entries: list[AvailabilityCreate],
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Create multiple availability entries at once (e.g., company holidays)"""
    created = 0
    errors = []

    for entry in entries:
        try:
            # Verify staff exists
            staff = await db.staff.find_one(ctx.filter_query({
                "staff_id": entry.staff_id,
                "deleted_at": None
            }))

            if not staff:
                errors.append(f"Staff {entry.staff_id} not found")
                continue

            availability = Availability(
                business_id=ctx.business_id,
                **entry.model_dump(mode="json")
            )

            await db.availability.insert_one(availability.model_dump(mode="json"))
            created += 1

        except Exception as e:
            errors.append(str(e))

    message = f"Created {created} availability entries"
    if errors:
        message += f". Errors: {len(errors)}"

    return MessageResponse(message=message)


@router.get(
    "/staff/{staff_id}/check",
    summary="Check staff availability for a date"
)
async def check_staff_availability(
    staff_id: str,
    check_date: str = Query(..., alias="date", description="Date to check YYYY-MM-DD"),
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Check if a staff member is available on a specific date"""
    # Verify staff exists
    staff = await db.staff.find_one(ctx.filter_query({
        "staff_id": staff_id,
        "deleted_at": None
    }))

    if not staff:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "STAFF_NOT_FOUND", "message": "Staff member not found"}
        )

    # Check for time off
    time_off = await db.availability.find_one({
        "staff_id": staff_id,
        "start_date": {"$lte": check_date},
        "end_date": {"$gte": check_date},
        "type": {"$in": ["unavailable", "vacation", "sick", "personal", "holiday"]},
        "deleted_at": None
    })

    if time_off:
        return {
            "success": True,
            "data": {
                "available": False,
                "reason": time_off["type"],
                "details": time_off.get("reason")
            }
        }

    # Check default availability for the day
    try:
        check_date_obj = date.fromisoformat(check_date)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_DATE", "message": "Invalid date format"}
        )

    day_name = check_date_obj.strftime("%A").lower()
    default_avail = staff.get("default_availability", {})
    day_hours = default_avail.get(day_name)

    if not day_hours:
        return {
            "success": True,
            "data": {
                "available": False,
                "reason": "not_scheduled",
                "details": f"Staff not scheduled on {day_name}s"
            }
        }

    # Check for modified hours
    modified = await db.availability.find_one({
        "staff_id": staff_id,
        "start_date": {"$lte": check_date},
        "end_date": {"$gte": check_date},
        "type": "modified",
        "deleted_at": None
    })

    hours = modified.get("time_slots", []) if modified else [day_hours]

    return {
        "success": True,
        "data": {
            "available": True,
            "hours": hours,
            "is_modified": modified is not None
        }
    }
