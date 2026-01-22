# ServicePro Modular Vertical Architecture

## Overview

ServicePro uses a modular vertical architecture that allows service businesses to enable/disable specific verticals (lawn care, HVAC, plumbing, etc.) independently. Each vertical is a self-contained module that can be added or removed without affecting other parts of the system.

## Key Benefits

1. **Independent Verticals**: Exit one vertical without losing others
2. **Self-Contained Modules**: Each vertical has its own routes, services, and data
3. **Dynamic Loading**: Routes are loaded based on enabled verticals
4. **Data Isolation**: Vertical data is archived (not deleted) when disabled
5. **Easy Extension**: Add new verticals by following a simple pattern

## Architecture

```
backend/app/verticals/
├── __init__.py           # Package exports
├── registry.py           # VerticalRegistry - central management
├── base/
│   └── __init__.py       # BaseVertical abstract class
├── lawn_care/
│   ├── __init__.py       # LawnCareVertical implementation
│   └── router.py         # Lawn care specific endpoints
├── hvac/
│   ├── __init__.py       # HVACVertical implementation
│   └── router.py         # HVAC specific endpoints
└── [future_vertical]/
    ├── __init__.py
    └── router.py
```

## Core Components

### 1. BaseVertical (Abstract Class)

All verticals must extend `BaseVertical` and implement these methods:

```python
from app.verticals.base import BaseVertical, VerticalConfig

class MyVertical(BaseVertical):
    @property
    def config(self) -> VerticalConfig:
        """Return vertical configuration"""
        return VerticalConfig(
            vertical_id="my_vertical",
            name="my_vertical",
            display_name="My Vertical",
            description="Description here",
            features=[...],
            ...
        )

    def get_router(self) -> Optional[APIRouter]:
        """Return FastAPI router for this vertical"""
        from .router import router
        return router

    def get_default_services(self) -> List[VerticalServiceConfig]:
        """Return default services for this vertical"""
        return [...]

    # Optional overrides:
    def get_collections(self) -> List[str]: ...
    def get_indexes(self) -> List[Dict]: ...
    async def on_enable(self, business_id: str): ...
    async def on_disable(self, business_id: str): ...
```

### 2. VerticalRegistry

The registry manages all registered verticals:

```python
from app.verticals import vertical_registry

# Check if vertical exists
vertical_registry.has_vertical("hvac")  # True/False

# Get a vertical
hvac = vertical_registry.get_vertical("hvac")

# List all verticals
all_verticals = vertical_registry.get_vertical_ids()  # ["lawn_care", "hvac"]

# Enable/disable for a business
await vertical_registry.enable_vertical_for_business("hvac", business_id)
await vertical_registry.disable_vertical_for_business("hvac", business_id)
```

### 3. VerticalConfig

Configuration schema for each vertical:

```python
VerticalConfig(
    vertical_id="hvac",           # Unique identifier
    name="hvac",                  # Internal name
    display_name="HVAC",          # User-facing name
    description="...",            # Description
    icon="thermometer",           # UI icon
    color="#2196F3",              # Brand color
    features=[                    # Available features
        VerticalFeature.SCHEDULING,
        VerticalFeature.LOAD_CALCULATOR,
        ...
    ],
    has_custom_pricing=True,      # Uses custom pricing logic
    pricing_unit="per_job",       # Pricing model
    requires_equipment_catalog=True,
    requires_climate_data=True,
    default_service_duration_minutes=120,
    api_prefix="/hvac",           # URL prefix for routes
)
```

## Available Features

Verticals can declare which features they support:

| Feature | Description | Example Verticals |
|---------|-------------|-------------------|
| `SCHEDULING` | Appointment scheduling | All |
| `INVOICING` | Invoice generation | All |
| `CUSTOMER_PORTAL` | Client self-service | All |
| `LOAD_CALCULATOR` | Load/capacity calculations | HVAC, Electrical |
| `SQUARE_FOOTAGE` | Area-based pricing | Lawn, Cleaning, Painting |
| `EQUIPMENT_CATALOG` | Equipment inventory | HVAC, Pool |
| `EQUIPMENT_TIERS` | Good/Better/Best options | HVAC |
| `QUOTE_BUILDER` | Complex quote generation | HVAC, Roofing |
| `PDF_PROPOSALS` | PDF proposal generation | HVAC, Contracting |
| `RECURRING_SERVICES` | Recurring appointments | Lawn, Cleaning |
| `MAINTENANCE_PLANS` | Service contracts | HVAC, Pool |
| `ROUTE_OPTIMIZATION` | Daily route planning | Lawn, Cleaning |
| `WEATHER_INTEGRATION` | Weather-based scheduling | Lawn |
| `INVENTORY_MANAGEMENT` | Parts/materials tracking | HVAC, Plumbing |
| `DIAGNOSTIC_TOOLS` | System diagnostics | HVAC, Auto |

## API Endpoints

