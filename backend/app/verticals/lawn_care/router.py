"""
Lawn Care Vertical API Router

Endpoints specific to lawn care services.
"""

from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field

from app.middleware.auth import get_current_user, get_current_business
from app.database import Database
from app.models.user import User
from app.models.business import Business

router = APIRouter()


# ============== Models ==============

class LawnProperty(BaseModel):
    """Property-specific lawn information"""
    property_id: Optional[str] = None
    client_id: str
    business_id: str
    address: str

    # Lawn specifics
    lot_size_sqft: int = Field(ge=0, description="Total lot size in square feet")
    lawn_size_sqft: int = Field(ge=0, description="Actual lawn area in square feet")
    grass_type: str = "unknown"
    irrigation_type: Optional[str] = None  # sprinkler, drip, manual, none
    sun_exposure: str = "mixed"  # full_sun, partial_shade, full_shade, mixed
    slope: str = "flat"  # flat, gentle, moderate, steep

    # Access
    gate_code: Optional[str] = None
    dog_in_yard: bool = False
    special_instructions: Optional[str] = None

    # Obstacles
    obstacles: List[str] = Field(default_factory=list)  # trees, beds, pool, etc.

    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class LawnPropertyCreate(BaseModel):
    """Create lawn property"""
    client_id: str
    address: str
    lot_size_sqft: int = Field(ge=0)
    lawn_size_sqft: int = Field(ge=0)
    grass_type: str = "unknown"
    irrigation_type: Optional[str] = None
    sun_exposure: str = "mixed"
    slope: str = "flat"
    gate_code: Optional[str] = None
    dog_in_yard: bool = False
    special_instructions: Optional[str] = None
    obstacles: List[str] = Field(default_factory=list)


class TreatmentRecord(BaseModel):
    """Treatment application record"""
    treatment_id: Optional[str] = None
    property_id: str
    business_id: str
    appointment_id: Optional[str] = None

    treatment_type: str  # fertilization, weed_control, aeration, etc.
    treatment_date: str
    products_used: List[dict] = Field(default_factory=list)
    coverage_sqft: int = 0
    weather_conditions: Optional[dict] = None
    notes: Optional[str] = None
    applied_by: Optional[str] = None  # Staff ID

    created_at: Optional[str] = None


class TreatmentCreate(BaseModel):
    """Create treatment record"""
    property_id: str
    appointment_id: Optional[str] = None
    treatment_type: str
    treatment_date: str
    products_used: List[dict] = Field(default_factory=list)
    coverage_sqft: int = 0
    weather_conditions: Optional[dict] = None
    notes: Optional[str] = None


class PriceEstimate(BaseModel):
    """Lawn service price estimate"""
    service_type: str
    lawn_size_sqft: int
    base_price: float
    size_adjustment: float
    difficulty_adjustment: float
    total_price: float
    notes: List[str] = Field(default_factory=list)


# ============== Property Endpoints ==============

