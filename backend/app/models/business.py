"""
Business Model
Multi-tenant business accounts with vertical-specific configuration
"""

from datetime import time
from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, EmailStr, ConfigDict

from app.models.common import BaseDocument, generate_id


class ServiceVertical(str, Enum):
    """Supported service business verticals"""
    LAWN_CARE = "lawn_care"
    LANDSCAPING = "landscaping"
    HVAC = "hvac"
    PLUMBING = "plumbing"
    ELECTRICAL = "electrical"
    CLEANING = "cleaning"
    PEST_CONTROL = "pest_control"
    POOL_SERVICE = "pool_service"
    PAINTING = "painting"
    ROOFING = "roofing"
    GENERAL_CONTRACTING = "general_contracting"
    OTHER = "other"


class BusinessPlan(str, Enum):
    """Subscription plan tiers"""
    FREE = "free"
    STARTER = "starter"
    PROFESSIONAL = "professional"
    ENTERPRISE = "enterprise"


class SubscriptionStatus(str, Enum):
    """Business subscription status"""
    ACTIVE = "active"
    TRIAL = "trial"
    PAUSED = "paused"
    CANCELED = "canceled"
    PAST_DUE = "past_due"


class DayHours(BaseModel):
    """Hours for a single day"""
    is_open: bool = True
    open_time: str = "08:00"  # HH:MM format
    close_time: str = "17:00"

    model_config = ConfigDict(str_strip_whitespace=True)


class BusinessHours(BaseModel):
    """Weekly business hours configuration"""
    monday: DayHours = Field(default_factory=DayHours)
    tuesday: DayHours = Field(default_factory=DayHours)
    wednesday: DayHours = Field(default_factory=DayHours)
    thursday: DayHours = Field(default_factory=DayHours)
    friday: DayHours = Field(default_factory=DayHours)
    saturday: DayHours = Field(default_factory=lambda: DayHours(is_open=False))
    sunday: DayHours = Field(default_factory=lambda: DayHours(is_open=False))

    def get_day(self, day: str) -> DayHours:
        """Get hours for a specific day"""
        return getattr(self, day.lower(), DayHours(is_open=False))


class WeatherThresholds(BaseModel):
    """Weather conditions that trigger rescheduling"""
    rain_probability_percent: int = 70  # Reschedule if > this %
    min_temperature_f: int = 32  # Reschedule if below
    max_temperature_f: int = 105  # Reschedule if above
    max_wind_speed_mph: int = 35  # Reschedule if above
    enabled: bool = True


class NotificationSettings(BaseModel):
    """Business notification configuration"""
    appointment_reminder_hours: int = 24  # Hours before appointment
    reschedule_notify: bool = True
    new_client_notify: bool = True
    daily_digest: bool = True
    digest_time: str = "06:00"  # HH:MM


class VerticalSettings(BaseModel):
    """Per-vertical configuration for a business"""
    vertical_id: str
    enabled: bool = True
    enabled_at: Optional[str] = None
    disabled_at: Optional[str] = None
    custom_config: Dict[str, Any] = Field(default_factory=dict)


class BusinessConfig(BaseModel):
    """Business-specific configuration"""
    business_hours: BusinessHours = Field(default_factory=BusinessHours)
    weather_thresholds: WeatherThresholds = Field(default_factory=WeatherThresholds)
    notification_settings: NotificationSettings = Field(default_factory=NotificationSettings)

    # Scheduling
    min_gap_between_jobs_minutes: int = 30
    max_daily_appointments: int = 20
    allow_same_day_booking: bool = True
    advance_booking_days: int = 60
    default_appointment_duration_minutes: int = 60

    # Features
    weather_enabled: bool = True
    ai_receptionist_enabled: bool = False
    online_booking_enabled: bool = True
    customer_portal_enabled: bool = True

    # Customization
    primary_color: str = "#2563EB"
    logo_url: Optional[str] = None

    # Vertical configuration
    # List of enabled verticals with their settings
    # Note: This is separate from the primary 'vertical' field which indicates
    # the business's main vertical. A business can enable multiple verticals.
    enabled_verticals: List[VerticalSettings] = Field(default_factory=list)
    vertical_configs: Dict[str, Dict[str, Any]] = Field(default_factory=dict)


class Business(BaseDocument):
    """Business document model"""
    business_id: str = Field(default_factory=lambda: generate_id("bus"))
    owner_id: str  # User ID of business owner

    # Basic Info
    name: str
    slug: Optional[str] = None  # URL-friendly identifier for public booking
    vertical: ServiceVertical = ServiceVertical.LAWN_CARE
    description: Optional[str] = None

    # Contact
    email: EmailStr
    phone: str
    website: Optional[str] = None

    # Address
    address_line1: str
    address_line2: Optional[str] = None
    city: str
    state: str
    zip_code: str
    country: str = "US"
    service_radius_miles: int = 25

    # Subscription
    plan: BusinessPlan = BusinessPlan.FREE
    subscription_status: SubscriptionStatus = SubscriptionStatus.TRIAL
    trial_ends_at: Optional[str] = None
    stripe_customer_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None

    # Configuration
    timezone: str = "America/Chicago"
    config: BusinessConfig = Field(default_factory=BusinessConfig)

    # Stats (denormalized for quick access)
    total_clients: int = 0
    total_staff: int = 0
    total_appointments: int = 0

    # Job numbering sequence for HVAC quotes/jobs (JOB-YYYY-NNNN)
    job_number_sequence: int = 0


class BusinessCreate(BaseModel):
    """Schema for creating a business"""
    name: str = Field(min_length=2, max_length=100)
    vertical: ServiceVertical = ServiceVertical.LAWN_CARE
    description: Optional[str] = None

    email: EmailStr
    phone: str = Field(min_length=10, max_length=20)
    website: Optional[str] = None

    address_line1: str
    address_line2: Optional[str] = None
    city: str
    state: str = Field(min_length=2, max_length=2)
    zip_code: str = Field(min_length=5, max_length=10)
    country: str = "US"
    service_radius_miles: int = Field(default=25, ge=1, le=100)

    timezone: str = "America/Chicago"

    model_config = ConfigDict(str_strip_whitespace=True)


class BusinessUpdate(BaseModel):
    """Schema for updating a business"""
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    vertical: Optional[ServiceVertical] = None
    description: Optional[str] = None

    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    website: Optional[str] = None

    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    service_radius_miles: Optional[int] = Field(None, ge=1, le=100)

    timezone: Optional[str] = None
    config: Optional[BusinessConfig] = None

    model_config = ConfigDict(str_strip_whitespace=True)


class BusinessResponse(BaseModel):
    """Public business response"""
    business_id: str
    owner_id: str
    name: str
    slug: Optional[str] = None
    vertical: ServiceVertical
    description: Optional[str] = None
    email: EmailStr
    phone: str
    website: Optional[str] = None
    city: str
    state: str
    plan: BusinessPlan
    subscription_status: SubscriptionStatus
    timezone: str
    config: BusinessConfig
    total_clients: int
    total_staff: int

    model_config = ConfigDict(from_attributes=True)


class PublicBusinessResponse(BaseModel):
    """Public-facing business response for portal"""
    business_id: str
    name: str
    slug: Optional[str] = None
    description: Optional[str] = None
    vertical: ServiceVertical
    phone: str
    email: EmailStr
    city: str
    state: str
    timezone: str
    config: BusinessConfig

    model_config = ConfigDict(from_attributes=True)
