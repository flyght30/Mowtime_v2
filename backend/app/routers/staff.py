"""
Staff API Router
Team member management
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional
from datetime import date

from app.database import get_database
from app.models.staff import (
    Staff, StaffCreate, StaffUpdate, StaffResponse, StaffRole, EmploymentType
)
from app.models.user import User, UserRole
from app.models.common import generate_id, utc_now
from app.middleware.auth import require_roles, BusinessContext, get_business_context
from app.schemas.common import (
    PaginatedResponse, SingleResponse, ListResponse, MessageResponse,
    create_pagination_meta
)

router = APIRouter()


@router.get(
    "",
    response_model=PaginatedResponse[StaffResponse],
    summary="List staff members"
)
async def list_staff(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    role: Optional[StaffRole] = None,
    active_only: bool = Query(True),
    search: Optional[str] = None,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """List staff members for the current business"""
    query = ctx.filter_query({"deleted_at": None})

    if active_only:
        query["is_active"] = True

    if role:
        query["role"] = role.value

    if search:
        query["$or"] = [
            {"first_name": {"$regex": search, "$options": "i"}},
            {"last_name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}}
        ]

    total = await db.staff.count_documents(query)
    skip = (page - 1) * per_page

    cursor = db.staff.find(query).sort("first_name", 1).skip(skip).limit(per_page)
    docs = await cursor.to_list(length=per_page)

    staff_list = [StaffResponse(**doc) for doc in docs]
    meta = create_pagination_meta(total, page, per_page)

    return PaginatedResponse(data=staff_list, meta=meta)


@router.get(
    "/available",
    response_model=ListResponse[StaffResponse],
    summary="List available staff for a date"
)
async def list_available_staff(
    date_str: str = Query(..., alias="date", description="Date in YYYY-MM-DD format"),
    time_start: str = Query("08:00", description="Start time HH:MM"),
    time_end: str = Query("17:00", description="End time HH:MM"),
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get staff members available on a specific date and time"""
    try:
        check_date = date.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_DATE", "message": "Invalid date format. Use YYYY-MM-DD"}
        )

    # Get all active staff
    active_staff = await db.staff.find(ctx.filter_query({
        "deleted_at": None,
        "is_active": True
    })).to_list(length=100)

    available = []

    for staff_doc in active_staff:
        staff = Staff(**staff_doc)

        # Check default availability for the day
        day_name = check_date.strftime("%A").lower()
        day_hours = getattr(staff.default_availability, day_name, None)

        if day_hours is None:
            continue  # Not available on this day

        # Check for availability overrides
        override = await db.availability.find_one({
            "staff_id": staff.staff_id,
            "start_date": {"$lte": check_date.isoformat()},
            "end_date": {"$gte": check_date.isoformat()},
            "type": {"$in": ["unavailable", "vacation", "sick", "personal"]}
        })

        if override:
            continue  # Has time off

        # Check for conflicting appointments
        conflicts = await db.appointments.count_documents({
            "business_id": ctx.business_id,
            "staff_ids": staff.staff_id,
            "scheduled_date": check_date.isoformat(),
            "status": {"$in": ["scheduled", "confirmed", "in_progress"]},
            "deleted_at": None
        })

        # Check if under max daily appointments
        if conflicts < staff.max_daily_appointments:
            available.append(StaffResponse(**staff_doc))

    return ListResponse(data=available, count=len(available))


@router.post(
    "",
    response_model=SingleResponse[StaffResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create staff member"
)
async def create_staff(
    data: StaffCreate,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Create a new staff member"""
    # Check for duplicate email
    if data.email:
        existing = await db.staff.find_one({
            "business_id": ctx.business_id,
            "email": data.email.lower(),
            "deleted_at": None
        })
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "EMAIL_EXISTS", "message": "A staff member with this email already exists"}
            )

    staff = Staff(
        business_id=ctx.business_id,
        **data.model_dump()
    )

    if staff.email:
        staff.email = staff.email.lower()

    await db.staff.insert_one(staff.model_dump())

    # Update business stats
    await db.businesses.update_one(
        {"business_id": ctx.business_id},
        {"$inc": {"total_staff": 1}}
    )

    return SingleResponse(data=StaffResponse(**staff.model_dump()))


@router.get(
    "/{staff_id}",
    response_model=SingleResponse[StaffResponse],
    summary="Get staff member by ID"
)
async def get_staff(
    staff_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get staff member by ID"""
    doc = await db.staff.find_one(ctx.filter_query({
        "staff_id": staff_id,
        "deleted_at": None
    }))

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "STAFF_NOT_FOUND", "message": "Staff member not found"}
        )

    return SingleResponse(data=StaffResponse(**doc))


