"""
Equipment Model
Tools and machinery tracking for service businesses
"""

from datetime import datetime, date
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict

from app.models.common import BaseDocument, generate_id


class EquipmentStatus(str, Enum):
    """Equipment operational status"""
    AVAILABLE = "available"
    IN_USE = "in_use"
    MAINTENANCE = "maintenance"
    REPAIR = "repair"
    RETIRED = "retired"


class EquipmentCategory(str, Enum):
    """Equipment categories"""
    # Lawn Care
    MOWER = "mower"
    TRIMMER = "trimmer"
    EDGER = "edger"
    BLOWER = "blower"
    SPREADER = "spreader"
    AERATOR = "aerator"

    # Vehicles
    TRUCK = "truck"
    TRAILER = "trailer"
    VAN = "van"

    # General
    POWER_TOOL = "power_tool"
    HAND_TOOL = "hand_tool"
    SAFETY_EQUIPMENT = "safety_equipment"
    OTHER = "other"


class MaintenanceRecord(BaseModel):
    """Maintenance history entry"""
    date: date
    type: str  # "routine", "repair", "inspection"
    description: str
    cost: float = 0.0
    performed_by: Optional[str] = None  # Staff ID or vendor
    next_due: Optional[date] = None
    notes: Optional[str] = None


class Equipment(BaseDocument):
    """Equipment document model"""
    equipment_id: str = Field(default_factory=lambda: generate_id("eqp"))
    business_id: str  # Multi-tenant key

    # Basic Info
    name: str
    category: EquipmentCategory = EquipmentCategory.OTHER
    description: Optional[str] = None

    # Identification
    make: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    year: Optional[int] = None

    # Status
    status: EquipmentStatus = EquipmentStatus.AVAILABLE
    current_staff_id: Optional[str] = None  # Who has it now
    current_appointment_id: Optional[str] = None

    # Value
    purchase_date: Optional[date] = None
    purchase_price: Optional[float] = None
    current_value: Optional[float] = None
    replacement_cost: Optional[float] = None

    # Maintenance
    maintenance_interval_days: Optional[int] = None  # How often to service
    last_maintenance_date: Optional[date] = None
    next_maintenance_date: Optional[date] = None
    maintenance_history: list[MaintenanceRecord] = Field(default_factory=list)
    total_maintenance_cost: float = 0.0

    # Usage tracking
    total_hours_used: float = 0.0
    total_appointments: int = 0

    # Assignment restrictions
    requires_certification: bool = False
    certified_staff_ids: list[str] = Field(default_factory=list)

    # Location
    storage_location: Optional[str] = None
    gps_tracker_id: Optional[str] = None

    # Notes
    notes: Optional[str] = None

    def check_out(self, staff_id: str, appointment_id: Optional[str] = None) -> None:
        """Check out equipment to staff"""
        self.status = EquipmentStatus.IN_USE
        self.current_staff_id = staff_id
        self.current_appointment_id = appointment_id
        self.updated_at = datetime.utcnow()

    def check_in(self, hours_used: float = 0) -> None:
        """Check in equipment"""
        self.status = EquipmentStatus.AVAILABLE
        self.current_staff_id = None
        self.current_appointment_id = None
        self.total_hours_used += hours_used
        self.total_appointments += 1
        self.updated_at = datetime.utcnow()

    def set_maintenance(self) -> None:
        """Put equipment in maintenance"""
        self.status = EquipmentStatus.MAINTENANCE
        self.current_staff_id = None
        self.current_appointment_id = None
        self.updated_at = datetime.utcnow()

    def add_maintenance_record(self, record: MaintenanceRecord) -> None:
        """Add maintenance history"""
        self.maintenance_history.append(record)
        self.total_maintenance_cost += record.cost
        self.last_maintenance_date = record.date
        if record.next_due:
            self.next_maintenance_date = record.next_due
        self.updated_at = datetime.utcnow()


class EquipmentCreate(BaseModel):
    """Schema for creating equipment"""
    name: str = Field(min_length=2, max_length=100)
    category: EquipmentCategory = EquipmentCategory.OTHER
    description: Optional[str] = None

    make: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    year: Optional[int] = Field(None, ge=1900, le=2100)

    status: EquipmentStatus = EquipmentStatus.AVAILABLE
    purchase_date: Optional[date] = None
    purchase_price: Optional[float] = Field(None, ge=0)

    maintenance_interval_days: Optional[int] = Field(None, ge=1)
    requires_certification: bool = False
    certified_staff_ids: list[str] = Field(default_factory=list)

    storage_location: Optional[str] = None
    notes: Optional[str] = None

    model_config = ConfigDict(str_strip_whitespace=True)


class EquipmentUpdate(BaseModel):
    """Schema for updating equipment"""
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    category: Optional[EquipmentCategory] = None
    description: Optional[str] = None

    make: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None

    status: Optional[EquipmentStatus] = None
    current_value: Optional[float] = Field(None, ge=0)

    maintenance_interval_days: Optional[int] = Field(None, ge=1)
    next_maintenance_date: Optional[date] = None
    requires_certification: Optional[bool] = None
    certified_staff_ids: Optional[list[str]] = None

    storage_location: Optional[str] = None
    notes: Optional[str] = None

    model_config = ConfigDict(str_strip_whitespace=True)


class EquipmentResponse(BaseModel):
    """Public equipment response"""
    equipment_id: str
    business_id: str
    name: str
    category: EquipmentCategory
    description: Optional[str] = None

    make: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None

    status: EquipmentStatus
    current_staff_id: Optional[str] = None

    purchase_date: Optional[date] = None
    purchase_price: Optional[float] = None

    next_maintenance_date: Optional[date] = None
    total_hours_used: float
    total_appointments: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
