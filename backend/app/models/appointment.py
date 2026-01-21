"""
Appointment Model
Scheduled service appointments with recurrence support
"""

from datetime import datetime, date
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict

from app.models.common import BaseDocument, generate_id, utc_now


class AppointmentStatus(str, Enum):
    """Appointment lifecycle status"""
    SCHEDULED = "scheduled"
    CONFIRMED = "confirmed"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELED = "canceled"
    NO_SHOW = "no_show"
    RESCHEDULED = "rescheduled"
    WEATHER_HOLD = "weather_hold"


class RecurrenceType(str, Enum):
    """Recurrence frequency types"""
    NONE = "none"
    DAILY = "daily"
    WEEKLY = "weekly"
    BIWEEKLY = "biweekly"
    MONTHLY = "monthly"
    CUSTOM = "custom"


class RecurrencePattern(BaseModel):
    """Recurrence pattern configuration"""
    type: RecurrenceType = RecurrenceType.NONE
    interval: int = 1  # Every N periods
    days_of_week: list[int] = Field(default_factory=list)  # 0=Mon, 6=Sun
    day_of_month: Optional[int] = None  # For monthly
    end_date: Optional[date] = None
    max_occurrences: Optional[int] = None
    occurrences_created: int = 0


class WeatherInfo(BaseModel):
    """Weather data at time of scheduling or check"""
    temperature_f: Optional[float] = None
    rain_probability: Optional[int] = None
    wind_speed_mph: Optional[float] = None
    conditions: Optional[str] = None
    checked_at: Optional[datetime] = None
    forecast_date: Optional[date] = None


class ServiceLineItem(BaseModel):
    """Individual service in an appointment"""
    service_id: str
    service_name: str
    quantity: int = 1
    unit_price: float
    total_price: float
    duration_minutes: int
    notes: Optional[str] = None


class Appointment(BaseDocument):
    """Appointment document model"""
    appointment_id: str = Field(default_factory=lambda: generate_id("apt"))
    business_id: str  # Multi-tenant key
    client_id: str
    address_index: int = 0  # Index into client's addresses array

    # Scheduling
    scheduled_date: date
    scheduled_time: str  # HH:MM format
    end_time: str  # HH:MM format (calculated)
    duration_minutes: int
    timezone: str = "America/Chicago"

    # Assignment
    staff_ids: list[str] = Field(default_factory=list)  # Can have multiple crew
    equipment_ids: list[str] = Field(default_factory=list)

    # Services
    services: list[ServiceLineItem] = Field(default_factory=list)
    total_price: float = 0.0

    # Status
    status: AppointmentStatus = AppointmentStatus.SCHEDULED
    confirmed_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    canceled_at: Optional[datetime] = None
    cancel_reason: Optional[str] = None

    # Recurrence
    recurrence: RecurrencePattern = Field(default_factory=RecurrencePattern)
    parent_appointment_id: Optional[str] = None  # For recurring instances
    is_recurring_instance: bool = False

    # Weather
    weather_info: Optional[WeatherInfo] = None
    weather_rescheduled: bool = False
    original_date: Optional[date] = None  # If rescheduled

    # Notes
    internal_notes: Optional[str] = None  # Staff only
    customer_notes: Optional[str] = None  # Customer visible

    # Notifications
    reminder_sent: bool = False
    confirmation_sent: bool = False

    def confirm(self) -> None:
        """Confirm the appointment"""
        self.status = AppointmentStatus.CONFIRMED
        self.confirmed_at = utc_now()
        self.updated_at = utc_now()

    def start(self) -> None:
        """Mark appointment as started"""
        self.status = AppointmentStatus.IN_PROGRESS
        self.started_at = utc_now()
        self.updated_at = utc_now()

    def complete(self) -> None:
        """Mark appointment as completed"""
        self.status = AppointmentStatus.COMPLETED
        self.completed_at = utc_now()
        self.updated_at = utc_now()

    def cancel(self, reason: Optional[str] = None) -> None:
        """Cancel the appointment"""
        self.status = AppointmentStatus.CANCELED
        self.canceled_at = utc_now()
        self.cancel_reason = reason
        self.updated_at = utc_now()

    def set_weather_hold(self, weather: WeatherInfo) -> None:
        """Put appointment on weather hold"""
        if self.original_date is None:
            self.original_date = self.scheduled_date
        self.status = AppointmentStatus.WEATHER_HOLD
        self.weather_info = weather
        self.weather_rescheduled = True
        self.updated_at = utc_now()

    def reschedule(self, new_date: date, new_time: str) -> None:
        """Reschedule the appointment"""
        if self.original_date is None:
            self.original_date = self.scheduled_date
        self.scheduled_date = new_date
        self.scheduled_time = new_time
        self.status = AppointmentStatus.SCHEDULED
        self.updated_at = utc_now()


class AppointmentCreate(BaseModel):
    """Schema for creating an appointment"""
    client_id: str
    address_index: int = 0

    scheduled_date: date
    scheduled_time: str = Field(pattern=r"^\d{2}:\d{2}$")  # HH:MM

    staff_ids: list[str] = Field(default_factory=list)
    equipment_ids: list[str] = Field(default_factory=list)

    service_ids: list[str] = Field(min_length=1)  # At least one service

    recurrence: Optional[RecurrencePattern] = None
    internal_notes: Optional[str] = None
    customer_notes: Optional[str] = None

    model_config = ConfigDict(str_strip_whitespace=True)


class AppointmentUpdate(BaseModel):
    """Schema for updating an appointment"""
    address_index: Optional[int] = None
    scheduled_date: Optional[date] = None
    scheduled_time: Optional[str] = Field(None, pattern=r"^\d{2}:\d{2}$")

    staff_ids: Optional[list[str]] = None
    equipment_ids: Optional[list[str]] = None
    service_ids: Optional[list[str]] = None

    status: Optional[AppointmentStatus] = None
    internal_notes: Optional[str] = None
    customer_notes: Optional[str] = None

    model_config = ConfigDict(str_strip_whitespace=True)


class AppointmentResponse(BaseModel):
    """Public appointment response"""
    appointment_id: str
    business_id: str
    client_id: str

    scheduled_date: date
    scheduled_time: str
    end_time: str
    duration_minutes: int

    staff_ids: list[str]
    services: list[ServiceLineItem]
    total_price: float

    status: AppointmentStatus
    recurrence: RecurrencePattern

    weather_info: Optional[WeatherInfo] = None
    weather_rescheduled: bool
    original_date: Optional[date] = None

    internal_notes: Optional[str] = None
    customer_notes: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
