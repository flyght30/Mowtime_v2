"""
Base Vertical Module

Provides the abstract base class and interfaces that all verticals must implement.
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Any, Type
from enum import Enum
from pydantic import BaseModel, Field
from fastapi import APIRouter


class VerticalFeature(str, Enum):
    """Standard features that verticals can provide"""
    # Core features (most verticals have these)
    SCHEDULING = "scheduling"
    INVOICING = "invoicing"
    CUSTOMER_PORTAL = "customer_portal"

    # Estimation features
    LOAD_CALCULATOR = "load_calculator"      # HVAC, electrical
    SQUARE_FOOTAGE = "square_footage"        # Lawn, cleaning, painting
    MATERIALS_ESTIMATOR = "materials_estimator"  # Roofing, plumbing

    # Equipment features
    EQUIPMENT_CATALOG = "equipment_catalog"  # HVAC, pool
    EQUIPMENT_TIERS = "equipment_tiers"      # Good/Better/Best

    # Inventory
    INVENTORY_MANAGEMENT = "inventory_management"
    PARTS_CATALOG = "parts_catalog"

    # Quotes/Proposals
    QUOTE_BUILDER = "quote_builder"
    PDF_PROPOSALS = "pdf_proposals"

    # Recurring
    RECURRING_SERVICES = "recurring_services"
    SERVICE_CONTRACTS = "service_contracts"
    MAINTENANCE_PLANS = "maintenance_plans"

    # Specialized
    ROUTE_OPTIMIZATION = "route_optimization"
    WEATHER_INTEGRATION = "weather_integration"
    DIAGNOSTIC_TOOLS = "diagnostic_tools"


class VerticalConfig(BaseModel):
    """Configuration schema for a vertical"""
    # Vertical identity
    vertical_id: str
    name: str
    display_name: str
    description: str
    icon: str = "briefcase"  # Icon name for UI
    color: str = "#4CAF50"   # Brand color

    # Feature flags
    features: List[VerticalFeature] = Field(default_factory=list)

    # Pricing
    has_custom_pricing: bool = False
    pricing_unit: str = "per_job"  # per_job, per_hour, per_sqft, etc.

    # Data requirements
    requires_equipment_catalog: bool = False
    requires_climate_data: bool = False
    requires_materials_db: bool = False

    # UI customization
    default_service_duration_minutes: int = 60
    appointment_fields: List[str] = Field(default_factory=list)  # Custom fields

    # API configuration
    api_prefix: str = ""  # e.g., "/hvac" - set automatically if empty


class VerticalServiceConfig(BaseModel):
    """Configuration for vertical-specific services that a business offers"""
    service_id: str
    name: str
    description: Optional[str] = None
    base_price: float = 0.0
    duration_minutes: int = 60
    is_recurring: bool = False
    recurring_interval_days: Optional[int] = None
    category: str = "general"
    requires_quote: bool = False
    custom_fields: Dict[str, Any] = Field(default_factory=dict)


class BaseVertical(ABC):
    """
    Abstract base class for all service verticals.

    Each vertical must implement this interface to be registered
    with the system. Verticals are self-contained modules that
    can be enabled/disabled per business.

    Example:
        class HVACVertical(BaseVertical):
            @property
            def config(self) -> VerticalConfig:
                return VerticalConfig(
                    vertical_id="hvac",
                    name="hvac",
                    display_name="HVAC",
                    ...
                )
    """

    @property
    @abstractmethod
    def config(self) -> VerticalConfig:
        """Return the vertical's configuration"""
        pass

    @property
    def vertical_id(self) -> str:
        """Shortcut to get vertical ID"""
        return self.config.vertical_id

    @property
    def name(self) -> str:
        """Shortcut to get vertical name"""
        return self.config.name

    @abstractmethod
    def get_router(self) -> Optional[APIRouter]:
        """
        Return the FastAPI router for this vertical's endpoints.
        Return None if the vertical has no custom endpoints.
        """
        pass

    @abstractmethod
    def get_default_services(self) -> List[VerticalServiceConfig]:
        """
        Return a list of default services for this vertical.
        These are seeded when a business first enables the vertical.
        """
        pass

    def get_models(self) -> List[Type[BaseModel]]:
        """
        Return Pydantic models specific to this vertical.
        Override in subclasses to register vertical-specific models.
        """
        return []

    def get_collections(self) -> List[str]:
        """
        Return MongoDB collection names used by this vertical.
        Override in subclasses to declare database collections.
        """
        return []

    def get_indexes(self) -> List[Dict[str, Any]]:
        """
        Return MongoDB indexes for this vertical's collections.
        Format: [{"collection": "name", "keys": [("field", 1)], "options": {}}]
        """
        return []

    async def on_enable(self, business_id: str) -> None:
        """
        Called when a business enables this vertical.
        Override to perform setup tasks (seed data, create records, etc.)
        """
        pass

    async def on_disable(self, business_id: str) -> None:
        """
        Called when a business disables this vertical.
        Override to perform cleanup (archive data, etc.)
        Note: Should NOT delete data - just archive/disable.
        """
        pass

    def validate_business_config(self, config: Dict[str, Any]) -> bool:
        """
        Validate business-specific configuration for this vertical.
        Override to add custom validation logic.
        """
        return True

    def get_dashboard_widgets(self) -> List[Dict[str, Any]]:
        """
        Return dashboard widget configurations for this vertical.
        Format: [{"type": "chart", "title": "...", "data_source": "..."}]
        """
        return []

    def get_reports(self) -> List[Dict[str, Any]]:
        """
        Return available reports for this vertical.
        Format: [{"id": "...", "name": "...", "description": "..."}]
        """
        return []


__all__ = [
    "BaseVertical",
    "VerticalConfig",
    "VerticalServiceConfig",
    "VerticalFeature",
]
