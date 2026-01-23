"""
Dispatch Schedule API Router
Job scheduling and assignment for technicians
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional
from datetime import date, datetime, timedelta

from app.database import get_database
from app.models.schedule_entry import (
    ScheduleEntry, ScheduleEntryCreate, ScheduleEntryUpdate, ScheduleEntryResponse,
    ScheduleStatus, DailySchedule, AssignJobRequest, AssignJobResponse,
    OptimizeRouteRequest, OptimizeRouteResponse, RouteStop
)
from app.models.technician import TechStatus
from app.models.common import utc_now
from app.middleware.auth import BusinessContext, get_business_context
from app.schemas.common import (
    SingleResponse, ListResponse, MessageResponse
)

router = APIRouter()


def calculate_end_time(start_time: str, hours: float) -> str:
    """Calculate end time from start time and duration"""
    h, m = map(int, start_time.split(":"))
    total_minutes = h * 60 + m + int(hours * 60)
    end_h = (total_minutes // 60) % 24
    end_m = total_minutes % 60
    return f"{end_h:02d}:{end_m:02d}"


def time_to_minutes(time_str: str) -> int:
    """Convert HH:MM to minutes since midnight"""
    h, m = map(int, time_str.split(":"))
    return h * 60 + m


def times_overlap(start1: str, end1: str, start2: str, end2: str) -> bool:
    """Check if two time ranges overlap"""
    s1, e1 = time_to_minutes(start1), time_to_minutes(end1)
    s2, e2 = time_to_minutes(start2), time_to_minutes(end2)
    return s1 < e2 and s2 < e1


@router.get(
    "",
    summary="Get schedule for a date"
)
async def get_schedule(
    date_str: str = Query(..., alias="date", description="Date YYYY-MM-DD"),
    tech_id: Optional[str] = None,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get schedule for a specific date, optionally filtered by technician"""
    try:
        target_date = date.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_DATE", "message": "Invalid date format. Use YYYY-MM-DD"}
        )

    query = ctx.filter_query({
        "scheduled_date": target_date.isoformat(),
        "deleted_at": None
    })

    if tech_id:
        query["tech_id"] = tech_id

    entries = await db.schedule_entries.find(query).sort("order", 1).to_list(length=100)

    # Get all technicians for this business
    techs = await db.technicians.find(ctx.filter_query({
        "deleted_at": None,
        "is_active": True
    })).to_list(length=50)

    # Group entries by technician
    tech_schedules = []
    for tech in techs:
        tech_entries = [e for e in entries if e["tech_id"] == tech["tech_id"]]

        # Calculate available slots
        schedule = tech.get("schedule", {})
        work_start = schedule.get("start_time", "08:00")
        work_end = schedule.get("end_time", "17:00")
        lunch_start = schedule.get("lunch_start", "12:00")
        lunch_duration = schedule.get("lunch_duration", 60)

        # Build busy periods
        busy = []
        for e in tech_entries:
            busy.append((e["start_time"], e["end_time"]))

        # Add lunch as busy
        lunch_end_minutes = time_to_minutes(lunch_start) + lunch_duration
        lunch_end = f"{lunch_end_minutes // 60:02d}:{lunch_end_minutes % 60:02d}"
        busy.append((lunch_start, lunch_end))
        busy.sort()

        # Find gaps
        available_slots = []
        current = work_start
        for start, end in busy:
            if time_to_minutes(current) < time_to_minutes(start):
                available_slots.append({"start": current, "end": start})
            current = max(current, end, key=time_to_minutes)
        if time_to_minutes(current) < time_to_minutes(work_end):
            available_slots.append({"start": current, "end": work_end})

        total_hours = sum(e.get("estimated_hours", 0) for e in tech_entries)

        tech_schedules.append({
            "tech_id": tech["tech_id"],
            "tech_name": f"{tech['first_name']} {tech['last_name']}",
            "entries": [ScheduleEntryResponse(**e).model_dump() for e in tech_entries],
            "available_slots": available_slots,
            "total_hours": total_hours
        })

    return {
        "success": True,
        "data": {
            "date": date_str,
            "technicians": tech_schedules
        }
    }