@router.put(
    "/{staff_id}",
    response_model=SingleResponse[StaffResponse],
    summary="Update staff member"
)
async def update_staff(
    staff_id: str,
    data: StaffUpdate,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Update staff member by ID"""
    update_data = data.model_dump(exclude_unset=True)

    # Check email uniqueness if being updated
    if "email" in update_data and update_data["email"]:
        existing = await db.staff.find_one({
            "business_id": ctx.business_id,
            "email": update_data["email"].lower(),
            "staff_id": {"$ne": staff_id},
            "deleted_at": None
        })
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "EMAIL_EXISTS", "message": "A staff member with this email already exists"}
            )
        update_data["email"] = update_data["email"].lower()

    update_data["updated_at"] = utc_now()

    result = await db.staff.find_one_and_update(
        ctx.filter_query({"staff_id": staff_id, "deleted_at": None}),
        {"$set": update_data},
        return_document=True
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "STAFF_NOT_FOUND", "message": "Staff member not found"}
        )

    return SingleResponse(data=StaffResponse(**result))


@router.delete(
    "/{staff_id}",
    response_model=MessageResponse,
    summary="Delete staff member"
)
async def delete_staff(
    staff_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Soft delete staff member"""
    # Check for assigned appointments
    active_appointments = await db.appointments.count_documents({
        "business_id": ctx.business_id,
        "staff_ids": staff_id,
        "status": {"$in": ["scheduled", "confirmed"]},
        "deleted_at": None
    })

    if active_appointments > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "STAFF_HAS_APPOINTMENTS",
                "message": f"Cannot delete - staff has {active_appointments} scheduled appointments"
            }
        )

    result = await db.staff.update_one(
        ctx.filter_query({"staff_id": staff_id, "deleted_at": None}),
        {"$set": {"deleted_at": utc_now(), "updated_at": utc_now()}}
    )

    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "STAFF_NOT_FOUND", "message": "Staff member not found"}
        )

    # Update business stats
    await db.businesses.update_one(
        {"business_id": ctx.business_id},
        {"$inc": {"total_staff": -1}}
    )

    return MessageResponse(message="Staff member deleted successfully")


@router.patch(
    "/{staff_id}/toggle-active",
    response_model=SingleResponse[StaffResponse],
    summary="Toggle staff active status"
)
async def toggle_staff_active(
    staff_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Toggle whether a staff member is active"""
    doc = await db.staff.find_one(ctx.filter_query({
        "staff_id": staff_id,
        "deleted_at": None
    }))

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "STAFF_NOT_FOUND", "message": "Staff member not found"}
        )

    new_status = not doc.get("is_active", True)

    result = await db.staff.find_one_and_update(
        {"staff_id": staff_id},
        {"$set": {"is_active": new_status, "updated_at": utc_now()}},
        return_document=True
    )

    return SingleResponse(data=StaffResponse(**result))


@router.put(
    "/{staff_id}/skills",
    response_model=SingleResponse[StaffResponse],
    summary="Update staff skills"
)
async def update_staff_skills(
    staff_id: str,
    skills: list[str],
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Update list of services a staff member can perform"""
    result = await db.staff.find_one_and_update(
        ctx.filter_query({"staff_id": staff_id, "deleted_at": None}),
        {"$set": {"skills": skills, "updated_at": utc_now()}},
        return_document=True
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "STAFF_NOT_FOUND", "message": "Staff member not found"}
        )

    return SingleResponse(data=StaffResponse(**result))


@router.get(
    "/{staff_id}/schedule",
    summary="Get staff schedule for date range"
)
async def get_staff_schedule(
    staff_id: str,
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get appointments for a staff member within a date range"""
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

    appointments = await db.appointments.find({
        "business_id": ctx.business_id,
        "staff_ids": staff_id,
        "scheduled_date": {"$gte": start_date, "$lte": end_date},
        "status": {"$in": ["scheduled", "confirmed", "in_progress", "completed"]},
        "deleted_at": None
    }).sort("scheduled_date", 1).to_list(length=100)

    # Get time off
    time_off = await db.availability.find({
        "staff_id": staff_id,
        "start_date": {"$lte": end_date},
        "end_date": {"$gte": start_date},
        "type": {"$in": ["unavailable", "vacation", "sick", "personal"]}
    }).to_list(length=50)

    return {
        "success": True,
        "data": {
            "staff_id": staff_id,
            "appointments": appointments,
            "time_off": time_off
        }
    }
