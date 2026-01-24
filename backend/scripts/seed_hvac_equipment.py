#!/usr/bin/env python3
"""
HVAC Equipment Catalog Seed Script

Seeds the hvac_equipment collection with comprehensive equipment data
from major HVAC brands with Good/Better/Best tiers.

Usage:
    python scripts/seed_hvac_equipment.py [--business-id BUSINESS_ID]

If no business_id is provided, creates a demo business.
"""

import asyncio
import sys
import os
from datetime import datetime
from typing import List, Dict, Any

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.motor_asyncio import AsyncIOMotorClient
from app.models.common import generate_id
from app.config import get_settings

settings = get_settings()


def get_equipment_catalog(business_id: str) -> List[Dict[str, Any]]:
    """Generate comprehensive HVAC equipment catalog."""
    equipment = []
    now = datetime.utcnow().isoformat()

    # ==================== AIR CONDITIONERS ====================
    ac_models = [
        # Good Tier - Budget-friendly, standard efficiency
        {
            "tier": "good",
            "brand": "Goodman",
            "model_prefix": "GSXC14",
            "name_suffix": "14 SEER",
            "seer": 14,
            "base_cost": 1800,
            "labor_hours": 6,
            "warranty_years": 10,
        },
        {
            "tier": "good",
            "brand": "Rheem",
            "model_prefix": "RA14AZ",
            "name_suffix": "14 SEER",
            "seer": 14,
            "base_cost": 2000,
            "labor_hours": 6,
            "warranty_years": 10,
        },
        # Better Tier - Mid-range, high efficiency
        {
            "tier": "better",
            "brand": "Carrier",
            "model_prefix": "24ACC6",
            "name_suffix": "16 SEER",
            "seer": 16,
            "base_cost": 3200,
            "labor_hours": 6,
            "warranty_years": 10,
        },
        {
            "tier": "better",
            "brand": "Trane",
            "model_prefix": "XR16",
            "name_suffix": "16 SEER",
            "seer": 16,
            "base_cost": 3400,
            "labor_hours": 6,
            "warranty_years": 10,
        },
        {
            "tier": "better",
            "brand": "Lennox",
            "model_prefix": "ML14XC1",
            "name_suffix": "16 SEER",
            "seer": 16,
            "base_cost": 3300,
            "labor_hours": 6,
            "warranty_years": 10,
        },
        # Best Tier - Premium, variable speed, ultra-high efficiency
        {
            "tier": "best",
            "brand": "Carrier",
            "model_prefix": "24VNA0",
            "name_suffix": "Infinity 21 SEER",
            "seer": 21,
            "base_cost": 5500,
            "labor_hours": 8,
            "warranty_years": 10,
        },
        {
            "tier": "best",
            "brand": "Trane",
            "model_prefix": "XV20i",
            "name_suffix": "TruComfort 20 SEER",
            "seer": 20,
            "base_cost": 5800,
            "labor_hours": 8,
            "warranty_years": 12,
        },
        {
            "tier": "best",
            "brand": "Lennox",
            "model_prefix": "XC25",
            "name_suffix": "SilentComfort 26 SEER",
            "seer": 26,
            "base_cost": 6500,
            "labor_hours": 8,
            "warranty_years": 10,
        },
    ]

    # Generate AC units for each size
    for model in ac_models:
        for tons in [1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0]:
            size_suffix = f"{int(tons * 12):03d}"
            cost_multiplier = 1 + (tons - 1.5) * 0.15
            equipment.append({
                "equipment_id": generate_id("equip"),
                "business_id": business_id,
                "category": "air_conditioner",
                "type": "central_ac",
                "tier": model["tier"],
                "name": f"{model['brand']} {model['name_suffix']} - {tons} Ton",
                "brand": model["brand"],
                "model": f"{model['model_prefix']}{size_suffix}",
                "capacity_tons": tons,
                "capacity_btu": int(tons * 12000),
                "seer": model["seer"],
                "cost": round(model["base_cost"] * cost_multiplier, 2),
                "labor_hours": model["labor_hours"],
                "warranty_years": model["warranty_years"],
                "is_active": True,
                "created_at": now,
            })

    # ==================== FURNACES ====================
    furnace_models = [
        # Good Tier - 80% AFUE (non-condensing)
        {
            "tier": "good",
            "brand": "Goodman",
            "model_prefix": "GMSS80",
            "name_suffix": "80% AFUE Single Stage",
            "afue": 80,
            "base_cost": 1200,
            "labor_hours": 5,
            "warranty_years": 10,
        },
        {
            "tier": "good",
            "brand": "Rheem",
            "model_prefix": "R801T",
            "name_suffix": "80% AFUE Single Stage",
            "afue": 80,
            "base_cost": 1400,
            "labor_hours": 5,
            "warranty_years": 10,
        },
        # Better Tier - 92-95% AFUE (condensing)
        {
            "tier": "better",
            "brand": "Carrier",
            "model_prefix": "59SC5",
            "name_suffix": "Comfort 95% AFUE",
            "afue": 95,
            "base_cost": 2400,
            "labor_hours": 6,
            "warranty_years": 10,
        },
        {
            "tier": "better",
            "brand": "Trane",
            "model_prefix": "S9V2",
            "name_suffix": "96% AFUE Two-Stage",
            "afue": 96,
            "base_cost": 2600,
            "labor_hours": 6,
            "warranty_years": 10,
        },
        {
            "tier": "better",
            "brand": "Lennox",
            "model_prefix": "SL280V",
            "name_suffix": "95% AFUE Variable",
            "afue": 95,
            "base_cost": 2500,
            "labor_hours": 6,
            "warranty_years": 10,
        },
        # Best Tier - 97-98% AFUE (modulating)
        {
            "tier": "best",
            "brand": "Carrier",
            "model_prefix": "59MN7",
            "name_suffix": "Infinity 98% AFUE Modulating",
            "afue": 98,
            "base_cost": 4200,
            "labor_hours": 8,
            "warranty_years": 10,
        },
        {
            "tier": "best",
            "brand": "Trane",
            "model_prefix": "S9X2",
            "name_suffix": "97% AFUE Modulating",
            "afue": 97,
            "base_cost": 4400,
            "labor_hours": 8,
            "warranty_years": 12,
        },
        {
            "tier": "best",
            "brand": "Lennox",
            "model_prefix": "SLP99V",
            "name_suffix": "99% AFUE Variable",
            "afue": 99,
            "base_cost": 5000,
            "labor_hours": 8,
            "warranty_years": 10,
        },
    ]

    # Generate furnaces for each BTU size
    for model in furnace_models:
        for btu in [40000, 60000, 80000, 100000, 120000]:
            size_code = f"{btu // 1000}"
            cost_multiplier = 1 + (btu - 40000) / 80000 * 0.3
            equipment.append({
                "equipment_id": generate_id("equip"),
                "business_id": business_id,
                "category": "furnace",
                "type": "gas_furnace",
                "tier": model["tier"],
                "name": f"{model['brand']} {model['name_suffix']} - {btu // 1000}K BTU",
                "brand": model["brand"],
                "model": f"{model['model_prefix']}{size_code}",
                "capacity_btu": btu,
                "afue": model["afue"],
                "cost": round(model["base_cost"] * cost_multiplier, 2),
                "labor_hours": model["labor_hours"],
                "warranty_years": model["warranty_years"],
                "is_active": True,
                "created_at": now,
            })

    # ==================== HEAT PUMPS ====================
    heat_pump_models = [
        # Good Tier
        {
            "tier": "good",
            "brand": "Goodman",
            "model_prefix": "GSZC14",
            "name_suffix": "14 SEER / 8.5 HSPF",
            "seer": 14,
            "hspf": 8.5,
            "base_cost": 2200,
            "labor_hours": 7,
            "warranty_years": 10,
        },
        {
            "tier": "good",
            "brand": "Rheem",
            "model_prefix": "RP14AZ",
            "name_suffix": "14 SEER / 8.5 HSPF",
            "seer": 14,
            "hspf": 8.5,
            "base_cost": 2400,
            "labor_hours": 7,
            "warranty_years": 10,
        },
        # Better Tier
        {
            "tier": "better",
            "brand": "Carrier",
            "model_prefix": "25HCC6",
            "name_suffix": "Performance 17 SEER / 9.5 HSPF",
            "seer": 17,
            "hspf": 9.5,
            "base_cost": 3800,
            "labor_hours": 7,
            "warranty_years": 10,
        },
        {
            "tier": "better",
            "brand": "Trane",
            "model_prefix": "XR17",
            "name_suffix": "17 SEER / 9.6 HSPF",
            "seer": 17,
            "hspf": 9.6,
            "base_cost": 4000,
            "labor_hours": 7,
            "warranty_years": 10,
        },
        # Best Tier
        {
            "tier": "best",
            "brand": "Carrier",
            "model_prefix": "25VNA0",
            "name_suffix": "Infinity 20 SEER / 13 HSPF",
            "seer": 20,
            "hspf": 13,
            "base_cost": 6200,
            "labor_hours": 8,
            "warranty_years": 10,
        },
        {
            "tier": "best",
            "brand": "Trane",
            "model_prefix": "XV20i",
            "name_suffix": "TruComfort 20 SEER / 10 HSPF",
            "seer": 20,
            "hspf": 10,
            "base_cost": 6500,
            "labor_hours": 8,
            "warranty_years": 12,
        },
    ]

    for model in heat_pump_models:
        for tons in [1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0]:
            size_suffix = f"{int(tons * 12):03d}"
            cost_multiplier = 1 + (tons - 1.5) * 0.15
            equipment.append({
                "equipment_id": generate_id("equip"),
                "business_id": business_id,
                "category": "heat_pump",
                "type": "air_source_heat_pump",
                "tier": model["tier"],
                "name": f"{model['brand']} {model['name_suffix']} - {tons} Ton",
                "brand": model["brand"],
                "model": f"{model['model_prefix']}{size_suffix}",
                "capacity_tons": tons,
                "capacity_btu": int(tons * 12000),
                "seer": model["seer"],
                "hspf": model["hspf"],
                "cost": round(model["base_cost"] * cost_multiplier, 2),
                "labor_hours": model["labor_hours"],
                "warranty_years": model["warranty_years"],
                "is_active": True,
                "created_at": now,
            })

    # ==================== MINI SPLITS ====================
    mini_split_models = [
        # Good Tier
        {
            "tier": "good",
            "brand": "Pioneer",
            "model_prefix": "WYS",
            "name_suffix": "19 SEER",
            "seer": 19,
            "base_cost": 1200,
            "labor_hours": 4,
            "warranty_years": 5,
        },
        {
            "tier": "good",
            "brand": "MRCOOL",
            "model_prefix": "DIY",
            "name_suffix": "20 SEER DIY",
            "seer": 20,
            "base_cost": 1400,
            "labor_hours": 3,
            "warranty_years": 7,
        },
        # Better Tier
        {
            "tier": "better",
            "brand": "Mitsubishi",
            "model_prefix": "MSZ-GL",
            "name_suffix": "20 SEER",
            "seer": 20,
            "base_cost": 2200,
            "labor_hours": 5,
            "warranty_years": 10,
        },
        {
            "tier": "better",
            "brand": "Fujitsu",
            "model_prefix": "ASU12RLS3",
            "name_suffix": "22 SEER",
            "seer": 22,
            "base_cost": 2400,
            "labor_hours": 5,
            "warranty_years": 10,
        },
        # Best Tier
        {
            "tier": "best",
            "brand": "Mitsubishi",
            "model_prefix": "MSZ-FH",
            "name_suffix": "Hyper-Heat 26 SEER",
            "seer": 26,
            "base_cost": 3500,
            "labor_hours": 6,
            "warranty_years": 12,
        },
        {
            "tier": "best",
            "brand": "Daikin",
            "model_prefix": "AURORA",
            "name_suffix": "24.5 SEER Premium",
            "seer": 24.5,
            "base_cost": 3800,
            "labor_hours": 6,
            "warranty_years": 12,
        },
    ]

    for model in mini_split_models:
        for btu in [9000, 12000, 18000, 24000, 36000]:
            tons = btu / 12000
            cost_multiplier = 1 + (btu - 9000) / 27000 * 0.8
            equipment.append({
                "equipment_id": generate_id("equip"),
                "business_id": business_id,
                "category": "mini_split",
                "type": "ductless_mini_split",
                "tier": model["tier"],
                "name": f"{model['brand']} {model['name_suffix']} - {btu // 1000}K BTU",
                "brand": model["brand"],
                "model": f"{model['model_prefix']}{btu // 1000}",
                "capacity_tons": round(tons, 1),
                "capacity_btu": btu,
                "seer": model["seer"],
                "cost": round(model["base_cost"] * cost_multiplier, 2),
                "labor_hours": model["labor_hours"],
                "warranty_years": model["warranty_years"],
                "is_active": True,
                "created_at": now,
            })

    # ==================== AIR HANDLERS ====================
    air_handler_models = [
        # Good Tier
        {
            "tier": "good",
            "brand": "Goodman",
            "model_prefix": "ARUF",
            "name_suffix": "Multi-Position",
            "base_cost": 800,
            "labor_hours": 4,
            "warranty_years": 10,
        },
        {
            "tier": "good",
            "brand": "Rheem",
            "model_prefix": "RH1T",
            "name_suffix": "Multi-Position",
            "base_cost": 900,
            "labor_hours": 4,
            "warranty_years": 10,
        },
        # Better Tier
        {
            "tier": "better",
            "brand": "Carrier",
            "model_prefix": "FE4A",
            "name_suffix": "Performance",
            "base_cost": 1400,
            "labor_hours": 5,
            "warranty_years": 10,
        },
        {
            "tier": "better",
            "brand": "Trane",
            "model_prefix": "GAM5",
            "name_suffix": "Hyperion",
            "base_cost": 1500,
            "labor_hours": 5,
            "warranty_years": 10,
        },
        # Best Tier
        {
            "tier": "best",
            "brand": "Carrier",
            "model_prefix": "FV4C",
            "name_suffix": "Infinity Variable Speed",
            "base_cost": 2200,
            "labor_hours": 6,
            "warranty_years": 10,
        },
        {
            "tier": "best",
            "brand": "Trane",
            "model_prefix": "TAM9",
            "name_suffix": "Hyperion XL Variable Speed",
            "base_cost": 2400,
            "labor_hours": 6,
            "warranty_years": 10,
        },
    ]

    for model in air_handler_models:
        for tons in [1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0]:
            size_code = f"{int(tons * 12):02d}"
            cfm = int(tons * 400)
            cost_multiplier = 1 + (tons - 1.5) * 0.12
            equipment.append({
                "equipment_id": generate_id("equip"),
                "business_id": business_id,
                "category": "air_handler",
                "type": "air_handler",
                "tier": model["tier"],
                "name": f"{model['brand']} {model['name_suffix']} - {tons} Ton / {cfm} CFM",
                "brand": model["brand"],
                "model": f"{model['model_prefix']}{size_code}",
                "capacity_tons": tons,
                "capacity_btu": int(tons * 12000),
                "cfm": cfm,
                "cost": round(model["base_cost"] * cost_multiplier, 2),
                "labor_hours": model["labor_hours"],
                "warranty_years": model["warranty_years"],
                "is_active": True,
                "created_at": now,
            })

    # ==================== THERMOSTATS ====================
    thermostat_models = [
        # Good Tier - Basic programmable
        {
            "tier": "good",
            "brand": "Honeywell",
            "model": "T4 Pro",
            "name": "Honeywell T4 Pro Programmable",
            "type": "programmable",
            "base_cost": 85,
            "labor_hours": 0.5,
            "warranty_years": 1,
        },
        {
            "tier": "good",
            "brand": "Emerson",
            "model": "1F87U-42WF",
            "name": "Emerson Sensi Lite WiFi",
            "type": "smart",
            "base_cost": 99,
            "labor_hours": 0.5,
            "warranty_years": 3,
        },
        # Better Tier - Smart thermostats
        {
            "tier": "better",
            "brand": "Honeywell",
            "model": "T6 Pro WiFi",
            "name": "Honeywell T6 Pro Smart",
            "type": "smart",
            "base_cost": 180,
            "labor_hours": 1,
            "warranty_years": 5,
        },
        {
            "tier": "better",
            "brand": "ecobee",
            "model": "ecobee3 lite",
            "name": "ecobee3 lite Smart Thermostat",
            "type": "smart",
            "base_cost": 170,
            "labor_hours": 1,
            "warranty_years": 3,
        },
        {
            "tier": "better",
            "brand": "Google",
            "model": "Nest Thermostat",
            "name": "Google Nest Thermostat",
            "type": "smart",
            "base_cost": 130,
            "labor_hours": 1,
            "warranty_years": 2,
        },
        # Best Tier - Premium smart with sensors
        {
            "tier": "best",
            "brand": "ecobee",
            "model": "ecobee Premium",
            "name": "ecobee Premium with SmartSensor",
            "type": "smart",
            "base_cost": 250,
            "labor_hours": 1.5,
            "warranty_years": 3,
        },
        {
            "tier": "best",
            "brand": "Google",
            "model": "Nest Learning",
            "name": "Google Nest Learning Thermostat",
            "type": "smart",
            "base_cost": 250,
            "labor_hours": 1.5,
            "warranty_years": 2,
        },
        {
            "tier": "best",
            "brand": "Carrier",
            "model": "SYSTXCCITC01",
            "name": "Carrier Infinity Control",
            "type": "communicating",
            "base_cost": 450,
            "labor_hours": 2,
            "warranty_years": 5,
        },
        {
            "tier": "best",
            "brand": "Trane",
            "model": "XL1050",
            "name": "Trane ComfortLink II XL1050",
            "type": "communicating",
            "base_cost": 480,
            "labor_hours": 2,
            "warranty_years": 5,
        },
    ]

    for model in thermostat_models:
        equipment.append({
            "equipment_id": generate_id("equip"),
            "business_id": business_id,
            "category": "thermostat",
            "type": model["type"],
            "tier": model["tier"],
            "name": model["name"],
            "brand": model["brand"],
            "model": model["model"],
            "cost": model["base_cost"],
            "labor_hours": model["labor_hours"],
            "warranty_years": model["warranty_years"],
            "is_active": True,
            "created_at": now,
        })

    return equipment


