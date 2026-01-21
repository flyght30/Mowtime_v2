"""
Client Model
Customer/client records for service businesses
"""

from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, EmailStr, ConfigDict

from app.models.common import BaseDocument, generate_id, utc_now


class ClientStatus(str, Enum):
    """Client account status"""
    ACTIVE = "active"
    INACTIVE = "inactive"
    PROSPECT = "prospect"
    DO_NOT_SERVICE = "do_not_service"


class Address(BaseModel):
    """Physical address for service location"""
    address_line1: str
    address_line2: Optional[str] = None
    city: str
    state: str
    zip_code: str
    country: str = "US"
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_primary: bool = True
    notes: Optional[str] = None  # Gate code, parking instructions, etc.

    model_config = ConfigDict(str_strip_whitespace=True)


class ClientPreferences(BaseModel):
    """Client notification and service preferences"""
    preferred_contact_method: str = "sms"  # sms, email, phone
    reminder_hours_before: int = 24
    allow_sms: bool = True
    allow_email: bool = True
    allow_marketing: bool = False
    preferred_days: list[str] = Field(default_factory=lambda: ["monday", "tuesday", "wednesday", "thursday", "friday"])
    preferred_time_start: str = "08:00"
    preferred_time_end: str = "17:00"
    notes: Optional[str] = None  # Special instructions


class Client(BaseDocument):
    """Client document model"""
    client_id: str = Field(default_factory=lambda: generate_id("cli"))
    business_id: str  # Multi-tenant key
    user_id: Optional[str] = None  # Link to user account if they have one

    # Contact Info
    first_name: str
    last_name: str
    email: Optional[EmailStr] = None
    phone: str
    secondary_phone: Optional[str] = None

    # Service Addresses (clients may have multiple properties)
    addresses: list[Address] = Field(default_factory=list)

    # Status
    status: ClientStatus = ClientStatus.ACTIVE
    source: Optional[str] = None  # How they found the business

    # Preferences
    preferences: ClientPreferences = Field(default_factory=ClientPreferences)

    # Billing (Phase 3)
    stripe_customer_id: Optional[str] = None
    default_payment_method_id: Optional[str] = None
    outstanding_balance: float = 0.0

    # Stats (denormalized)
    total_appointments: int = 0
    completed_appointments: int = 0
    canceled_appointments: int = 0
    lifetime_value: float = 0.0
    last_service_date: Optional[datetime] = None
    next_scheduled_date: Optional[datetime] = None

    # Tags for organization
    tags: list[str] = Field(default_factory=list)

    @property
    def full_name(self) -> str:
        """Get client's full name"""
        return f"{self.first_name} {self.last_name}"

    @property
    def primary_address(self) -> Optional[Address]:
        """Get primary service address"""
        for addr in self.addresses:
            if addr.is_primary:
                return addr
        return self.addresses[0] if self.addresses else None

    def record_service(self, amount: float) -> None:
        """Record a completed service"""
        self.total_appointments += 1
        self.completed_appointments += 1
        self.lifetime_value += amount
        self.last_service_date = utc_now()
        self.updated_at = utc_now()


class ClientCreate(BaseModel):
    """Schema for creating a client"""
    first_name: str = Field(min_length=1, max_length=50)
    last_name: str = Field(min_length=1, max_length=50)
    email: Optional[EmailStr] = None
    phone: str = Field(min_length=10, max_length=20)
    secondary_phone: Optional[str] = None

    addresses: list[Address] = Field(default_factory=list)
    status: ClientStatus = ClientStatus.ACTIVE
    source: Optional[str] = None
    preferences: Optional[ClientPreferences] = None
    tags: list[str] = Field(default_factory=list)

    model_config = ConfigDict(str_strip_whitespace=True)


class ClientUpdate(BaseModel):
    """Schema for updating a client"""
    first_name: Optional[str] = Field(None, min_length=1, max_length=50)
    last_name: Optional[str] = Field(None, min_length=1, max_length=50)
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    secondary_phone: Optional[str] = None

    addresses: Optional[list[Address]] = None
    status: Optional[ClientStatus] = None
    preferences: Optional[ClientPreferences] = None
    tags: Optional[list[str]] = None

    model_config = ConfigDict(str_strip_whitespace=True)


class ClientResponse(BaseModel):
    """Public client response"""
    client_id: str
    business_id: str
    first_name: str
    last_name: str
    email: Optional[EmailStr] = None
    phone: str
    addresses: list[Address]
    status: ClientStatus
    preferences: ClientPreferences
    total_appointments: int
    completed_appointments: int
    lifetime_value: float
    last_service_date: Optional[datetime] = None
    tags: list[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
