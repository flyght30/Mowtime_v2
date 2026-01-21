"""
Scheduling Service
Handles appointment scheduling, conflict detection, and availability
"""

from datetime import datetime, date, time, timedelta
from typing import Optional
import logging

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.appointment import AppointmentStatus
from app.models.common import utc_now
from app.services.weather_service import WeatherService

logger = logging.getLogger(__name__)


class TimeSlot:
    """Represents a time slot for scheduling"""
    def __init__(self, start: str, end: str, available: bool = True):
        self.start = start  # HH:MM
        self.end = end  # HH:MM
        self.available = available

    def overlaps(self, other: "TimeSlot") -> bool:
        """Check if this slot overlaps with another"""
        return self.start < other.end and self.end > other.start

    def to_dict(self) -> dict:
        return {
            "start": self.start,
            "end": self.end,
            "available": self.available
        }


class Conflict:
    """Represents a scheduling conflict"""
    def __init__(
        self,
        conflict_type: str,
        entity_type: str,
        entity_id: str,
        details: str
    ):
        self.conflict_type = conflict_type
        self.entity_type = entity_type
        self.entity_id = entity_id
        self.details = details

    def to_dict(self) -> dict:
        return {
            "type": self.conflict_type,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "details": self.details
        }


class SchedulingService:
    """Service for scheduling operations"""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.weather_service = WeatherService(db)

    async def get_business_hours(
        self,
        business_id: str,
        target_date: date
    ) -> Optional[dict]:
        """
        Get business hours for a specific date

        Returns:
            Dict with is_open, open_time, close_time or None
        """
        business = await self.db.businesses.find_one({"business_id": business_id})
        if not business:
            return None

        config = business.get("config", {})
        business_hours = config.get("business_hours", {})

        day_name = target_date.strftime("%A").lower()
        day_config = business_hours.get(day_name, {"is_open": False})

        return day_config

    async def get_available_slots(
        self,
        business_id: str,
        target_date: date,
        duration_minutes: int,
        staff_ids: Optional[list[str]] = None,
        slot_interval: int = 30
    ) -> list[TimeSlot]:
        """
        Get available time slots for a date

        Args:
            business_id: Business ID
            target_date: Date to check
            duration_minutes: Required appointment duration
            staff_ids: Optional list of staff to check (if None, checks all)
            slot_interval: Minutes between slot start times

        Returns:
            List of TimeSlot objects
        """
        # Get business hours
        day_hours = await self.get_business_hours(business_id, target_date)
        if not day_hours or not day_hours.get("is_open", False):
            return []

        open_time = day_hours.get("open_time", "08:00")
        close_time = day_hours.get("close_time", "17:00")

        # Get existing appointments for the day
        appointments = await self.db.appointments.find({
            "business_id": business_id,
            "scheduled_date": target_date.isoformat(),
            "status": {"$in": ["scheduled", "confirmed", "in_progress"]},
            "deleted_at": None
        }).to_list(length=100)

        # If staff_ids specified, filter by them
        if staff_ids:
            appointments = [
                a for a in appointments
                if any(s in a.get("staff_ids", []) for s in staff_ids)
            ]

        # Generate all possible slots
        slots = []
        current = self._time_str_to_minutes(open_time)
        close = self._time_str_to_minutes(close_time)

        while current + duration_minutes <= close:
            slot_start = self._minutes_to_time_str(current)
            slot_end = self._minutes_to_time_str(current + duration_minutes)

            # Check for conflicts
            is_available = True
            for apt in appointments:
                apt_start = apt.get("scheduled_time", "")
                apt_end = apt.get("end_time", "")

                if slot_start < apt_end and slot_end > apt_start:
                    is_available = False
                    break

            slots.append(TimeSlot(slot_start, slot_end, is_available))
            current += slot_interval

        return slots

    async def check_conflicts(
        self,
        business_id: str,
        target_date: date,
        start_time: str,
        end_time: str,
        staff_ids: list[str],
        equipment_ids: Optional[list[str]] = None,
        exclude_appointment_id: Optional[str] = None
    ) -> list[Conflict]:
        """
        Check for scheduling conflicts

        Args:
            business_id: Business ID
            target_date: Appointment date
            start_time: Start time HH:MM
            end_time: End time HH:MM
            staff_ids: Staff assigned
            equipment_ids: Equipment needed
            exclude_appointment_id: Appointment to exclude (for updates)

        Returns:
            List of Conflict objects
        """
        conflicts = []

        # Check business hours
        day_hours = await self.get_business_hours(business_id, target_date)
        if not day_hours or not day_hours.get("is_open", False):
            conflicts.append(Conflict(
                conflict_type="business_closed",
                entity_type="business",
                entity_id=business_id,
                details=f"Business is closed on {target_date.strftime('%A')}"
            ))
            return conflicts

        open_time = day_hours.get("open_time", "08:00")
        close_time = day_hours.get("close_time", "17:00")

        if start_time < open_time:
            conflicts.append(Conflict(
                conflict_type="outside_hours",
                entity_type="business",
                entity_id=business_id,
                details=f"Start time {start_time} is before opening time {open_time}"
            ))

        if end_time > close_time:
            conflicts.append(Conflict(
                conflict_type="outside_hours",
                entity_type="business",
                entity_id=business_id,
                details=f"End time {end_time} is after closing time {close_time}"
            ))

        # Build appointment query
        apt_query = {
            "business_id": business_id,
            "scheduled_date": target_date.isoformat(),
            "status": {"$in": ["scheduled", "confirmed", "in_progress"]},
            "deleted_at": None
        }

        if exclude_appointment_id:
            apt_query["appointment_id"] = {"$ne": exclude_appointment_id}

        existing = await self.db.appointments.find(apt_query).to_list(length=100)

        # Check staff conflicts
        for staff_id in staff_ids:
            # Check availability overrides
            unavailable = await self.db.availability.find_one({
                "staff_id": staff_id,
                "start_date": {"$lte": target_date.isoformat()},
                "end_date": {"$gte": target_date.isoformat()},
                "type": {"$in": ["unavailable", "vacation", "sick", "personal"]},
                "deleted_at": None
            })

            if unavailable:
                conflicts.append(Conflict(
                    conflict_type="staff_unavailable",
                    entity_type="staff",
                    entity_id=staff_id,
                    details=f"Staff is marked as {unavailable['type']}"
                ))
                continue

            # Check appointment overlaps
            for apt in existing:
                if staff_id in apt.get("staff_ids", []):
                    apt_start = apt.get("scheduled_time", "")
                    apt_end = apt.get("end_time", "")

                    if start_time < apt_end and end_time > apt_start:
                        conflicts.append(Conflict(
                            conflict_type="staff_double_booked",
                            entity_type="staff",
                            entity_id=staff_id,
                            details=f"Already scheduled {apt_start}-{apt_end}"
                        ))

        # Check equipment conflicts
        if equipment_ids:
            for equip_id in equipment_ids:
                for apt in existing:
                    if equip_id in apt.get("equipment_ids", []):
                        apt_start = apt.get("scheduled_time", "")
                        apt_end = apt.get("end_time", "")

                        if start_time < apt_end and end_time > apt_start:
                            conflicts.append(Conflict(
                                conflict_type="equipment_in_use",
                                entity_type="equipment",
                                entity_id=equip_id,
                                details=f"Already assigned {apt_start}-{apt_end}"
                            ))

        return conflicts

    async def check_weather_and_reschedule(
        self,
        business_id: str,
        appointment_id: str,
        latitude: float,
        longitude: float
    ) -> dict:
        """
        Check weather conditions and determine if rescheduling is needed

        Args:
            business_id: Business ID
            appointment_id: Appointment to check
            latitude: Service location latitude
            longitude: Service location longitude

        Returns:
            Dict with needs_reschedule, reason, suggested_date
        """
        # Get business config
        business = await self.db.businesses.find_one({"business_id": business_id})
        if not business:
            return {"needs_reschedule": False, "reason": "Business not found"}

        config = business.get("config", {})
        if not config.get("weather_enabled", True):
            return {"needs_reschedule": False, "reason": "Weather checking disabled"}

        thresholds = config.get("weather_thresholds", {
            "rain_probability_percent": 70,
            "min_temperature_f": 32,
            "max_temperature_f": 105,
            "max_wind_speed_mph": 35
        })

        # Get appointment
        appointment = await self.db.appointments.find_one({
            "appointment_id": appointment_id,
            "business_id": business_id
        })

        if not appointment:
            return {"needs_reschedule": False, "reason": "Appointment not found"}

        apt_date = date.fromisoformat(appointment["scheduled_date"])

        # Check weather
        weather_check = await self.weather_service.check_weather_conditions(
            latitude, longitude, apt_date, thresholds
        )

        if weather_check["suitable"]:
            return {
                "needs_reschedule": False,
                "weather": weather_check.get("weather")
            }

        # Find next suitable date
        next_date = await self.weather_service.find_next_suitable_date(
            latitude, longitude, apt_date + timedelta(days=1), thresholds
        )

        return {
            "needs_reschedule": True,
            "reasons": weather_check["reasons"],
            "weather": weather_check.get("weather"),
            "suggested_date": next_date.isoformat() if next_date else None
        }

    async def auto_reschedule_for_weather(
        self,
        business_id: str,
        lookahead_hours: int = 48
    ) -> list[dict]:
        """
        Check upcoming appointments and reschedule for bad weather

        Args:
            business_id: Business ID
            lookahead_hours: Hours ahead to check

        Returns:
            List of rescheduled appointments
        """
        # Get business config
        business = await self.db.businesses.find_one({"business_id": business_id})
        if not business or not business.get("config", {}).get("weather_enabled", True):
            return []

        # Get appointments in the lookahead window
        now = datetime.now()
        end_date = (now + timedelta(hours=lookahead_hours)).date()

        appointments = await self.db.appointments.find({
            "business_id": business_id,
            "scheduled_date": {
                "$gte": now.date().isoformat(),
                "$lte": end_date.isoformat()
            },
            "status": {"$in": ["scheduled", "confirmed"]},
            "weather_rescheduled": {"$ne": True},
            "deleted_at": None
        }).to_list(length=50)

        rescheduled = []

        for apt in appointments:
            # Get client's primary address for location
            client = await self.db.clients.find_one({
                "client_id": apt["client_id"]
            })

            if not client or not client.get("addresses"):
                continue

            addr = client["addresses"][apt.get("address_index", 0)]
            lat = addr.get("latitude")
            lon = addr.get("longitude")

            if not lat or not lon:
                continue

            # Check weather
            result = await self.check_weather_and_reschedule(
                business_id, apt["appointment_id"], lat, lon
            )

            if result.get("needs_reschedule") and result.get("suggested_date"):
                # Update appointment
                await self.db.appointments.update_one(
                    {"appointment_id": apt["appointment_id"]},
                    {"$set": {
                        "status": AppointmentStatus.WEATHER_HOLD.value,
                        "weather_rescheduled": True,
                        "weather_info": result.get("weather"),
                        "original_date": apt["scheduled_date"],
                        "updated_at": utc_now()
                    }}
                )

                rescheduled.append({
                    "appointment_id": apt["appointment_id"],
                    "original_date": apt["scheduled_date"],
                    "reason": result.get("reasons"),
                    "suggested_date": result.get("suggested_date")
                })

        return rescheduled

    def _time_str_to_minutes(self, time_str: str) -> int:
        """Convert HH:MM to minutes since midnight"""
        hour, minute = map(int, time_str.split(":"))
        return hour * 60 + minute

    def _minutes_to_time_str(self, minutes: int) -> str:
        """Convert minutes since midnight to HH:MM"""
        hour = minutes // 60
        minute = minutes % 60
        return f"{hour:02d}:{minute:02d}"


async def get_scheduling_service(db: AsyncIOMotorDatabase) -> SchedulingService:
    """Dependency injection for scheduling service"""
    return SchedulingService(db)
