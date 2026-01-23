"""
Distributor Models
For managing equipment and parts distributors
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from app.models.common import generate_id


class Distributor(BaseModel):
    """Distributor record"""
    distributor_id: str = Field(default_factory=lambda: generate_id("dst"))
    business_id: str

    name: str
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    account_number: Optional[str] = None

    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None

    website: Optional[str] = None
    notes: Optional[str] = None

    price_list_updated: Optional[datetime] = None
    price_list_items_count: int = 0

    is_active: bool = True
    is_preferred: bool = False

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    deleted_at: Optional[datetime] = None


class DistributorCreate(BaseModel):
    """Create a new distributor"""
    name: str
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    account_number: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    website: Optional[str] = None
    notes: Optional[str] = None
    is_preferred: bool = False


class DistributorUpdate(BaseModel):
    """Update a distributor"""
    name: Optional[str] = None
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    account_number: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    website: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None
    is_preferred: Optional[bool] = None


class DistributorResponse(BaseModel):
    """Distributor API response"""
    distributor_id: str
    business_id: str
    name: str
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    account_number: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    website: Optional[str] = None
    notes: Optional[str] = None
    price_list_updated: Optional[datetime] = None
    price_list_items_count: int = 0
    is_active: bool
    is_preferred: bool
    created_at: datetime
