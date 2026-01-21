"""
Appointments API Router
Scheduling and appointment management
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional
from datetime import date, datetime, timedelta

from app.database import get_database
from app.models.appointment import (
    Appointment, AppointmentCreate, AppointmentUpdate, AppointmentResponse,
    AppointmentStatus, ServiceLineItem
)
from app.models.user import User
from app.models.common import utc_now
from app.middleware.auth import get_current_user, BusinessContext, get_business_context
from app.schemas.common import (
    PaginatedResponse, SingleResponse, ListResponse, MessageResponse,
    create_pagination_meta
)

router = APIRouter()


async def calculate_appointment_details(
    db: AsyncIOMotorDatabase,
    business_id: str,
    service_ids: list[str],
    scheduled_time: str
) -> tuple[list[ServiceLineItem], int, float, str]:
    """
    Calculate appointment details from service IDs

    Returns: (line_items, total_duration, total_price, end_time)
    """
    line_items = []
    total_duration = 0
    total_price = 0.0

    for service_id in service_ids:
        service = await db.services.find_one({
            "service_id": service_id,
            "business_id": business_id,
            "is_active": True,
            "deleted_at": None
        })

        if not service:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "SERVICE_NOT_FOUND", "message": f"Service {service_id} not found"}
            )

        line_item = ServiceLineItem(
            service_id=service["service_id"],
            service_name=service["name"],
            quantity=1,
            unit_price=service["base_price"],
            total_price=service["base_price"],
            duration_minutes=service["duration_minutes"]
        )
        line_items.append(line_item)
        total_duration += service["duration_minutes"]
        total_price += service["base_price"]

    # Calculate end time
    start_hour, start_min = map(int, scheduled_time.split(":"))
    end_minutes = start_hour * 60 + start_min + total_duration
    end_hour = end_minutes // 60
    end_min = end_minutes % 60
    end_time = f"{end_hour:02d}:{end_min:02d}"

    return line_items, total_duration, total_price, end_time


async def check_conflicts(
    db: AsyncIOMotorDatabase,
    business_id: str,
    scheduled_date: date,
    scheduled_time: str,
    end_time: str,
    staff_ids: list[str],
    exclude_appointment_id: Optional[str] = None
) -> list[dict]:
    """Check for scheduling conflicts"""
    conflicts = []

    # Check each staff member
    for staff_id in staff_ids:
        query = {
            "business_id": business_id,
            "staff_ids": staff_id,
            "scheduled_date": scheduled_date.isoformat(),
            "status": {"$in": ["scheduled", "confirmed", "in_progress"]},
            "deleted_at": None
        }

        if exclude_appointment_id:
            query["appointment_id"] = {"$ne": exclude_appointment_id}

        existing = await db.appointments.find(query).to_list(length=20)

        for apt in existing:
            # Check time overlap
            apt_start = apt["scheduled_time"]
            apt_end = apt["end_time"]

            # Overlap exists if: start < apt_end AND end > apt_start
            if scheduled_time < apt_end and end_time > apt_start:
                conflicts.append({
                    "staff_id": staff_id,
                    "appointment_id": apt["appointment_id"],
                    "time": f"{apt_start} - {apt_end}"
                })

    return conflicts


@router.get(
    "",
    response_model=PaginatedResponse[AppointmentResponse],
    summary="List appointments"
)
async def list_appointments(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status_filter: Optional[AppointmentStatus] = Query(None, alias="status"),
    client_id: Optional[str] = None,
    staff_id: Optional[str] = None,
    date_from: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """List appointments with filters"""
    query = ctx.filter_query({"deleted_at": None})

    if status_filter:
        query["status"] = status_filter.value

    if client_id:
        query["client_id"] = client_id

    if staff_id:
        query["staff_ids"] = staff_id

    if date_from:
        query["scheduled_date"] = {"$gte": date_from}

    if date_to:
        if "scheduled_date" in query:
            query["scheduled_date"]["$lte"] = date_to
        else:
            query["scheduled_date"] = {"$lte": date_to}

    total = await db.appointments.count_documents(query)
    skip = (page - 1) * per_page

    cursor = db.appointments.find(query).sort([
        ("scheduled_date", 1),
        ("scheduled_time", 1)
    ]).skip(skip).limit(per_page)

    docs = await cursor.to_list(length=per_page)
    appointments = [AppointmentResponse(**doc) for doc in docs]
    meta = create_pagination_meta(total, page, per_page)

    return PaginatedResponse(data=appointments, meta=meta)


@router.get(
    "/today",
    response_model=ListResponse[AppointmentResponse],
    summary="Get today's appointments"
)
async def get_todays_appointments(
    staff_id: Optional[str] = None,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get all appointments for today"""
    today = date.today().isoformat()

    query = ctx.filter_query({
        "scheduled_date": today,
        "deleted_at": None,
        "status": {"$in": ["scheduled", "confirmed", "in_progress"]}
    })

    if staff_id:
        query["staff_ids"] = staff_id

    cursor = db.appointments.find(query).sort("scheduled_time", 1)
    docs = await cursor.to_list(length=50)

    appointments = [AppointmentResponse(**doc) for doc in docs]

    return ListResponse(data=appointments, count=len(appointments))


