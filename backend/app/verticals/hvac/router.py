"""
HVAC Vertical API Router

Endpoints for HVAC-specific functionality including:
- Load calculations
- Equipment catalog
- Job pricing/quoting
- Maintenance contracts
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field

from app.middleware.auth import get_current_user, get_current_business
from app.database import Database
from app.models.user import User
from app.models.business import Business
from app.models.common import generate_id

router = APIRouter()


# ============== Enums ==============

class EquipmentTier(str, Enum):
    GOOD = "good"
    BETTER = "better"
    BEST = "best"


class EquipmentCategory(str, Enum):
    AIR_CONDITIONER = "air_conditioner"
    FURNACE = "furnace"
    HEAT_PUMP = "heat_pump"
    MINI_SPLIT = "mini_split"
    AIR_HANDLER = "air_handler"
    THERMOSTAT = "thermostat"


class QuoteStatus(str, Enum):
    DRAFT = "draft"
    SENT = "sent"
    VIEWED = "viewed"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    EXPIRED = "expired"


# ============== Models ==============

class LoadCalculationInput(BaseModel):
    """Input for HVAC load calculation"""
    square_footage: int = Field(ge=100, le=50000)
    ceiling_height_ft: float = Field(default=8, ge=7, le=20)
    floor_count: int = Field(default=1, ge=1, le=5)
    window_count: int = Field(default=8, ge=0, le=100)
    window_quality: str = Field(default="standard")  # single, standard, double, triple
    insulation_quality: str = Field(default="average")  # poor, average, good, excellent
    sun_exposure: str = Field(default="mixed")  # low, mixed, high
    climate_zone: int = Field(default=4, ge=1, le=8)  # ASHRAE climate zones
    occupants: int = Field(default=3, ge=1, le=20)

    # Optional overrides
    manual_j_btuh: Optional[int] = None  # If professional calc done


class LoadCalculationResult(BaseModel):
    """Result of HVAC load calculation"""
    calc_id: str
    created_at: str

    # Inputs (stored for reference)
    input_data: LoadCalculationInput

    # Cooling load
    cooling_btuh: int
    cooling_tons: float
    recommended_ac_tons: float

    # Heating load
    heating_btuh: int

    # Airflow
    cfm_required: int

    # Recommendations
    recommended_equipment: List[Dict[str, Any]]
    notes: List[str]

    # Factors breakdown
    factors: Dict[str, float]


class EquipmentItem(BaseModel):
    """Equipment catalog item"""
    equipment_id: str
    business_id: str
    category: EquipmentCategory
    type: str
    tier: EquipmentTier
    name: str
    brand: str
    model: str

    # Capacity
    capacity_tons: Optional[float] = None
    capacity_btu: Optional[int] = None

    # Efficiency ratings
    seer: Optional[float] = None
    afue: Optional[float] = None
    hspf: Optional[float] = None

    # Pricing
    cost: float
    labor_hours: float
    warranty_years: int

    is_active: bool = True


class QuoteLineItem(BaseModel):
    """Line item in a quote"""
    item_type: str  # equipment, labor, material, permit, other
    description: str
    equipment_id: Optional[str] = None
    quantity: int = 1
    unit_price: float
    total: float


class QuoteCreate(BaseModel):
    """Create a job quote"""
    client_id: str
    load_calc_id: Optional[str] = None
    tier: EquipmentTier
    job_type: str  # install_ac, install_furnace, install_complete, repair
    description: Optional[str] = None
    line_items: List[QuoteLineItem] = Field(default_factory=list)
    notes: Optional[str] = None
    valid_days: int = Field(default=30, ge=7, le=90)


class QuoteResponse(BaseModel):
    """Quote response"""
    quote_id: str
    business_id: str
    client_id: str
    load_calc_id: Optional[str]

    tier: str
    job_type: str
    description: Optional[str]

    # Line items
    line_items: List[QuoteLineItem]

    # Pricing
    equipment_total: float
    labor_total: float
    materials_total: float
    subtotal: float
    tax: float
    total: float

    # Margins (internal)
    cost_total: float
    margin_percent: float
    profit: float

    # Status
    status: str
    created_at: str
    expires_at: str
    notes: Optional[str]


# ============== Load Calculator ==============

@router.post("/calculate-load", response_model=LoadCalculationResult)
async def calculate_hvac_load(
    data: LoadCalculationInput,
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """
    Calculate HVAC cooling and heating load.

    Uses simplified Manual J methodology to estimate:
    - Cooling load (BTU/h)
    - Required tonnage
    - Heating load (BTU/h)
    - Airflow (CFM)
    """
    notes = []
    factors = {}

    # Base load calculation (simplified Manual J)
    # Rule of thumb: 20-25 BTU per sq ft, adjusted by factors

    # Climate zone adjustments (BTU per sq ft)
    climate_factors = {
        1: 30,   # Very hot (Miami)
        2: 28,   # Hot-humid (Houston)
        3: 25,   # Warm-humid (Atlanta)
        4: 22,   # Mixed-humid (DC)
        5: 20,   # Cool-humid (Chicago)
        6: 18,   # Cold (Minneapolis)
        7: 15,   # Very cold (Duluth)
        8: 12,   # Subarctic (Fairbanks)
    }
    base_btuh_per_sqft = climate_factors.get(data.climate_zone, 22)
    factors["climate_zone"] = data.climate_zone

    # Calculate base cooling load
    base_cooling = data.square_footage * base_btuh_per_sqft

    # Window adjustment
    window_factors = {
        "single": 1.15,
        "standard": 1.0,
        "double": 0.90,
        "triple": 0.80,
    }
    window_factor = window_factors.get(data.window_quality, 1.0)
    window_addition = data.window_count * 1000 * (window_factor - 0.8)
    factors["window_factor"] = window_factor

    # Insulation adjustment
    insulation_factors = {
        "poor": 1.20,
        "average": 1.0,
        "good": 0.90,
        "excellent": 0.80,
    }
    insulation_factor = insulation_factors.get(data.insulation_quality, 1.0)
    factors["insulation_factor"] = insulation_factor

    # Sun exposure
    sun_factors = {
        "low": 0.90,
        "mixed": 1.0,
        "high": 1.15,
    }
    sun_factor = sun_factors.get(data.sun_exposure, 1.0)
    factors["sun_factor"] = sun_factor

    # Height factor (per foot over 8ft standard)
    height_factor = 1.0 + (data.ceiling_height_ft - 8) * 0.02
    factors["height_factor"] = round(height_factor, 2)

    # Floor factor
    floor_factor = 1.0 + (data.floor_count - 1) * 0.05
    factors["floor_factor"] = round(floor_factor, 2)

    # Occupant load (400 BTU per person)
    occupant_load = data.occupants * 400

    # Calculate cooling BTUH
    if data.manual_j_btuh:
        # Use professional calculation if provided
        cooling_btuh = data.manual_j_btuh
        notes.append("Using provided Manual J calculation")
    else:
        cooling_btuh = int(
            (base_cooling + window_addition + occupant_load)
            * insulation_factor
            * sun_factor
            * height_factor
            * floor_factor
        )
        notes.append("Calculated using simplified Manual J methodology")

    # Convert to tons (12,000 BTU = 1 ton)
    cooling_tons = cooling_btuh / 12000

    # Round up to nearest 0.5 ton for equipment sizing
    recommended_tons = round(cooling_tons * 2) / 2
    if recommended_tons < cooling_tons:
        recommended_tons += 0.5

    # Heating load (typically 1.0-1.2x cooling in mixed climates)
    heating_multiplier = 1.0 + (data.climate_zone - 4) * 0.1
    heating_multiplier = max(0.8, min(1.5, heating_multiplier))
    heating_btuh = int(cooling_btuh * heating_multiplier)
    factors["heating_multiplier"] = round(heating_multiplier, 2)

    # CFM calculation (400 CFM per ton is standard)
    cfm_required = int(recommended_tons * 400)

    # Recommendations based on size
    if cooling_tons < 2:
        notes.append("Small system - consider mini-split for efficiency")
    elif cooling_tons > 5:
        notes.append("Large load - may require zoning or multiple systems")

    if data.insulation_quality == "poor":
        notes.append("Recommend improving insulation before new equipment")

    # Get recommended equipment from catalog
    recommended_equipment = []
    if Database.db:
        # Find matching equipment for each tier
        for tier in ["good", "better", "best"]:
            ac = await Database.db.hvac_equipment.find_one({
                "business_id": business.business_id,
                "category": "air_conditioner",
                "tier": tier,
                "capacity_tons": recommended_tons,
                "is_active": True,
            })
            furnace = await Database.db.hvac_equipment.find_one({
                "business_id": business.business_id,
                "category": "furnace",
                "tier": tier,
                "capacity_btu": {"$gte": heating_btuh * 0.8},
                "is_active": True,
            })

            if ac and furnace:
                recommended_equipment.append({
                    "tier": tier,
                    "ac": {
                        "equipment_id": ac.get("equipment_id"),
                        "name": ac.get("name"),
                        "seer": ac.get("seer"),
                        "cost": ac.get("cost"),
                    },
                    "furnace": {
                        "equipment_id": furnace.get("equipment_id"),
                        "name": furnace.get("name"),
                        "afue": furnace.get("afue"),
                        "cost": furnace.get("cost"),
                    },
                    "total_equipment_cost": ac.get("cost", 0) + furnace.get("cost", 0),
                })

    # Store calculation
    calc_id = generate_id("calc")
    now = datetime.utcnow().isoformat()

    calc_record = {
        "calc_id": calc_id,
        "business_id": business.business_id,
        "user_id": current_user.user_id,
        "input_data": data.model_dump(),
        "cooling_btuh": cooling_btuh,
        "cooling_tons": round(cooling_tons, 2),
        "recommended_ac_tons": recommended_tons,
        "heating_btuh": heating_btuh,
        "cfm_required": cfm_required,
        "factors": factors,
        "notes": notes,
        "created_at": now,
    }

    if Database.db:
        await Database.db.hvac_load_calcs.insert_one(calc_record)

    return LoadCalculationResult(
        calc_id=calc_id,
        created_at=now,
        input_data=data,
        cooling_btuh=cooling_btuh,
        cooling_tons=round(cooling_tons, 2),
        recommended_ac_tons=recommended_tons,
        heating_btuh=heating_btuh,
        cfm_required=cfm_required,
        recommended_equipment=recommended_equipment,
        notes=notes,
        factors=factors,
    )


@router.get("/load-calculations", response_model=dict)
async def list_load_calculations(
    client_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """List load calculations for the business."""
    query = {"business_id": business.business_id}
    if client_id:
        query["client_id"] = client_id

    calcs = await Database.db.hvac_load_calcs.find(query).sort(
        "created_at", -1
    ).to_list(100)

    return {"success": True, "calculations": calcs}


# ============== Equipment Catalog ==============

@router.get("/equipment", response_model=dict)
async def list_equipment(
    category: Optional[EquipmentCategory] = Query(None),
    tier: Optional[EquipmentTier] = Query(None),
    min_tons: Optional[float] = Query(None),
    max_tons: Optional[float] = Query(None),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """List equipment catalog."""
    query = {"business_id": business.business_id, "is_active": True}

    if category:
        query["category"] = category.value
    if tier:
        query["tier"] = tier.value
    if min_tons:
        query["capacity_tons"] = {"$gte": min_tons}
    if max_tons:
        if "capacity_tons" in query:
            query["capacity_tons"]["$lte"] = max_tons
        else:
            query["capacity_tons"] = {"$lte": max_tons}

    equipment = await Database.db.hvac_equipment.find(query).to_list(200)

    # Group by category and tier
    grouped = {}
    for item in equipment:
        cat = item.get("category", "other")
        tier_val = item.get("tier", "good")
        key = f"{cat}_{tier_val}"
        if key not in grouped:
            grouped[key] = []
        grouped[key].append(item)

    return {
        "success": True,
        "equipment": equipment,
        "grouped": grouped,
        "total": len(equipment),
    }


@router.get("/equipment/{equipment_id}", response_model=dict)
async def get_equipment(
    equipment_id: str,
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """Get specific equipment item."""
    item = await Database.db.hvac_equipment.find_one({
        "equipment_id": equipment_id,
        "business_id": business.business_id
    })

    if not item:
        raise HTTPException(status_code=404, detail="Equipment not found")

    return {"success": True, "equipment": item}


@router.post("/equipment", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_equipment(
    data: EquipmentItem,
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """Add equipment to catalog."""
    equipment_data = data.model_dump()
    equipment_data["equipment_id"] = generate_id("equip")
    equipment_data["business_id"] = business.business_id
    equipment_data["created_at"] = datetime.utcnow().isoformat()

    await Database.db.hvac_equipment.insert_one(equipment_data)

    return {"success": True, "equipment": equipment_data}


# ============== Quoting ==============

@router.post("/quotes", response_model=QuoteResponse, status_code=status.HTTP_201_CREATED)
async def create_quote(
    data: QuoteCreate,
    labor_rate: float = Query(default=85.0, description="Labor rate per hour"),
    margin_percent: float = Query(default=35.0, description="Target margin percentage"),
    tax_rate: float = Query(default=8.25, description="Tax rate percentage"),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """
    Create a job quote with pricing.

    Automatically calculates equipment, labor, materials totals
    and applies margin and tax.
    """
    line_items = data.line_items

    # If no line items, auto-generate based on tier and load calc
    if not line_items and data.load_calc_id:
        load_calc = await Database.db.hvac_load_calcs.find_one({
            "calc_id": data.load_calc_id,
            "business_id": business.business_id
        })

        if load_calc:
            # Get equipment for the tier
            ac = await Database.db.hvac_equipment.find_one({
                "business_id": business.business_id,
                "category": "air_conditioner",
                "tier": data.tier.value,
                "capacity_tons": load_calc.get("recommended_ac_tons"),
                "is_active": True,
            })

            furnace = await Database.db.hvac_equipment.find_one({
                "business_id": business.business_id,
                "category": "furnace",
                "tier": data.tier.value,
                "capacity_btu": {"$gte": load_calc.get("heating_btuh", 0) * 0.8},
                "is_active": True,
            })

            if ac:
                line_items.append(QuoteLineItem(
                    item_type="equipment",
                    description=ac.get("name", "Air Conditioner"),
                    equipment_id=ac.get("equipment_id"),
                    quantity=1,
                    unit_price=ac.get("cost", 0),
                    total=ac.get("cost", 0),
                ))

                # AC labor
                line_items.append(QuoteLineItem(
                    item_type="labor",
                    description=f"AC Installation Labor ({ac.get('labor_hours', 6)} hrs)",
                    quantity=int(ac.get("labor_hours", 6)),
                    unit_price=labor_rate,
                    total=ac.get("labor_hours", 6) * labor_rate,
                ))

            if furnace:
                line_items.append(QuoteLineItem(
                    item_type="equipment",
                    description=furnace.get("name", "Furnace"),
                    equipment_id=furnace.get("equipment_id"),
                    quantity=1,
                    unit_price=furnace.get("cost", 0),
                    total=furnace.get("cost", 0),
                ))

                # Furnace labor
                line_items.append(QuoteLineItem(
                    item_type="labor",
                    description=f"Furnace Installation Labor ({furnace.get('labor_hours', 6)} hrs)",
                    quantity=int(furnace.get("labor_hours", 6)),
                    unit_price=labor_rate,
                    total=furnace.get("labor_hours", 6) * labor_rate,
                ))

            # Standard materials
            line_items.append(QuoteLineItem(
                item_type="material",
                description="Installation materials (refrigerant, copper, fittings, etc.)",
                quantity=1,
                unit_price=350,
                total=350,
            ))

            # Permit
            line_items.append(QuoteLineItem(
                item_type="permit",
                description="Permit and inspection fees",
                quantity=1,
                unit_price=150,
                total=150,
            ))

    # Calculate totals
    equipment_total = sum(
        item.total for item in line_items if item.item_type == "equipment"
    )
    labor_total = sum(
        item.total for item in line_items if item.item_type == "labor"
    )
    materials_total = sum(
        item.total for item in line_items if item.item_type in ["material", "permit", "other"]
    )

    cost_total = equipment_total + labor_total + materials_total

    # Apply margin
    subtotal = cost_total / (1 - margin_percent / 100)
    profit = subtotal - cost_total

    # Apply tax (on equipment and materials only, not labor in most states)
    taxable = equipment_total + materials_total
    taxable_marked_up = taxable / (1 - margin_percent / 100)
    tax = taxable_marked_up * (tax_rate / 100)

    total = subtotal + tax

    # Create quote
    quote_id = generate_id("quote")
    now = datetime.utcnow()
    expires_at = datetime(
        now.year, now.month, now.day
    ).isoformat()  # Will be updated with valid_days

    quote_data = {
        "quote_id": quote_id,
        "business_id": business.business_id,
        "client_id": data.client_id,
        "load_calc_id": data.load_calc_id,
        "created_by": current_user.user_id,
        "tier": data.tier.value,
        "job_type": data.job_type,
        "description": data.description,
        "line_items": [item.model_dump() for item in line_items],
        "equipment_total": round(equipment_total, 2),
        "labor_total": round(labor_total, 2),
        "materials_total": round(materials_total, 2),
        "subtotal": round(subtotal, 2),
        "tax_rate": tax_rate,
        "tax": round(tax, 2),
        "total": round(total, 2),
        "cost_total": round(cost_total, 2),
        "margin_percent": margin_percent,
        "profit": round(profit, 2),
        "status": QuoteStatus.DRAFT.value,
        "notes": data.notes,
        "created_at": now.isoformat(),
        "expires_at": (now.replace(day=now.day) + __import__('datetime').timedelta(days=data.valid_days)).isoformat(),
    }

    await Database.db.hvac_quotes.insert_one(quote_data)

    return QuoteResponse(
        quote_id=quote_id,
        business_id=business.business_id,
        client_id=data.client_id,
        load_calc_id=data.load_calc_id,
        tier=data.tier.value,
        job_type=data.job_type,
        description=data.description,
        line_items=line_items,
        equipment_total=round(equipment_total, 2),
        labor_total=round(labor_total, 2),
        materials_total=round(materials_total, 2),
        subtotal=round(subtotal, 2),
        tax=round(tax, 2),
        total=round(total, 2),
        cost_total=round(cost_total, 2),
        margin_percent=margin_percent,
        profit=round(profit, 2),
        status=QuoteStatus.DRAFT.value,
        created_at=now.isoformat(),
        expires_at=quote_data["expires_at"],
        notes=data.notes,
    )


@router.get("/quotes", response_model=dict)
async def list_quotes(
    status: Optional[QuoteStatus] = Query(None),
    client_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """List quotes for the business."""
    query = {"business_id": business.business_id}
    if status:
        query["status"] = status.value
    if client_id:
        query["client_id"] = client_id

    quotes = await Database.db.hvac_quotes.find(query).sort(
        "created_at", -1
    ).to_list(100)

    return {"success": True, "quotes": quotes}


@router.get("/quotes/{quote_id}", response_model=dict)
async def get_quote(
    quote_id: str,
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """Get specific quote."""
    quote = await Database.db.hvac_quotes.find_one({
        "quote_id": quote_id,
        "business_id": business.business_id
    })

    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")

    return {"success": True, "quote": quote}


@router.patch("/quotes/{quote_id}/status", response_model=dict)
async def update_quote_status(
    quote_id: str,
    new_status: QuoteStatus,
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """Update quote status."""
    result = await Database.db.hvac_quotes.update_one(
        {"quote_id": quote_id, "business_id": business.business_id},
        {
            "$set": {
                "status": new_status.value,
                "updated_at": datetime.utcnow().isoformat(),
                "updated_by": current_user.user_id,
            }
        }
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Quote not found")

    return {"success": True, "message": f"Quote status updated to {new_status.value}"}


# ============== Maintenance Contracts ==============

@router.get("/maintenance", response_model=dict)
async def list_maintenance_contracts(
    status: Optional[str] = Query(None),  # active, expired, cancelled
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """List maintenance contracts."""
    query = {"business_id": business.business_id}
    if status:
        query["status"] = status

    contracts = await Database.db.hvac_maintenance.find(query).to_list(100)

    return {"success": True, "contracts": contracts}


@router.get("/maintenance/due", response_model=dict)
async def get_maintenance_due(
    days_ahead: int = Query(default=30, ge=1, le=90),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """Get maintenance contracts due for service soon."""
    from datetime import timedelta

    cutoff = (datetime.utcnow() + timedelta(days=days_ahead)).isoformat()

    contracts = await Database.db.hvac_maintenance.find({
        "business_id": business.business_id,
        "status": "active",
        "next_service_date": {"$lte": cutoff}
    }).sort("next_service_date", 1).to_list(100)

    return {
        "success": True,
        "days_ahead": days_ahead,
        "due_count": len(contracts),
        "contracts": contracts,
    }
