"""
Common model utilities and base classes
"""

from datetime import datetime, timezone
from typing import Annotated, Any, Optional
from bson import ObjectId
from pydantic import BaseModel, Field, ConfigDict
from pydantic.functional_validators import BeforeValidator
import uuid


def validate_object_id(v: Any) -> ObjectId:
    """Validate and convert to ObjectId"""
    if isinstance(v, ObjectId):
        return v
    if isinstance(v, str) and ObjectId.is_valid(v):
        return ObjectId(v)
    raise ValueError(f"Invalid ObjectId: {v}")


PyObjectId = Annotated[ObjectId, BeforeValidator(validate_object_id)]


def generate_id(prefix: str) -> str:
    """Generate a prefixed unique ID"""
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def utc_now() -> datetime:
    """Get current UTC timestamp"""
    return datetime.now(timezone.utc)


class AuditEntry(BaseModel):
    """Audit log entry for tracking changes"""
    action: str
    user_id: Optional[str] = None
    timestamp: datetime = Field(default_factory=utc_now)
    changes: Optional[dict] = None
    ip_address: Optional[str] = None

    model_config = ConfigDict(
        json_encoders={datetime: lambda v: v.isoformat()}
    )


class BaseDocument(BaseModel):
    """Base model for MongoDB documents"""
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    deleted_at: Optional[datetime] = None
    audit_log: list[AuditEntry] = Field(default_factory=list)

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={
            ObjectId: str,
            datetime: lambda v: v.isoformat()
        }
    )

    def soft_delete(self) -> None:
        """Mark document as deleted"""
        self.deleted_at = utc_now()
        self.updated_at = utc_now()

    def add_audit(self, action: str, user_id: Optional[str] = None,
                  changes: Optional[dict] = None, ip_address: Optional[str] = None) -> None:
        """Add an audit log entry"""
        self.audit_log.append(AuditEntry(
            action=action,
            user_id=user_id,
            changes=changes,
            ip_address=ip_address
        ))
        self.updated_at = utc_now()

    def is_deleted(self) -> bool:
        """Check if document is soft deleted"""
        return self.deleted_at is not None


class TimestampMixin(BaseModel):
    """Mixin for simple timestamp fields"""
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


from typing import Generic, TypeVar, List

T = TypeVar('T')


class SingleResponse(BaseModel, Generic[T]):
    """Standard response wrapper for single item"""
    success: bool = True
    data: Optional[T] = None
    message: Optional[str] = None

    model_config = ConfigDict(
        json_encoders={
            ObjectId: str,
            datetime: lambda v: v.isoformat()
        }
    )


class ListResponse(BaseModel, Generic[T]):
    """Standard response wrapper for list of items"""
    success: bool = True
    data: List[T] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 20
    message: Optional[str] = None

    model_config = ConfigDict(
        json_encoders={
            ObjectId: str,
            datetime: lambda v: v.isoformat()
        }
    )