@router.post("/properties", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_lawn_property(
    data: LawnPropertyCreate,
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """Create a lawn property record for a client."""
    from app.models.common import generate_id

    now = datetime.utcnow().isoformat()
    property_data = {
        "property_id": generate_id("lprop"),
        "business_id": business.business_id,
        **data.model_dump(),
        "created_at": now,
        "updated_at": now,
    }

    await Database.db.lawn_properties.insert_one(property_data)

    return {"success": True, "property": property_data}


@router.get("/properties", response_model=dict)
async def list_lawn_properties(
    client_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """List lawn properties for a business."""
    query = {"business_id": business.business_id}
    if client_id:
        query["client_id"] = client_id

    properties = await Database.db.lawn_properties.find(query).to_list(100)

    return {"success": True, "properties": properties}


@router.get("/properties/{property_id}", response_model=dict)
async def get_lawn_property(
    property_id: str,
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """Get a specific lawn property."""
    property_data = await Database.db.lawn_properties.find_one({
        "property_id": property_id,
        "business_id": business.business_id
    })

    if not property_data:
        raise HTTPException(status_code=404, detail="Property not found")

    return {"success": True, "property": property_data}


@router.put("/properties/{property_id}", response_model=dict)
async def update_lawn_property(
    property_id: str,
    data: LawnPropertyCreate,
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """Update a lawn property."""
    update_data = {
        **data.model_dump(),
        "updated_at": datetime.utcnow().isoformat()
    }

    result = await Database.db.lawn_properties.update_one(
        {"property_id": property_id, "business_id": business.business_id},
        {"$set": update_data}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Property not found")

    return {"success": True, "message": "Property updated"}


# ============== Treatment Endpoints ==============

@router.post("/treatments", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_treatment_record(
    data: TreatmentCreate,
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """Record a lawn treatment application."""
    from app.models.common import generate_id

    treatment_data = {
        "treatment_id": generate_id("treat"),
        "business_id": business.business_id,
        "applied_by": current_user.user_id,
        **data.model_dump(),
        "created_at": datetime.utcnow().isoformat(),
    }

    await Database.db.lawn_treatments.insert_one(treatment_data)

    return {"success": True, "treatment": treatment_data}


@router.get("/treatments", response_model=dict)
async def list_treatments(
    property_id: Optional[str] = Query(None),
    treatment_type: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """List treatment records."""
    query = {"business_id": business.business_id}

    if property_id:
        query["property_id"] = property_id
    if treatment_type:
        query["treatment_type"] = treatment_type
    if start_date:
        query["treatment_date"] = {"$gte": start_date}
    if end_date:
        if "treatment_date" in query:
            query["treatment_date"]["$lte"] = end_date
        else:
            query["treatment_date"] = {"$lte": end_date}

    treatments = await Database.db.lawn_treatments.find(query).sort(
        "treatment_date", -1
    ).to_list(100)

    return {"success": True, "treatments": treatments}


@router.get("/treatments/{property_id}/history", response_model=dict)
async def get_treatment_history(
    property_id: str,
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """Get complete treatment history for a property."""
    treatments = await Database.db.lawn_treatments.find({
        "property_id": property_id,
        "business_id": business.business_id
    }).sort("treatment_date", -1).to_list(500)

    # Group by treatment type
    by_type = {}
    for t in treatments:
        t_type = t.get("treatment_type", "other")
        if t_type not in by_type:
            by_type[t_type] = []
        by_type[t_type].append(t)

    return {
        "success": True,
        "property_id": property_id,
        "total_treatments": len(treatments),
        "treatments": treatments,
        "by_type": by_type,
    }


# ============== Pricing Endpoints ==============

@router.post("/estimate", response_model=PriceEstimate)
async def calculate_price_estimate(
    service_type: str,
    lawn_size_sqft: int,
    slope: str = "flat",
    obstacles: int = 0,
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """Calculate a price estimate for lawn services."""
    # Base prices per service type
    base_prices = {
        "lawn_mowing": 45.00,
        "fertilization": 75.00,
        "weed_control": 65.00,
        "aeration": 150.00,
        "overseeding": 125.00,
        "leaf_removal": 100.00,
    }

    base_price = base_prices.get(service_type, 50.00)
    notes = []

    # Size adjustment (per 1000 sqft over 5000)
    size_adjustment = 0.0
    if lawn_size_sqft > 5000:
        extra_thousands = (lawn_size_sqft - 5000) / 1000
        if service_type == "lawn_mowing":
            size_adjustment = extra_thousands * 10.00  # $10 per 1000 sqft
        elif service_type in ["fertilization", "weed_control"]:
            size_adjustment = extra_thousands * 15.00  # $15 per 1000 sqft
        elif service_type == "aeration":
            size_adjustment = extra_thousands * 25.00  # $25 per 1000 sqft
        else:
            size_adjustment = extra_thousands * 12.00

        notes.append(f"Size adjustment for {lawn_size_sqft:,} sq ft")

    # Difficulty adjustment
    difficulty_adjustment = 0.0
    slope_multipliers = {"flat": 0, "gentle": 0.1, "moderate": 0.2, "steep": 0.35}
    if slope in slope_multipliers and slope_multipliers[slope] > 0:
        difficulty_adjustment += base_price * slope_multipliers[slope]
        notes.append(f"{slope.title()} slope adjustment")

    # Obstacle adjustment
    if obstacles > 3:
        obstacle_fee = (obstacles - 3) * 5.00
        difficulty_adjustment += obstacle_fee
        notes.append(f"{obstacles} obstacles in yard")

    total_price = base_price + size_adjustment + difficulty_adjustment

    return PriceEstimate(
        service_type=service_type,
        lawn_size_sqft=lawn_size_sqft,
        base_price=base_price,
        size_adjustment=round(size_adjustment, 2),
        difficulty_adjustment=round(difficulty_adjustment, 2),
        total_price=round(total_price, 2),
        notes=notes,
    )


# ============== Program Endpoints ==============

@router.get("/programs", response_model=dict)
async def list_lawn_programs(
    is_template: Optional[bool] = Query(None),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """List lawn care programs (templates and client-specific)."""
    query = {"business_id": business.business_id, "archived": {"$ne": True}}
    if is_template is not None:
        query["is_template"] = is_template

    programs = await Database.db.lawn_programs.find(query).to_list(100)

    return {"success": True, "programs": programs}


@router.get("/programs/{program_id}", response_model=dict)
async def get_lawn_program(
    program_id: str,
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """Get a specific lawn program."""
    from bson import ObjectId

    try:
        program = await Database.db.lawn_programs.find_one({
            "_id": ObjectId(program_id),
            "business_id": business.business_id
        })
    except Exception:
        program = await Database.db.lawn_programs.find_one({
            "program_id": program_id,
            "business_id": business.business_id
        })

    if not program:
        raise HTTPException(status_code=404, detail="Program not found")

    return {"success": True, "program": program}
