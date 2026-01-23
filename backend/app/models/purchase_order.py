"""
Purchase Order Models
For managing equipment and parts procurement
"""

from datetime import datetime
from typing import Optional, List
from enum import Enum
from pydantic import BaseModel, Field
from app.models.common import generate_id


class POStatus(str, Enum):
    """Purchase order status"""
    DRAFT = "draft"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    SENT = "sent"
    PARTIAL = "partial"  # Partially received
    RECEIVED = "received"
    CANCELLED = "cancelled"


class POLineItem(BaseModel):
    """Purchase order line item"""
    line_id: str = Field(default_factory=lambda: generate_id("pol"))
    part_number: str
    description: str
    quantity_ordered: float
    quantity_received: float = 0
    unit: str = "each"
    unit_cost: float
    total: float

    # Optional references
    price_list_item_id: Optional[str] = None
    inventory_item_id: Optional[str] = None

    notes: Optional[str] = None


class PurchaseOrder(BaseModel):
    """Purchase order record"""
    po_id: str = Field(default_factory=lambda: generate_id("po"))
    business_id: str
    distributor_id: str

    po_number: str  # Human readable: PO-2025-0001
    status: POStatus = POStatus.DRAFT

    # Optional job reference
    job_id: Optional[str] = None
    job_address: Optional[str] = None

    # Line items
    items: List[POLineItem] = []

    # Totals
    subtotal: float = 0
    tax_rate: float = 0
    tax: float = 0
    shipping: float = 0
    total: float = 0

    # Shipping info
    ship_to_address: Optional[str] = None
    ship_to_name: Optional[str] = None
    ship_to_phone: Optional[str] = None
    delivery_instructions: Optional[str] = None

    # Notes
    notes: Optional[str] = None
    internal_notes: Optional[str] = None

    # Dates
    expected_delivery: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    received_at: Optional[datetime] = None

    # Approval
    requires_approval: bool = False
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None

    # Tracking
    created_by: str
    updated_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    deleted_at: Optional[datetime] = None


class POLineItemCreate(BaseModel):
    """Create PO line item"""
    part_number: str
    description: str
    quantity_ordered: float
    unit: str = "each"
    unit_cost: float
    price_list_item_id: Optional[str] = None
    inventory_item_id: Optional[str] = None
    notes: Optional[str] = None


class POCreate(BaseModel):
    """Create purchase order"""
    distributor_id: str
    job_id: Optional[str] = None
    items: List[POLineItemCreate] = []

    tax_rate: float = 0
    shipping: float = 0

    ship_to_address: Optional[str] = None
    ship_to_name: Optional[str] = None
    ship_to_phone: Optional[str] = None
    delivery_instructions: Optional[str] = None

    notes: Optional[str] = None
    internal_notes: Optional[str] = None
    expected_delivery: Optional[datetime] = None
    requires_approval: bool = False


class POUpdate(BaseModel):
    """Update purchase order"""
    distributor_id: Optional[str] = None
    job_id: Optional[str] = None
    items: Optional[List[POLineItemCreate]] = None

    tax_rate: Optional[float] = None
    shipping: Optional[float] = None

    ship_to_address: Optional[str] = None
    ship_to_name: Optional[str] = None
    ship_to_phone: Optional[str] = None
    delivery_instructions: Optional[str] = None

    notes: Optional[str] = None
    internal_notes: Optional[str] = None
    expected_delivery: Optional[datetime] = None


class POReceiveItem(BaseModel):
    """Item being received"""
    line_id: str
    quantity_received: float
    notes: Optional[str] = None


class POReceive(BaseModel):
    """Receive items on a PO"""
    items: List[POReceiveItem]
    notes: Optional[str] = None
    update_inventory: bool = True


class POLineItemResponse(BaseModel):
    """PO line item API response"""
    line_id: str
    part_number: str
    description: str
    quantity_ordered: float
    quantity_received: float
    quantity_remaining: float
    unit: str
    unit_cost: float
    total: float
    inventory_item_id: Optional[str] = None
    notes: Optional[str] = None


class POResponse(BaseModel):
    """Purchase order API response"""
    po_id: str
    business_id: str
    distributor_id: str
    distributor_name: Optional[str] = None

    po_number: str
    status: str

    job_id: Optional[str] = None
    job_address: Optional[str] = None

    items: List[POLineItemResponse]

    subtotal: float
    tax_rate: float
    tax: float
    shipping: float
    total: float

    ship_to_address: Optional[str] = None
    ship_to_name: Optional[str] = None
    ship_to_phone: Optional[str] = None
    delivery_instructions: Optional[str] = None

    notes: Optional[str] = None
    expected_delivery: Optional[datetime] = None

    sent_at: Optional[datetime] = None
    received_at: Optional[datetime] = None

    requires_approval: bool
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None

    created_by: str
    created_at: datetime
    updated_at: datetime


class POSummary(BaseModel):
    """PO summary for lists"""
    po_id: str
    po_number: str
    status: str
    distributor_name: str
    total: float
    items_count: int
    job_id: Optional[str] = None
    expected_delivery: Optional[datetime] = None
    created_at: datetime
