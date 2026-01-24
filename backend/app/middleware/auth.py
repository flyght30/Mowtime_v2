"""
Authentication and Authorization Middleware
JWT token validation and role-based access control
"""

from typing import Optional, Callable
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_database
from app.models.user import User, UserRole
from app.utils.security import verify_token, TokenData

# HTTP Bearer token scheme
security = HTTPBearer(auto_error=False)


async def get_token_data(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Optional[TokenData]:
    """
    Extract and validate token from Authorization header

    Returns TokenData if valid token, None if no token provided
    Raises HTTPException if token is invalid
    """
    if credentials is None:
        return None

    token = credentials.credentials
    token_data = verify_token(token, token_type="access")

    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_TOKEN", "message": "Invalid or expired access token"},
            headers={"WWW-Authenticate": "Bearer"}
        )

    return token_data


async def get_current_user(
    token_data: Optional[TokenData] = Depends(get_token_data),
    db: AsyncIOMotorDatabase = Depends(get_database)
) -> User:
    """
    Get current authenticated user from token

    Raises HTTPException if not authenticated or user not found
    """
    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "NOT_AUTHENTICATED", "message": "Authentication required"},
            headers={"WWW-Authenticate": "Bearer"}
        )

    user_dict = await db.users.find_one({"user_id": token_data.user_id})

    if not user_dict:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "USER_NOT_FOUND", "message": "User not found"},
            headers={"WWW-Authenticate": "Bearer"}
        )

    user = User(**user_dict)

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "ACCOUNT_DISABLED", "message": "Account has been disabled"}
        )

    return user


async def get_optional_user(
    token_data: Optional[TokenData] = Depends(get_token_data),
    db: AsyncIOMotorDatabase = Depends(get_database)
) -> Optional[User]:
    """
    Get current user if authenticated, None otherwise

    Use for endpoints that work with or without authentication
    """
    if token_data is None:
        return None

    user_dict = await db.users.find_one({"user_id": token_data.user_id})

    if not user_dict:
        return None

    user = User(**user_dict)

    if not user.is_active:
        return None

    return user


def require_roles(*allowed_roles: UserRole) -> Callable:
    """
    Dependency factory for role-based access control

    Usage:
        @router.get("/admin-only")
        async def admin_endpoint(user: User = Depends(require_roles(UserRole.ADMIN, UserRole.OWNER))):
            ...

    Args:
        *allowed_roles: Roles that are allowed to access the endpoint

    Returns:
        Dependency function that validates user role
    """
    async def role_checker(
        current_user: User = Depends(get_current_user)
    ) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "INSUFFICIENT_PERMISSIONS",
                    "message": f"This action requires one of these roles: {[r.value for r in allowed_roles]}"
                }
            )
        return current_user

    return role_checker


def require_business_access(allow_customer: bool = False) -> Callable:
    """
    Dependency factory to ensure user has access to business resources

    Args:
        allow_customer: Whether to allow customer role access

    Returns:
        Dependency function that validates business access
    """
    async def business_checker(
        current_user: User = Depends(get_current_user)
    ) -> User:
        # Admins always have access
        if current_user.role == UserRole.ADMIN:
            return current_user

        # User must have a business_id
        if not current_user.business_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "NO_BUSINESS_ACCESS",
                    "message": "User is not associated with any business"
                }
            )

        # Check if customer access is allowed
        if current_user.role == UserRole.CUSTOMER and not allow_customer:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "INSUFFICIENT_PERMISSIONS",
                    "message": "Customer accounts cannot access this resource"
                }
            )

        return current_user

    return business_checker


# Convenience dependency instances
require_owner = require_roles(UserRole.OWNER, UserRole.ADMIN)
require_staff = require_roles(UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF)
require_any_authenticated = get_current_user


class BusinessContext:
    """
    Context for business-scoped operations

    Ensures queries are filtered by the user's business_id
    """

    def __init__(self, user: User, db: AsyncIOMotorDatabase):
        self.user = user
        self.db = db
        self.business_id = user.business_id

    def filter_query(self, query: dict) -> dict:
        """Add business_id filter to query"""
        if self.user.role == UserRole.ADMIN:
            # Admins can access all businesses
            return query

        return {**query, "business_id": self.business_id}

    async def verify_business_access(self, business_id: str) -> bool:
        """Verify user has access to a specific business"""
        if self.user.role == UserRole.ADMIN:
            return True
        return self.business_id == business_id


async def get_business_context(
    current_user: User = Depends(require_business_access()),
    db: AsyncIOMotorDatabase = Depends(get_database)
) -> BusinessContext:
    """
    Dependency to get business context for scoped queries
    """
    return BusinessContext(current_user, db)



async def get_current_business_id(
    current_user: User = Depends(get_current_user)
) -> str:
    """
    Dependency to get current user's business_id
    """
    if not current_user.business_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "NO_BUSINESS", "message": "User is not associated with any business"}
        )
    return current_user.business_id


async def get_current_business(
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Dependency to get current user's business
    """
    from app.models.business import Business
    
    if not current_user.business_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "NO_BUSINESS", "message": "User is not associated with any business"}
        )
    
    business_dict = await db.businesses.find_one({"business_id": current_user.business_id})
    
    if not business_dict:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "BUSINESS_NOT_FOUND", "message": "Business not found"}
        )
    
    return Business(**business_dict)
