"""
Price List Models
For managing distributor price lists and equipment/parts catalog
"""

from datetime import datetime, date
from typing import Optional, List
from enum import Enum
from pydantic import BaseModel, Field
from app.models.common import generate_id


class PriceListCategory(str, Enum):
    """Price list item categories"""
    EQUIPMENT = "equipment"
    PARTS = "parts"
    MATERIALS = "materials"
    REFRIGERANT = "refrigerant"
    TOOLS = "tools"
    OTHER = "other"


class PriceListItem(BaseModel):
    """Price list item from distributor"""
    item_id: str = Field(default_factory=lambda: generate_id("pli"))
    business_id: str
    distributor_id: str

    part_number: str
    description: str
    category: PriceListCategory = PriceListCategory.OTHER

    cost: float  # Dealer cost
    msrp: Optional[float] = None  # Manufacturer suggested retail
    unit: str = "each"  # each, foot, lb, etc.

    brand: Optional[str] = None
    model: Optional[str] = None
    manufacturer: Optional[str] = None

    # Availability
    in_stock: bool = True
    lead_time_days: Optional[int] = None
    min_order_qty: int = 1

    # Pricing dates
    effective_date: Optional[date] = None
    expires_date: Optional[date] = None

    # Metadata
    upc: Optional[str] = None
    weight: Optional[float] = None
    dimensions: Optional[str] = None

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class PriceListItemResponse(BaseModel):
    """Price list item API response"""
    item_id: str
    distributor_id: str
    distributor_name: Optional[str] = None

    part_number: str
    description: str
    category: str

    cost: float
    msrp: Optional[float] = None
    unit: str

    brand: Optional[str] = None
    model: Optional[str] = None
    manufacturer: Optional[str] = None

    in_stock: bool
    lead_time_days: Optional[int] = None

    effective_date: Optional[date] = None


class PriceListUploadResult(BaseModel):
    """Result of price list CSV upload"""
    items_imported: int
    items_updated: int
    items_skipped: int
    errors: List[str] = []
    warnings: List[str] = []


class PriceListSearchResult(BaseModel):
    """Search result with distributor info"""
    item_id: str
    distributor_id: str
    distributor_name: str

    part_number: str
    description: str
    category: str

    cost: float
    msrp: Optional[float] = None
    unit: str

    brand: Optional[str] = None
    model: Optional[str] = None

    in_stock: bool
    lead_time_days: Optional[int] = None
