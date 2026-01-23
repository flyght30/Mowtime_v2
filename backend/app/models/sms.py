"""
SMS Model
SMS messages and templates for automated notifications
"""

from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict

from app.models.common import BaseDocument, generate_id, utc_now


class SMSDirection(str, Enum):
    """SMS message direction"""
    OUTBOUND = "outbound"
    INBOUND = "inbound"


class SMSTriggerType(str, Enum):
    """What triggered the SMS"""
    SCHEDULED = "scheduled"      # Job scheduled
    REMINDER = "reminder"        # Day-before reminder
    ENROUTE = "enroute"          # Tech on the way
    FIFTEEN_MIN = "15_min"       # 15 minutes away
    ARRIVED = "arrived"          # Tech arrived
    COMPLETE = "complete"        # Job complete
    MANUAL = "manual"            # Manually sent
    REPLY = "reply"              # Customer reply


class SMSStatus(str, Enum):
    """SMS delivery status"""
    QUEUED = "queued"
    SENT = "sent"
    DELIVERED = "delivered"
    FAILED = "failed"
    RECEIVED = "received"        # For inbound


class SMSMessage(BaseDocument):
    """SMS message record"""
    message_id: str = Field(default_factory=lambda: generate_id("sms"))
    business_id: str  # Multi-tenant key

    # Related entities
    job_id: Optional[str] = None
    customer_id: str
    tech_id: Optional[str] = None

    # Message details
    direction: SMSDirection
    to_phone: str
    from_phone: str
    body: str

    trigger_type: SMSTriggerType
    template_id: Optional[str] = None

    # Status
    status: SMSStatus = SMSStatus.QUEUED
    twilio_sid: Optional[str] = None
    error_message: Optional[str] = None

    # Timestamps
    sent_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None


class SMSTemplate(BaseDocument):
    """SMS template for automated messages"""
    template_id: str = Field(default_factory=lambda: generate_id("tpl"))
    business_id: str  # Multi-tenant key

    trigger_type: SMSTriggerType
    name: str
    body: str  # With {{variables}}

    is_active: bool = True
    is_default: bool = False


class SMSSettings(BaseModel):
    """SMS settings for a business (stored in business.config)"""
    enabled: bool = False
    twilio_phone: Optional[str] = None

    # Auto-send toggles
    auto_scheduled: bool = True
    auto_reminder: bool = True
    auto_enroute: bool = True
    auto_15_min: bool = True
    auto_arrived: bool = False
    auto_complete: bool = True

    # Settings
    reminder_time: str = "18:00"  # 6 PM day before
    opt_out_message: str = "You have been unsubscribed. Reply START to resubscribe."


# ============== Request/Response Schemas ==============

class SMSMessageCreate(BaseModel):
    """Schema for sending a manual SMS"""
    customer_id: str
    job_id: Optional[str] = None
    body: str

    model_config = ConfigDict(str_strip_whitespace=True)


class SMSMessageResponse(BaseModel):
    """Public SMS message response"""
    message_id: str
    business_id: str
    job_id: Optional[str] = None
    customer_id: str
    tech_id: Optional[str] = None

    direction: SMSDirection
    to_phone: str
    from_phone: str
    body: str

    trigger_type: SMSTriggerType
    status: SMSStatus
    twilio_sid: Optional[str] = None
    error_message: Optional[str] = None

    sent_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SMSTemplateCreate(BaseModel):
    """Schema for creating SMS template"""
    trigger_type: SMSTriggerType
    name: str = Field(min_length=1, max_length=100)
    body: str = Field(min_length=1, max_length=1600)
    is_active: bool = True


class SMSTemplateUpdate(BaseModel):
    """Schema for updating SMS template"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    body: Optional[str] = Field(None, min_length=1, max_length=1600)
    is_active: Optional[bool] = None


class SMSTemplateResponse(BaseModel):
    """Public SMS template response"""
    template_id: str
    business_id: str
    trigger_type: SMSTriggerType
    name: str
    body: str
    is_active: bool
    is_default: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SMSSettingsUpdate(BaseModel):
    """Schema for updating SMS settings"""
    enabled: Optional[bool] = None
    auto_scheduled: Optional[bool] = None
    auto_reminder: Optional[bool] = None
    auto_enroute: Optional[bool] = None
    auto_15_min: Optional[bool] = None
    auto_arrived: Optional[bool] = None
    auto_complete: Optional[bool] = None
    reminder_time: Optional[str] = None


class SMSPreviewRequest(BaseModel):
    """Request to preview template with data"""
    job_id: Optional[str] = None
    customer_id: Optional[str] = None


class SMSPreviewResponse(BaseModel):
    """Rendered template preview"""
    preview: str
    character_count: int
    segment_count: int  # SMS segments (160 chars each)


# ============== Default Templates ==============

DEFAULT_TEMPLATES = [
    {
        "trigger_type": SMSTriggerType.SCHEDULED,
        "name": "Job Scheduled",
        "body": "Hi {{customer_first_name}}, your {{job_type}} with {{company_name}} is scheduled for {{scheduled_date}} at {{scheduled_time}}. Reply STOP to opt out.",
        "is_default": True,
    },
    {
        "trigger_type": SMSTriggerType.REMINDER,
        "name": "Day Before Reminder",
        "body": "Reminder: {{company_name}} is scheduled to arrive tomorrow {{scheduled_date}} between {{scheduled_time}}. See you then!",
        "is_default": True,
    },
    {
        "trigger_type": SMSTriggerType.ENROUTE,
        "name": "Tech Enroute",
        "body": "Your technician {{tech_first_name}} is on the way! Estimated arrival: {{eta_time}}.",
        "is_default": True,
    },
    {
        "trigger_type": SMSTriggerType.FIFTEEN_MIN,
        "name": "15 Minutes Away",
        "body": "{{tech_first_name}} from {{company_name}} will arrive in about 15 minutes.",
        "is_default": True,
    },
    {
        "trigger_type": SMSTriggerType.ARRIVED,
        "name": "Tech Arrived",
        "body": "{{tech_first_name}} has arrived at your location. Thank you for choosing {{company_name}}!",
        "is_default": True,
    },
    {
        "trigger_type": SMSTriggerType.COMPLETE,
        "name": "Job Complete",
        "body": "Your service is complete! Invoice: {{invoice_link}}. Questions? Reply to this message or call {{company_phone}}.",
        "is_default": True,
    },
]
