# HVAC Vertical Analysis: TheWorx vs ServicePro

## Executive Summary

**TheWorx** is a specialized HVAC contractor platform with industry-specific features. Comparing it to **ServicePro/MowTime**, there are significant differences in domain logic but shared architecture patterns.

**Recommendation**: Build HVAC features as a new vertical within ServicePro rather than starting from scratch.

---

## Feature Comparison

| Feature | ServicePro (Current) | TheWorx (HVAC Spec) | Gap |
|---------|---------------------|---------------------|-----|
| **Auth & Users** | ✅ JWT, roles, multi-tenant | ✅ Same pattern | None |
| **Customers** | ✅ Full CRUD, addresses | ✅ Full CRUD, geo-location | Add geo-indexing |
| **Appointments/Jobs** | ✅ Scheduling, status tracking | ✅ More statuses, costing | Add job costing |
| **Staff/Technicians** | ✅ Basic management | ✅ GPS, skills, schedules | Add GPS tracking |
| **Services** | ✅ Generic services | ❌ Equipment-based | Need equipment catalog |
| **Payments** | ✅ Stripe integration | ✅ Same approach | None |
| **SMS** | ✅ Twilio reminders | ✅ Same + templates | Add template editor |
| **Route Optimization** | ✅ Basic routing | ✅ Smart dispatch | Similar |
| **Analytics** | ✅ Dashboard | ✅ Job costing analytics | Add margin tracking |
| **QuickBooks** | ✅ Sync | ✅ Sync | None |
| **Load Calculator** | ❌ Not needed | ✅ Duculator | **NEW** |
| **Equipment Matcher** | ❌ Not applicable | ✅ Good/Better/Best | **NEW** |
| **Pricing Engine** | ❌ Simple pricing | ✅ Margin-based | **NEW** |
| **PDF Quotes** | ❌ Not implemented | ✅ WeasyPrint | **NEW** |
| **Voice AI** | ✅ ElevenLabs | ✅ Same | None |
| **Inventory** | ❌ Not implemented | ✅ Full system | **NEW** |
| **Purchase Orders** | ❌ Not implemented | ✅ Distributor orders | **NEW** |

---

## HVAC-Specific Features Needed

### 1. **Duculator (Load Calculator)** - HIGH PRIORITY
Calculates HVAC system size based on property characteristics.

**Inputs:**
- ZIP code → climate zone lookup
- Square footage
- Sun exposure (shady/partial/full)
- Occupancy count
- Ceiling height
- Insulation quality (poor/average/good)
- Window percentage

**Outputs:**
- BTU (heating/cooling capacity)
- Tons (1 ton = 12,000 BTU)
- CFM (airflow)
- Duct sizing recommendations

**Implementation:** New service + API endpoint + frontend wizard

### 2. **Equipment Catalog** - HIGH PRIORITY
HVAC equipment database with tiered options.

**Fields:**
- Brand, Model, SKU
- Tier (Good/Better/Best)
- Tonnage (1.5-5 tons)
- SEER rating (efficiency)
- CFM capacity
- Contractor cost vs MSRP
- Warranty details
- Distributor info
- Stock status, lead time

**Implementation:** New collection + seed data + admin UI

### 3. **Job Pricing Engine** - HIGH PRIORITY
Calculate job cost with margins.

**Components:**
- Equipment cost
- Materials (based on tonnage/ducts)
- Labor hours × rate
- Overhead percentage
- Profit margin
- Total with breakdown

**Implementation:** New pricing service

### 4. **PDF Quote Generation** - MEDIUM PRIORITY
Generate professional quotes for customers.

**Contents:**
- Company branding
- Customer info
- Property details
- Load calculation results
- Equipment options comparison
- Line item breakdown
- Terms and conditions
- Signature line

**Implementation:** WeasyPrint or ReportLab

### 5. **Inventory Management** - MEDIUM PRIORITY
Track parts and materials.

**Features:**
- Item catalog with costs
- Quantity on hand
- Reorder points
- Usage tracking per job
- Purchase order generation

### 6. **Distributor Integration** - LOW PRIORITY (Phase 2)
Connect with HVAC distributors.

**Features:**
- Import price lists
- Check stock availability
- Create purchase orders
- Track deliveries

---

## Architecture Approach

### Option A: Add HVAC as ServicePro Vertical (RECOMMENDED)

**Pros:**
- Leverage existing auth, users, customers, payments
- Single codebase to maintain
- Shared mobile app with vertical switcher
- Faster time to market

**Cons:**
- Some refactoring needed
- More complex routing logic

**Implementation:**
1. Add `vertical: "hvac"` to business model (already exists!)
2. Create HVAC-specific services in `/backend/app/services/hvac/`
3. Create HVAC-specific routes in `/backend/app/routers/hvac/`
4. Add equipment collection and models
5. Build Duculator wizard in frontend
6. Add PDF generation

### Option B: Build Separate TheWorx App

**Pros:**
- Clean slate, no legacy code
- Fully optimized for HVAC

**Cons:**
- Duplicate effort (auth, payments, SMS, etc.)
- Two codebases to maintain
- Longer development time

---

## Implementation Plan (Option A - Add to ServicePro)

### Phase 1: HVAC Core (4-6 weeks)

