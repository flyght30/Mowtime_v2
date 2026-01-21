"""
Common API response schemas
"""

from typing import Generic, TypeVar, Optional, Any
from pydantic import BaseModel, Field

T = TypeVar("T")


class ErrorDetail(BaseModel):
    """Error detail information"""
    code: str
    message: str
    field: Optional[str] = None
    details: Optional[dict] = None


class ErrorResponse(BaseModel):
    """Standard error response"""
    success: bool = False
    error: ErrorDetail


class MessageResponse(BaseModel):
    """Simple message response"""
    success: bool = True
    message: str


class PaginationMeta(BaseModel):
    """Pagination metadata"""
    total: int
    page: int
    per_page: int
    total_pages: int
    has_next: bool
    has_prev: bool


class PaginatedResponse(BaseModel, Generic[T]):
    """Paginated list response"""
    success: bool = True
    data: list[T]
    meta: PaginationMeta


class SingleResponse(BaseModel, Generic[T]):
    """Single item response"""
    success: bool = True
    data: T


class ListResponse(BaseModel, Generic[T]):
    """Non-paginated list response"""
    success: bool = True
    data: list[T]
    count: int


def create_pagination_meta(
    total: int,
    page: int,
    per_page: int
) -> PaginationMeta:
    """Create pagination metadata"""
    total_pages = (total + per_page - 1) // per_page if per_page > 0 else 0
    return PaginationMeta(
        total=total,
        page=page,
        per_page=per_page,
        total_pages=total_pages,
        has_next=page < total_pages,
        has_prev=page > 1
    )