@router.get(
    "/calendar",
    summary="Get appointments for calendar view"
)
async def get_calendar_appointments(
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
    staff_id: Optional[str] = None,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get appointments for calendar display"""
    query = ctx.filter_query({
        "scheduled_date": {"$gte": start_date, "$lte": end_date},
        "deleted_at": None
    })

    if staff_id:
        query["staff_ids"] = staff_id

    cursor = db.appointments.find(query).sort([
        ("scheduled_date", 1),
        ("scheduled_time", 1)
    ])
    docs = await cursor.to_list(length=200)

    # Group by date
    by_date = {}
    for doc in docs:
        d = doc["scheduled_date"]
        if d not in by_date:
            by_date[d] = []
        by_date[d].append(doc)

    return {"success": True, "data": by_date}


@router.post(
    "",
    response_model=SingleResponse[AppointmentResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create appointment"
)
async def create_appointment(
    data: AppointmentCreate,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Create a new appointment"""
    # Verify client exists
    client = await db.clients.find_one(ctx.filter_query({
        "client_id": data.client_id,
        "deleted_at": None
    }))

    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CLIENT_NOT_FOUND", "message": "Client not found"}
        )

    # Calculate service details
    line_items, total_duration, total_price, end_time = await calculate_appointment_details(
        db, ctx.business_id, data.service_ids, data.scheduled_time
    )

    # Check for conflicts if staff assigned
    if data.staff_ids:
        conflicts = await check_conflicts(
            db, ctx.business_id, data.scheduled_date,
            data.scheduled_time, end_time, data.staff_ids
        )

        if conflicts:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "SCHEDULING_CONFLICT",
                    "message": "Scheduling conflict detected",
                    "conflicts": conflicts
                }
            )

    # Get business timezone
    business = await db.businesses.find_one({"business_id": ctx.business_id})
    timezone = business.get("timezone", "America/Chicago") if business else "America/Chicago"

    appointment = Appointment(
        business_id=ctx.business_id,
        client_id=data.client_id,
        address_index=data.address_index,
        scheduled_date=data.scheduled_date,
        scheduled_time=data.scheduled_time,
        end_time=end_time,
        duration_minutes=total_duration,
        timezone=timezone,
        staff_ids=data.staff_ids,
        equipment_ids=data.equipment_ids,
        services=[item.model_dump() for item in line_items],
        total_price=total_price,
        internal_notes=data.internal_notes,
        customer_notes=data.customer_notes
    )

    if data.recurrence:
        appointment.recurrence = data.recurrence

    await db.appointments.insert_one(appointment.model_dump(mode="json"))

    # Update stats
    await db.businesses.update_one(
        {"business_id": ctx.business_id},
        {"$inc": {"total_appointments": 1}}
    )

    await db.clients.update_one(
        {"client_id": data.client_id},
        {
            "$inc": {"total_appointments": 1},
            "$set": {"next_scheduled_date": data.scheduled_date.isoformat()}
        }
    )

    return SingleResponse(data=AppointmentResponse(**appointment.model_dump()))


