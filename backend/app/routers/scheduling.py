"""
Scheduling API Router
Weather-aware scheduling and availability checking
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import date

from app.database import get_database
from app.models.user import User
from app.middleware.auth import get_current_user, BusinessContext, get_business_context
from app.services.scheduling_service import SchedulingService
from app.services.weather_service import WeatherService
from app.schemas.common import MessageResponse

router = APIRouter()


def get_scheduling_service(db: AsyncIOMotorDatabase = Depends(get_database)) -> SchedulingService:
    """Get scheduling service"""
    return SchedulingService(db)


def get_weather_service(db: AsyncIOMotorDatabase = Depends(get_database)) -> WeatherService:
    """Get weather service"""
    return WeatherService(db)


@router.get(
    "/slots",
    summary="Get available time slots"
)
async def get_available_slots(
    date_str: str = Query(..., alias="date", description="Date YYYY-MM-DD"),
    duration: int = Query(60, ge=15, description="Appointment duration in minutes"),
    staff_id: str = Query(None, description="Specific staff member"),
    ctx: BusinessContext = Depends(get_business_context),
    scheduling: SchedulingService = Depends(get_scheduling_service)
):
    """Get available scheduling slots for a date"""
    try:
        target_date = date.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_DATE", "message": "Invalid date format. Use YYYY-MM-DD"}
        )

    staff_ids = [staff_id] if staff_id else None

    slots = await scheduling.get_available_slots(
        ctx.business_id,
        target_date,
        duration,
        staff_ids
    )

    available = [s for s in slots if s.available]

    return {
        "success": True,
        "data": {
            "date": date_str,
            "duration_minutes": duration,
            "slots": [s.to_dict() for s in slots],
            "available_count": len(available),
            "total_count": len(slots)
        }
    }


@router.post(
    "/check-conflicts",
    summary="Check for scheduling conflicts"
)
async def check_conflicts(
    date_str: str = Query(..., alias="date"),
    start_time: str = Query(..., description="Start time HH:MM"),
    end_time: str = Query(..., description="End time HH:MM"),
    staff_ids: list[str] = Query(default=[]),
    equipment_ids: list[str] = Query(default=[]),
    exclude_id: str = Query(None, description="Appointment ID to exclude"),
    ctx: BusinessContext = Depends(get_business_context),
    scheduling: SchedulingService = Depends(get_scheduling_service)
):
    """Check for scheduling conflicts before creating/updating appointment"""
    try:
        target_date = date.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_DATE", "message": "Invalid date format"}
        )

    conflicts = await scheduling.check_conflicts(
        ctx.business_id,
        target_date,
        start_time,
        end_time,
        staff_ids,
        equipment_ids,
        exclude_id
    )

    return {
        "success": True,
        "data": {
            "has_conflicts": len(conflicts) > 0,
            "conflicts": [c.to_dict() for c in conflicts]
        }
    }


@router.get(
    "/business-hours",
    summary="Get business hours for a date"
)
async def get_business_hours(
    date_str: str = Query(..., alias="date"),
    ctx: BusinessContext = Depends(get_business_context),
    scheduling: SchedulingService = Depends(get_scheduling_service)
):
    """Get business operating hours for a specific date"""
    try:
        target_date = date.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_DATE", "message": "Invalid date format"}
        )

    hours = await scheduling.get_business_hours(ctx.business_id, target_date)

    return {
        "success": True,
        "data": {
            "date": date_str,
            "day": target_date.strftime("%A"),
            "is_open": hours.get("is_open", False) if hours else False,
            "open_time": hours.get("open_time") if hours else None,
            "close_time": hours.get("close_time") if hours else None
        }
    }


@router.get(
    "/weather/forecast",
    summary="Get weather forecast"
)
async def get_weather_forecast(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    days: int = Query(7, ge=1, le=7),
    weather: WeatherService = Depends(get_weather_service),
    current_user: User = Depends(get_current_user)
):
    """Get weather forecast for a location"""
    forecasts = await weather.get_forecast(latitude, longitude, days)

    return {
        "success": True,
        "data": [f.to_dict() for f in forecasts]
    }


@router.post(
    "/weather/check",
    summary="Check weather conditions for scheduling"
)
async def check_weather_conditions(
    date_str: str = Query(..., alias="date"),
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Check if weather conditions are suitable for outdoor work"""
    try:
        target_date = date.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_DATE", "message": "Invalid date format"}
        )

    # Get business weather thresholds
    business = await db.businesses.find_one({"business_id": ctx.business_id})
    if not business:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "BUSINESS_NOT_FOUND", "message": "Business not found"}
        )

    config = business.get("config", {})
    thresholds = config.get("weather_thresholds", {
        "rain_probability_percent": 70,
        "min_temperature_f": 32,
        "max_temperature_f": 105,
        "max_wind_speed_mph": 35
    })

    weather = WeatherService(db)
    result = await weather.check_weather_conditions(
        latitude, longitude, target_date, thresholds
    )

    return {
        "success": True,
        "data": {
            "date": date_str,
            "suitable": result["suitable"],
            "reasons": result.get("reasons", []),
            "weather": result.get("weather"),
            "thresholds": thresholds
        }
    }


@router.post(
    "/weather/auto-reschedule",
    summary="Auto-reschedule appointments for weather"
)
async def auto_reschedule_for_weather(
    lookahead_hours: int = Query(48, ge=24, le=168),
    ctx: BusinessContext = Depends(get_business_context),
    scheduling: SchedulingService = Depends(get_scheduling_service)
):
    """
    Check upcoming appointments and put on weather hold if needed.
    This should be called periodically (e.g., via cron job).
    """
    rescheduled = await scheduling.auto_reschedule_for_weather(
        ctx.business_id,
        lookahead_hours
    )

    return {
        "success": True,
        "data": {
            "checked_hours": lookahead_hours,
            "rescheduled_count": len(rescheduled),
            "appointments": rescheduled
        }
    }


@router.post(
    "/appointments/{appointment_id}/weather-check",
    summary="Check weather for specific appointment"
)
async def check_appointment_weather(
    appointment_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    scheduling: SchedulingService = Depends(get_scheduling_service),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Check weather conditions for a specific appointment"""
    # Get appointment
    appointment = await db.appointments.find_one({
        "appointment_id": appointment_id,
        "business_id": ctx.business_id,
        "deleted_at": None
    })

    if not appointment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "APPOINTMENT_NOT_FOUND", "message": "Appointment not found"}
        )

    # Get client's address
    client = await db.clients.find_one({"client_id": appointment["client_id"]})
    if not client or not client.get("addresses"):
        return {
            "success": True,
            "data": {
                "can_check": False,
                "reason": "Client has no address with coordinates"
            }
        }

    addr = client["addresses"][appointment.get("address_index", 0)]
    lat = addr.get("latitude")
    lon = addr.get("longitude")

    if not lat or not lon:
        return {
            "success": True,
            "data": {
                "can_check": False,
                "reason": "Address has no coordinates"
            }
        }

    result = await scheduling.check_weather_and_reschedule(
        ctx.business_id,
        appointment_id,
        lat,
        lon
    )

    return {
        "success": True,
        "data": {
            "appointment_id": appointment_id,
            "scheduled_date": appointment["scheduled_date"],
            **result
        }
    }
