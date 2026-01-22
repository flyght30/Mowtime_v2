"""
HVAC Vertical Module

Provides HVAC-specific functionality including:
- Load calculation (simplified Manual J)
- Equipment catalog with Good/Better/Best tiers
- Job pricing engine
- Maintenance plan management
- Diagnostic tools integration
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


class HVACVertical(BaseVertical):
    """
    HVAC (Heating, Ventilation, Air Conditioning) service vertical.

    Features:
    - Load calculator (BTU/tons/CFM)
    - Equipment catalog with tiered options
    - Job pricing with materials and labor
    - Maintenance contracts
    - Refrigerant tracking
    """

    @property
    def config(self) -> VerticalConfig:
        return VerticalConfig(
            vertical_id="hvac",
            name="hvac",
            display_name="HVAC",
            description="Heating, ventilation, and air conditioning services",
            icon="thermometer",
            color="#2196F3",  # Blue
            features=[
                VerticalFeature.SCHEDULING,
                VerticalFeature.INVOICING,
                VerticalFeature.CUSTOMER_PORTAL,
                VerticalFeature.LOAD_CALCULATOR,
                VerticalFeature.EQUIPMENT_CATALOG,
                VerticalFeature.EQUIPMENT_TIERS,
                VerticalFeature.QUOTE_BUILDER,
                VerticalFeature.PDF_PROPOSALS,
                VerticalFeature.MAINTENANCE_PLANS,
                VerticalFeature.PARTS_CATALOG,
                VerticalFeature.INVENTORY_MANAGEMENT,
                VerticalFeature.DIAGNOSTIC_TOOLS,
            ],
            has_custom_pricing=True,
            pricing_unit="per_job",
            requires_equipment_catalog=True,
            requires_climate_data=True,
            default_service_duration_minutes=120,
            appointment_fields=[
                "system_type",
                "system_age",
                "square_footage",
                "floor_count",
                "last_service_date",
            ],
            api_prefix="/hvac",
        )

    def get_router(self) -> Optional[APIRouter]:
        """Return the HVAC specific API router."""
        from app.verticals.hvac.router import router
        return router

    def get_default_services(self) -> List[VerticalServiceConfig]:
        """Return default HVAC services."""
        return [
            # Maintenance
            VerticalServiceConfig(
                service_id="hvac_tune_up",
                name="AC/Furnace Tune-Up",
                description="Comprehensive system inspection and tune-up",
                base_price=129.00,
                duration_minutes=90,
                is_recurring=True,
                recurring_interval_days=180,
                category="maintenance",
            ),
            VerticalServiceConfig(
                service_id="hvac_maintenance_plan",
                name="Annual Maintenance Plan",
                description="2 tune-ups per year with priority service",
                base_price=199.00,
                duration_minutes=90,
                is_recurring=True,
                recurring_interval_days=365,
                category="maintenance",
            ),

            # Repairs
            VerticalServiceConfig(
                service_id="hvac_diagnostic",
                name="Diagnostic Service Call",
                description="Diagnose AC or heating system issues",
                base_price=89.00,
                duration_minutes=60,
                is_recurring=False,
                category="repair",
            ),
            VerticalServiceConfig(
                service_id="hvac_repair",
                name="System Repair",
                description="Repair service (parts additional)",
                base_price=0.00,
                duration_minutes=120,
                is_recurring=False,
                category="repair",
                requires_quote=True,
            ),
            VerticalServiceConfig(
                service_id="refrigerant_recharge",
                name="Refrigerant Recharge",
                description="Check for leaks and recharge refrigerant",
                base_price=150.00,
                duration_minutes=90,
                is_recurring=False,
                category="repair",
                custom_fields={"per_pound_charge": 50.00},
            ),

            # Installation
            VerticalServiceConfig(
                service_id="hvac_install_ac",
                name="AC System Installation",
                description="Full air conditioning system replacement",
                base_price=0.00,
                duration_minutes=480,
                is_recurring=False,
                category="installation",
                requires_quote=True,
            ),
            VerticalServiceConfig(
                service_id="hvac_install_furnace",
                name="Furnace Installation",
                description="Furnace replacement or new installation",
                base_price=0.00,
                duration_minutes=480,
                is_recurring=False,
                category="installation",
                requires_quote=True,
            ),
            VerticalServiceConfig(
                service_id="hvac_install_complete",
                name="Complete HVAC System",
                description="Full system replacement (AC + Furnace)",
                base_price=0.00,
                duration_minutes=720,
                is_recurring=False,
                category="installation",
                requires_quote=True,
            ),
            VerticalServiceConfig(
                service_id="hvac_install_mini_split",
                name="Mini-Split Installation",
                description="Ductless mini-split system installation",
                base_price=0.00,
                duration_minutes=360,
                is_recurring=False,
                category="installation",
                requires_quote=True,
            ),

            # Indoor Air Quality
            VerticalServiceConfig(
                service_id="duct_cleaning",
                name="Duct Cleaning",
                description="Professional air duct cleaning service",
                base_price=399.00,
                duration_minutes=180,
                is_recurring=True,
                recurring_interval_days=730,
                category="air_quality",
            ),
            VerticalServiceConfig(
                service_id="air_purifier_install",
                name="Air Purifier Installation",
                description="Whole-home air purification system",
                base_price=0.00,
                duration_minutes=120,
                is_recurring=False,
                category="air_quality",
                requires_quote=True,
            ),
        ]

    def get_collections(self) -> List[str]:
        """Return MongoDB collections used by HVAC vertical."""
        return [
            "hvac_equipment",        # Equipment catalog
            "hvac_load_calcs",       # Load calculations
            "hvac_quotes",           # Job quotes/proposals
            "hvac_jobs",             # Installation jobs
            "hvac_maintenance",      # Maintenance contracts
            "hvac_refrigerant_log",  # Refrigerant tracking (EPA compliance)
            "hvac_inventory",        # Parts inventory
        ]

    def get_indexes(self) -> List[Dict[str, Any]]:
        """Return MongoDB indexes for HVAC collections."""
        return [
            {
                "collection": "hvac_equipment",
                "keys": [("category", 1), ("tier", 1)],
                "options": {},
            },
            {
                "collection": "hvac_equipment",
                "keys": [("business_id", 1), ("is_active", 1)],
                "options": {},
            },
            {
                "collection": "hvac_load_calcs",
                "keys": [("business_id", 1), ("client_id", 1)],
                "options": {},
            },
            {
                "collection": "hvac_quotes",
                "keys": [("business_id", 1), ("status", 1)],
                "options": {},
            },
            {
                "collection": "hvac_jobs",
                "keys": [("business_id", 1), ("scheduled_date", 1)],
                "options": {},
            },
            {
                "collection": "hvac_maintenance",
                "keys": [("business_id", 1), ("next_service_date", 1)],
                "options": {},
            },
            {
                "collection": "hvac_refrigerant_log",
                "keys": [("business_id", 1), ("service_date", -1)],
                "options": {},
            },
        ]

    async def on_enable(self, business_id: str) -> None:
        """Initialize HVAC vertical for a business."""
        from app.database import Database

        # Seed default equipment catalog
        default_equipment = self._get_default_equipment_catalog(business_id)

        if Database.db:
            # Insert default equipment if not exists
            existing = await Database.db.hvac_equipment.count_documents({
                "business_id": business_id
            })
            if existing == 0:
                await Database.db.hvac_equipment.insert_many(default_equipment)

    async def on_disable(self, business_id: str) -> None:
        """Archive HVAC data for a business (does not delete)."""
        from app.database import Database
        from datetime import datetime

        if Database.db:
            # Archive all HVAC data
            archive_time = datetime.utcnow().isoformat()
            for collection in self.get_collections():
                await Database.db[collection].update_many(
                    {"business_id": business_id},
                    {"$set": {"archived": True, "archived_at": archive_time}}
                )

    def _get_default_equipment_catalog(self, business_id: str) -> List[Dict[str, Any]]:
        """Return default HVAC equipment catalog."""
        from app.models.common import generate_id

        equipment = []

        # Air Conditioners - Good/Better/Best
        ac_tiers = [
            {
                "tier": "good",
                "name": "Standard Efficiency AC",
                "brand": "Generic",
                "model": "AC-14SEER",
                "seer": 14,
                "base_cost": 2500,
                "labor_hours": 6,
            },
            {
                "tier": "better",
                "name": "High Efficiency AC",
                "brand": "Generic",
                "model": "AC-16SEER",
                "seer": 16,
                "base_cost": 3500,
                "labor_hours": 6,
            },
            {
                "tier": "best",
                "name": "Premium Variable Speed AC",
                "brand": "Generic",
                "model": "AC-20SEER",
                "seer": 20,
                "base_cost": 5500,
                "labor_hours": 8,
            },
        ]

        for tier_data in ac_tiers:
            for tons in [1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0]:
                equipment.append({
                    "equipment_id": generate_id("equip"),
                    "business_id": business_id,
                    "category": "air_conditioner",
                    "type": "central_ac",
                    "tier": tier_data["tier"],
                    "name": f"{tier_data['name']} - {tons} Ton",
                    "brand": tier_data["brand"],
                    "model": f"{tier_data['model']}-{int(tons*12)}",
                    "capacity_tons": tons,
                    "capacity_btu": int(tons * 12000),
                    "seer": tier_data["seer"],
                    "cost": tier_data["base_cost"] + (tons - 1.5) * 400,
                    "labor_hours": tier_data["labor_hours"],
                    "warranty_years": 5 if tier_data["tier"] == "good" else 10,
                    "is_active": True,
                })

        # Furnaces - Good/Better/Best
        furnace_tiers = [
            {
                "tier": "good",
                "name": "Standard Efficiency Furnace",
                "brand": "Generic",
                "model": "FUR-80AFUE",
                "afue": 80,
                "base_cost": 1500,
                "labor_hours": 6,
            },
            {
                "tier": "better",
                "name": "High Efficiency Furnace",
                "brand": "Generic",
                "model": "FUR-92AFUE",
                "afue": 92,
                "base_cost": 2500,
                "labor_hours": 6,
            },
            {
                "tier": "best",
                "name": "Premium Modulating Furnace",
                "brand": "Generic",
                "model": "FUR-98AFUE",
                "afue": 98,
                "base_cost": 4000,
                "labor_hours": 8,
            },
        ]

        for tier_data in furnace_tiers:
            for btu in [40000, 60000, 80000, 100000, 120000]:
                equipment.append({
                    "equipment_id": generate_id("equip"),
                    "business_id": business_id,
                    "category": "furnace",
                    "type": "gas_furnace",
                    "tier": tier_data["tier"],
                    "name": f"{tier_data['name']} - {btu//1000}K BTU",
                    "brand": tier_data["brand"],
                    "model": f"{tier_data['model']}-{btu//1000}",
                    "capacity_btu": btu,
                    "afue": tier_data["afue"],
                    "cost": tier_data["base_cost"] + (btu - 40000) // 20000 * 200,
                    "labor_hours": tier_data["labor_hours"],
                    "warranty_years": 5 if tier_data["tier"] == "good" else 10,
                    "is_active": True,
                })

        return equipment

    def get_dashboard_widgets(self) -> List[Dict[str, Any]]:
        """Return HVAC dashboard widgets."""
        return [
            {
                "type": "stat",
                "title": "Pending Quotes",
                "data_source": "hvac_quotes_pending",
                "icon": "document",
            },
            {
                "type": "stat",
                "title": "Installations This Week",
                "data_source": "hvac_installs_weekly",
                "icon": "wrench",
            },
            {
                "type": "stat",
                "title": "Maintenance Due",
                "data_source": "hvac_maintenance_due",
                "icon": "calendar",
            },
            {
                "type": "chart",
                "title": "Quote Conversion Rate",
                "data_source": "quote_conversion",
                "chart_type": "line",
            },
            {
                "type": "list",
                "title": "Recent Load Calculations",
                "data_source": "recent_load_calcs",
                "max_items": 5,
            },
        ]

    def get_reports(self) -> List[Dict[str, Any]]:
        """Return available HVAC reports."""
        return [
            {
                "id": "quote_analysis",
                "name": "Quote Analysis Report",
                "description": "Track quote conversion rates and average job values",
            },
            {
                "id": "equipment_sales",
                "name": "Equipment Sales Report",
                "description": "Equipment sold by tier and category",
            },
            {
                "id": "refrigerant_tracking",
                "name": "Refrigerant Tracking Report",
                "description": "EPA compliance report for refrigerant usage",
            },
            {
                "id": "maintenance_renewals",
                "name": "Maintenance Plan Renewals",
                "description": "Upcoming and lapsed maintenance contracts",
            },
            {
                "id": "technician_productivity",
                "name": "Technician Productivity",
                "description": "Jobs completed and revenue by technician",
            },
        ]


# Register the vertical
hvac_vertical = HVACVertical()
vertical_registry.register(hvac_vertical)

__all__ = ["HVACVertical", "hvac_vertical"]
