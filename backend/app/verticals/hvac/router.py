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
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging

from app.middleware.auth import get_current_user, get_current_business
from app.database import Database, get_database
from app.models.user import User
from app.models.business import Business
from app.models.common import generate_id

logger = logging.getLogger(__name__)
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
    job_number: str  # JOB-YYYY-NNNN format
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
    business: Business = Depends(get_current_business),
    db: AsyncIOMotorDatabase = Depends(get_database)
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
    if db is not None:
        logger.info(f"Looking for equipment: business_id={business.business_id}, recommended_tons={recommended_tons}")
        
        # Find matching equipment for each tier
        # Use range matching for tonnage (within 0.5 tons)
        for tier in ["good", "better", "best"]:
            query_ac = {
                "business_id": business.business_id,
                "category": "air_conditioner",
                "tier": tier,
                "capacity_tons": {
                    "$gte": recommended_tons - 0.5,
                    "$lte": recommended_tons + 0.5
                },
                "is_active": True,
            }
            logger.info(f"AC query for {tier}: {query_ac}")
            
            ac = await db.hvac_equipment.find_one(query_ac)
            logger.info(f"AC result for {tier}: {ac.get('name') if ac else 'None'}")
            
            furnace = await db.hvac_equipment.find_one({
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

    if db is not None:
        await db.hvac_load_calcs.insert_one(calc_record)

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


@router.get("/load-calculations/{calc_id}", response_model=dict)
async def get_load_calculation(
    calc_id: str,
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """Get a specific load calculation."""
    calc = await Database.db.hvac_load_calcs.find_one({
        "calc_id": calc_id,
        "business_id": business.business_id
    })

    if not calc:
        raise HTTPException(status_code=404, detail="Calculation not found")

    return {"success": True, "calculation": calc}


# ============== Climate Zone Lookup ==============

@router.get("/climate-zone/zip/{zip_code}", response_model=dict)
async def get_climate_zone_by_zip(zip_code: str):
    """
    Look up ASHRAE climate zone by ZIP code.

    Returns climate zone (1-8) and design temperatures for load calculations.
    """
    from app.verticals.hvac.climate import (
        get_climate_zone_by_zip as lookup_zone,
        get_climate_zone_info,
        get_design_temperatures,
    )

    zone = lookup_zone(zip_code)
    zone_info = get_climate_zone_info(zone)
    temps = get_design_temperatures(zip_code)

    return {
        "success": True,
        "zip_code": zip_code,
        "climate_zone": zone,
        "zone_info": zone_info,
        "design_temperatures": temps,
    }


@router.get("/climate-zone/state/{state}", response_model=dict)
async def get_climate_zone_by_state(state: str):
    """
    Look up default ASHRAE climate zone by state.

    Returns the most common climate zone for the state.
    """
    from app.verticals.hvac.climate import (
        get_climate_zone_by_state as lookup_state,
        get_climate_zone_info,
    )

    zone = lookup_state(state)
    zone_info = get_climate_zone_info(zone)

    return {
        "success": True,
        "state": state.upper(),
        "climate_zone": zone,
        "zone_info": zone_info,
    }


@router.get("/climate-zones", response_model=dict)
async def list_climate_zones():
    """
    List all ASHRAE climate zones with descriptions.
    """
    from app.verticals.hvac.climate import get_all_zones

    zones = get_all_zones()

    return {
        "success": True,
        "zones": zones,
    }


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

    # Create quote with job number
    quote_id = generate_id("quote")
    now = datetime.utcnow()
    expires_at = datetime(
        now.year, now.month, now.day
    ).isoformat()  # Will be updated with valid_days

    # Generate job number in JOB-YYYY-NNNN format
    # Atomically increment the business's job_number_sequence
    result = await Database.db.businesses.find_one_and_update(
        {"business_id": business.business_id},
        {"$inc": {"job_number_sequence": 1}},
        return_document=True
    )
    sequence = result.get("job_number_sequence", 1) if result else 1
    job_number = f"JOB-{now.year}-{sequence:04d}"

    quote_data = {
        "quote_id": quote_id,
        "job_number": job_number,
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
        job_number=job_number,
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


@router.get("/quotes/{quote_id}/pdf", response_model=dict)
async def get_quote_pdf(
    quote_id: str,
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """
    Generate PDF for a quote.

    Returns base64-encoded PDF or HTML fallback.
    """
    from app.verticals.hvac.quote_pdf import generate_quote_pdf, quote_to_base64_pdf

    # Get quote
    quote = await Database.db.hvac_quotes.find_one({
        "quote_id": quote_id,
        "business_id": business.business_id
    })
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")

    # Get client
    client = await Database.db.clients.find_one({
        "client_id": quote.get("client_id"),
        "business_id": business.business_id
    })
    if not client:
        client = {"first_name": "Customer", "last_name": ""}

    # Get business details
    business_doc = await Database.db.businesses.find_one({
        "business_id": business.business_id
    })
    if not business_doc:
        business_doc = {"name": business.name}

    # Get load calculation if referenced
    load_calc = None
    if quote.get("load_calc_id"):
        load_calc = await Database.db.hvac_load_calcs.find_one({
            "calc_id": quote.get("load_calc_id")
        })

    # Generate PDF
    pdf_bytes = await generate_quote_pdf(quote, business_doc, client, load_calc)

    # Check if it's actual PDF or HTML fallback
    is_pdf = pdf_bytes[:4] == b'%PDF'

    return {
        "success": True,
        "quote_id": quote_id,
        "format": "pdf" if is_pdf else "html",
        "content": quote_to_base64_pdf(pdf_bytes),
        "filename": f"quote_{quote_id}.{'pdf' if is_pdf else 'html'}",
    }


@router.post("/quotes/{quote_id}/send", response_model=dict)
async def send_quote_to_client(
    quote_id: str,
    send_method: str = Query(default="email", description="email or sms"),
    message: Optional[str] = Query(default=None, description="Custom message"),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """
    Send quote to client via email or SMS.

    Updates quote status to 'sent' and records the send event.
    """
    from app.services.email_service import EmailService

    # Get quote
    quote = await Database.db.hvac_quotes.find_one({
        "quote_id": quote_id,
        "business_id": business.business_id
    })
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")

    # Get client
    client = await Database.db.clients.find_one({
        "client_id": quote.get("client_id"),
        "business_id": business.business_id
    })
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    # Get business
    business_doc = await Database.db.businesses.find_one({
        "business_id": business.business_id
    })

    now = datetime.utcnow().isoformat()
    send_record = {
        "sent_at": now,
        "sent_by": current_user.user_id,
        "method": send_method,
        "recipient": client.get("email") if send_method == "email" else client.get("phone"),
    }

    if send_method == "email":
        # Send email with quote
        email_service = EmailService()

        subject = f"Your HVAC Quote from {business_doc.get('name', 'Us')}"
        default_message = f"""
        Dear {client.get('first_name', 'Valued Customer')},

        Thank you for your interest in our HVAC services. Please find your quote attached.

        Quote Total: ${quote.get('total', 0):,.2f}
        Valid Until: {quote.get('expires_at', 'N/A')}

        If you have any questions, please don't hesitate to contact us.

        Best regards,
        {business_doc.get('name', 'HVAC Team')}
        """

        body = message or default_message

        # In production, this would send the actual email with PDF attachment
        # For now, we'll just record the intent
        send_record["email_subject"] = subject
        send_record["status"] = "queued"

        # TODO: Actually send email
        # await email_service.send_with_attachment(
        #     to_email=client.get("email"),
        #     subject=subject,
        #     body=body,
        #     attachment=pdf_bytes,
        #     attachment_name=f"quote_{quote_id}.pdf"
        # )

    elif send_method == "sms":
        # Send SMS with link to quote
        sms_message = message or f"Your HVAC quote for ${quote.get('total', 0):,.2f} is ready. View it here: [link]"
        send_record["sms_message"] = sms_message
        send_record["status"] = "queued"

        # TODO: Actually send SMS
        # from app.services.sms_service import SMSService
        # sms_service = SMSService()
        # await sms_service.send(client.get("phone"), sms_message)

    # Update quote status and add send record
    await Database.db.hvac_quotes.update_one(
        {"quote_id": quote_id},
        {
            "$set": {
                "status": QuoteStatus.SENT.value,
                "sent_at": now,
                "updated_at": now,
            },
            "$push": {"send_history": send_record}
        }
    )

    return {
        "success": True,
        "message": f"Quote sent via {send_method}",
        "quote_id": quote_id,
        "sent_to": send_record["recipient"],
        "status": "sent",
    }


@router.delete("/quotes/{quote_id}", response_model=dict)
async def delete_quote(
    quote_id: str,
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """Delete a quote (only drafts can be deleted)."""
    quote = await Database.db.hvac_quotes.find_one({
        "quote_id": quote_id,
        "business_id": business.business_id
    })

    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")

    if quote.get("status") != QuoteStatus.DRAFT.value:
        raise HTTPException(
            status_code=400,
            detail="Only draft quotes can be deleted. Cancel the quote instead."
        )

    await Database.db.hvac_quotes.delete_one({"quote_id": quote_id})

    return {"success": True, "message": "Quote deleted"}


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


# ============== Equipment Update/Delete ==============

class EquipmentUpdate(BaseModel):
    """Update equipment item"""
    name: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    tier: Optional[EquipmentTier] = None
    capacity_tons: Optional[float] = None
    capacity_btu: Optional[int] = None
    seer: Optional[float] = None
    afue: Optional[float] = None
    hspf: Optional[float] = None
    cost: Optional[float] = None
    labor_hours: Optional[float] = None
    warranty_years: Optional[int] = None
    is_active: Optional[bool] = None


@router.put("/equipment/{equipment_id}", response_model=dict)
async def update_equipment(
    equipment_id: str,
    data: EquipmentUpdate,
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """Update equipment in catalog."""
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    update_data["updated_at"] = datetime.utcnow().isoformat()
    update_data["updated_by"] = current_user.user_id

    result = await Database.db.hvac_equipment.update_one(
        {"equipment_id": equipment_id, "business_id": business.business_id},
        {"$set": update_data}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Equipment not found")

    return {"success": True, "message": "Equipment updated"}


@router.delete("/equipment/{equipment_id}", response_model=dict)
async def delete_equipment(
    equipment_id: str,
    hard_delete: bool = Query(default=False, description="Permanently delete instead of deactivate"),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """Delete or deactivate equipment from catalog."""
    if hard_delete:
        result = await Database.db.hvac_equipment.delete_one({
            "equipment_id": equipment_id,
            "business_id": business.business_id
        })
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Equipment not found")
        return {"success": True, "message": "Equipment permanently deleted"}
    else:
        result = await Database.db.hvac_equipment.update_one(
            {"equipment_id": equipment_id, "business_id": business.business_id},
            {"$set": {"is_active": False, "deactivated_at": datetime.utcnow().isoformat()}}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Equipment not found")
        return {"success": True, "message": "Equipment deactivated"}


# ============== Maintenance Contract CRUD ==============

class MaintenanceContractCreate(BaseModel):
    """Create maintenance contract"""
    client_id: str
    plan_name: str = "Annual Maintenance Plan"
    plan_type: str = "annual"  # annual, semi_annual, quarterly
    price: float
    equipment_covered: List[str] = Field(default_factory=list)  # equipment_ids
    start_date: str
    end_date: str
    visits_per_year: int = 2
    includes_parts: bool = False
    includes_refrigerant: bool = False
    priority_service: bool = True
    discount_percent: float = 10.0  # Discount on repairs
    notes: Optional[str] = None


class MaintenanceContractUpdate(BaseModel):
    """Update maintenance contract"""
    plan_name: Optional[str] = None
    price: Optional[float] = None
    equipment_covered: Optional[List[str]] = None
    end_date: Optional[str] = None
    visits_per_year: Optional[int] = None
    includes_parts: Optional[bool] = None
    includes_refrigerant: Optional[bool] = None
    priority_service: Optional[bool] = None
    discount_percent: Optional[float] = None
    status: Optional[str] = None  # active, expired, cancelled
    next_service_date: Optional[str] = None
    notes: Optional[str] = None


@router.post("/maintenance", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_maintenance_contract(
    data: MaintenanceContractCreate,
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """Create a new maintenance contract."""
    from dateutil.parser import parse as parse_date
    from dateutil.relativedelta import relativedelta

    contract_id = generate_id("maint")
    now = datetime.utcnow().isoformat()

    # Calculate next service date (first visit)
    start = parse_date(data.start_date)
    interval_months = 12 // data.visits_per_year
    next_service = start + relativedelta(months=interval_months)

    contract_data = {
        "contract_id": contract_id,
        "business_id": business.business_id,
        "client_id": data.client_id,
        "plan_name": data.plan_name,
        "plan_type": data.plan_type,
        "price": data.price,
        "equipment_covered": data.equipment_covered,
        "start_date": data.start_date,
        "end_date": data.end_date,
        "visits_per_year": data.visits_per_year,
        "visits_completed": 0,
        "includes_parts": data.includes_parts,
        "includes_refrigerant": data.includes_refrigerant,
        "priority_service": data.priority_service,
        "discount_percent": data.discount_percent,
        "status": "active",
        "next_service_date": next_service.isoformat(),
        "service_history": [],
        "notes": data.notes,
        "created_at": now,
        "created_by": current_user.user_id,
    }

    await Database.db.hvac_maintenance.insert_one(contract_data)

    return {"success": True, "contract": contract_data}


@router.get("/maintenance/{contract_id}", response_model=dict)
async def get_maintenance_contract(
    contract_id: str,
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """Get a specific maintenance contract."""
    contract = await Database.db.hvac_maintenance.find_one({
        "contract_id": contract_id,
        "business_id": business.business_id
    })

    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")

    return {"success": True, "contract": contract}


@router.put("/maintenance/{contract_id}", response_model=dict)
async def update_maintenance_contract(
    contract_id: str,
    data: MaintenanceContractUpdate,
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """Update a maintenance contract."""
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    update_data["updated_at"] = datetime.utcnow().isoformat()
    update_data["updated_by"] = current_user.user_id

    result = await Database.db.hvac_maintenance.update_one(
        {"contract_id": contract_id, "business_id": business.business_id},
        {"$set": update_data}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Contract not found")

    return {"success": True, "message": "Contract updated"}


@router.post("/maintenance/{contract_id}/record-service", response_model=dict)
async def record_maintenance_service(
    contract_id: str,
    service_date: str,
    technician_id: str,
    services_performed: List[str],
    notes: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """Record a maintenance service visit."""
    from dateutil.parser import parse as parse_date
    from dateutil.relativedelta import relativedelta

    contract = await Database.db.hvac_maintenance.find_one({
        "contract_id": contract_id,
        "business_id": business.business_id
    })

    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")

    # Create service record
    service_record = {
        "service_id": generate_id("svc"),
        "service_date": service_date,
        "technician_id": technician_id,
        "services_performed": services_performed,
        "notes": notes,
        "recorded_at": datetime.utcnow().isoformat(),
        "recorded_by": current_user.user_id,
    }

    # Calculate next service date
    visits_per_year = contract.get("visits_per_year", 2)
    interval_months = 12 // visits_per_year
    current_date = parse_date(service_date)
    next_service = current_date + relativedelta(months=interval_months)

    # Check if past end date
    end_date = parse_date(contract.get("end_date"))
    if next_service > end_date:
        next_service_str = None
        new_status = "expired"
    else:
        next_service_str = next_service.isoformat()
        new_status = contract.get("status", "active")

    await Database.db.hvac_maintenance.update_one(
        {"contract_id": contract_id},
        {
            "$push": {"service_history": service_record},
            "$inc": {"visits_completed": 1},
            "$set": {
                "next_service_date": next_service_str,
                "last_service_date": service_date,
                "status": new_status,
                "updated_at": datetime.utcnow().isoformat(),
            }
        }
    )

    return {
        "success": True,
        "message": "Service recorded",
        "service_record": service_record,
        "next_service_date": next_service_str,
    }


@router.delete("/maintenance/{contract_id}", response_model=dict)
async def cancel_maintenance_contract(
    contract_id: str,
    reason: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """Cancel a maintenance contract."""
    result = await Database.db.hvac_maintenance.update_one(
        {"contract_id": contract_id, "business_id": business.business_id},
        {
            "$set": {
                "status": "cancelled",
                "cancelled_at": datetime.utcnow().isoformat(),
                "cancelled_by": current_user.user_id,
                "cancellation_reason": reason,
            }
        }
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Contract not found")

    return {"success": True, "message": "Contract cancelled"}


# ============== Refrigerant Tracking (EPA Compliance) ==============

class RefrigerantLogEntry(BaseModel):
    """Refrigerant usage log entry for EPA compliance"""
    service_date: str
    client_id: str
    job_id: Optional[str] = None
    equipment_id: Optional[str] = None
    refrigerant_type: str  # R-22, R-410A, R-32, R-454B, etc.
    action: str  # add, recover, reclaim, dispose
    quantity_lbs: float
    technician_id: str
    technician_epa_cert: Optional[str] = None  # EPA certification number
    leak_detected: bool = False
    leak_repaired: bool = False
    notes: Optional[str] = None


@router.post("/refrigerant/log", response_model=dict, status_code=status.HTTP_201_CREATED)
async def log_refrigerant_usage(
    data: RefrigerantLogEntry,
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """Log refrigerant usage for EPA compliance tracking."""
    log_id = generate_id("refr")
    now = datetime.utcnow().isoformat()

    log_entry = {
        "log_id": log_id,
        "business_id": business.business_id,
        **data.model_dump(),
        "created_at": now,
        "created_by": current_user.user_id,
    }

    await Database.db.hvac_refrigerant_log.insert_one(log_entry)

    return {"success": True, "log_entry": log_entry}


@router.get("/refrigerant/log", response_model=dict)
async def list_refrigerant_logs(
    client_id: Optional[str] = Query(None),
    refrigerant_type: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """List refrigerant usage logs."""
    query = {"business_id": business.business_id}

    if client_id:
        query["client_id"] = client_id
    if refrigerant_type:
        query["refrigerant_type"] = refrigerant_type
    if start_date:
        query["service_date"] = {"$gte": start_date}
    if end_date:
        if "service_date" in query:
            query["service_date"]["$lte"] = end_date
        else:
            query["service_date"] = {"$lte": end_date}

    logs = await Database.db.hvac_refrigerant_log.find(query).sort(
        "service_date", -1
    ).to_list(500)

    return {"success": True, "logs": logs, "count": len(logs)}


@router.get("/refrigerant/report", response_model=dict)
async def get_refrigerant_report(
    year: int = Query(default=None, description="Report year"),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """
    Generate EPA compliance refrigerant report.

    Summarizes refrigerant usage by type and action for regulatory reporting.
    """
    if year is None:
        year = datetime.utcnow().year

    start_date = f"{year}-01-01"
    end_date = f"{year}-12-31"

    logs = await Database.db.hvac_refrigerant_log.find({
        "business_id": business.business_id,
        "service_date": {"$gte": start_date, "$lte": end_date}
    }).to_list(1000)

    # Aggregate by refrigerant type and action
    summary = {}
    total_added = 0
    total_recovered = 0
    leak_incidents = 0

    for log in logs:
        ref_type = log.get("refrigerant_type", "unknown")
        action = log.get("action", "unknown")
        qty = log.get("quantity_lbs", 0)

        if ref_type not in summary:
            summary[ref_type] = {"added": 0, "recovered": 0, "reclaimed": 0, "disposed": 0}

        if action in summary[ref_type]:
            summary[ref_type][action] += qty

        if action == "add":
            total_added += qty
        elif action in ["recover", "reclaim"]:
            total_recovered += qty

        if log.get("leak_detected"):
            leak_incidents += 1

    return {
        "success": True,
        "report": {
            "year": year,
            "business_id": business.business_id,
            "generated_at": datetime.utcnow().isoformat(),
            "summary_by_type": summary,
            "totals": {
                "total_added_lbs": round(total_added, 2),
                "total_recovered_lbs": round(total_recovered, 2),
                "leak_incidents": leak_incidents,
                "total_transactions": len(logs),
            },
        },
    }


# ============== Inventory Management ==============

class InventoryItemCreate(BaseModel):
    """Create inventory item"""
    sku: str
    name: str
    description: Optional[str] = None
    category: str  # part, material, supply, refrigerant
    unit: str = "each"  # each, foot, pound, gallon
    cost: float
    sell_price: Optional[float] = None
    quantity_on_hand: int = 0
    reorder_point: int = 5
    reorder_quantity: int = 10
    location: Optional[str] = None  # warehouse location
    supplier: Optional[str] = None
    supplier_part_number: Optional[str] = None


class InventoryItemUpdate(BaseModel):
    """Update inventory item"""
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    cost: Optional[float] = None
    sell_price: Optional[float] = None
    reorder_point: Optional[int] = None
    reorder_quantity: Optional[int] = None
    location: Optional[str] = None
    supplier: Optional[str] = None
    is_active: Optional[bool] = None


class InventoryAdjustment(BaseModel):
    """Adjust inventory quantity"""
    adjustment_type: str  # receive, use, return, adjust, transfer
    quantity: int
    job_id: Optional[str] = None
    notes: Optional[str] = None


@router.post("/inventory", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_inventory_item(
    data: InventoryItemCreate,
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """Add item to inventory."""
    item_id = generate_id("inv")
    now = datetime.utcnow().isoformat()

    item_data = {
        "item_id": item_id,
        "business_id": business.business_id,
        **data.model_dump(),
        "is_active": True,
        "adjustment_history": [],
        "created_at": now,
        "created_by": current_user.user_id,
    }

    await Database.db.hvac_inventory.insert_one(item_data)

    return {"success": True, "item": item_data}


@router.get("/inventory", response_model=dict)
async def list_inventory(
    category: Optional[str] = Query(None),
    low_stock: bool = Query(default=False, description="Only show items at or below reorder point"),
    search: Optional[str] = Query(None, description="Search by name or SKU"),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """List inventory items."""
    query = {"business_id": business.business_id, "is_active": True}

    if category:
        query["category"] = category
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"sku": {"$regex": search, "$options": "i"}},
        ]

    items = await Database.db.hvac_inventory.find(query).to_list(500)

    if low_stock:
        items = [
            i for i in items
            if i.get("quantity_on_hand", 0) <= i.get("reorder_point", 5)
        ]

    # Calculate total inventory value
    total_value = sum(
        i.get("quantity_on_hand", 0) * i.get("cost", 0)
        for i in items
    )

    return {
        "success": True,
        "items": items,
        "count": len(items),
        "total_value": round(total_value, 2),
    }


@router.get("/inventory/{item_id}", response_model=dict)
async def get_inventory_item(
    item_id: str,
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """Get specific inventory item."""
    item = await Database.db.hvac_inventory.find_one({
        "item_id": item_id,
        "business_id": business.business_id
    })

    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    return {"success": True, "item": item}


@router.put("/inventory/{item_id}", response_model=dict)
async def update_inventory_item(
    item_id: str,
    data: InventoryItemUpdate,
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """Update inventory item."""
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    update_data["updated_at"] = datetime.utcnow().isoformat()
    update_data["updated_by"] = current_user.user_id

    result = await Database.db.hvac_inventory.update_one(
        {"item_id": item_id, "business_id": business.business_id},
        {"$set": update_data}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")

    return {"success": True, "message": "Item updated"}


@router.post("/inventory/{item_id}/adjust", response_model=dict)
async def adjust_inventory(
    item_id: str,
    data: InventoryAdjustment,
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """Adjust inventory quantity (receive, use, return, etc.)."""
    item = await Database.db.hvac_inventory.find_one({
        "item_id": item_id,
        "business_id": business.business_id
    })

    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    current_qty = item.get("quantity_on_hand", 0)

    # Calculate new quantity based on adjustment type
    if data.adjustment_type in ["receive", "return"]:
        new_qty = current_qty + data.quantity
    elif data.adjustment_type == "use":
        new_qty = current_qty - data.quantity
        if new_qty < 0:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock. Available: {current_qty}"
            )
    elif data.adjustment_type == "adjust":
        new_qty = data.quantity  # Direct set
    else:
        new_qty = current_qty + data.quantity  # Default to add

    # Create adjustment record
    adjustment_record = {
        "adjustment_id": generate_id("adj"),
        "type": data.adjustment_type,
        "quantity": data.quantity,
        "previous_qty": current_qty,
        "new_qty": new_qty,
        "job_id": data.job_id,
        "notes": data.notes,
        "adjusted_at": datetime.utcnow().isoformat(),
        "adjusted_by": current_user.user_id,
    }

    # Check if below reorder point
    reorder_point = item.get("reorder_point", 5)
    needs_reorder = new_qty <= reorder_point

    await Database.db.hvac_inventory.update_one(
        {"item_id": item_id},
        {
            "$set": {
                "quantity_on_hand": new_qty,
                "updated_at": datetime.utcnow().isoformat(),
            },
            "$push": {"adjustment_history": adjustment_record}
        }
    )

    return {
        "success": True,
        "previous_quantity": current_qty,
        "new_quantity": new_qty,
        "adjustment": adjustment_record,
        "needs_reorder": needs_reorder,
    }


@router.get("/inventory/reorder-report", response_model=dict)
async def get_reorder_report(
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """Get items that need to be reordered."""
    items = await Database.db.hvac_inventory.find({
        "business_id": business.business_id,
        "is_active": True,
        "$expr": {"$lte": ["$quantity_on_hand", "$reorder_point"]}
    }).to_list(500)

    # Group by supplier
    by_supplier = {}
    for item in items:
        supplier = item.get("supplier", "Unknown")
        if supplier not in by_supplier:
            by_supplier[supplier] = []
        by_supplier[supplier].append({
            "item_id": item.get("item_id"),
            "sku": item.get("sku"),
            "name": item.get("name"),
            "current_qty": item.get("quantity_on_hand", 0),
            "reorder_qty": item.get("reorder_quantity", 10),
            "cost": item.get("cost", 0),
            "supplier_part_number": item.get("supplier_part_number"),
        })

    return {
        "success": True,
        "items_to_reorder": len(items),
        "by_supplier": by_supplier,
        "total_reorder_value": sum(
            i.get("reorder_quantity", 10) * i.get("cost", 0)
            for i in items
        ),
    }
