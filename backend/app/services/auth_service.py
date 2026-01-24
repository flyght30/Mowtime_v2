"""
Authentication Service
Handles user registration, login, and token management
"""

from typing import Optional, Tuple
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging
import secrets
from datetime import datetime, timedelta

from app.models.user import User, UserRole
from app.models.business import Business, BusinessPlan, SubscriptionStatus, ServiceVertical
from app.models.common import generate_id, utc_now
from app.schemas.auth import RegisterRequest, TokenResponse
from app.utils.security import (
    get_password_hash,
    verify_password,
    create_access_token,
    create_refresh_token,
    verify_token,
    TokenData
)
from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

# Password reset token expiry in minutes
PASSWORD_RESET_EXPIRE_MINUTES = 60


class AuthError(Exception):
    """Authentication error"""
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


class AuthService:
    """Authentication service for user management"""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.users = db.users
        self.businesses = db.businesses

    async def register_user(
        self,
        data: RegisterRequest
    ) -> Tuple[User, Optional[Business]]:
        """
        Register a new user and optionally create a business

        Args:
            data: Registration request data

        Returns:
            Tuple of (User, Business or None)

        Raises:
            AuthError: If registration fails
        """
        # Check if email already exists
        existing = await self.users.find_one({"email": data.email.lower()})
        if existing:
            raise AuthError("EMAIL_EXISTS", "An account with this email already exists")

        business = None
        business_id = None
        role = UserRole.CUSTOMER

        # If business info provided, create business first
        if data.business_name:
            business_id = generate_id("bus")
            role = UserRole.OWNER

            # Determine vertical - default to HVAC if not specified or invalid
            try:
                vertical = ServiceVertical(data.vertical.lower()) if data.vertical else ServiceVertical.HVAC
            except ValueError:
                logger.warning(f"Invalid vertical '{data.vertical}', defaulting to HVAC")
                vertical = ServiceVertical.HVAC

            business = Business(
                business_id=business_id,
                owner_id="",  # Will update after user created
                name=data.business_name,
                email=data.email.lower(),
                phone=data.business_phone or data.phone or "",
                address_line1=data.business_address or "",
                city=data.business_city or "",
                state=data.business_state or "",
                zip_code=data.business_zip or "",
                timezone=data.timezone,
                plan=BusinessPlan.FREE,
                subscription_status=SubscriptionStatus.TRIAL,
                vertical=vertical
            )

        # Create user
        user = User(
            email=data.email.lower(),
            password_hash=get_password_hash(data.password),
            first_name=data.first_name,
            last_name=data.last_name,
            phone=data.phone,
            role=role,
            business_id=business_id,
            timezone=data.timezone
        )

        # Insert user
        user_dict = user.model_dump(by_alias=True)
        await self.users.insert_one(user_dict)

        # Insert business and update with owner_id
        if business:
            business.owner_id = user.user_id
            business_dict = business.model_dump(by_alias=True)
            await self.businesses.insert_one(business_dict)

        logger.info(f"User registered: {user.email} (role: {role})")
        return user, business

    async def authenticate(
        self,
        email: str,
        password: str
    ) -> User:
        """
        Authenticate user with email and password

        Args:
            email: User's email
            password: User's password

        Returns:
            Authenticated User object

        Raises:
            AuthError: If authentication fails
        """
        user_dict = await self.users.find_one({"email": email.lower()})

        if not user_dict:
            raise AuthError("INVALID_CREDENTIALS", "Invalid email or password")

        user = User(**user_dict)

        # Check if account is locked
        if user.is_locked():
            raise AuthError(
                "ACCOUNT_LOCKED",
                "Account is temporarily locked due to too many failed login attempts"
            )

        # Check if account is active
        if not user.is_active:
            raise AuthError("ACCOUNT_DISABLED", "This account has been disabled")

        # Verify password
        if not verify_password(password, user.password_hash):
            # Record failed attempt
            user.record_failed_login()
            await self.users.update_one(
                {"user_id": user.user_id},
                {"$set": {
                    "failed_login_attempts": user.failed_login_attempts,
                    "locked_until": user.locked_until,
                    "updated_at": utc_now()
                }}
            )
            raise AuthError("INVALID_CREDENTIALS", "Invalid email or password")

        # Record successful login
        user.record_login()
        await self.users.update_one(
            {"user_id": user.user_id},
            {"$set": {
                "last_login_at": user.last_login_at,
                "failed_login_attempts": 0,
                "locked_until": None,
                "updated_at": utc_now()
            }}
        )

        logger.info(f"User authenticated: {user.email}")
        return user

    def create_tokens(self, user: User) -> TokenResponse:
        """
        Create access and refresh tokens for user

        Args:
            user: Authenticated user

        Returns:
            TokenResponse with tokens and user info
        """
        access_token = create_access_token(
            user_id=user.user_id,
            role=user.role.value,
            business_id=user.business_id
        )

        refresh_token = create_refresh_token(
            user_id=user.user_id,
            role=user.role.value,
            business_id=user.business_id
        )

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            user_id=user.user_id,
            email=user.email,
            role=user.role.value,
            business_id=user.business_id,
            first_name=user.first_name,
            last_name=user.last_name
        )

    async def refresh_tokens(self, refresh_token: str) -> TokenResponse:
        """
        Refresh access token using refresh token

        Args:
            refresh_token: Valid refresh token

        Returns:
            New TokenResponse

        Raises:
            AuthError: If refresh token is invalid
        """
        token_data = verify_token(refresh_token, token_type="refresh")

        if not token_data:
            raise AuthError("INVALID_TOKEN", "Invalid or expired refresh token")

        # Get user to ensure they still exist and are active
        user_dict = await self.users.find_one({"user_id": token_data.user_id})

        if not user_dict:
            raise AuthError("USER_NOT_FOUND", "User no longer exists")

        user = User(**user_dict)

        if not user.is_active:
            raise AuthError("ACCOUNT_DISABLED", "This account has been disabled")

        logger.info(f"Tokens refreshed for: {user.email}")
        return self.create_tokens(user)

    async def get_user_by_id(self, user_id: str) -> Optional[User]:
        """Get user by ID"""
        user_dict = await self.users.find_one({"user_id": user_id})
        if not user_dict:
            return None
        return User(**user_dict)

    async def get_user_by_email(self, email: str) -> Optional[User]:
        """Get user by email"""
        user_dict = await self.users.find_one({"email": email.lower()})
        if not user_dict:
            return None
        return User(**user_dict)

    async def change_password(
        self,
        user_id: str,
        current_password: str,
        new_password: str
    ) -> bool:
        """
        Change user's password

        Args:
            user_id: User ID
            current_password: Current password
            new_password: New password

        Returns:
            True if successful

        Raises:
            AuthError: If password change fails
        """
        user = await self.get_user_by_id(user_id)

        if not user:
            raise AuthError("USER_NOT_FOUND", "User not found")

        if not verify_password(current_password, user.password_hash):
            raise AuthError("INVALID_PASSWORD", "Current password is incorrect")

        new_hash = get_password_hash(new_password)

        await self.users.update_one(
            {"user_id": user_id},
            {"$set": {
                "password_hash": new_hash,
                "updated_at": utc_now()
            }}
        )

        logger.info(f"Password changed for: {user.email}")
        return True

    async def verify_token_data(self, token: str) -> Optional[TokenData]:
        """
        Verify access token and return token data

        Args:
            token: Access token string

        Returns:
            TokenData if valid, None otherwise
        """
        return verify_token(token, token_type="access")

    async def create_password_reset_token(self, email: str) -> Optional[str]:
        """
        Create a password reset token for user

        Args:
            email: User's email address

        Returns:
            Reset token if user exists, None otherwise
        """
        user = await self.get_user_by_email(email)
        if not user:
            # Don't reveal if user exists - return None silently
            logger.info(f"Password reset requested for non-existent email: {email}")
            return None

        # Generate secure token
        token = secrets.token_urlsafe(32)
        expires_at = utc_now() + timedelta(minutes=PASSWORD_RESET_EXPIRE_MINUTES)

        # Store token in database
        await self.db.password_reset_tokens.delete_many({"user_id": user.user_id})
        await self.db.password_reset_tokens.insert_one({
            "token": token,
            "user_id": user.user_id,
            "email": email.lower(),
            "expires_at": expires_at,
            "created_at": utc_now(),
            "used": False
        })

        logger.info(f"Password reset token created for: {email}")
        return token

    async def verify_password_reset_token(self, token: str) -> Optional[User]:
        """
        Verify a password reset token

        Args:
            token: Reset token

        Returns:
            User if token is valid, None otherwise
        """
        token_doc = await self.db.password_reset_tokens.find_one({
            "token": token,
            "used": False,
            "expires_at": {"$gt": utc_now()}
        })

        if not token_doc:
            return None

        user = await self.get_user_by_id(token_doc["user_id"])
        return user

    async def reset_password(self, token: str, new_password: str) -> bool:
        """
        Reset password using token

        Args:
            token: Reset token
            new_password: New password

        Returns:
            True if successful

        Raises:
            AuthError: If token is invalid or expired
        """
        token_doc = await self.db.password_reset_tokens.find_one({
            "token": token,
            "used": False,
            "expires_at": {"$gt": utc_now()}
        })

        if not token_doc:
            raise AuthError("INVALID_TOKEN", "Invalid or expired reset token")

        # Update password
        new_hash = get_password_hash(new_password)
        await self.users.update_one(
            {"user_id": token_doc["user_id"]},
            {"$set": {
                "password_hash": new_hash,
                "updated_at": utc_now()
            }}
        )

        # Mark token as used
        await self.db.password_reset_tokens.update_one(
            {"token": token},
            {"$set": {"used": True, "used_at": utc_now()}}
        )

        logger.info(f"Password reset completed for user: {token_doc['user_id']}")
        return True

    async def get_user_for_reset(self, email: str) -> Optional[User]:
        """Get user by email for password reset (returns user info for email template)"""
        return await self.get_user_by_email(email)
