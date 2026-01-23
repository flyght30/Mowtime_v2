"""
Dispatch API Router
Job queue, map data, and technician suggestions
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional
from datetime import date, datetime
from math import radians, sin, cos, sqrt, atan2

from app.database import get_database
from app.models.technician import TechStatus
from app.models.schedule_entry import ScheduleStatus
from app.models.common import utc_now
from app.middleware.auth import BusinessContext, get_business_context

router = APIRouter()


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two points in miles"""
    R = 3959  # Earth's radius in miles

    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))

    return R * c


def estimate_drive_time(distance_miles: float) -> int:
    """Estimate drive time in minutes (assumes ~30 mph average)"""
    return int(distance_miles * 2)  # 2 minutes per mile


@router.get(
    "/queue",
    summary="Get dispatch job queue"
)
async def get_dispatch_queue(
    status_filter: list[str] = Query(default=["approved", "scheduled"]),
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get jobs ready for dispatch (approved or scheduled)"""
    # Get unassigned jobs (approved status, no schedule entry)
    unassigned_query = ctx.filter_query({
        "status": "approved",
        "deleted_at": None
    })

    unassigned_jobs = await db.hvac_quotes.find(unassigned_query).sort(
        "created_at", 1
    ).to_list(length=100)

    # Get today's assigned jobs
    today = date.today().isoformat()
    assigned_query = ctx.filter_query({
        "status": "scheduled",
        "schedule.scheduled_date": today,
        "deleted_at": None
    })

    assigned_jobs = await db.hvac_quotes.find(assigned_query).sort(
        "schedule.scheduled_time_start", 1
    ).to_list(length=100)

    # Format response
    def format_job(job: dict) -> dict:
        client = job.get("client", {})
        return {
            "id": job["quote_id"],
            "job_number": job.get("job_number", job["quote_id"]),
            "customer_name": f"{client.get('first_name', '')} {client.get('last_name', '')}".strip() or "Unknown",
            "address": client.get("address", "No address"),
            "location": job.get("location"),  # {"lat": float, "lng": float}
            "job_type": job.get("job_type", "service"),
            "estimated_hours": job.get("estimated_hours", 2),
            "priority": job.get("priority", "normal"),
            "status": job["status"],
            "schedule": job.get("schedule"),
            "created_at": job["created_at"].isoformat() if isinstance(job.get("created_at"), datetime) else job.get("created_at"),
            "equipment_total": job.get("equipment_total", 0),
            "grand_total": job.get("grand_total", 0)
        }

    return {
        "success": True,
        "data": {
            "unassigned": [format_job(j) for j in unassigned_jobs],
            "assigned_today": [format_job(j) for j in assigned_jobs],
            "total_unassigned": len(unassigned_jobs)
        }
    }


@router.get(
    "/map-data",
    summary="Get map data for dispatch board"
)
async def get_map_data(
    date_str: str = Query(None, alias="date", description="Date YYYY-MM-DD (defaults to today)"),
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get technician locations and job pins for the map"""
    target_date = date_str or date.today().isoformat()

    # Get all active technicians with their locations
    techs = await db.technicians.find(ctx.filter_query({
        "deleted_at": None,
        "is_active": True
    })).to_list(length=50)

    tech_data = []
    for tech in techs:
        location = tech.get("location")
        tech_data.append({
            "id": tech["tech_id"],
            "name": f"{tech['first_name']} {tech['last_name']}",
            "status": tech["status"],
            "location": {
                "lat": location["coordinates"][1],
                "lng": location["coordinates"][0]
            } if location and location.get("coordinates") else None,
            "current_job_id": tech.get("current_job_id"),
            "color": tech.get("color", "#4CAF50")
        })

    # Get jobs for the date (both scheduled and unassigned)
    jobs_query = ctx.filter_query({
        "$or": [
            {"status": "approved"},  # Unassigned
            {"schedule.scheduled_date": target_date}  # Scheduled for today
        ],
        "deleted_at": None
    })

    jobs = await db.hvac_quotes.find(jobs_query).to_list(length=200)

    job_data = []
    for job in jobs:
        client = job.get("client", {})
        location = job.get("location")
        schedule = job.get("schedule", {})

        job_data.append({
            "id": job["quote_id"],
            "job_number": job.get("job_number", job["quote_id"]),
            "customer_name": f"{client.get('first_name', '')} {client.get('last_name', '')}".strip(),
            "address": client.get("address"),
            "location": location,
            "status": job["status"],
            "tech_id": schedule.get("tech_id") if schedule else None,
            "scheduled_time": schedule.get("scheduled_time_start") if schedule else None,
            "job_type": job.get("job_type", "service")
        })

    return {
        "success": True,
        "data": {
            "date": target_date,
            "technicians": tech_data,
            "jobs": job_data
        }
    }


@router.post(
    "/suggest-tech",
    summary="Suggest best technician for a job"
)
async def suggest_technician(
    job_id: str,
    target_date: Optional[str] = Query(None, description="Target date YYYY-MM-DD"),
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get ranked technician suggestions for a job"""
    # Get job details
    job = await db.hvac_quotes.find_one(ctx.filter_query({
        "quote_id": job_id,
        "deleted_at": None
    }))

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "JOB_NOT_FOUND", "message": "Job not found"}
        )

    job_location = job.get("location")
    job_type = job.get("job_type", "service")
    estimated_hours = job.get("estimated_hours", 2)

    # Skill requirements based on job type
    required_skill = {
        "install": "can_install",
        "service": "can_service",
        "maintenance": "can_maintenance"
    }.get(job_type, "can_service")

    # Get all active technicians
    techs = await db.technicians.find(ctx.filter_query({
        "deleted_at": None,
        "is_active": True,
        "status": {"$ne": TechStatus.OFF_DUTY.value}
    })).to_list(length=50)

    # Calculate date for availability check
    check_date = target_date or date.today().isoformat()

    suggestions = []
    for tech in techs:
        score = 50  # Base score
        reasons = []

        # Check skills
        skills = tech.get("skills", {})
        if skills.get(required_skill, False):
            score += 20
            reasons.append(f"{job_type.title()} certified")
        else:
            score -= 30
            reasons.append(f"Not {job_type} certified")

        # Check distance
        tech_location = tech.get("location")
        distance_miles = None
        eta_minutes = None

        if tech_location and job_location:
            tech_coords = tech_location.get("coordinates", [])
            if len(tech_coords) >= 2:
                distance_miles = haversine_distance(
                    tech_coords[1], tech_coords[0],  # lat, lng
                    job_location.get("lat", 0), job_location.get("lng", 0)
                )
                eta_minutes = estimate_drive_time(distance_miles)

                if distance_miles < 5:
                    score += 25
                    reasons.append(f"Closest ({eta_minutes} min)")
                elif distance_miles < 15:
                    score += 15
                    reasons.append(f"Nearby ({eta_minutes} min)")
                else:
                    reasons.append(f"{eta_minutes} min away")

        # Check availability for the day
        entries = await db.schedule_entries.find({
            "business_id": ctx.business_id,
            "tech_id": tech["tech_id"],
            "scheduled_date": check_date,
            "status": {"$in": ["scheduled", "in_progress"]},
            "deleted_at": None
        }).to_list(length=20)

        total_scheduled_hours = sum(e.get("estimated_hours", 0) for e in entries)
        schedule = tech.get("schedule", {})
        work_hours = 8  # Default work hours

        if schedule.get("start_time") and schedule.get("end_time"):
            start_h, _ = map(int, schedule["start_time"].split(":"))
            end_h, _ = map(int, schedule["end_time"].split(":"))
            work_hours = end_h - start_h - (schedule.get("lunch_duration", 60) / 60)

        available_hours = work_hours - total_scheduled_hours

        if available_hours >= estimated_hours:
            score += 15
            # Find next available slot
            if entries:
                last_end = max(e["end_time"] for e in entries)
                reasons.append(f"Available after {last_end}")
            else:
                reasons.append("Available all day")
        else:
            score -= 20
            reasons.append(f"Limited availability ({available_hours:.1f}h)")

        # Current status bonus
        if tech["status"] == TechStatus.AVAILABLE.value:
            score += 10
            reasons.append("Currently available")
        elif tech["status"] == TechStatus.COMPLETE.value:
            score += 5
            reasons.append("Just finished job")

        suggestions.append({
            "tech_id": tech["tech_id"],
            "tech_name": f"{tech['first_name']} {tech['last_name']}",
            "score": max(0, min(100, score)),  # Clamp 0-100
            "reasons": reasons,
            "eta_minutes": eta_minutes,
            "distance_miles": round(distance_miles, 1) if distance_miles else None,
            "status": tech["status"],
            "available_hours": available_hours
        })

    # Sort by score descending
    suggestions.sort(key=lambda x: x["score"], reverse=True)

    return {
        "success": True,
        "data": {
            "job_id": job_id,
            "target_date": check_date,
            "suggestions": suggestions
        }
    }


@router.get(
    "/route",
    summary="Get technician's route for a day"
)
async def get_tech_route(
    tech_id: str,
    date_str: str = Query(..., alias="date", description="Date YYYY-MM-DD"),
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get the route (ordered stops) for a technician on a given day"""
    try:
        target_date = date.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_DATE", "message": "Invalid date format"}
        )

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

    # Get schedule entries for this day
    entries = await db.schedule_entries.find(ctx.filter_query({
        "tech_id": tech_id,
        "scheduled_date": date_str,
        "status": {"$in": ["scheduled", "in_progress"]},
        "deleted_at": None
    })).sort("order", 1).to_list(length=20)

    if not entries:
        return {
            "success": True,
            "data": {
                "tech_id": tech_id,
                "tech_name": f"{tech['first_name']} {tech['last_name']}",
                "date": date_str,
                "stops": [],
                "total_drive_time": 0,
                "total_job_time": 0
            }
        }

    # Get job details
    job_ids = [e["job_id"] for e in entries]
    jobs = await db.hvac_quotes.find({
        "quote_id": {"$in": job_ids}
    }).to_list(length=20)

    job_map = {j["quote_id"]: j for j in jobs}

    # Build stops list
    stops = []
    total_drive_time = 0
    total_job_time = 0
    prev_location = None

    for i, entry in enumerate(entries):
        job = job_map.get(entry["job_id"], {})
        client = job.get("client", {})
        location = job.get("location")

        # Calculate travel time from previous stop
        travel_time = 0
        if prev_location and location:
            distance = haversine_distance(
                prev_location.get("lat", 0), prev_location.get("lng", 0),
                location.get("lat", 0), location.get("lng", 0)
            )
            travel_time = estimate_drive_time(distance)
            total_drive_time += travel_time

        job_duration = entry.get("estimated_hours", 2) * 60
        total_job_time += job_duration

        stops.append({
            "order": i + 1,
            "entry_id": entry["entry_id"],
            "job_id": entry["job_id"],
            "job_number": job.get("job_number", entry["job_id"]),
            "customer_name": f"{client.get('first_name', '')} {client.get('last_name', '')}".strip(),
            "address": client.get("address", "Unknown"),
            "location": location,
            "arrival_time": entry["start_time"],
            "departure_time": entry["end_time"],
            "travel_from_previous": travel_time,
            "status": entry["status"],
            "job_type": job.get("job_type", "service")
        })

        prev_location = location

    return {
        "success": True,
        "data": {
            "tech_id": tech_id,
            "tech_name": f"{tech['first_name']} {tech['last_name']}",
            "date": date_str,
            "stops": stops,
            "total_drive_time": total_drive_time,
            "total_job_time": int(total_job_time),
            "stop_count": len(stops)
        }
    }


@router.get(
    "/stats",
    summary="Get dispatch statistics"
)
async def get_dispatch_stats(
    date_str: Optional[str] = Query(None, alias="date"),
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get dispatch statistics for the day"""
    target_date = date_str or date.today().isoformat()

    # Count technicians by status
    tech_pipeline = [
        {"$match": ctx.filter_query({"deleted_at": None, "is_active": True})},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]
    tech_stats = await db.technicians.aggregate(tech_pipeline).to_list(length=10)
    tech_by_status = {s["_id"]: s["count"] for s in tech_stats}

    # Count jobs for today
    jobs_scheduled = await db.hvac_quotes.count_documents(ctx.filter_query({
        "schedule.scheduled_date": target_date,
        "status": "scheduled",
        "deleted_at": None
    }))

    jobs_in_progress = await db.hvac_quotes.count_documents(ctx.filter_query({
        "schedule.scheduled_date": target_date,
        "status": "in_progress",
        "deleted_at": None
    }))

    jobs_completed = await db.hvac_quotes.count_documents(ctx.filter_query({
        "schedule.scheduled_date": target_date,
        "status": "completed",
        "deleted_at": None
    }))

    jobs_unassigned = await db.hvac_quotes.count_documents(ctx.filter_query({
        "status": "approved",
        "deleted_at": None
    }))

    return {
        "success": True,
        "data": {
            "date": target_date,
            "technicians": {
                "total_active": sum(tech_by_status.values()),
                "available": tech_by_status.get("available", 0),
                "enroute": tech_by_status.get("enroute", 0),
                "on_site": tech_by_status.get("on_site", 0),
                "off_duty": tech_by_status.get("off_duty", 0)
            },
            "jobs": {
                "unassigned": jobs_unassigned,
                "scheduled": jobs_scheduled,
                "in_progress": jobs_in_progress,
                "completed": jobs_completed,
                "total_today": jobs_scheduled + jobs_in_progress + jobs_completed
            }
        }
    }
