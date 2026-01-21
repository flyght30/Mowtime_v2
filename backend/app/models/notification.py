"""
Notification Model
SMS, Push, and Email notification queue
"""

from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict

from app.models.common import BaseDocument, generate_id, utc_now


class NotificationType(str, Enum):
    """Notification delivery channel"""
    SMS = "sms"
    PUSH = "push"
    EMAIL = "email"
    VOICE = "voice"  # Automated voice calls


class NotificationStatus(str, Enum):
    """Notification delivery status"""
    PENDING = "pending"
    SCHEDULED = "scheduled"
    SENDING = "sending"
    SENT = "sent"
    DELIVERED = "delivered"
    FAILED = "failed"
    CANCELED = "canceled"


class NotificationCategory(str, Enum):
    """Notification purpose/category"""
    APPOINTMENT_REMINDER = "appointment_reminder"
    APPOINTMENT_CONFIRMATION = "appointment_confirmation"
    APPOINTMENT_CANCELED = "appointment_canceled"
    APPOINTMENT_RESCHEDULED = "appointment_rescheduled"
    WEATHER_ALERT = "weather_alert"
    PAYMENT_RECEIPT = "payment_receipt"
    PAYMENT_REMINDER = "payment_reminder"
    MARKETING = "marketing"
    SYSTEM = "system"
    CUSTOM = "custom"


class Notification(BaseDocument):
    """Notification document model"""
    notification_id: str = Field(default_factory=lambda: generate_id("ntf"))
    business_id: str  # Multi-tenant key

    # Recipient
    recipient_type: str = "client"  # client, staff, user
    recipient_id: str  # Client ID, Staff ID, or User ID
    recipient_name: Optional[str] = None
    recipient_contact: str  # Phone, email, or device token

    # Content
    type: NotificationType
    category: NotificationCategory = NotificationCategory.CUSTOM
    subject: Optional[str] = None  # For email
    message: str
    template_id: Optional[str] = None
    template_data: Optional[dict] = None

    # Related entities
    appointment_id: Optional[str] = None
    invoice_id: Optional[str] = None

    # Scheduling
    status: NotificationStatus = NotificationStatus.PENDING
    scheduled_at: Optional[datetime] = None  # When to send
    priority: int = Field(default=5, ge=1, le=10)  # 1=highest

    # Delivery tracking
    sent_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    failed_at: Optional[datetime] = None

    # Provider info
    provider: Optional[str] = None  # twilio, firebase, sendgrid
    provider_message_id: Optional[str] = None
    error_message: Optional[str] = None
    retry_count: int = 0
    max_retries: int = 3

    def mark_sending(self) -> None:
        """Mark notification as being sent"""
        self.status = NotificationStatus.SENDING
        self.updated_at = utc_now()

    def mark_sent(self, provider_id: Optional[str] = None) -> None:
        """Mark notification as sent"""
        self.status = NotificationStatus.SENT
        self.sent_at = utc_now()
        self.provider_message_id = provider_id
        self.updated_at = utc_now()

    def mark_delivered(self) -> None:
        """Mark notification as delivered"""
        self.status = NotificationStatus.DELIVERED
        self.delivered_at = utc_now()
        self.updated_at = utc_now()

    def mark_failed(self, error: str) -> None:
        """Mark notification as failed"""
        self.status = NotificationStatus.FAILED
        self.failed_at = utc_now()
        self.error_message = error
        self.retry_count += 1
        self.updated_at = utc_now()

    def can_retry(self) -> bool:
        """Check if notification can be retried"""
        return self.retry_count < self.max_retries

    def schedule_retry(self) -> None:
        """Reset for retry"""
        if self.can_retry():
            self.status = NotificationStatus.PENDING
            self.updated_at = utc_now()


class NotificationCreate(BaseModel):
    """Schema for creating a notification"""
    recipient_type: str = "client"
    recipient_id: str
    recipient_contact: str

    type: NotificationType
    category: NotificationCategory = NotificationCategory.CUSTOM
    subject: Optional[str] = None
    message: str

    appointment_id: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    priority: int = Field(default=5, ge=1, le=10)

    model_config = ConfigDict(str_strip_whitespace=True)


class NotificationResponse(BaseModel):
    """Public notification response"""
    notification_id: str
    business_id: str
    recipient_type: str
    recipient_id: str

    type: NotificationType
    category: NotificationCategory
    message: str

    status: NotificationStatus
    scheduled_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None

    error_message: Optional[str] = None
    retry_count: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
