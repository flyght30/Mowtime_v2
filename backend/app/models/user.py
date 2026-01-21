"""
User Model
Handles authentication and user accounts
"""

from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, EmailStr, ConfigDict

from app.models.common import BaseDocument, generate_id, utc_now


class UserRole(str, Enum):
    """User role types for RBAC"""
    OWNER = "owner"
    ADMIN = "admin"
    STAFF = "staff"
    CUSTOMER = "customer"


class User(BaseDocument):
    """User document model"""
    user_id: str = Field(default_factory=lambda: generate_id("usr"))
    email: EmailStr
    password_hash: str
    role: UserRole = UserRole.CUSTOMER
    business_id: Optional[str] = None  # None for super admins

    # Profile
    first_name: str
    last_name: str
    phone: Optional[str] = None
    avatar_url: Optional[str] = None

    # Status
    is_active: bool = True
    is_verified: bool = False

    # Tracking
    last_login_at: Optional[datetime] = None
    failed_login_attempts: int = 0
    locked_until: Optional[datetime] = None

    # Preferences
    timezone: str = "America/Chicago"
    notification_preferences: dict = Field(default_factory=lambda: {
        "email": True,
        "sms": True,
        "push": True
    })

    @property
    def full_name(self) -> str:
        """Get user's full name"""
        return f"{self.first_name} {self.last_name}"

    def record_login(self) -> None:
        """Record successful login"""
        self.last_login_at = utc_now()
        self.failed_login_attempts = 0
        self.locked_until = None
        self.updated_at = utc_now()

    def record_failed_login(self, max_attempts: int = 5, lockout_minutes: int = 30) -> None:
        """Record failed login attempt"""
        from datetime import timedelta
        self.failed_login_attempts += 1
        if self.failed_login_attempts >= max_attempts:
            self.locked_until = utc_now() + timedelta(minutes=lockout_minutes)
        self.updated_at = utc_now()

    def is_locked(self) -> bool:
        """Check if account is locked"""
        if self.locked_until is None:
            return False
        return utc_now() < self.locked_until


class UserCreate(BaseModel):
    """Schema for creating a user"""
    email: EmailStr
    password: str = Field(min_length=8)
    first_name: str = Field(min_length=1, max_length=50)
    last_name: str = Field(min_length=1, max_length=50)
    phone: Optional[str] = None
    role: UserRole = UserRole.CUSTOMER
    business_id: Optional[str] = None
    timezone: str = "America/Chicago"

    model_config = ConfigDict(str_strip_whitespace=True)


class UserUpdate(BaseModel):
    """Schema for updating a user"""
    first_name: Optional[str] = Field(None, min_length=1, max_length=50)
    last_name: Optional[str] = Field(None, min_length=1, max_length=50)
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    timezone: Optional[str] = None
    notification_preferences: Optional[dict] = None
    is_active: Optional[bool] = None

    model_config = ConfigDict(str_strip_whitespace=True)


class UserInDB(User):
    """User model as stored in database (includes MongoDB _id)"""
    id: Optional[str] = Field(None, alias="_id")

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True
    )


class UserResponse(BaseModel):
    """Public user response (excludes sensitive data)"""
    user_id: str
    email: EmailStr
    role: UserRole
    business_id: Optional[str] = None
    first_name: str
    last_name: str
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    is_active: bool
    is_verified: bool
    timezone: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
