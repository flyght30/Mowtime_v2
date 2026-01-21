"""
ServicePro Data Models
Pydantic models for MongoDB documents
"""

from app.models.user import User, UserRole, UserCreate, UserUpdate, UserInDB
from app.models.business import (
    Business, BusinessConfig, BusinessHours, WeatherThresholds,
    BusinessCreate, BusinessUpdate, BusinessPlan, ServiceVertical
)
from app.models.client import Client, ClientCreate, ClientUpdate, Address
from app.models.appointment import (
    Appointment, AppointmentStatus, AppointmentCreate, AppointmentUpdate,
    RecurrencePattern, RecurrenceType
)
from app.models.service import Service, ServiceCreate, ServiceUpdate, PricingType
from app.models.staff import Staff, StaffCreate, StaffUpdate, StaffRole
from app.models.equipment import Equipment, EquipmentStatus, EquipmentCreate, EquipmentUpdate
from app.models.availability import Availability, AvailabilityType, TimeSlot
from app.models.notification import Notification, NotificationType, NotificationStatus
from app.models.common import AuditEntry, PyObjectId

__all__ = [
    # User
    "User", "UserRole", "UserCreate", "UserUpdate", "UserInDB",
    # Business
    "Business", "BusinessConfig", "BusinessHours", "WeatherThresholds",
    "BusinessCreate", "BusinessUpdate", "BusinessPlan", "ServiceVertical",
    # Client
    "Client", "ClientCreate", "ClientUpdate", "Address",
    # Appointment
    "Appointment", "AppointmentStatus", "AppointmentCreate", "AppointmentUpdate",
    "RecurrencePattern", "RecurrenceType",
    # Service
    "Service", "ServiceCreate", "ServiceUpdate", "PricingType",
    # Staff
    "Staff", "StaffCreate", "StaffUpdate", "StaffRole",
    # Equipment
    "Equipment", "EquipmentStatus", "EquipmentCreate", "EquipmentUpdate",
    # Availability
    "Availability", "AvailabilityType", "TimeSlot",
    # Notification
    "Notification", "NotificationType", "NotificationStatus",
    # Common
    "AuditEntry", "PyObjectId",
]
