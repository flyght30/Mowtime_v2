"""
Availability Model
Staff availability and time-off management
"""

from datetime import date, datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict

from app.models.common import BaseDocument, generate_id


class AvailabilityType(str, Enum):
    """Type of availability entry"""
    AVAILABLE = "available"  # Override default - they ARE available
    UNAVAILABLE = "unavailable"  # Time off
    VACATION = "vacation"
    SICK = "sick"
    PERSONAL = "personal"
    HOLIDAY = "holiday"
    TRAINING = "training"
    MODIFIED = "modified"  # Modified hours


class TimeSlot(BaseModel):
    """Time slot for availability"""
    start_time: str = Field(pattern=r"^\d{2}:\d{2}$")  # HH:MM
    end_time: str = Field(pattern=r"^\d{2}:\d{2}$")


class Availability(BaseDocument):
    """Availability document model - overrides to default schedule"""
    availability_id: str = Field(default_factory=lambda: generate_id("avl"))
    business_id: str  # Multi-tenant key
    staff_id: str

    # Date range
    start_date: date
    end_date: date  # Can be same as start_date for single day

    # Type and reason
    type: AvailabilityType = AvailabilityType.UNAVAILABLE
    reason: Optional[str] = None

    # Time slots (for modified availability)
    # If empty and type is UNAVAILABLE, means all day unavailable
    # If populated and type is MODIFIED, these are the available hours
    time_slots: list[TimeSlot] = Field(default_factory=list)

    # Recurrence (for regular patterns)
    is_recurring: bool = False
    recurrence_days: list[int] = Field(default_factory=list)  # 0=Mon, 6=Sun
    recurrence_end_date: Optional[date] = None

    # Approval workflow
    approved: bool = True  # Auto-approve for now
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None

    # Notes
    notes: Optional[str] = None

    def is_active_on(self, check_date: date) -> bool:
        """Check if this availability applies to a specific date"""
        if check_date < self.start_date or check_date > self.end_date:
            return False

        if self.is_recurring and self.recurrence_days:
            return check_date.weekday() in self.recurrence_days

        return True


class AvailabilityCreate(BaseModel):
    """Schema for creating availability entry"""
    staff_id: str
    start_date: date
    end_date: date

    type: AvailabilityType = AvailabilityType.UNAVAILABLE
    reason: Optional[str] = None
    time_slots: list[TimeSlot] = Field(default_factory=list)

    is_recurring: bool = False
    recurrence_days: list[int] = Field(default_factory=list)
    recurrence_end_date: Optional[date] = None

    notes: Optional[str] = None

    model_config = ConfigDict(str_strip_whitespace=True)


class AvailabilityUpdate(BaseModel):
    """Schema for updating availability"""
    start_date: Optional[date] = None
    end_date: Optional[date] = None

    type: Optional[AvailabilityType] = None
    reason: Optional[str] = None
    time_slots: Optional[list[TimeSlot]] = None

    is_recurring: Optional[bool] = None
    recurrence_days: Optional[list[int]] = None
    recurrence_end_date: Optional[date] = None

    notes: Optional[str] = None

    model_config = ConfigDict(str_strip_whitespace=True)


class AvailabilityResponse(BaseModel):
    """Public availability response"""
    availability_id: str
    business_id: str
    staff_id: str

    start_date: date
    end_date: date
    type: AvailabilityType
    reason: Optional[str] = None
    time_slots: list[TimeSlot]

    is_recurring: bool
    recurrence_days: list[int]

    approved: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
