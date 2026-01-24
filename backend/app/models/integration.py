"""
Integration Models
For managing third-party service integrations
"""

from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
from enum import Enum
from app.models.common import generate_id


class IntegrationProvider(str, Enum):
    """Supported integration providers"""
    HOUSECALL_PRO = "housecall_pro"
    QUICKBOOKS = "quickbooks"
    GOOGLE_CALENDAR = "google_calendar"
    ZAPIER = "zapier"
    WEBHOOK = "webhook"


class SyncDirection(str, Enum):
    """Sync direction for mappings"""
    PUSH = "push"
    PULL = "pull"
    BIDIRECTIONAL = "bidirectional"


class SyncEntityType(str, Enum):
    """Types of entities that can be synced"""
    CUSTOMER = "customer"
    JOB = "job"
    INVOICE = "invoice"
    APPOINTMENT = "appointment"
    PAYMENT = "payment"
    ITEM = "item"  # Service items for QuickBooks


class IntegrationCredentials(BaseModel):
    """OAuth credentials for integration"""
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    expires_at: Optional[datetime] = None
    account_id: Optional[str] = None
    realm_id: Optional[str] = None  # QuickBooks specific


class IntegrationSettings(BaseModel):
    """Provider-specific integration settings"""
    # General
    auto_sync_enabled: bool = True
    sync_interval_minutes: int = 60

    # Customer sync
    sync_customers: bool = True
    customer_sync_direction: SyncDirection = SyncDirection.BIDIRECTIONAL

    # Job sync
    sync_jobs: bool = True
    push_jobs_on_schedule: bool = True
    sync_job_status: bool = True
    pull_jobs_from_remote: bool = False

    # Invoice sync (QuickBooks)
    auto_create_invoice: bool = False
    default_income_account: Optional[str] = None

    # Items/Services sync (QuickBooks)
    sync_items: bool = True
    item_sync_direction: SyncDirection = SyncDirection.PUSH

    # Field mappings
    job_type_mapping: Dict[str, str] = Field(default_factory=dict)
    status_mapping: Dict[str, str] = Field(default_factory=dict)


class SyncStatus(BaseModel):
    """Current sync status"""
    last_sync: Optional[datetime] = None
    last_error: Optional[str] = None
    items_synced: int = 0
    in_progress: bool = False
    current_operation: Optional[str] = None


class Integration(BaseModel):
    """Integration configuration"""
    integration_id: str = Field(default_factory=lambda: generate_id("int"))
    business_id: str
    provider: IntegrationProvider

    is_active: bool = False
    connected_at: Optional[datetime] = None

    credentials: IntegrationCredentials = Field(default_factory=IntegrationCredentials)
    settings: IntegrationSettings = Field(default_factory=IntegrationSettings)
    sync_status: SyncStatus = Field(default_factory=SyncStatus)

    # Provider-specific metadata
    remote_account_name: Optional[str] = None
    remote_account_email: Optional[str] = None

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class SyncMapping(BaseModel):
    """Mapping between local and remote entities"""
    mapping_id: str = Field(default_factory=lambda: generate_id("map"))
    business_id: str
    integration_id: str

    local_type: SyncEntityType
    local_id: str
    remote_id: str
    remote_url: Optional[str] = None

    sync_direction: SyncDirection = SyncDirection.BIDIRECTIONAL
    last_synced: Optional[datetime] = None
    last_hash: Optional[str] = None  # For change detection

    created_at: datetime = Field(default_factory=datetime.utcnow)


# API Request/Response Models

class IntegrationCreate(BaseModel):
    """Create integration configuration"""
    provider: IntegrationProvider
    settings: Optional[IntegrationSettings] = None


class IntegrationUpdate(BaseModel):
    """Update integration settings"""
    settings: Optional[IntegrationSettings] = None
    is_active: Optional[bool] = None


class IntegrationResponse(BaseModel):
    """Integration API response"""
    integration_id: str
    business_id: str
    provider: IntegrationProvider
    is_active: bool
    connected_at: Optional[datetime] = None
    settings: IntegrationSettings
    sync_status: SyncStatus
    remote_account_name: Optional[str] = None
    remote_account_email: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class IntegrationSummary(BaseModel):
    """Integration summary for list view"""
    integration_id: str
    provider: IntegrationProvider
    is_active: bool
    connected_at: Optional[datetime] = None
    remote_account_name: Optional[str] = None
    sync_status: SyncStatus


class OAuthInitResponse(BaseModel):
    """OAuth initialization response"""
    auth_url: str
    state: str


class SyncTriggerResponse(BaseModel):
    """Response when triggering a sync"""
    sync_started: bool
    job_id: Optional[str] = None
    message: Optional[str] = None


class SyncMappingResponse(BaseModel):
    """Sync mapping API response"""
    mapping_id: str
    local_type: SyncEntityType
    local_id: str
    remote_id: str
    remote_url: Optional[str] = None
    sync_direction: SyncDirection
    last_synced: Optional[datetime] = None


class CustomerMatchResult(BaseModel):
    """Result of customer matching operation"""
    unmatched_local: int
    unmatched_remote: int
    matched: int
    suggestions: List[Dict[str, Any]] = Field(default_factory=list)


class JobPushResult(BaseModel):
    """Result of pushing a job to remote system"""
    success: bool
    remote_job_id: Optional[str] = None
    remote_url: Optional[str] = None
    error: Optional[str] = None


class InvoiceCreateResult(BaseModel):
    """Result of creating invoice in QuickBooks"""
    success: bool
    qb_invoice_id: Optional[str] = None
    invoice_number: Optional[str] = None
    error: Optional[str] = None