@router.get(
    "/{appointment_id}",
    response_model=SingleResponse[AppointmentResponse],
    summary="Get appointment by ID"
)
async def get_appointment(
    appointment_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get appointment by ID"""
    doc = await db.appointments.find_one(ctx.filter_query({
        "appointment_id": appointment_id,
        "deleted_at": None
    }))

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "APPOINTMENT_NOT_FOUND", "message": "Appointment not found"}
        )

    return SingleResponse(data=AppointmentResponse(**doc))


@router.put(
    "/{appointment_id}",
    response_model=SingleResponse[AppointmentResponse],
    summary="Update appointment"
)
async def update_appointment(
    appointment_id: str,
    data: AppointmentUpdate,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Update appointment"""
    # Get existing appointment
    existing = await db.appointments.find_one(ctx.filter_query({
        "appointment_id": appointment_id,
        "deleted_at": None
    }))

    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "APPOINTMENT_NOT_FOUND", "message": "Appointment not found"}
        )

    update_data = data.model_dump(exclude_unset=True, mode="json")

    # If services are being updated, recalculate
    if "service_ids" in update_data:
        scheduled_time = update_data.get("scheduled_time", existing["scheduled_time"])
        line_items, total_duration, total_price, end_time = await calculate_appointment_details(
            db, ctx.business_id, update_data["service_ids"], scheduled_time
        )
        update_data["services"] = [item.model_dump() for item in line_items]
        update_data["duration_minutes"] = total_duration
        update_data["total_price"] = total_price
        update_data["end_time"] = end_time
        del update_data["service_ids"]

    # If time/date/staff changed, check conflicts
    if any(k in update_data for k in ["scheduled_date", "scheduled_time", "staff_ids"]):
        scheduled_date = update_data.get("scheduled_date", existing["scheduled_date"])
        if isinstance(scheduled_date, str):
            scheduled_date = date.fromisoformat(scheduled_date)

        scheduled_time = update_data.get("scheduled_time", existing["scheduled_time"])
        staff_ids = update_data.get("staff_ids", existing["staff_ids"])

        # Recalculate end time if needed
        if "end_time" not in update_data:
            duration = existing["duration_minutes"]
            start_hour, start_min = map(int, scheduled_time.split(":"))
            end_minutes = start_hour * 60 + start_min + duration
            end_time = f"{end_minutes // 60:02d}:{end_minutes % 60:02d}"
        else:
            end_time = update_data["end_time"]

        conflicts = await check_conflicts(
            db, ctx.business_id, scheduled_date,
            scheduled_time, end_time, staff_ids,
            exclude_appointment_id=appointment_id
        )

        if conflicts:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "SCHEDULING_CONFLICT",
                    "message": "Scheduling conflict detected",
                    "conflicts": conflicts
                }
            )

    update_data["updated_at"] = utc_now()

    result = await db.appointments.find_one_and_update(
        {"appointment_id": appointment_id},
        {"$set": update_data},
        return_document=True
    )

    return SingleResponse(data=AppointmentResponse(**result))


