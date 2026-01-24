"""
Webhook Models
For managing webhook subscriptions and event delivery
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, HttpUrl
from enum import Enum
import secrets
from app.models.common import generate_id


class WebhookEvent(str, Enum):
    """Available webhook events"""
    # Job events
    JOB_CREATED = "job.created"
    JOB_UPDATED = "job.updated"
    JOB_STATUS_CHANGED = "job.status_changed"
    JOB_COMPLETED = "job.completed"
    JOB_CANCELLED = "job.cancelled"

    # Customer events
    CUSTOMER_CREATED = "customer.created"
    CUSTOMER_UPDATED = "customer.updated"

    # Appointment events
    APPOINTMENT_SCHEDULED = "appointment.scheduled"
    APPOINTMENT_RESCHEDULED = "appointment.rescheduled"
    APPOINTMENT_CANCELLED = "appointment.cancelled"
    APPOINTMENT_COMPLETED = "appointment.completed"

    # Invoice events
    INVOICE_CREATED = "invoice.created"
    INVOICE_SENT = "invoice.sent"
    INVOICE_PAID = "invoice.paid"

    # Payment events
    PAYMENT_RECEIVED = "payment.received"
    PAYMENT_FAILED = "payment.failed"

    # Estimate events
    ESTIMATE_CREATED = "estimate.created"
    ESTIMATE_SENT = "estimate.sent"
    ESTIMATE_ACCEPTED = "estimate.accepted"
    ESTIMATE_DECLINED = "estimate.declined"


class DeliveryStatus(str, Enum):
    """Webhook delivery status"""
    PENDING = "pending"
    SUCCESS = "success"
    FAILED = "failed"
    RETRYING = "retrying"


def generate_webhook_secret() -> str:
    """Generate a secure webhook signing secret"""
    return f"whsec_{secrets.token_urlsafe(32)}"


class WebhookSubscription(BaseModel):
    """Webhook subscription configuration"""
    subscription_id: str = Field(default_factory=lambda: generate_id("whk"))
    business_id: str

    name: Optional[str] = None  # User-friendly name
    url: str
    events: List[WebhookEvent]
    secret: str = Field(default_factory=generate_webhook_secret)

    is_active: bool = True
    last_triggered: Optional[datetime] = None
    failure_count: int = 0
    consecutive_failures: int = 0

    # Auto-disable after too many failures
    auto_disabled: bool = False
    auto_disabled_at: Optional[datetime] = None

    headers: Dict[str, str] = Field(default_factory=dict)  # Custom headers

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class WebhookLog(BaseModel):
    """Log of webhook delivery attempts"""
    log_id: str = Field(default_factory=lambda: generate_id("whl"))
    subscription_id: str
    business_id: str

    event: WebhookEvent
    payload: Dict[str, Any]

    status: DeliveryStatus = DeliveryStatus.PENDING
    attempt_count: int = 1

    response_status: Optional[int] = None
    response_body: Optional[str] = None
    response_time_ms: Optional[int] = None

    error: Optional[str] = None

    created_at: datetime = Field(default_factory=datetime.utcnow)
    delivered_at: Optional[datetime] = None


class WebhookPayload(BaseModel):
    """Standard webhook payload structure"""
    id: str  # Unique event ID
    event: WebhookEvent
    created_at: datetime
    business_id: str
    data: Dict[str, Any]

    # For idempotency
    idempotency_key: Optional[str] = None


# API Request/Response Models

class WebhookCreate(BaseModel):
    """Create webhook subscription"""
    name: Optional[str] = None
    url: str
    events: List[WebhookEvent]
    headers: Optional[Dict[str, str]] = None


class WebhookUpdate(BaseModel):
    """Update webhook subscription"""
    name: Optional[str] = None
    url: Optional[str] = None
    events: Optional[List[WebhookEvent]] = None
    is_active: Optional[bool] = None
    headers: Optional[Dict[str, str]] = None


class WebhookResponse(BaseModel):
    """Webhook subscription API response"""
    subscription_id: str
    business_id: str
    name: Optional[str] = None
    url: str
    events: List[WebhookEvent]
    secret: str
    is_active: bool
    last_triggered: Optional[datetime] = None
    failure_count: int
    consecutive_failures: int
    auto_disabled: bool
    created_at: datetime
    updated_at: datetime


class WebhookLogResponse(BaseModel):
    """Webhook log API response"""
    log_id: str
    event: WebhookEvent
    status: DeliveryStatus
    attempt_count: int
    response_status: Optional[int] = None
    response_time_ms: Optional[int] = None
    error: Optional[str] = None
    created_at: datetime
    delivered_at: Optional[datetime] = None


class WebhookTestResult(BaseModel):
    """Result of testing a webhook"""
    delivered: bool
    response_status: Optional[int] = None
    response_body: Optional[str] = None
    response_time_ms: Optional[int] = None
    error: Optional[str] = None


class WebhookStats(BaseModel):
    """Webhook delivery statistics"""
    total_deliveries: int
    successful: int
    failed: int
    success_rate: float
    avg_response_time_ms: Optional[float] = None


# Inbound webhook models (for receiving webhooks from other services)

class InboundWebhookConfig(BaseModel):
    """Configuration for receiving webhooks"""
    config_id: str = Field(default_factory=lambda: generate_id("iwh"))
    business_id: str

    provider: str  # e.g., "stripe", "twilio"
    endpoint_path: str  # Unique path for this webhook
    secret: str = Field(default_factory=generate_webhook_secret)

    is_active: bool = True

    created_at: datetime = Field(default_factory=datetime.utcnow)


class InboundWebhookLog(BaseModel):
    """Log of received webhooks"""
    log_id: str = Field(default_factory=lambda: generate_id("iwl"))
    config_id: str
    business_id: str

    provider: str
    event_type: Optional[str] = None
    payload: Dict[str, Any]

    signature_valid: bool
    processed: bool = False
    error: Optional[str] = None

    created_at: datetime = Field(default_factory=datetime.utcnow)
