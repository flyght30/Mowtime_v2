"""
Dispatch Suggestion Model
Persists AI-generated technician suggestions for jobs
"""

from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field

from app.models.common import generate_id, utc_now


class SuggestionStatus(str, Enum):
    """Status of a dispatch suggestion"""
    PENDING = "pending"        # Suggestion generated, awaiting action
    ACCEPTED = "accepted"      # Dispatcher accepted and assigned the tech
    REJECTED = "rejected"      # Dispatcher chose different tech
    EXPIRED = "expired"        # Suggestion expired without action
    AUTO_ASSIGNED = "auto_assigned"  # Auto-assigned via automation


class TechPerformance(BaseModel):
    """Performance metrics for a technician"""
    on_time_rate: Optional[float] = None
    avg_rating: Optional[float] = None
    total_jobs: int = 0


class TrafficConditions(BaseModel):
    """Traffic conditions at suggestion time"""
    level: str  # light, moderate, heavy
    description: str
    multiplier: float
    color: str


class TechSuggestion(BaseModel):
    """Individual technician suggestion"""
    tech_id: str
    tech_name: str
    score: int = Field(ge=0, le=100)
    reasons: list[str] = []
    eta_minutes: Optional[int] = None
    eta_no_traffic: Optional[int] = None
    distance_miles: Optional[float] = None
    status: str
    available_hours: float = 0
    performance: TechPerformance = Field(default_factory=TechPerformance)
    is_preferred: bool = False


class DispatchSuggestion(BaseModel):
    """
    Dispatch Suggestion Model
    Persists AI suggestions for tech assignment
    """
    suggestion_id: str = Field(default_factory=lambda: generate_id("sug"))
    business_id: str
    job_id: str

    # Timing
    target_date: str
    target_time: Optional[str] = None

    # Context
    traffic_conditions: Optional[TrafficConditions] = None
    customer_preferred_tech: Optional[str] = None

    # Recommendations
    top_recommendation: TechSuggestion
    all_suggestions: list[TechSuggestion] = []

    # Outcome tracking
    status: SuggestionStatus = SuggestionStatus.PENDING
    selected_tech_id: Optional[str] = None  # Actual tech assigned (may differ)
    selection_reason: Optional[str] = None  # Why dispatcher chose differently

    # Analytics
    response_time_seconds: Optional[int] = None  # Time from suggestion to action
    was_top_pick_selected: Optional[bool] = None

    # Timestamps
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    actioned_at: Optional[datetime] = None
    actioned_by: Optional[str] = None  # User ID who took action


class DispatchSuggestionCreate(BaseModel):
    """Schema for creating a suggestion (internal use)"""
    job_id: str
    target_date: str
    target_time: Optional[str] = None
    save_to_db: bool = True


class DispatchSuggestionResponse(BaseModel):
    """Response schema for dispatch suggestion"""
    suggestion_id: str
    business_id: str
    job_id: str
    target_date: str
    target_time: Optional[str] = None
    traffic_conditions: Optional[TrafficConditions] = None
    customer_preferred_tech: Optional[str] = None
    top_recommendation: TechSuggestion
    status: SuggestionStatus
    created_at: datetime


class SuggestionActionRequest(BaseModel):
    """Request to accept or reject a suggestion"""
    action: str = Field(..., pattern="^(accept|reject)$")
    selected_tech_id: Optional[str] = None  # Required if rejecting to pick different
    reason: Optional[str] = None  # Optional reason for rejection


class SuggestionStats(BaseModel):
    """Analytics for suggestion accuracy"""
    total_suggestions: int
    accepted: int
    rejected: int
    expired: int
    top_pick_acceptance_rate: float
    avg_response_time_seconds: Optional[float] = None