@router.delete(
    "/{appointment_id}",
    response_model=MessageResponse,
    summary="Cancel appointment"
)
async def cancel_appointment(
    appointment_id: str,
    reason: Optional[str] = None,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Cancel an appointment"""
    doc = await db.appointments.find_one(ctx.filter_query({
        "appointment_id": appointment_id,
        "deleted_at": None
    }))

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "APPOINTMENT_NOT_FOUND", "message": "Appointment not found"}
        )

    await db.appointments.update_one(
        {"appointment_id": appointment_id},
        {"$set": {
            "status": AppointmentStatus.CANCELED.value,
            "canceled_at": utc_now(),
            "cancel_reason": reason,
            "updated_at": utc_now()
        }}
    )

    # Update client stats
    await db.clients.update_one(
        {"client_id": doc["client_id"]},
        {"$inc": {"canceled_appointments": 1}}
    )

    return MessageResponse(message="Appointment canceled successfully")


@router.post(
    "/{appointment_id}/confirm",
    response_model=SingleResponse[AppointmentResponse],
    summary="Confirm appointment"
)
async def confirm_appointment(
    appointment_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Confirm a scheduled appointment"""
    result = await db.appointments.find_one_and_update(
        ctx.filter_query({
            "appointment_id": appointment_id,
            "status": AppointmentStatus.SCHEDULED.value,
            "deleted_at": None
        }),
        {"$set": {
            "status": AppointmentStatus.CONFIRMED.value,
            "confirmed_at": utc_now(),
            "updated_at": utc_now()
        }},
        return_document=True
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "APPOINTMENT_NOT_FOUND", "message": "Appointment not found or not in scheduled status"}
        )

    return SingleResponse(data=AppointmentResponse(**result))


@router.post(
    "/{appointment_id}/start",
    response_model=SingleResponse[AppointmentResponse],
    summary="Start appointment"
)
async def start_appointment(
    appointment_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Mark appointment as in progress"""
    result = await db.appointments.find_one_and_update(
        ctx.filter_query({
            "appointment_id": appointment_id,
            "status": {"$in": [AppointmentStatus.SCHEDULED.value, AppointmentStatus.CONFIRMED.value]},
            "deleted_at": None
        }),
        {"$set": {
            "status": AppointmentStatus.IN_PROGRESS.value,
            "started_at": utc_now(),
            "updated_at": utc_now()
        }},
        return_document=True
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "APPOINTMENT_NOT_FOUND", "message": "Appointment not found or not in valid status"}
        )

    return SingleResponse(data=AppointmentResponse(**result))


@router.post(
    "/{appointment_id}/complete",
    response_model=SingleResponse[AppointmentResponse],
    summary="Complete appointment"
)
async def complete_appointment(
    appointment_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Mark appointment as completed"""
    doc = await db.appointments.find_one(ctx.filter_query({
        "appointment_id": appointment_id,
        "deleted_at": None
    }))

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "APPOINTMENT_NOT_FOUND", "message": "Appointment not found"}
        )

    result = await db.appointments.find_one_and_update(
        {"appointment_id": appointment_id},
        {"$set": {
            "status": AppointmentStatus.COMPLETED.value,
            "completed_at": utc_now(),
            "updated_at": utc_now()
        }},
        return_document=True
    )

    # Update client stats
    await db.clients.update_one(
        {"client_id": doc["client_id"]},
        {
            "$inc": {"completed_appointments": 1},
            "$set": {"last_service_date": utc_now()}
        }
    )

    # Update service stats
    for service in doc.get("services", []):
        await db.services.update_one(
            {"service_id": service["service_id"]},
            {"$inc": {
                "times_booked": 1,
                "total_revenue": service["total_price"]
            }}
        )

    # Update staff stats
    for staff_id in doc.get("staff_ids", []):
        await db.staff.update_one(
            {"staff_id": staff_id},
            {"$inc": {
                "total_appointments": 1,
                "completed_appointments": 1,
                "total_hours_worked": doc["duration_minutes"] / 60
            }}
        )

    return SingleResponse(data=AppointmentResponse(**result))


