"""
Voice Note Model
Technician voice recordings with AI transcription and summarization
"""

from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict

from app.models.common import BaseDocument, generate_id, utc_now


class VoiceNoteStatus(str, Enum):
    """Voice note processing status"""
    UPLOADED = "uploaded"
    TRANSCRIBING = "transcribing"
    SUMMARIZING = "summarizing"
    COMPLETE = "complete"
    FAILED = "failed"


class VoiceNote(BaseDocument):
    """Voice note document model"""
    voice_note_id: str = Field(default_factory=lambda: generate_id("vnote"))
    business_id: str

    # Related entities
    job_id: str
    tech_id: str
    appointment_id: Optional[str] = None

    # Audio file
    audio_url: str
    audio_filename: str
    duration_seconds: int = 0
    file_size_bytes: int = 0
    mime_type: str = "audio/m4a"

    # Processing status
    status: VoiceNoteStatus = VoiceNoteStatus.UPLOADED
    error_message: Optional[str] = None

    # Transcription (Whisper)
    transcription: Optional[str] = None
    transcription_confidence: Optional[float] = None
    transcribed_at: Optional[datetime] = None

    # Summary (Claude)
    summary: Optional[str] = None
    summarized_at: Optional[datetime] = None

    # User review
    summary_approved: bool = False
    summary_edited: Optional[str] = None  # User's edited version
    approved_at: Optional[datetime] = None
    approved_by: Optional[str] = None

    # Usage tracking
    whisper_tokens_used: int = 0
    claude_tokens_used: int = 0

    def start_transcription(self) -> None:
        """Mark transcription as started"""
        self.status = VoiceNoteStatus.TRANSCRIBING
        self.updated_at = utc_now()

    def complete_transcription(self, text: str, confidence: float = 0.0) -> None:
        """Mark transcription as complete"""
        self.transcription = text
        self.transcription_confidence = confidence
        self.transcribed_at = utc_now()
        self.status = VoiceNoteStatus.SUMMARIZING
        self.updated_at = utc_now()

    def complete_summary(self, summary: str) -> None:
        """Mark summarization as complete"""
        self.summary = summary
        self.summarized_at = utc_now()
        self.status = VoiceNoteStatus.COMPLETE
        self.updated_at = utc_now()

    def mark_failed(self, error: str) -> None:
        """Mark processing as failed"""
        self.status = VoiceNoteStatus.FAILED
        self.error_message = error
        self.updated_at = utc_now()

    def approve_summary(self, user_id: str, edited_text: Optional[str] = None) -> None:
        """Approve or edit the summary"""
        self.summary_approved = True
        self.approved_at = utc_now()
        self.approved_by = user_id
        if edited_text:
            self.summary_edited = edited_text
        self.updated_at = utc_now()

    def get_final_summary(self) -> Optional[str]:
        """Get the final summary (edited if available, otherwise original)"""
        return self.summary_edited or self.summary


class VoiceNoteCreate(BaseModel):
    """Schema for creating a voice note"""
    job_id: str
    appointment_id: Optional[str] = None
    duration_seconds: int = 0

    model_config = ConfigDict(str_strip_whitespace=True)


class VoiceNoteUpdate(BaseModel):
    """Schema for updating a voice note"""
    summary_edited: Optional[str] = None

    model_config = ConfigDict(str_strip_whitespace=True)


class VoiceNoteResponse(BaseModel):
    """Public voice note response"""
    voice_note_id: str
    business_id: str
    job_id: str
    tech_id: str
    appointment_id: Optional[str] = None

    audio_url: str
    duration_seconds: int

    status: VoiceNoteStatus
    error_message: Optional[str] = None

    transcription: Optional[str] = None
    summary: Optional[str] = None
    summary_edited: Optional[str] = None
    summary_approved: bool

    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @property
    def final_summary(self) -> Optional[str]:
        """Get final summary for display"""
        return self.summary_edited or self.summary
