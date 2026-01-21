"""
Call Model
Phone call tracking and AI voice receptionist data
"""

from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict

from app.models.common import BaseDocument, generate_id, utc_now


class CallDirection(str, Enum):
    """Call direction"""
    INBOUND = "inbound"
    OUTBOUND = "outbound"


class CallStatus(str, Enum):
    """Call status"""
    RINGING = "ringing"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    BUSY = "busy"
    NO_ANSWER = "no_answer"
    CANCELED = "canceled"
    VOICEMAIL = "voicemail"


class CallIntent(str, Enum):
    """Detected caller intent"""
    BOOKING = "booking"
    RESCHEDULE = "reschedule"
    CANCEL = "cancel"
    INQUIRY = "inquiry"
    SUPPORT = "support"
    COMPLAINT = "complaint"
    OTHER = "other"
    UNKNOWN = "unknown"


class Call(BaseDocument):
    """Call document model"""
    call_id: str = Field(default_factory=lambda: generate_id("call"))
    business_id: str  # Multi-tenant key

    # Twilio identifiers
    twilio_call_sid: Optional[str] = None
    twilio_account_sid: Optional[str] = None

    # Call metadata
    direction: CallDirection
    status: CallStatus = CallStatus.RINGING

    # Participants
    from_number: str
    to_number: str
    caller_name: Optional[str] = None  # Caller ID name if available

    # Related entities
    client_id: Optional[str] = None  # Matched client
    appointment_id: Optional[str] = None  # If call results in booking
    staff_id: Optional[str] = None  # If transferred to staff

    # AI Conversation
    ai_handled: bool = True  # Whether AI receptionist handled the call
    intent: CallIntent = CallIntent.UNKNOWN
    conversation_summary: Optional[str] = None
    sentiment: Optional[str] = None  # positive, neutral, negative

    # Timing
    started_at: Optional[datetime] = None
    answered_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    duration_seconds: int = 0

    # Recording
    recording_url: Optional[str] = None
    recording_duration_seconds: int = 0
    transcription: Optional[str] = None

    # Voice synthesis
    voice_id: Optional[str] = None  # ElevenLabs voice ID used
    tts_characters_used: int = 0

    # Outcomes
    transferred_to_human: bool = False
    voicemail_left: bool = False
    callback_requested: bool = False
    callback_number: Optional[str] = None

    # Error tracking
    error_message: Optional[str] = None

    def start_call(self) -> None:
        """Mark call as started"""
        self.status = CallStatus.IN_PROGRESS
        self.started_at = utc_now()
        self.answered_at = utc_now()
        self.updated_at = utc_now()

    def end_call(self, status: CallStatus = CallStatus.COMPLETED) -> None:
        """Mark call as ended"""
        self.status = status
        self.ended_at = utc_now()
        if self.started_at:
            self.duration_seconds = int(
                (self.ended_at - self.started_at).total_seconds()
            )
        self.updated_at = utc_now()

    def set_intent(self, intent: CallIntent, summary: Optional[str] = None) -> None:
        """Set detected intent"""
        self.intent = intent
        self.conversation_summary = summary
        self.updated_at = utc_now()


class ConversationTurn(BaseModel):
    """A single turn in the conversation"""
    role: str  # "ai", "caller", "system"
    content: str
    timestamp: datetime = Field(default_factory=utc_now)
    audio_url: Optional[str] = None  # ElevenLabs generated audio URL
    intent_detected: Optional[CallIntent] = None


class CallConversation(BaseDocument):
    """Full conversation history for a call"""
    conversation_id: str = Field(default_factory=lambda: generate_id("conv"))
    call_id: str
    business_id: str

    turns: list[ConversationTurn] = []
    entities_extracted: dict = {}  # name, date, service, etc.

    def add_turn(
        self,
        role: str,
        content: str,
        audio_url: Optional[str] = None,
        intent: Optional[CallIntent] = None
    ) -> None:
        """Add a conversation turn"""
        self.turns.append(ConversationTurn(
            role=role,
            content=content,
            audio_url=audio_url,
            intent_detected=intent
        ))
        self.updated_at = utc_now()


class VoicemailMessage(BaseDocument):
    """Voicemail message model"""
    voicemail_id: str = Field(default_factory=lambda: generate_id("vm"))
    business_id: str
    call_id: str

    # Caller info
    from_number: str
    caller_name: Optional[str] = None
    client_id: Optional[str] = None

    # Message
    recording_url: str
    duration_seconds: int
    transcription: Optional[str] = None

    # Status
    is_read: bool = False
    read_at: Optional[datetime] = None
    read_by: Optional[str] = None  # User ID who read it

    # Follow-up
    callback_completed: bool = False
    callback_at: Optional[datetime] = None
    callback_by: Optional[str] = None
    notes: Optional[str] = None

    def mark_read(self, user_id: str) -> None:
        """Mark voicemail as read"""
        self.is_read = True
        self.read_at = utc_now()
        self.read_by = user_id
        self.updated_at = utc_now()


class CallCreate(BaseModel):
    """Schema for creating a call record"""
    direction: CallDirection
    from_number: str
    to_number: str
    twilio_call_sid: Optional[str] = None

    model_config = ConfigDict(str_strip_whitespace=True)


class CallResponse(BaseModel):
    """Public call response"""
    call_id: str
    business_id: str
    direction: CallDirection
    status: CallStatus
    from_number: str
    to_number: str
    caller_name: Optional[str] = None
    client_id: Optional[str] = None

    ai_handled: bool
    intent: CallIntent
    conversation_summary: Optional[str] = None

    duration_seconds: int
    recording_url: Optional[str] = None
    transcription: Optional[str] = None

    transferred_to_human: bool
    voicemail_left: bool

    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class VoicemailResponse(BaseModel):
    """Public voicemail response"""
    voicemail_id: str
    business_id: str
    call_id: str
    from_number: str
    caller_name: Optional[str] = None
    client_id: Optional[str] = None
    recording_url: str
    duration_seconds: int
    transcription: Optional[str] = None
    is_read: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