@router.post(
    "/{appointment_id}/reschedule",
    response_model=SingleResponse[AppointmentResponse],
    summary="Reschedule appointment"
)
async def reschedule_appointment(
    appointment_id: str,
    new_date: date,
    new_time: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Reschedule an appointment to a new date/time"""
    doc = await db.appointments.find_one(ctx.filter_query({
        "appointment_id": appointment_id,
        "status": {"$in": ["scheduled", "confirmed", "weather_hold"]},
        "deleted_at": None
    }))

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "APPOINTMENT_NOT_FOUND", "message": "Appointment not found or cannot be rescheduled"}
        )

    # Recalculate end time
    duration = doc["duration_minutes"]
    start_hour, start_min = map(int, new_time.split(":"))
    end_minutes = start_hour * 60 + start_min + duration
    end_time = f"{end_minutes // 60:02d}:{end_minutes % 60:02d}"

    # Check conflicts
    staff_ids = doc.get("staff_ids", [])
    if staff_ids:
        conflicts = await check_conflicts(
            db, ctx.business_id, new_date,
            new_time, end_time, staff_ids,
            exclude_appointment_id=appointment_id
        )

        if conflicts:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "SCHEDULING_CONFLICT",
                    "message": "Scheduling conflict at new time",
                    "conflicts": conflicts
                }
            )

    update_data = {
        "scheduled_date": new_date.isoformat(),
        "scheduled_time": new_time,
        "end_time": end_time,
        "status": AppointmentStatus.SCHEDULED.value,
        "updated_at": utc_now()
    }

    # Store original date if not already stored
    if not doc.get("original_date"):
        update_data["original_date"] = doc["scheduled_date"]

    result = await db.appointments.find_one_and_update(
        {"appointment_id": appointment_id},
        {"$set": update_data},
        return_document=True
    )

    return SingleResponse(data=AppointmentResponse(**result))


@router.post(
    "/check-availability",
    summary="Check scheduling availability"
)
async def check_availability(
    check_date: date,
    duration_minutes: int = Query(60, ge=15),
    staff_ids: Optional[list[str]] = None,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Check available time slots for a given date"""
    # Get business hours
    business = await db.businesses.find_one({"business_id": ctx.business_id})
    if not business:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "BUSINESS_NOT_FOUND", "message": "Business not found"}
        )

    config = business.get("config", {})
    business_hours = config.get("business_hours", {})
    day_name = check_date.strftime("%A").lower()
    day_hours = business_hours.get(day_name, {"is_open": False})

    if not day_hours.get("is_open", False):
        return {
            "success": True,
            "data": {
                "date": check_date.isoformat(),
                "available": False,
                "reason": "Business closed",
                "slots": []
            }
        }

    open_time = day_hours.get("open_time", "08:00")
    close_time = day_hours.get("close_time", "17:00")

    # Get existing appointments
    query = {
        "business_id": ctx.business_id,
        "scheduled_date": check_date.isoformat(),
        "status": {"$in": ["scheduled", "confirmed", "in_progress"]},
        "deleted_at": None
    }

    if staff_ids:
        query["staff_ids"] = {"$in": staff_ids}

    appointments = await db.appointments.find(query).to_list(length=50)

    # Generate time slots (every 30 min)
    slots = []
    current_hour, current_min = map(int, open_time.split(":"))
    close_hour, close_min = map(int, close_time.split(":"))
    close_minutes = close_hour * 60 + close_min

    while True:
        current_minutes = current_hour * 60 + current_min
        end_minutes = current_minutes + duration_minutes

        if end_minutes > close_minutes:
            break

        slot_start = f"{current_hour:02d}:{current_min:02d}"
        slot_end = f"{end_minutes // 60:02d}:{end_minutes % 60:02d}"

        # Check for conflicts
        is_available = True
        for apt in appointments:
            apt_start = apt["scheduled_time"]
            apt_end = apt["end_time"]
            if slot_start < apt_end and slot_end > apt_start:
                is_available = False
                break

        slots.append({
            "start": slot_start,
            "end": slot_end,
            "available": is_available
        })

        # Next slot (30 min increment)
        current_min += 30
        if current_min >= 60:
            current_hour += 1
            current_min = 0

    available_slots = [s for s in slots if s["available"]]

    return {
        "success": True,
        "data": {
            "date": check_date.isoformat(),
            "available": len(available_slots) > 0,
            "slots": slots,
            "available_count": len(available_slots)
        }
    }
