"""
Schedule Entry Model
Job scheduling entries linking technicians to jobs with times
"""

from datetime import datetime, date
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict

from app.models.common import BaseDocument, generate_id, utc_now


class ScheduleStatus(str, Enum):
    """Schedule entry status"""
    SCHEDULED = "scheduled"
    IN_PROGRESS = "in_progress"
    COMPLETE = "complete"
    CANCELLED = "cancelled"


class ScheduleEntry(BaseDocument):
    """Schedule entry linking job to technician for a specific date/time"""
    entry_id: str = Field(default_factory=lambda: generate_id("sch"))
    business_id: str  # Multi-tenant key

    tech_id: str
    job_id: str  # HVAC quote/job ID

    # Scheduling
    scheduled_date: date
    start_time: str  # "09:00"
    end_time: str  # "15:00"
    estimated_hours: float = 1.0

    # Status
    status: ScheduleStatus = ScheduleStatus.SCHEDULED
    order: int = 1  # Position in day's route

    # Travel info
    travel_time_minutes: Optional[int] = None

    # Tracking timestamps
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    # Notes
    notes: Optional[str] = None


class ScheduleEntryCreate(BaseModel):
    """Schema for creating schedule entry"""
    tech_id: str
    job_id: str
    scheduled_date: date
    start_time: str = Field(pattern=r"^\d{2}:\d{2}$")  # HH:MM
    estimated_hours: float = Field(ge=0.5, le=24)
    notes: Optional[str] = None

    model_config = ConfigDict(str_strip_whitespace=True)


class ScheduleEntryUpdate(BaseModel):
    """Schema for updating schedule entry"""
    scheduled_date: Optional[date] = None
    start_time: Optional[str] = Field(None, pattern=r"^\d{2}:\d{2}$")
    estimated_hours: Optional[float] = Field(None, ge=0.5, le=24)
    order: Optional[int] = Field(None, ge=1)
    notes: Optional[str] = None

    model_config = ConfigDict(str_strip_whitespace=True)


class ScheduleEntryResponse(BaseModel):
    """Public schedule entry response"""
    entry_id: str
    business_id: str
    tech_id: str
    job_id: str

    scheduled_date: date
    start_time: str
    end_time: str
    estimated_hours: float

    status: ScheduleStatus
    order: int
    travel_time_minutes: Optional[int] = None

    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    notes: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DailySchedule(BaseModel):
    """A technician's schedule for a day"""
    tech_id: str
    tech_name: str
    date: date
    entries: list[ScheduleEntryResponse] = Field(default_factory=list)
    available_slots: list[dict] = Field(default_factory=list)  # [{"start": "08:00", "end": "09:00"}]
    total_hours: float = 0.0


class AssignJobRequest(BaseModel):
    """Request to assign a job to a technician"""
    job_id: str
    tech_id: str
    scheduled_date: date
    start_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    estimated_hours: float = Field(ge=0.5, le=24)
    notes: Optional[str] = None

    model_config = ConfigDict(str_strip_whitespace=True)


class AssignJobResponse(BaseModel):
    """Response after assigning a job"""
    schedule_entry: ScheduleEntryResponse
    conflicts: list[dict] = Field(default_factory=list)


class OptimizeRouteRequest(BaseModel):
    """Request to optimize a technician's route"""
    tech_id: str
    date: date


class RouteStop(BaseModel):
    """A stop in an optimized route"""
    order: int
    job_id: str
    address: str
    location: Optional[dict] = None  # {"lat": float, "lng": float}
    arrival_time: str
    departure_time: str
    travel_from_previous: int = 0  # minutes


class OptimizeRouteResponse(BaseModel):
    """Response with optimized route"""
    tech_id: str
    date: date
    original_order: list[str] = Field(default_factory=list)  # job_ids
    optimized_order: list[str] = Field(default_factory=list)  # job_ids
    stops: list[RouteStop] = Field(default_factory=list)
    time_saved_minutes: int = 0
    total_drive_time_minutes: int = 0
    route_geometry: Optional[str] = None  # Mapbox encoded polyline