async def create_demo_business(db) -> str:
    """Create a demo business if none exists."""
    from app.models.common import generate_id

    # Check for existing business
    existing = await db.businesses.find_one({})
    if existing:
        print(f"Using existing business: {existing.get('name')} ({existing.get('business_id')})")
        return existing.get('business_id')

    # Create demo business
    business_id = generate_id("bus")
    now = datetime.utcnow().isoformat()

    business = {
        "business_id": business_id,
        "name": "Demo HVAC Company",
        "slug": "demo-hvac",
        "email": "demo@hvaccompany.com",
        "phone": "(555) 123-4567",
        "address": {
            "street": "123 Main Street",
            "city": "Springfield",
            "state": "IL",
            "zip": "62701",
            "country": "US",
        },
        "timezone": "America/Chicago",
        "currency": "USD",
        "verticals": ["hvac"],
        "settings": {
            "labor_rate": 95.0,
            "default_margin": 35.0,
            "tax_rate": 8.25,
        },
        "is_active": True,
        "created_at": now,
        "job_number_sequence": 0,
    }

    await db.businesses.insert_one(business)
    print(f"Created demo business: {business['name']} ({business_id})")

    # Create demo user
    user_id = generate_id("user")
    from passlib.hash import bcrypt

    user = {
        "user_id": user_id,
        "business_id": business_id,
        "email": "admin@hvaccompany.com",
        "password_hash": bcrypt.hash("demo123"),
        "first_name": "Admin",
        "last_name": "User",
        "role": "owner",
        "is_active": True,
        "created_at": now,
    }

    await db.users.insert_one(user)
    print(f"Created demo user: admin@hvaccompany.com (password: demo123)")

    return business_id


