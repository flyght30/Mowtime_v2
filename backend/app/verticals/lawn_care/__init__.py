"""
Lawn Care Vertical Module

This is the primary vertical for ServicePro (MowTime).
Provides lawn care specific functionality including:
- Lawn mowing scheduling
- Fertilization programs
- Weed control
- Aeration and overseeding
- Leaf removal
- Weather-based rescheduling
"""

from typing import List, Optional, Dict, Any
from fastapi import APIRouter

from app.verticals.base import (
    BaseVertical,
    VerticalConfig,
    VerticalServiceConfig,
    VerticalFeature,
)
from app.verticals.registry import vertical_registry


class LawnCareVertical(BaseVertical):
    """
    Lawn Care service vertical implementation.

    Features:
    - Square footage-based pricing
    - Recurring service schedules
    - Weather integration for rescheduling
    - Route optimization for daily schedules
    - Seasonal service packages
    """

    @property
    def config(self) -> VerticalConfig:
        return VerticalConfig(
            vertical_id="lawn_care",
            name="lawn_care",
            display_name="Lawn Care",
            description="Professional lawn mowing, fertilization, and maintenance services",
            icon="grass",
            color="#4CAF50",  # Green
            features=[
                VerticalFeature.SCHEDULING,
                VerticalFeature.INVOICING,
                VerticalFeature.CUSTOMER_PORTAL,
                VerticalFeature.SQUARE_FOOTAGE,
                VerticalFeature.RECURRING_SERVICES,
                VerticalFeature.ROUTE_OPTIMIZATION,
                VerticalFeature.WEATHER_INTEGRATION,
                VerticalFeature.MAINTENANCE_PLANS,
            ],
            has_custom_pricing=True,
            pricing_unit="per_sqft",
            requires_climate_data=True,
            default_service_duration_minutes=45,
            appointment_fields=[
                "lot_size_sqft",
                "grass_type",
                "obstacles",
                "gate_code",
            ],
            api_prefix="/lawn-care",
        )

    def get_router(self) -> Optional[APIRouter]:
        """Return the lawn care specific API router."""
        from app.verticals.lawn_care.router import router
        return router

    def get_default_services(self) -> List[VerticalServiceConfig]:
        """Return default lawn care services."""
        return [
            VerticalServiceConfig(
                service_id="lawn_mowing",
                name="Lawn Mowing",
                description="Weekly lawn mowing with trimming and edging",
                base_price=45.00,
                duration_minutes=45,
                is_recurring=True,
                recurring_interval_days=7,
                category="mowing",
            ),
            VerticalServiceConfig(
                service_id="lawn_mowing_biweekly",
                name="Bi-Weekly Lawn Mowing",
                description="Bi-weekly lawn mowing with trimming and edging",
                base_price=55.00,
                duration_minutes=45,
                is_recurring=True,
                recurring_interval_days=14,
                category="mowing",
            ),
            VerticalServiceConfig(
                service_id="fertilization",
                name="Fertilization Application",
                description="Professional fertilizer application for healthy growth",
                base_price=75.00,
                duration_minutes=30,
                is_recurring=True,
                recurring_interval_days=60,
                category="fertilization",
            ),
            VerticalServiceConfig(
                service_id="weed_control",
                name="Weed Control Treatment",
                description="Pre and post-emergent weed control",
                base_price=65.00,
                duration_minutes=30,
                is_recurring=True,
                recurring_interval_days=90,
                category="weed_control",
            ),
            VerticalServiceConfig(
                service_id="aeration",
                name="Core Aeration",
                description="Core aeration to reduce soil compaction",
                base_price=150.00,
                duration_minutes=60,
                is_recurring=True,
                recurring_interval_days=365,
                category="lawn_health",
            ),
            VerticalServiceConfig(
                service_id="overseeding",
                name="Overseeding",
                description="Overseed thin or bare areas",
                base_price=125.00,
                duration_minutes=45,
                is_recurring=False,
                category="lawn_health",
            ),
            VerticalServiceConfig(
                service_id="leaf_removal",
                name="Leaf Removal",
                description="Fall leaf cleanup and removal",
                base_price=100.00,
                duration_minutes=90,
                is_recurring=False,
                category="cleanup",
            ),
            VerticalServiceConfig(
                service_id="spring_cleanup",
                name="Spring Cleanup",
                description="Debris removal, bed edging, and first mow",
                base_price=175.00,
                duration_minutes=120,
                is_recurring=False,
                category="cleanup",
            ),
            VerticalServiceConfig(
                service_id="hedge_trimming",
                name="Hedge Trimming",
                description="Trim and shape hedges and shrubs",
                base_price=85.00,
                duration_minutes=60,
                is_recurring=True,
                recurring_interval_days=30,
                category="trimming",
            ),
            VerticalServiceConfig(
                service_id="mulch_installation",
                name="Mulch Installation",
                description="Fresh mulch installation in beds",
                base_price=0.00,  # Priced by yard
                duration_minutes=120,
                is_recurring=True,
                recurring_interval_days=365,
                category="beds",
                requires_quote=True,
                custom_fields={
                    "mulch_type": ["hardwood", "cedar", "pine", "rubber"],
                    "cubic_yards_needed": 0,
                    "price_per_yard": 75.00,
                },
            ),
        ]

    def get_collections(self) -> List[str]:
        """Return MongoDB collections used by lawn care vertical."""
        return [
            "lawn_properties",      # Property-specific lawn data
            "lawn_treatments",      # Treatment history
            "lawn_programs",        # Subscription programs
        ]

    def get_indexes(self) -> List[Dict[str, Any]]:
        """Return MongoDB indexes for lawn care collections."""
        return [
            {
                "collection": "lawn_properties",
                "keys": [("business_id", 1), ("client_id", 1)],
                "options": {},
            },
            {
                "collection": "lawn_treatments",
                "keys": [("property_id", 1), ("treatment_date", -1)],
                "options": {},
            },
            {
                "collection": "lawn_programs",
                "keys": [("business_id", 1), ("status", 1)],
                "options": {},
            },
        ]

    async def on_enable(self, business_id: str) -> None:
        """Initialize lawn care for a business."""
        from app.database import Database

        # Create default lawn care program templates
        default_programs = [
            {
                "business_id": business_id,
                "name": "Basic Lawn Care",
                "description": "Weekly mowing with seasonal fertilization",
                "services": ["lawn_mowing", "fertilization"],
                "annual_visits": 30,
                "is_template": True,
            },
            {
                "business_id": business_id,
                "name": "Premium Lawn Care",
                "description": "Weekly mowing, fertilization, weed control, and aeration",
                "services": ["lawn_mowing", "fertilization", "weed_control", "aeration"],
                "annual_visits": 35,
                "is_template": True,
            },
            {
                "business_id": business_id,
                "name": "Full Service",
                "description": "Complete lawn and landscape maintenance",
                "services": [
                    "lawn_mowing", "fertilization", "weed_control",
                    "aeration", "hedge_trimming", "spring_cleanup", "leaf_removal"
                ],
                "annual_visits": 45,
                "is_template": True,
            },
        ]

        if Database.db:
            await Database.db.lawn_programs.insert_many(default_programs)

    async def on_disable(self, business_id: str) -> None:
        """Archive lawn care data for a business (does not delete)."""
        from app.database import Database
        from datetime import datetime

        if Database.db:
            # Mark all programs as archived instead of deleting
            await Database.db.lawn_programs.update_many(
                {"business_id": business_id},
                {"$set": {"archived": True, "archived_at": datetime.utcnow().isoformat()}}
            )

    def get_dashboard_widgets(self) -> List[Dict[str, Any]]:
        """Return lawn care dashboard widgets."""
        return [
            {
                "type": "stat",
                "title": "Today's Lawns",
                "data_source": "appointments_today",
                "icon": "grass",
            },
            {
                "type": "stat",
                "title": "Weather Alert",
                "data_source": "weather_status",
                "icon": "cloud",
            },
            {
                "type": "chart",
                "title": "Weekly Revenue",
                "data_source": "revenue_weekly",
                "chart_type": "bar",
            },
            {
                "type": "list",
                "title": "Upcoming Treatments",
                "data_source": "upcoming_treatments",
                "max_items": 5,
            },
        ]

    def get_reports(self) -> List[Dict[str, Any]]:
        """Return available lawn care reports."""
        return [
            {
                "id": "route_efficiency",
                "name": "Route Efficiency Report",
                "description": "Analyze daily route optimization and drive times",
            },
            {
                "id": "treatment_history",
                "name": "Treatment History",
                "description": "All treatments applied by property",
            },
            {
                "id": "seasonal_revenue",
                "name": "Seasonal Revenue Analysis",
                "description": "Revenue breakdown by season and service type",
            },
            {
                "id": "client_retention",
                "name": "Client Retention Report",
                "description": "Track recurring client retention rates",
            },
        ]


# Register the vertical
lawn_care_vertical = LawnCareVertical()
vertical_registry.register(lawn_care_vertical)

__all__ = ["LawnCareVertical", "lawn_care_vertical"]
