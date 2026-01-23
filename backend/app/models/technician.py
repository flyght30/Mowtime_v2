"""
Technician Model
Dispatch-focused technician records with GPS tracking and status
"""

from datetime import datetime, date
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, EmailStr, ConfigDict

from app.models.common import BaseDocument, generate_id, utc_now


class TechStatus(str, Enum):
    """Technician dispatch status"""
    AVAILABLE = "available"
    ASSIGNED = "assigned"
    ENROUTE = "enroute"
    ON_SITE = "on_site"
    COMPLETE = "complete"
    OFF_DUTY = "off_duty"


class GeoPoint(BaseModel):
    """GeoJSON Point for location storage"""
    type: str = "Point"
    coordinates: list[float] = Field(default_factory=lambda: [0.0, 0.0])  # [lng, lat]


class TechLocation(BaseModel):
    """Current technician location"""
    type: str = "Point"
    coordinates: list[float] = Field(default_factory=lambda: [0.0, 0.0])  # [lng, lat]
    timestamp: datetime = Field(default_factory=utc_now)
    accuracy: Optional[float] = None  # Accuracy in meters


class TechSkills(BaseModel):
    """Technician skill capabilities"""
    can_install: bool = True
    can_service: bool = True
    can_maintenance: bool = True


class TechSchedule(BaseModel):
    """Default work schedule"""
    work_days: list[int] = Field(default_factory=lambda: [1, 2, 3, 4, 5])  # Mon-Fri
    start_time: str = "08:00"
    end_time: str = "17:00"
    lunch_start: str = "12:00"
    lunch_duration: int = 60  # minutes


class TechStats(BaseModel):
    """Performance statistics"""
    jobs_completed: int = 0
    avg_rating: Optional[float] = None
    on_time_percentage: float = 100.0
    total_drive_time_minutes: int = 0
    total_job_time_minutes: int = 0


class Technician(BaseDocument):
    """Technician document model for dispatch"""
    tech_id: str = Field(default_factory=lambda: generate_id("tech"))
    business_id: str  # Multi-tenant key
    user_id: Optional[str] = None  # Link to user account for app access
    staff_id: Optional[str] = None  # Optional link to Staff record

    # Basic Info
    first_name: str
    last_name: str
    phone: str
    email: Optional[EmailStr] = None

    # Status
    status: TechStatus = TechStatus.OFF_DUTY
    current_job_id: Optional[str] = None
    next_job_id: Optional[str] = None
    is_active: bool = True

    # Location (GeoJSON for geospatial queries)
    location: Optional[TechLocation] = None

    # Skills & Certifications
    certifications: list[str] = Field(default_factory=list)  # ["EPA_608", "NATE", "OSHA_10"]
    skills: TechSkills = Field(default_factory=TechSkills)

    # Schedule
    schedule: TechSchedule = Field(default_factory=TechSchedule)

    # Performance
    stats: TechStats = Field(default_factory=TechStats)

    # Color for map marker (hex)
    color: str = "#4CAF50"

    @property
    def full_name(self) -> str:
        """Get technician's full name"""
        return f"{self.first_name} {self.last_name}"

    def update_status(self, new_status: TechStatus, job_id: Optional[str] = None) -> None:
        """Update technician status"""
        self.status = new_status
        if new_status == TechStatus.ENROUTE and job_id:
            self.current_job_id = job_id
        elif new_status == TechStatus.COMPLETE:
            self.current_job_id = None
        elif new_status == TechStatus.OFF_DUTY:
            self.current_job_id = None
            self.next_job_id = None
        self.updated_at = utc_now()

    def update_location(self, lng: float, lat: float, accuracy: Optional[float] = None) -> None:
        """Update technician GPS location"""
        self.location = TechLocation(
            coordinates=[lng, lat],
            timestamp=utc_now(),
            accuracy=accuracy
        )
        self.updated_at = utc_now()


class TechnicianCreate(BaseModel):
    """Schema for creating technician"""
    first_name: str = Field(min_length=1, max_length=50)
    last_name: str = Field(min_length=1, max_length=50)
    phone: str = Field(min_length=10, max_length=20)
    email: Optional[EmailStr] = None

    certifications: list[str] = Field(default_factory=list)
    skills: Optional[TechSkills] = None
    schedule: Optional[TechSchedule] = None

    user_id: Optional[str] = None
    staff_id: Optional[str] = None
    color: Optional[str] = None

    model_config = ConfigDict(str_strip_whitespace=True)


class TechnicianUpdate(BaseModel):
    """Schema for updating technician"""
    first_name: Optional[str] = Field(None, min_length=1, max_length=50)
    last_name: Optional[str] = Field(None, min_length=1, max_length=50)
    phone: Optional[str] = None
    email: Optional[EmailStr] = None

    certifications: Optional[list[str]] = None
    skills: Optional[TechSkills] = None
    schedule: Optional[TechSchedule] = None

    is_active: Optional[bool] = None
    color: Optional[str] = None

    model_config = ConfigDict(str_strip_whitespace=True)


class TechnicianResponse(BaseModel):
    """Public technician response"""
    tech_id: str
    business_id: str
    user_id: Optional[str] = None

    first_name: str
    last_name: str
    phone: str
    email: Optional[EmailStr] = None

    status: TechStatus
    current_job_id: Optional[str] = None
    next_job_id: Optional[str] = None
    is_active: bool

    location: Optional[TechLocation] = None
    certifications: list[str]
    skills: TechSkills
    schedule: TechSchedule
    stats: TechStats
    color: str

    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TechnicianBrief(BaseModel):
    """Brief technician info for lists"""
    tech_id: str
    first_name: str
    last_name: str
    status: TechStatus
    current_job_id: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# Location History Model (separate collection with TTL)
class TechLocationHistory(BaseModel):
    """Historical location record (expires after 7 days)"""
    tech_id: str
    business_id: str
    location: GeoPoint
    accuracy: Optional[float] = None
    timestamp: datetime = Field(default_factory=utc_now)

    model_config = ConfigDict(
        json_encoders={datetime: lambda v: v.isoformat()}
    )