async def seed_equipment(business_id: str = None):
    """Main seeding function."""
    print("Connecting to MongoDB...")
    client = AsyncIOMotorClient(settings.MONGO_URL)
    db = client[settings.DB_NAME]

    try:
        # Get or create business
        if business_id:
            # Verify business exists
            business = await db.businesses.find_one({"business_id": business_id})
            if not business:
                print(f"Error: Business {business_id} not found")
                return
            print(f"Using business: {business.get('name')} ({business_id})")
        else:
            business_id = await create_demo_business(db)

        # Check existing equipment count
        existing_count = await db.hvac_equipment.count_documents({"business_id": business_id})

        if existing_count > 0:
            print(f"Found {existing_count} existing equipment items")
            response = input("Delete existing and re-seed? (y/N): ")
            if response.lower() == 'y':
                result = await db.hvac_equipment.delete_many({"business_id": business_id})
                print(f"Deleted {result.deleted_count} existing items")
            else:
                print("Keeping existing equipment. Exiting.")
                return

        # Generate equipment catalog
        print("\nGenerating equipment catalog...")
        equipment = get_equipment_catalog(business_id)

        # Insert equipment
        print(f"Inserting {len(equipment)} equipment items...")
        result = await db.hvac_equipment.insert_many(equipment)
        print(f"Inserted {len(result.inserted_ids)} items")

        # Print summary
        print("\n" + "=" * 50)
        print("EQUIPMENT CATALOG SUMMARY")
        print("=" * 50)

        categories = {}
        tiers = {"good": 0, "better": 0, "best": 0}
        brands = set()

        for item in equipment:
            cat = item.get("category", "unknown")
            tier = item.get("tier", "unknown")
            brand = item.get("brand", "unknown")

            categories[cat] = categories.get(cat, 0) + 1
            if tier in tiers:
                tiers[tier] += 1
            brands.add(brand)

        print("\nBy Category:")
        for cat, count in sorted(categories.items()):
            print(f"  {cat}: {count}")

        print("\nBy Tier:")
        for tier, count in sorted(tiers.items()):
            print(f"  {tier}: {count}")

        print(f"\nBrands: {len(brands)}")
        print(f"  {', '.join(sorted(brands))}")

        print("\n" + "=" * 50)
        print("Seeding complete!")
        print(f"Business ID: {business_id}")
        if not business_id:
            print("\nYou can now log in with:")
            print("  Email: admin@hvaccompany.com")
            print("  Password: demo123")

    finally:
        client.close()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Seed HVAC equipment catalog")
    parser.add_argument("--business-id", help="Business ID to seed equipment for")
    args = parser.parse_args()

    asyncio.run(seed_equipment(args.business_id))
