"""
Inventory Models
For tracking parts, materials, and equipment inventory
"""

from datetime import datetime
from typing import Optional, List
from enum import Enum
from pydantic import BaseModel, Field
from app.models.common import generate_id


class InventoryCategory(str, Enum):
    """Inventory item categories"""
    PARTS = "parts"
    MATERIALS = "materials"
    REFRIGERANT = "refrigerant"
    EQUIPMENT = "equipment"
    TOOLS = "tools"
    CONSUMABLES = "consumables"
    OTHER = "other"


class TransactionType(str, Enum):
    """Inventory transaction types"""
    ADJUSTMENT = "adjustment"  # Manual adjustment
    USAGE = "usage"  # Used on a job
    RECEIVED = "received"  # Received from PO
    TRANSFER = "transfer"  # Transfer between locations
    RETURN = "return"  # Returned from job
    INITIAL = "initial"  # Initial stock count
    DAMAGED = "damaged"  # Damaged/lost items


class InventoryItem(BaseModel):
    """Inventory item record"""
    item_id: str = Field(default_factory=lambda: generate_id("inv"))
    business_id: str

    name: str
    description: Optional[str] = None
    part_number: Optional[str] = None
    category: InventoryCategory = InventoryCategory.OTHER
    unit: str = "each"  # each, foot, lb, etc.

    # Stock levels
    quantity_on_hand: float = 0
    quantity_reserved: float = 0  # Reserved for scheduled jobs
    quantity_available: float = 0  # on_hand - reserved

    # Reorder settings
    reorder_point: float = 0
    reorder_quantity: float = 0
    max_quantity: Optional[float] = None

    # Cost tracking
    cost_per_unit: float = 0  # Average cost
    last_cost: float = 0  # Most recent purchase cost
    total_value: float = 0  # quantity_on_hand * cost_per_unit

    # Location
    location: str = "Warehouse"  # Warehouse, Truck 1, etc.
    bin_location: Optional[str] = None  # Shelf/bin identifier

    # Supplier info
    preferred_distributor_id: Optional[str] = None
    preferred_part_number: Optional[str] = None

    # Metadata
    brand: Optional[str] = None
    manufacturer: Optional[str] = None
    barcode: Optional[str] = None

    is_active: bool = True
    track_inventory: bool = True

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    deleted_at: Optional[datetime] = None


class InventoryTransaction(BaseModel):
    """Inventory transaction record"""
    transaction_id: str = Field(default_factory=lambda: generate_id("trx"))
    business_id: str
    item_id: str

    transaction_type: TransactionType
    quantity: float  # Positive or negative
    unit_cost: Optional[float] = None

    # References
    job_id: Optional[str] = None
    po_id: Optional[str] = None
    from_location: Optional[str] = None
    to_location: Optional[str] = None

    # Tracking
    quantity_before: float
    quantity_after: float
    notes: Optional[str] = None

    user_id: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class InventoryItemCreate(BaseModel):
    """Create inventory item"""
    name: str
    description: Optional[str] = None
    part_number: Optional[str] = None
    category: InventoryCategory = InventoryCategory.OTHER
    unit: str = "each"

    quantity_on_hand: float = 0
    reorder_point: float = 0
    reorder_quantity: float = 0
    max_quantity: Optional[float] = None

    cost_per_unit: float = 0
    location: str = "Warehouse"
    bin_location: Optional[str] = None

    preferred_distributor_id: Optional[str] = None
    preferred_part_number: Optional[str] = None

    brand: Optional[str] = None
    manufacturer: Optional[str] = None
    barcode: Optional[str] = None

    track_inventory: bool = True


class InventoryItemUpdate(BaseModel):
    """Update inventory item"""
    name: Optional[str] = None
    description: Optional[str] = None
    part_number: Optional[str] = None
    category: Optional[InventoryCategory] = None
    unit: Optional[str] = None

    reorder_point: Optional[float] = None
    reorder_quantity: Optional[float] = None
    max_quantity: Optional[float] = None

    cost_per_unit: Optional[float] = None
    location: Optional[str] = None
    bin_location: Optional[str] = None

    preferred_distributor_id: Optional[str] = None
    preferred_part_number: Optional[str] = None

    brand: Optional[str] = None
    manufacturer: Optional[str] = None
    barcode: Optional[str] = None

    is_active: Optional[bool] = None
    track_inventory: Optional[bool] = None


class StockAdjustment(BaseModel):
    """Stock adjustment request"""
    quantity: float  # Positive to add, negative to remove
    reason: str
    job_id: Optional[str] = None
    notes: Optional[str] = None


class StockTransfer(BaseModel):
    """Stock transfer between locations"""
    quantity: float
    from_location: str
    to_location: str
    notes: Optional[str] = None


class InventoryItemResponse(BaseModel):
    """Inventory item API response"""
    item_id: str
    business_id: str

    name: str
    description: Optional[str] = None
    part_number: Optional[str] = None
    category: str
    unit: str

    quantity_on_hand: float
    quantity_reserved: float
    quantity_available: float

    reorder_point: float
    reorder_quantity: float
    max_quantity: Optional[float] = None

    cost_per_unit: float
    last_cost: float
    total_value: float

    location: str
    bin_location: Optional[str] = None

    preferred_distributor_id: Optional[str] = None
    brand: Optional[str] = None

    is_active: bool
    track_inventory: bool
    is_low_stock: bool = False

    created_at: datetime
    updated_at: datetime


class InventoryAlert(BaseModel):
    """Low stock alert"""
    item_id: str
    name: str
    part_number: Optional[str] = None
    category: str
    location: str

    quantity_on_hand: float
    reorder_point: float
    reorder_quantity: float

    is_out_of_stock: bool
    quantity_to_order: float


class InventoryTransactionResponse(BaseModel):
    """Transaction API response"""
    transaction_id: str
    item_id: str
    item_name: str

    transaction_type: str
    quantity: float
    unit_cost: Optional[float] = None

    job_id: Optional[str] = None
    po_id: Optional[str] = None

    quantity_before: float
    quantity_after: float
    notes: Optional[str] = None

    user_id: str
    user_name: Optional[str] = None
    created_at: datetime