### Vertical Management (`/api/v1/verticals`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | List all verticals and their status |
| `/enable` | POST | Enable a vertical for business |
| `/disable/{id}` | POST | Disable a vertical |
| `/{id}/config` | GET | Get vertical configuration |
| `/{id}/config` | PUT | Update vertical configuration |
| `/{id}/services` | GET | Get default services |
| `/{id}/dashboard` | GET | Get dashboard widgets |

### Vertical-Specific Routes

Each vertical registers its own routes under its prefix:

**Lawn Care** (`/api/v1/lawn-care`):
- `POST /properties` - Create lawn property
- `GET /properties` - List properties
- `POST /treatments` - Record treatment
- `GET /treatments/{property_id}/history` - Treatment history
- `POST /estimate` - Calculate price estimate
- `GET /programs` - List lawn programs

**HVAC** (`/api/v1/hvac`):
- `POST /calculate-load` - Calculate HVAC load
- `GET /load-calculations` - List calculations
- `GET /equipment` - List equipment catalog
- `POST /equipment` - Add equipment
- `POST /quotes` - Create job quote
- `GET /quotes` - List quotes
- `GET /maintenance` - List maintenance contracts
- `GET /maintenance/due` - Get due maintenance

## Adding a New Vertical

1. Create the vertical directory:
```bash
mkdir -p backend/app/verticals/plumbing
```

2. Create `__init__.py` with vertical class:
```python
from app.verticals.base import BaseVertical, VerticalConfig, VerticalServiceConfig
from app.verticals.registry import vertical_registry

class PlumbingVertical(BaseVertical):
    @property
    def config(self) -> VerticalConfig:
        return VerticalConfig(
            vertical_id="plumbing",
            name="plumbing",
            display_name="Plumbing",
            # ...
        )

    def get_router(self):
        from .router import router
        return router

    def get_default_services(self):
        return [
            VerticalServiceConfig(
                service_id="drain_cleaning",
                name="Drain Cleaning",
                # ...
            ),
        ]

# Register the vertical
plumbing_vertical = PlumbingVertical()
vertical_registry.register(plumbing_vertical)
```

3. Create `router.py` with endpoints:
```python
from fastapi import APIRouter
router = APIRouter()

@router.get("/service-areas")
async def list_service_areas():
    # ...
```

4. Import in `server.py`:
```python
from app.verticals import plumbing  # noqa: F401
```

## Business Configuration

Each business can enable multiple verticals:

```python
# Business model
class BusinessConfig(BaseModel):
    # ...
    enabled_verticals: List[VerticalSettings]
    vertical_configs: Dict[str, Dict[str, Any]]

class VerticalSettings(BaseModel):
    vertical_id: str
    enabled: bool
    enabled_at: Optional[str]
    disabled_at: Optional[str]
    custom_config: Dict[str, Any]
```

**Example API calls:**

```bash
# Enable HVAC for business
POST /api/v1/verticals/enable
{
  "vertical_id": "hvac",
  "custom_config": {
    "labor_rate": 95.00,
    "default_margin": 35
  }
}

# Disable lawn care (archives data, doesn't delete)
POST /api/v1/verticals/disable/lawn_care

# Get current vertical status
GET /api/v1/verticals/
```

## Data Lifecycle

When a vertical is **enabled**:
1. `on_enable()` callback runs
2. Default data is seeded (equipment, programs, etc.)
3. Routes become available
4. Dashboard widgets activate

When a vertical is **disabled**:
1. `on_disable()` callback runs
2. Data is **archived** (not deleted)
3. Routes return 403 for that vertical
4. Dashboard widgets hide

When a vertical is **re-enabled**:
1. Archived data is restored
2. New defaults are not re-seeded (existing data preserved)

## Current Verticals

### Lawn Care (`lawn_care`)
Primary vertical for MowTime. Includes:
- Property management (lot size, grass type)
- Treatment tracking
- Recurring service programs
- Weather-based scheduling
- Route optimization

### HVAC (`hvac`)
Full HVAC contractor features:
- Load calculator (simplified Manual J)
- Equipment catalog (Good/Better/Best tiers)
- Job quoting with margins
- Maintenance contracts
- Refrigerant tracking

## Future Verticals (Planned)

- **Plumbing**: Service calls, parts inventory
- **Electrical**: Load calculations, panel upgrades
- **Cleaning**: Square footage pricing, recurring schedules
- **Pool Service**: Chemical tracking, equipment maintenance
- **Pest Control**: Treatment schedules, inspection reports

## Testing Verticals

```python
import pytest
from app.verticals import vertical_registry

def test_vertical_registration():
    assert vertical_registry.has_vertical("lawn_care")
    assert vertical_registry.has_vertical("hvac")

def test_vertical_config():
    hvac = vertical_registry.get_vertical("hvac")
    assert hvac.config.display_name == "HVAC"
    assert VerticalFeature.LOAD_CALCULATOR in hvac.config.features

async def test_enable_vertical():
    success = await vertical_registry.enable_vertical_for_business(
        "hvac", "test_business_123"
    )
    assert success
```
