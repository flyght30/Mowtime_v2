"""
Staff Model
Team member records with skills and availability
"""

from datetime import datetime, date
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, EmailStr, ConfigDict

from app.models.common import BaseDocument, generate_id


class StaffRole(str, Enum):
    """Staff role/position types"""
    TECHNICIAN = "technician"
    CREW_LEAD = "crew_lead"
    SUPERVISOR = "supervisor"
    MANAGER = "manager"
    DISPATCHER = "dispatcher"
    ADMIN = "admin"


class EmploymentType(str, Enum):
    """Employment classification"""
    FULL_TIME = "full_time"
    PART_TIME = "part_time"
    CONTRACT = "contract"
    SEASONAL = "seasonal"


class StaffAvailability(BaseModel):
    """Default weekly availability schedule"""
    monday: Optional[dict] = Field(default_factory=lambda: {"start": "08:00", "end": "17:00"})
    tuesday: Optional[dict] = Field(default_factory=lambda: {"start": "08:00", "end": "17:00"})
    wednesday: Optional[dict] = Field(default_factory=lambda: {"start": "08:00", "end": "17:00"})
    thursday: Optional[dict] = Field(default_factory=lambda: {"start": "08:00", "end": "17:00"})
    friday: Optional[dict] = Field(default_factory=lambda: {"start": "08:00", "end": "17:00"})
    saturday: Optional[dict] = None  # None = not available
    sunday: Optional[dict] = None


class EmergencyContact(BaseModel):
    """Emergency contact information"""
    name: str
    relationship: str
    phone: str


class Staff(BaseDocument):
    """Staff document model"""
    staff_id: str = Field(default_factory=lambda: generate_id("stf"))
    business_id: str  # Multi-tenant key
    user_id: Optional[str] = None  # Link to user account

    # Basic Info
    first_name: str
    last_name: str
    email: Optional[EmailStr] = None
    phone: str

    # Employment
    role: StaffRole = StaffRole.TECHNICIAN
    employment_type: EmploymentType = EmploymentType.FULL_TIME
    hire_date: Optional[date] = None
    hourly_rate: Optional[float] = None  # For payroll/costing
    employee_id: Optional[str] = None  # External employee ID

    # Status
    is_active: bool = True
    can_lead_crew: bool = False
    max_daily_appointments: int = 8

    # Skills & Certifications
    skills: list[str] = Field(default_factory=list)  # Service IDs they can perform
    certifications: list[str] = Field(default_factory=list)
    equipment_trained: list[str] = Field(default_factory=list)  # Equipment IDs

    # Default Availability
    default_availability: StaffAvailability = Field(default_factory=StaffAvailability)

    # Contact
    emergency_contact: Optional[EmergencyContact] = None
    address_line1: Optional[str] = None
    address_city: Optional[str] = None
    address_state: Optional[str] = None
    address_zip: Optional[str] = None

    # Performance (denormalized)
    total_appointments: int = 0
    completed_appointments: int = 0
    average_rating: Optional[float] = None
    total_hours_worked: float = 0.0

    # Notes
    notes: Optional[str] = None

    @property
    def full_name(self) -> str:
        """Get staff member's full name"""
        return f"{self.first_name} {self.last_name}"

    def record_appointment(self, duration_hours: float) -> None:
        """Record completed appointment"""
        self.total_appointments += 1
        self.completed_appointments += 1
        self.total_hours_worked += duration_hours
        self.updated_at = datetime.utcnow()


class StaffCreate(BaseModel):
    """Schema for creating staff"""
    first_name: str = Field(min_length=1, max_length=50)
    last_name: str = Field(min_length=1, max_length=50)
    email: Optional[EmailStr] = None
    phone: str = Field(min_length=10, max_length=20)

    role: StaffRole = StaffRole.TECHNICIAN
    employment_type: EmploymentType = EmploymentType.FULL_TIME
    hire_date: Optional[date] = None
    hourly_rate: Optional[float] = Field(None, ge=0)
    employee_id: Optional[str] = None

    is_active: bool = True
    can_lead_crew: bool = False
    max_daily_appointments: int = Field(default=8, ge=1, le=20)

    skills: list[str] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)
    equipment_trained: list[str] = Field(default_factory=list)

    default_availability: Optional[StaffAvailability] = None
    emergency_contact: Optional[EmergencyContact] = None
    notes: Optional[str] = None

    model_config = ConfigDict(str_strip_whitespace=True)


class StaffUpdate(BaseModel):
    """Schema for updating staff"""
    first_name: Optional[str] = Field(None, min_length=1, max_length=50)
    last_name: Optional[str] = Field(None, min_length=1, max_length=50)
    email: Optional[EmailStr] = None
    phone: Optional[str] = None

    role: Optional[StaffRole] = None
    employment_type: Optional[EmploymentType] = None
    hourly_rate: Optional[float] = Field(None, ge=0)

    is_active: Optional[bool] = None
    can_lead_crew: Optional[bool] = None
    max_daily_appointments: Optional[int] = Field(None, ge=1, le=20)

    skills: Optional[list[str]] = None
    certifications: Optional[list[str]] = None
    equipment_trained: Optional[list[str]] = None

    default_availability: Optional[StaffAvailability] = None
    emergency_contact: Optional[EmergencyContact] = None
    notes: Optional[str] = None

    model_config = ConfigDict(str_strip_whitespace=True)


class StaffResponse(BaseModel):
    """Public staff response"""
    staff_id: str
    business_id: str
    first_name: str
    last_name: str
    email: Optional[EmailStr] = None
    phone: str

    role: StaffRole
    employment_type: EmploymentType
    is_active: bool
    can_lead_crew: bool

    skills: list[str]
    certifications: list[str]

    total_appointments: int
    completed_appointments: int
    average_rating: Optional[float] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