@router.get(
    "/week",
    summary="Get week schedule"
)
async def get_week_schedule(
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    tech_id: Optional[str] = None,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get schedule for a week starting from the given date"""
    try:
        start = date.fromisoformat(start_date)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_DATE", "message": "Invalid date format"}
        )

    end = start + timedelta(days=6)

    query = ctx.filter_query({
        "scheduled_date": {"$gte": start.isoformat(), "$lte": end.isoformat()},
        "deleted_at": None
    })

    if tech_id:
        query["tech_id"] = tech_id

    entries = await db.schedule_entries.find(query).sort(
        [("scheduled_date", 1), ("order", 1)]
    ).to_list(length=500)

    # Get technicians
    tech_query = ctx.filter_query({"deleted_at": None, "is_active": True})
    if tech_id:
        tech_query["tech_id"] = tech_id
    techs = await db.technicians.find(tech_query).to_list(length=50)

    # Group by date and tech
    week_data = []
    current_date = start
    while current_date <= end:
        date_str = current_date.isoformat()
        day_entries = [e for e in entries if e["scheduled_date"] == date_str]

        day_data = {
            "date": date_str,
            "day": current_date.strftime("%A"),
            "technicians": []
        }

        for tech in techs:
            tech_entries = [e for e in day_entries if e["tech_id"] == tech["tech_id"]]
            day_data["technicians"].append({
                "tech_id": tech["tech_id"],
                "tech_name": f"{tech['first_name']} {tech['last_name']}",
                "entries": [ScheduleEntryResponse(**e).model_dump() for e in tech_entries],
                "total_hours": sum(e.get("estimated_hours", 0) for e in tech_entries)
            })

        week_data.append(day_data)
        current_date += timedelta(days=1)

    return {
        "success": True,
        "data": week_data
    }


@router.post(
    "/assign",
    response_model=SingleResponse[AssignJobResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Assign job to technician"
)
async def assign_job(
    data: AssignJobRequest,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Assign a job to a technician for a specific date/time"""
    # Verify technician exists
    tech = await db.technicians.find_one(ctx.filter_query({
        "tech_id": data.tech_id,
        "deleted_at": None
    }))
    if not tech:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "TECH_NOT_FOUND", "message": "Technician not found"}
        )

    # Verify job exists (check HVAC quotes collection)
    job = await db.hvac_quotes.find_one(ctx.filter_query({
        "quote_id": data.job_id,
        "deleted_at": None
    }))
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "JOB_NOT_FOUND", "message": "Job not found"}
        )

    # Calculate end time
    end_time = calculate_end_time(data.start_time, data.estimated_hours)

    # Check for conflicts
    existing_entries = await db.schedule_entries.find(ctx.filter_query({
        "tech_id": data.tech_id,
        "scheduled_date": data.scheduled_date.isoformat(),
        "status": {"$in": ["scheduled", "in_progress"]},
        "deleted_at": None
    })).to_list(length=50)

    conflicts = []
    for entry in existing_entries:
        if times_overlap(data.start_time, end_time, entry["start_time"], entry["end_time"]):
            conflicts.append({
                "entry_id": entry["entry_id"],
                "job_id": entry["job_id"],
                "start_time": entry["start_time"],
                "end_time": entry["end_time"]
            })

    # Get next order number
    max_order_entry = await db.schedule_entries.find_one(
        ctx.filter_query({
            "tech_id": data.tech_id,
            "scheduled_date": data.scheduled_date.isoformat(),
            "deleted_at": None
        }),
        sort=[("order", -1)]
    )
    next_order = (max_order_entry.get("order", 0) if max_order_entry else 0) + 1

    # Create schedule entry
    entry = ScheduleEntry(
        business_id=ctx.business_id,
        tech_id=data.tech_id,
        job_id=data.job_id,
        scheduled_date=data.scheduled_date,
        start_time=data.start_time,
        end_time=end_time,
        estimated_hours=data.estimated_hours,
        order=next_order,
        notes=data.notes
    )

    await db.schedule_entries.insert_one(entry.model_dump())

    # Update job status to scheduled
    await db.hvac_quotes.update_one(
        {"quote_id": data.job_id},
        {
            "$set": {
                "schedule.scheduled_date": data.scheduled_date.isoformat(),
                "schedule.scheduled_time_start": data.start_time,
                "schedule.scheduled_time_end": end_time,
                "schedule.tech_id": data.tech_id,
                "schedule.estimated_hours": data.estimated_hours,
                "schedule.schedule_entry_id": entry.entry_id,
                "status": "scheduled",
                "updated_at": utc_now()
            }
        }
    )

    # Update technician's next_job_id if this is the first job today
    if next_order == 1:
        await db.technicians.update_one(
            {"tech_id": data.tech_id},
            {"$set": {"next_job_id": data.job_id, "updated_at": utc_now()}}
        )

    response = AssignJobResponse(
        schedule_entry=ScheduleEntryResponse(**entry.model_dump()),
        conflicts=conflicts
    )

    return SingleResponse(data=response)


