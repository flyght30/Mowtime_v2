"""
Security utilities for authentication
Password hashing and JWT token management
"""

from datetime import datetime, timedelta, timezone
from typing import Optional
from passlib.context import CryptContext
from jose import JWTError, jwt
from pydantic import BaseModel

from app.config import get_settings

settings = get_settings()

# Password hashing context
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=12  # Secure default
)


class TokenData(BaseModel):
    """Data extracted from JWT token"""
    user_id: str
    business_id: Optional[str] = None
    role: str
    token_type: str = "access"  # access or refresh


class TokenPair(BaseModel):
    """Access and refresh token pair"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a password against its hash
    Uses constant-time comparison to prevent timing attacks
    """
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """
    Hash a password using bcrypt
    Salt is automatically generated and stored in the hash
    """
    return pwd_context.hash(password)


def create_access_token(
    user_id: str,
    role: str,
    business_id: Optional[str] = None,
    expires_delta: Optional[timedelta] = None
) -> str:
    """
    Create a JWT access token

    Args:
        user_id: User's unique identifier
        role: User's role (owner, admin, staff, customer)
        business_id: Associated business ID
        expires_delta: Optional custom expiration time

    Returns:
        Encoded JWT token string
    """
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )

    to_encode = {
        "sub": user_id,
        "role": role,
        "business_id": business_id,
        "type": "access",
        "exp": expire,
        "iat": datetime.now(timezone.utc)
    }

    encoded_jwt = jwt.encode(
        to_encode,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM
    )
    return encoded_jwt


def create_refresh_token(
    user_id: str,
    role: str,
    business_id: Optional[str] = None,
    expires_delta: Optional[timedelta] = None
) -> str:
    """
    Create a JWT refresh token
    Refresh tokens have longer expiration and are used to obtain new access tokens
    """
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            days=settings.REFRESH_TOKEN_EXPIRE_DAYS
        )

    to_encode = {
        "sub": user_id,
        "role": role,
        "business_id": business_id,
        "type": "refresh",
        "exp": expire,
        "iat": datetime.now(timezone.utc)
    }

    encoded_jwt = jwt.encode(
        to_encode,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM
    )
    return encoded_jwt


def create_token_pair(
    user_id: str,
    role: str,
    business_id: Optional[str] = None
) -> TokenPair:
    """
    Create both access and refresh tokens
    """
    access_token = create_access_token(user_id, role, business_id)
    refresh_token = create_refresh_token(user_id, role, business_id)

    return TokenPair(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )


def verify_token(token: str, token_type: str = "access") -> Optional[TokenData]:
    """
    Verify and decode a JWT token

    Args:
        token: The JWT token string
        token_type: Expected token type (access or refresh)

    Returns:
        TokenData if valid, None if invalid
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM]
        )

        user_id: str = payload.get("sub")
        role: str = payload.get("role")
        business_id: Optional[str] = payload.get("business_id")
        payload_type: str = payload.get("type", "access")

        if user_id is None or role is None:
            return None

        if payload_type != token_type:
            return None

        return TokenData(
            user_id=user_id,
            business_id=business_id,
            role=role,
            token_type=payload_type
        )

    except JWTError:
        return None


def is_token_expired(token: str) -> bool:
    """
    Check if a token is expired without full validation
    Useful for determining if refresh is needed
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            options={"verify_exp": False}  # Don't raise on expiry
        )
        exp = payload.get("exp")
        if exp is None:
            return True
        return datetime.fromtimestamp(exp, tz=timezone.utc) < datetime.now(timezone.utc)
    except JWTError:
        return True
