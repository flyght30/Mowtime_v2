"""
Custom Exceptions and Error Handling
Standardized error responses across the application
"""

from typing import Optional, Any
from fastapi import HTTPException, status
from fastapi.responses import JSONResponse
from fastapi import Request
from pydantic import ValidationError
import logging

logger = logging.getLogger(__name__)


class ServiceProException(Exception):
    """Base exception for ServicePro application"""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        details: Optional[dict] = None
    ):
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details
        super().__init__(message)

    def to_response(self) -> dict:
        """Convert to API response format"""
        response = {
            "success": False,
            "error": {
                "code": self.code,
                "message": self.message
            }
        }
        if self.details:
            response["error"]["details"] = self.details
        return response


# Authentication Exceptions
class AuthenticationError(ServiceProException):
    """Authentication failed"""

    def __init__(self, message: str = "Authentication failed", code: str = "AUTH_ERROR"):
        super().__init__(
            code=code,
            message=message,
            status_code=status.HTTP_401_UNAUTHORIZED
        )


class InvalidCredentialsError(AuthenticationError):
    """Invalid login credentials"""

    def __init__(self):
        super().__init__(
            message="Invalid email or password",
            code="INVALID_CREDENTIALS"
        )


class TokenExpiredError(AuthenticationError):
    """JWT token has expired"""

    def __init__(self):
        super().__init__(
            message="Token has expired",
            code="TOKEN_EXPIRED"
        )


class InvalidTokenError(AuthenticationError):
    """JWT token is invalid"""

    def __init__(self):
        super().__init__(
            message="Invalid or malformed token",
            code="INVALID_TOKEN"
        )


class AccountLockedError(AuthenticationError):
    """Account is temporarily locked"""

    def __init__(self, minutes_remaining: Optional[int] = None):
        message = "Account is temporarily locked due to too many failed login attempts"
        if minutes_remaining:
            message += f". Try again in {minutes_remaining} minutes"
        super().__init__(message=message, code="ACCOUNT_LOCKED")
        self.status_code = status.HTTP_423_LOCKED


# Authorization Exceptions
class AuthorizationError(ServiceProException):
    """Authorization failed - insufficient permissions"""

    def __init__(self, message: str = "Insufficient permissions"):
        super().__init__(
            code="FORBIDDEN",
            message=message,
            status_code=status.HTTP_403_FORBIDDEN
        )


class RoleRequiredError(AuthorizationError):
    """Specific role required"""

    def __init__(self, required_roles: list[str]):
        super().__init__(
            message=f"This action requires one of these roles: {', '.join(required_roles)}"
        )
        self.code = "INSUFFICIENT_ROLE"


class BusinessAccessError(AuthorizationError):
    """User doesn't have access to this business"""

    def __init__(self):
        super().__init__(message="Access denied to this business")
        self.code = "BUSINESS_ACCESS_DENIED"


# Resource Exceptions
class ResourceNotFoundError(ServiceProException):
    """Requested resource not found"""

    def __init__(self, resource_type: str, resource_id: Optional[str] = None):
        message = f"{resource_type} not found"
        if resource_id:
            message = f"{resource_type} with ID '{resource_id}' not found"
        super().__init__(
            code=f"{resource_type.upper()}_NOT_FOUND",
            message=message,
            status_code=status.HTTP_404_NOT_FOUND
        )


class ResourceExistsError(ServiceProException):
    """Resource already exists (conflict)"""

    def __init__(self, resource_type: str, field: str = ""):
        message = f"{resource_type} already exists"
        if field:
            message = f"A {resource_type.lower()} with this {field} already exists"
        super().__init__(
            code=f"{resource_type.upper()}_EXISTS",
            message=message,
            status_code=status.HTTP_409_CONFLICT
        )


class ResourceInUseError(ServiceProException):
    """Resource cannot be deleted because it's in use"""

    def __init__(self, resource_type: str, reason: str = ""):
        message = f"Cannot delete {resource_type} - it is currently in use"
        if reason:
            message = f"Cannot delete {resource_type}: {reason}"
        super().__init__(
            code=f"{resource_type.upper()}_IN_USE",
            message=message,
            status_code=status.HTTP_400_BAD_REQUEST
        )


