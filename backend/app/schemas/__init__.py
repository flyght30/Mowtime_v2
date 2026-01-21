"""
API Request/Response Schemas
"""

from app.schemas.auth import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    RefreshRequest,
    PasswordChangeRequest,
    PasswordResetRequest,
    PasswordResetConfirm
)
from app.schemas.common import (
    PaginatedResponse,
    MessageResponse,
    ErrorResponse,
    ErrorDetail
)

__all__ = [
    # Auth
    "LoginRequest",
    "RegisterRequest",
    "TokenResponse",
    "RefreshRequest",
    "PasswordChangeRequest",
    "PasswordResetRequest",
    "PasswordResetConfirm",
    # Common
    "PaginatedResponse",
    "MessageResponse",
    "ErrorResponse",
    "ErrorDetail"
]