#### Backend
```
backend/app/
├── services/
│   └── hvac/
│       ├── __init__.py
│       ├── load_calculator.py    # BTU/ton/CFM calculations
│       ├── equipment_matcher.py  # Good/Better/Best selection
│       ├── pricing_engine.py     # Job costing with margins
│       └── quote_generator.py    # PDF generation
├── routers/
│   └── hvac/
│       ├── __init__.py
│       ├── calculate.py          # Load calculation endpoints
│       ├── equipment.py          # Equipment catalog
│       └── jobs.py               # HVAC-specific job endpoints
├── models/
│   ├── hvac_equipment.py         # Equipment catalog model
│   ├── hvac_job.py               # Extended job with load calc
│   └── hvac_quote.py             # Quote model
└── data/
    ├── climate_zones.json        # ZIP → climate mapping
    └── equipment_seed.json       # Initial equipment data
```

#### Frontend (Mobile)
```
frontend/app/
└── (tabs)/
    └── hvac/
        ├── _layout.tsx
        ├── index.tsx             # HVAC dashboard
        ├── estimate.tsx          # New estimate wizard
        ├── equipment.tsx         # Equipment catalog
        └── [jobId].tsx           # Job detail with HVAC data
```

### Phase 2: Advanced Features (4 weeks)
- Inventory management
- Purchase orders
- Distributor price lists
- Enhanced reporting

### Phase 3: AI Enhancements (4 weeks)
- Photo analysis (diagnose issues from photos)
- Voice notes transcription
- Smart troubleshooting assistant

---

## Database Changes Needed

### New Collections

#### hvac_equipment
```python
{
  "_id": ObjectId,
  "brand": str,
  "model": str,
  "tier": "good" | "better" | "best",
  "type": "ac" | "heat_pump" | "furnace" | "air_handler",
  "tons": float,
  "seer": float,
  "cfm": int,
  "cost": float,
  "msrp": float,
  "warranty": {...},
  "distributor": str,
  "in_stock": bool,
  "created_at": datetime
}
```

#### climate_zones
```python
{
  "_id": ObjectId,
  "zip_code": str,
  "region": str,
  "state": str,
  "design_temp_cooling": int,
  "design_temp_heating": int,
  "humidity_avg": float,
  "zone": int  # 1-7
}
```

### Extended Job Model
Add to existing appointments/jobs:
```python
"hvac_data": {
  "property": {
    "sqft": int,
    "sun_exposure": str,
    "occupancy": int,
    "ceiling_height": float,
    "insulation": str,
    "window_percentage": int
  },
  "load_calculation": {
    "btu": int,
    "tons": float,
    "cfm": int
  },
  "duct_sizing": {
    "supply_outlets": int,
    "return_size": str,
    "trunk_size": str
  },
  "equipment_id": ObjectId,
  "selected_tier": str
}
```

---

## Estimated Effort

| Component | Effort | Priority |
|-----------|--------|----------|
| Load Calculator Service | 3 days | High |
| Equipment Catalog | 2 days | High |
| Pricing Engine | 2 days | High |
| Calculate API Endpoints | 2 days | High |
| Equipment API Endpoints | 1 day | High |
| Climate Zone Data | 1 day | High |
| Equipment Seed Data | 2 days | High |
| Frontend Estimate Wizard | 5 days | High |
| Equipment Selection UI | 3 days | High |
| PDF Quote Generation | 3 days | Medium |
| Inventory Management | 5 days | Medium |
| Purchase Orders | 3 days | Low |

**Total: ~32 days of development**

---

## Quick Start: Load Calculator Algorithm

```python
# Simplified Manual J load calculation
def calculate_load(
    sqft: int,
    design_temp: int,  # From climate zone
    sun_exposure: str,  # shady/partial/full
    occupancy: int,
    ceiling_height: float,
    insulation: str,  # poor/average/good
    window_percentage: int
) -> dict:
    # Base BTU: 20-25 BTU per sqft
    base_btu_per_sqft = 22

    # Adjustments
    sun_factor = {"shady": 0.9, "partial": 1.0, "full": 1.1}[sun_exposure]
    insulation_factor = {"poor": 1.15, "average": 1.0, "good": 0.85}[insulation]
    ceiling_factor = ceiling_height / 8  # Baseline 8ft
    window_factor = 1 + (window_percentage - 15) * 0.01
    occupancy_factor = 1 + (occupancy - 2) * 0.02

    # Calculate
    btu = int(sqft * base_btu_per_sqft
              * sun_factor
              * insulation_factor
              * ceiling_factor
              * window_factor
              * occupancy_factor)

    tons = round(btu / 12000, 1)
    cfm = int(tons * 400)  # 400 CFM per ton

    return {
        "btu": btu,
        "tons": tons,
        "cfm": cfm,
        "supply_outlets": int(cfm / 100)  # ~100 CFM per outlet
    }
```

---

## Next Steps

1. **Confirm approach**: Add to ServicePro vs new app
2. **Get climate zone data**: ZIP code to climate mapping
3. **Get equipment data**: Brands, models, pricing
4. **Build load calculator service**: Core algorithm
5. **Create equipment catalog**: Database + API
6. **Build estimate wizard**: Frontend UI
7. **Add PDF generation**: Quotes

Would you like me to start implementing any of these components?