@router.get(
    "/{entry_id}",
    response_model=SingleResponse[ScheduleEntryResponse],
    summary="Get schedule entry"
)
async def get_schedule_entry(
    entry_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get a specific schedule entry"""
    doc = await db.schedule_entries.find_one(ctx.filter_query({
        "entry_id": entry_id,
        "deleted_at": None
    }))

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "ENTRY_NOT_FOUND", "message": "Schedule entry not found"}
        )

    return SingleResponse(data=ScheduleEntryResponse(**doc))


@router.put(
    "/{entry_id}",
    response_model=SingleResponse[ScheduleEntryResponse],
    summary="Update schedule entry"
)
async def update_schedule_entry(
    entry_id: str,
    data: ScheduleEntryUpdate,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Update a schedule entry"""
    update_data = data.model_dump(exclude_unset=True)

    # Recalculate end time if start_time or estimated_hours changed
    if "start_time" in update_data or "estimated_hours" in update_data:
        entry = await db.schedule_entries.find_one(ctx.filter_query({
            "entry_id": entry_id,
            "deleted_at": None
        }))
        if entry:
            start = update_data.get("start_time", entry["start_time"])
            hours = update_data.get("estimated_hours", entry["estimated_hours"])
            update_data["end_time"] = calculate_end_time(start, hours)

    update_data["updated_at"] = utc_now()

    result = await db.schedule_entries.find_one_and_update(
        ctx.filter_query({"entry_id": entry_id, "deleted_at": None}),
        {"$set": update_data},
        return_document=True
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "ENTRY_NOT_FOUND", "message": "Schedule entry not found"}
        )

    # Update job schedule info
    await db.hvac_quotes.update_one(
        {"quote_id": result["job_id"]},
        {
            "$set": {
                "schedule.scheduled_date": result["scheduled_date"],
                "schedule.scheduled_time_start": result["start_time"],
                "schedule.scheduled_time_end": result["end_time"],
                "schedule.estimated_hours": result["estimated_hours"],
                "updated_at": utc_now()
            }
        }
    )

    return SingleResponse(data=ScheduleEntryResponse(**result))


