"""
Authentication request/response schemas
"""

from typing import Optional
from pydantic import BaseModel, Field, EmailStr, ConfigDict


class LoginRequest(BaseModel):
    """Login request schema"""
    email: EmailStr
    password: str = Field(min_length=1)

    model_config = ConfigDict(str_strip_whitespace=True)


class RegisterRequest(BaseModel):
    """User registration request schema"""
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    first_name: str = Field(min_length=1, max_length=50)
    last_name: str = Field(min_length=1, max_length=50)
    phone: Optional[str] = Field(None, min_length=10, max_length=20)
    timezone: str = "America/Chicago"

    # Business registration (optional - for business owners)
    business_name: Optional[str] = Field(None, min_length=2, max_length=100)
    business_phone: Optional[str] = None
    business_address: Optional[str] = None
    business_city: Optional[str] = None
    business_state: Optional[str] = Field(None, min_length=2, max_length=2)
    business_zip: Optional[str] = None
    vertical: Optional[str] = "hvac"  # Service vertical: lawn_care, hvac, plumbing, etc.

    model_config = ConfigDict(str_strip_whitespace=True)


class TokenResponse(BaseModel):
    """Token response after successful authentication"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds until access token expires

    # User info for frontend
    user_id: str
    email: str
    role: str
    business_id: Optional[str] = None
    first_name: str
    last_name: str


class RefreshRequest(BaseModel):
    """Token refresh request"""
    refresh_token: str


class PasswordChangeRequest(BaseModel):
    """Change password request (authenticated users)"""
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=128)

    model_config = ConfigDict(str_strip_whitespace=True)


class PasswordResetRequest(BaseModel):
    """Request password reset (forgot password)"""
    email: EmailStr

    model_config = ConfigDict(str_strip_whitespace=True)


class PasswordResetConfirm(BaseModel):
    """Confirm password reset with token"""
    token: str
    new_password: str = Field(min_length=8, max_length=128)

    model_config = ConfigDict(str_strip_whitespace=True)


class UserProfileResponse(BaseModel):
    """Current user profile response"""
    user_id: str
    email: EmailStr
    role: str
    business_id: Optional[str] = None
    first_name: str
    last_name: str
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    is_verified: bool
    timezone: str
    notification_preferences: dict

    model_config = ConfigDict(from_attributes=True)
