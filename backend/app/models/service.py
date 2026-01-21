"""
Service Model
Service offerings with pricing and duration
"""

from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime

from app.models.common import BaseDocument, generate_id


class PricingType(str, Enum):
    """How the service is priced"""
    FIXED = "fixed"  # Fixed price per service
    HOURLY = "hourly"  # Per hour
    PER_UNIT = "per_unit"  # Per sq ft, per room, etc.
    QUOTE = "quote"  # Custom quote required


class ServiceCategory(str, Enum):
    """Service categories (varies by vertical)"""
    # Lawn Care
    MOWING = "mowing"
    EDGING = "edging"
    TRIMMING = "trimming"
    LEAF_REMOVAL = "leaf_removal"
    FERTILIZATION = "fertilization"
    AERATION = "aeration"
    SEEDING = "seeding"
    WEED_CONTROL = "weed_control"

    # Landscaping
    PLANTING = "planting"
    MULCHING = "mulching"
    HARDSCAPING = "hardscaping"
    IRRIGATION = "irrigation"

    # General
    CONSULTATION = "consultation"
    MAINTENANCE = "maintenance"
    REPAIR = "repair"
    INSTALLATION = "installation"
    INSPECTION = "inspection"
    CLEANUP = "cleanup"
    EMERGENCY = "emergency"
    OTHER = "other"


class Service(BaseDocument):
    """Service document model"""
    service_id: str = Field(default_factory=lambda: generate_id("svc"))
    business_id: str  # Multi-tenant key

    # Basic Info
    name: str
    description: Optional[str] = None
    category: ServiceCategory = ServiceCategory.OTHER

    # Pricing
    pricing_type: PricingType = PricingType.FIXED
    base_price: float = Field(ge=0)
    unit_label: Optional[str] = None  # "sq ft", "hour", "room", etc.
    min_price: Optional[float] = None
    max_price: Optional[float] = None

    # Duration
    duration_minutes: int = Field(default=60, ge=15)
    min_duration_minutes: Optional[int] = None
    max_duration_minutes: Optional[int] = None

    # Availability
    is_active: bool = True
    is_featured: bool = False
    requires_equipment: list[str] = Field(default_factory=list)  # Equipment IDs
    min_staff_required: int = 1
    max_staff_allowed: int = 4

    # Online Booking
    allow_online_booking: bool = True
    booking_buffer_hours: int = 24  # Minimum hours notice
    seasonal_availability: Optional[dict] = None  # Month-based availability

    # Display
    sort_order: int = 0
    icon: Optional[str] = None
    color: Optional[str] = None

    # Stats (denormalized)
    times_booked: int = 0
    total_revenue: float = 0.0


class ServiceCreate(BaseModel):
    """Schema for creating a service"""
    name: str = Field(min_length=2, max_length=100)
    description: Optional[str] = None
    category: ServiceCategory = ServiceCategory.OTHER

    pricing_type: PricingType = PricingType.FIXED
    base_price: float = Field(ge=0)
    unit_label: Optional[str] = None
    min_price: Optional[float] = None
    max_price: Optional[float] = None

    duration_minutes: int = Field(default=60, ge=15)
    min_duration_minutes: Optional[int] = None
    max_duration_minutes: Optional[int] = None

    is_active: bool = True
    is_featured: bool = False
    requires_equipment: list[str] = Field(default_factory=list)
    min_staff_required: int = Field(default=1, ge=1)
    max_staff_allowed: int = Field(default=4, ge=1)

    allow_online_booking: bool = True
    booking_buffer_hours: int = Field(default=24, ge=0)
    sort_order: int = 0

    model_config = ConfigDict(str_strip_whitespace=True)


class ServiceUpdate(BaseModel):
    """Schema for updating a service"""
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = None
    category: Optional[ServiceCategory] = None

    pricing_type: Optional[PricingType] = None
    base_price: Optional[float] = Field(None, ge=0)
    unit_label: Optional[str] = None
    min_price: Optional[float] = None
    max_price: Optional[float] = None

    duration_minutes: Optional[int] = Field(None, ge=15)

    is_active: Optional[bool] = None
    is_featured: Optional[bool] = None
    requires_equipment: Optional[list[str]] = None
    min_staff_required: Optional[int] = Field(None, ge=1)
    max_staff_allowed: Optional[int] = Field(None, ge=1)

    allow_online_booking: Optional[bool] = None
    booking_buffer_hours: Optional[int] = Field(None, ge=0)
    sort_order: Optional[int] = None

    model_config = ConfigDict(str_strip_whitespace=True)


class ServiceResponse(BaseModel):
    """Public service response"""
    service_id: str
    business_id: str
    name: str
    description: Optional[str] = None
    category: ServiceCategory

    pricing_type: PricingType
    base_price: float
    unit_label: Optional[str] = None

    duration_minutes: int
    is_active: bool
    is_featured: bool
    allow_online_booking: bool

    times_booked: int
    total_revenue: float
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