@router.delete(
    "/{entry_id}",
    response_model=MessageResponse,
    summary="Delete schedule entry"
)
async def delete_schedule_entry(
    entry_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Delete a schedule entry (unassign job)"""
    entry = await db.schedule_entries.find_one(ctx.filter_query({
        "entry_id": entry_id,
        "deleted_at": None
    }))

    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "ENTRY_NOT_FOUND", "message": "Schedule entry not found"}
        )

    # Soft delete
    await db.schedule_entries.update_one(
        {"entry_id": entry_id},
        {"$set": {"deleted_at": utc_now(), "updated_at": utc_now()}}
    )

    # Update job status back to approved
    await db.hvac_quotes.update_one(
        {"quote_id": entry["job_id"]},
        {
            "$set": {
                "status": "approved",
                "schedule": None,
                "updated_at": utc_now()
            }
        }
    )

    return MessageResponse(message="Schedule entry deleted, job unassigned")


@router.patch(
    "/{entry_id}/status",
    response_model=SingleResponse[ScheduleEntryResponse],
    summary="Update schedule entry status"
)
async def update_entry_status(
    entry_id: str,
    new_status: ScheduleStatus,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Update schedule entry status (started, completed, cancelled)"""
    update_data = {
        "status": new_status.value,
        "updated_at": utc_now()
    }

    if new_status == ScheduleStatus.IN_PROGRESS:
        update_data["started_at"] = utc_now()
    elif new_status == ScheduleStatus.COMPLETE:
        update_data["completed_at"] = utc_now()

    result = await db.schedule_entries.find_one_and_update(
        ctx.filter_query({"entry_id": entry_id, "deleted_at": None}),
        {"$set": update_data},
        return_document=True
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "ENTRY_NOT_FOUND", "message": "Schedule entry not found"}
        )

    # Update job status to match
    job_status_map = {
        ScheduleStatus.IN_PROGRESS: "in_progress",
        ScheduleStatus.COMPLETE: "completed",
        ScheduleStatus.CANCELLED: "approved"
    }
    if new_status in job_status_map:
        await db.hvac_quotes.update_one(
            {"quote_id": result["job_id"]},
            {"$set": {"status": job_status_map[new_status], "updated_at": utc_now()}}
        )

    return SingleResponse(data=ScheduleEntryResponse(**result))


@router.post(
    "/optimize",
    summary="Optimize technician's route"
)
async def optimize_route(
    data: OptimizeRouteRequest,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Optimize the order of jobs for a technician on a given day"""
    # Get all scheduled entries for this tech on this day
    entries = await db.schedule_entries.find(ctx.filter_query({
        "tech_id": data.tech_id,
        "scheduled_date": data.date.isoformat(),
        "status": ScheduleStatus.SCHEDULED.value,
        "deleted_at": None
    })).sort("order", 1).to_list(length=20)

    if len(entries) < 2:
        return {
            "success": True,
            "data": {
                "message": "Not enough jobs to optimize",
                "tech_id": data.tech_id,
                "date": data.date.isoformat(),
                "job_count": len(entries)
            }
        }

    # Get job details with locations
    job_ids = [e["job_id"] for e in entries]
    jobs = await db.hvac_quotes.find({
        "quote_id": {"$in": job_ids}
    }).to_list(length=20)

    job_map = {j["quote_id"]: j for j in jobs}

    original_order = [e["job_id"] for e in entries]

    # Simple optimization: sort by scheduled time (for now)
    # In production, this would call Mapbox Optimization API
    # For now, just return the current order as "optimized"
    stops = []
    current_time = entries[0]["start_time"] if entries else "08:00"

    for i, entry in enumerate(entries):
        job = job_map.get(entry["job_id"], {})
        client_data = job.get("client", {})
        address = client_data.get("address", "Unknown address")

        stops.append(RouteStop(
            order=i + 1,
            job_id=entry["job_id"],
            address=address,
            location=job.get("location"),
            arrival_time=entry["start_time"],
            departure_time=entry["end_time"],
            travel_from_previous=15 if i > 0 else 0  # Placeholder
        ).model_dump())

        current_time = entry["end_time"]

    response = OptimizeRouteResponse(
        tech_id=data.tech_id,
        date=data.date,
        original_order=original_order,
        optimized_order=original_order,  # Same for now
        stops=stops,
        time_saved_minutes=0,
        total_drive_time_minutes=15 * (len(entries) - 1) if len(entries) > 1 else 0
    )

    return {"success": True, "data": response.model_dump()}
