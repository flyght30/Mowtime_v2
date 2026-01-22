"""
Authentication API Router
Handles registration, login, token refresh, and password management
"""

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_database
from app.services.auth_service import AuthService, AuthError
from app.schemas.auth import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    RefreshRequest,
    PasswordChangeRequest,
    PasswordResetRequest,
    PasswordResetConfirm,
    UserProfileResponse
)
from app.schemas.common import MessageResponse, ErrorResponse, ErrorDetail
from app.middleware.auth import get_current_user
from app.models.user import User

router = APIRouter()


def get_auth_service(db: AsyncIOMotorDatabase = Depends(get_database)) -> AuthService:
    """Dependency to get auth service"""
    return AuthService(db)


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        400: {"model": ErrorResponse, "description": "Registration failed"},
        409: {"model": ErrorResponse, "description": "Email already exists"}
    }
)
async def register(
    data: RegisterRequest,
    auth_service: AuthService = Depends(get_auth_service)
):
    """
    Register a new user account

    Optionally creates a business if business_name is provided.
    Returns JWT tokens for immediate authentication.
    """
    try:
        user, business = await auth_service.register_user(data)
        return auth_service.create_tokens(user)

    except AuthError as e:
        status_code = status.HTTP_409_CONFLICT if e.code == "EMAIL_EXISTS" else status.HTTP_400_BAD_REQUEST
        raise HTTPException(
            status_code=status_code,
            detail={"code": e.code, "message": e.message}
        )


@router.post(
    "/login",
    response_model=TokenResponse,
    responses={
        401: {"model": ErrorResponse, "description": "Invalid credentials"},
        423: {"model": ErrorResponse, "description": "Account locked"}
    }
)
async def login(
    data: LoginRequest,
    auth_service: AuthService = Depends(get_auth_service)
):
    """
    Authenticate user and return JWT tokens

    Returns access and refresh tokens along with basic user info.
    Account will be locked after 5 failed attempts.
    """
    try:
        user = await auth_service.authenticate(data.email, data.password)
        return auth_service.create_tokens(user)

    except AuthError as e:
        if e.code == "ACCOUNT_LOCKED":
            status_code = status.HTTP_423_LOCKED
        elif e.code == "ACCOUNT_DISABLED":
            status_code = status.HTTP_403_FORBIDDEN
        else:
            status_code = status.HTTP_401_UNAUTHORIZED

        raise HTTPException(
            status_code=status_code,
            detail={"code": e.code, "message": e.message}
        )


@router.post(
    "/refresh",
    response_model=TokenResponse,
    responses={
        401: {"model": ErrorResponse, "description": "Invalid refresh token"}
    }
)
async def refresh_token(
    data: RefreshRequest,
    auth_service: AuthService = Depends(get_auth_service)
):
    """
    Refresh access token using refresh token

    Use this when access token expires to get new tokens
    without requiring user to re-authenticate.
    """
    try:
        return await auth_service.refresh_tokens(data.refresh_token)

    except AuthError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": e.code, "message": e.message}
        )


@router.get(
    "/me",
    response_model=UserProfileResponse,
    responses={
        401: {"model": ErrorResponse, "description": "Not authenticated"}
    }
)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user)
):
    """
    Get current authenticated user's profile

    Requires valid access token in Authorization header.
    """
    return UserProfileResponse(
        user_id=current_user.user_id,
        email=current_user.email,
        role=current_user.role.value,
        business_id=current_user.business_id,
        first_name=current_user.first_name,
        last_name=current_user.last_name,
        phone=current_user.phone,
        avatar_url=current_user.avatar_url,
        is_verified=current_user.is_verified,
        timezone=current_user.timezone,
        notification_preferences=current_user.notification_preferences
    )


@router.post(
    "/change-password",
    response_model=MessageResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid password"},
        401: {"model": ErrorResponse, "description": "Not authenticated"}
    }
)
async def change_password(
    data: PasswordChangeRequest,
    current_user: User = Depends(get_current_user),
    auth_service: AuthService = Depends(get_auth_service)
):
    """
    Change current user's password

    Requires current password for verification.
    """
    try:
        await auth_service.change_password(
            current_user.user_id,
            data.current_password,
            data.new_password
        )
        return MessageResponse(message="Password changed successfully")

    except AuthError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": e.code, "message": e.message}
        )


@router.post(
    "/logout",
    response_model=MessageResponse
)
async def logout():
    """
    Logout user

    Note: JWT tokens are stateless, so this endpoint is primarily
    for client-side token cleanup. Consider implementing token
    blacklisting for enhanced security in production.
    """
    # In a production system, you might want to:
    # 1. Add the token to a blacklist in Redis
    # 2. Invalidate refresh tokens in the database
    return MessageResponse(message="Logged out successfully")


@router.post(
    "/forgot-password",
    response_model=MessageResponse,
    responses={
        200: {"description": "Reset email sent (or user doesn't exist)"}
    }
)
async def forgot_password(
    data: PasswordResetRequest,
    auth_service: AuthService = Depends(get_auth_service)
):
    """
    Request a password reset email

    If the email exists, a password reset link will be sent.
    Always returns success to prevent email enumeration.
    """
    import os
    from app.services.email_service import get_email_service
    from app.services.email_templates import render_password_reset

    # Create reset token
    token = await auth_service.create_password_reset_token(data.email)

    if token:
        # Get user info for email
        user = await auth_service.get_user_for_reset(data.email)
        if user:
            # Build reset link
            frontend_url = os.getenv("FRONTEND_URL", "http://localhost:8081")
            reset_link = f"{frontend_url}/reset-password?token={token}"

            # Send email
            email_service = get_email_service()
            if email_service.is_configured:
                user_name = f"{user.first_name} {user.last_name}".strip() or "User"
                html_content = render_password_reset(
                    user_name=user_name,
                    reset_link=reset_link,
                    expires_minutes=60
                )
                await email_service.send_email(
                    to_email=data.email,
                    subject="Reset Your Password",
                    html_content=html_content,
                    to_name=user_name
                )

    # Always return success to prevent email enumeration
    return MessageResponse(
        message="If an account exists with this email, a password reset link has been sent."
    )


@router.post(
    "/reset-password",
    response_model=MessageResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid or expired token"}
    }
)
async def reset_password(
    data: PasswordResetConfirm,
    auth_service: AuthService = Depends(get_auth_service)
):
    """
    Reset password using token from email

    Validates the token and sets the new password.
    """
    try:
        await auth_service.reset_password(data.token, data.new_password)
        return MessageResponse(message="Password has been reset successfully")

    except AuthError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": e.code, "message": e.message}
        )


@router.get(
    "/verify-reset-token",
    response_model=dict,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid or expired token"}
    }
)
async def verify_reset_token(
    token: str,
    auth_service: AuthService = Depends(get_auth_service)
):
    """
    Verify a password reset token is valid

    Use this to check if a reset link is still valid before showing the form.
    """
    user = await auth_service.verify_password_reset_token(token)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_TOKEN", "message": "Invalid or expired reset token"}
        )

    return {
        "success": True,
        "data": {
            "valid": True,
            "email": user.email
        }
    }