# Scheduling Exceptions
class SchedulingConflictError(ServiceProException):
    """Scheduling conflict detected"""

    def __init__(self, conflicts: list[dict]):
        super().__init__(
            code="SCHEDULING_CONFLICT",
            message="Scheduling conflict detected",
            status_code=status.HTTP_409_CONFLICT,
            details={"conflicts": conflicts}
        )


class BusinessClosedError(ServiceProException):
    """Business is closed on requested date/time"""

    def __init__(self, date: str):
        super().__init__(
            code="BUSINESS_CLOSED",
            message=f"Business is closed on {date}",
            status_code=status.HTTP_400_BAD_REQUEST
        )


class StaffUnavailableError(ServiceProException):
    """Staff member is not available"""

    def __init__(self, staff_id: str, reason: str = ""):
        message = f"Staff member is not available"
        if reason:
            message += f": {reason}"
        super().__init__(
            code="STAFF_UNAVAILABLE",
            message=message,
            status_code=status.HTTP_400_BAD_REQUEST,
            details={"staff_id": staff_id}
        )


# Validation Exceptions
class ValidationException(ServiceProException):
    """Input validation failed"""

    def __init__(self, errors: list[dict]):
        super().__init__(
            code="VALIDATION_ERROR",
            message="Input validation failed",
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            details={"errors": errors}
        )


# External Service Exceptions
class ExternalServiceError(ServiceProException):
    """External service (API) error"""

    def __init__(self, service_name: str, message: str = ""):
        super().__init__(
            code=f"{service_name.upper()}_ERROR",
            message=message or f"{service_name} service error",
            status_code=status.HTTP_502_BAD_GATEWAY
        )


class WeatherServiceError(ExternalServiceError):
    """Weather API error"""

    def __init__(self, message: str = "Failed to fetch weather data"):
        super().__init__(service_name="WEATHER", message=message)


class SMSServiceError(ExternalServiceError):
    """SMS/Twilio service error"""

    def __init__(self, message: str = "Failed to send SMS"):
        super().__init__(service_name="SMS", message=message)


# Rate Limiting
class RateLimitExceededError(ServiceProException):
    """Rate limit exceeded"""

    def __init__(self, retry_after: Optional[int] = None):
        message = "Too many requests. Please try again later"
        if retry_after:
            message += f" (retry after {retry_after} seconds)"
        super().__init__(
            code="RATE_LIMIT_EXCEEDED",
            message=message,
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            details={"retry_after": retry_after} if retry_after else None
        )


# Exception Handlers for FastAPI
async def service_pro_exception_handler(request: Request, exc: ServiceProException) -> JSONResponse:
    """Handle ServicePro custom exceptions"""
    logger.warning(f"ServicePro exception: {exc.code} - {exc.message}")
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.to_response()
    )


async def validation_exception_handler(request: Request, exc: ValidationError) -> JSONResponse:
    """Handle Pydantic validation errors"""
    errors = []
    for error in exc.errors():
        errors.append({
            "field": ".".join(str(loc) for loc in error["loc"]),
            "message": error["msg"],
            "type": error["type"]
        })

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "success": False,
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Input validation failed",
                "details": {"errors": errors}
            }
        }
    )


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Handle FastAPI HTTP exceptions"""
    detail = exc.detail
    if isinstance(detail, dict):
        code = detail.get("code", "HTTP_ERROR")
        message = detail.get("message", str(detail))
    else:
        code = "HTTP_ERROR"
        message = str(detail)

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error": {
                "code": code,
                "message": message
            }
        }
    )


async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle unexpected exceptions"""
    logger.error(f"Unexpected error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "success": False,
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "An unexpected error occurred"
            }
        }
    )


def register_exception_handlers(app):
    """Register all exception handlers with the FastAPI app"""
    from fastapi.exceptions import RequestValidationError

    app.add_exception_handler(ServiceProException, service_pro_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(Exception, generic_exception_handler)
