"""
Database Seed Script
Creates realistic lawn care demo data for ServicePro

Run with: python -m scripts.seed
"""

import asyncio
import random
from datetime import datetime, date, timedelta
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
import os

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# MongoDB connection
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "servicepro_dev")

# ID generators
def generate_id(prefix: str) -> str:
    import uuid
    return f"{prefix}_{uuid.uuid4().hex[:12]}"

# Demo data constants
FIRST_NAMES = [
    "James", "John", "Robert", "Michael", "David", "William", "Richard", "Joseph",
    "Thomas", "Charles", "Mary", "Patricia", "Jennifer", "Linda", "Elizabeth",
    "Barbara", "Susan", "Jessica", "Sarah", "Karen", "Daniel", "Matthew", "Anthony",
    "Mark", "Donald", "Steven", "Paul", "Andrew", "Joshua", "Kenneth"
]

LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
    "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson",
    "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson"
]

STREET_NAMES = [
    "Oak", "Maple", "Cedar", "Pine", "Elm", "Birch", "Willow", "Magnolia",
    "Peach", "Cherry", "Walnut", "Hickory", "Cypress", "Dogwood", "Holly"
]

STREET_TYPES = ["St", "Ave", "Blvd", "Dr", "Ln", "Ct", "Way", "Rd"]

CITIES_TX = [
    ("Austin", "78701"), ("Austin", "78702"), ("Austin", "78704"), ("Austin", "78745"),
    ("Round Rock", "78664"), ("Cedar Park", "78613"), ("Georgetown", "78626"),
    ("Pflugerville", "78660"), ("Leander", "78641"), ("Lakeway", "78734")
]

CITIES_FL = [
    ("Orlando", "32801"), ("Orlando", "32803"), ("Winter Park", "32789"),
    ("Kissimmee", "34741"), ("Sanford", "32771"), ("Lake Mary", "32746"),
    ("Altamonte Springs", "32701"), ("Oviedo", "32765"), ("Windermere", "34786"),
    ("Celebration", "34747")
]

CLIENT_SOURCES = [
    "Google Search", "Referral", "Nextdoor", "Facebook", "Yelp",
    "Yard Sign", "Door Hanger", "Home Advisor", "Thumbtack", "Word of Mouth"
]

CLIENT_TAGS = [
    "VIP", "Commercial", "Residential", "Weekly", "Bi-weekly", "Monthly",
    "Large Yard", "Small Yard", "Corner Lot", "HOA", "Gated Community",
    "Dog Owner", "Pool", "Irrigation System", "Fenced Yard"
]

SERVICE_NOTES = [
    "Customer prefers early morning service",
    "Please use side gate - code 1234",
    "Do not mow after 5pm",
    "Be careful around the flower beds",
    "Large oak tree in backyard needs extra cleanup",
    "Customer has a dog - make sure gate is closed",
    "Leave invoice at front door",
    "Text when arriving",
    "Pool area needs extra attention",
    "Customer works from home - quiet equipment preferred"
]

CERTIFICATIONS = [
    "Pesticide Applicator License",
    "Commercial Driver's License (CDL)",
    "OSHA Safety Certified",
    "First Aid/CPR",
    "Irrigation Technician Certified",
    "Landscape Design Certificate",
    "Arborist Certification"
]


async def seed_database():
    """Main seed function"""
    print("🌱 Starting database seed...")

    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DATABASE_NAME]

    # Clear existing data
    print("  Clearing existing data...")
    collections = ["users", "businesses", "clients", "services", "staff",
                   "appointments", "invoices", "payments"]
    for collection in collections:
        await db[collection].delete_many({})

    # Create businesses
    print("  Creating businesses...")
    businesses = await create_businesses(db)

    # Create users (owners)
    print("  Creating users...")
    users = await create_users(db, businesses)

    # Create services for each business
    print("  Creating services...")
    services = await create_services(db, businesses)

    # Create staff for each business
    print("  Creating staff...")
    staff = await create_staff(db, businesses)

    # Create clients for each business
    print("  Creating clients...")
    clients = await create_clients(db, businesses)

    # Create appointments
    print("  Creating appointments...")
    appointments = await create_appointments(db, businesses, clients, services, staff)

    # Create invoices
    print("  Creating invoices...")
    invoices = await create_invoices(db, appointments)

    print("\n✅ Seed complete!")
    print(f"   - {len(businesses)} businesses")
    print(f"   - {len(users)} users")
    print(f"   - {sum(len(s) for s in services.values())} services")
    print(f"   - {sum(len(s) for s in staff.values())} staff members")
    print(f"   - {sum(len(c) for c in clients.values())} clients")
    print(f"   - {len(appointments)} appointments")
    print(f"   - {len(invoices)} invoices")

    print("\n📧 Demo login credentials:")
    for user in users:
        print(f"   {user['email']} / demo123")

    client.close()


async def create_businesses(db) -> list:
    """Create demo businesses"""
    businesses = [
        {
            "business_id": generate_id("bus"),
            "owner_id": "",  # Will be updated after user creation
            "name": "GreenScape Pro",
            "slug": "greenscape-pro",
            "vertical": "lawn_care",
            "description": "Professional lawn care and landscaping services in the Austin area",
            "email": "info@greenscapepro.com",
            "phone": "5125551234",
            "website": "https://greenscapepro.com",
            "address_line1": "100 Business Park Dr",
            "city": "Austin",
            "state": "TX",
            "zip_code": "78701",
            "country": "US",
            "service_radius_miles": 30,
            "plan": "professional",
            "subscription_status": "active",
            "timezone": "America/Chicago",
            "config": {
                "business_hours": {
                    "monday": {"is_open": True, "open_time": "07:00", "close_time": "18:00"},
                    "tuesday": {"is_open": True, "open_time": "07:00", "close_time": "18:00"},
                    "wednesday": {"is_open": True, "open_time": "07:00", "close_time": "18:00"},
                    "thursday": {"is_open": True, "open_time": "07:00", "close_time": "18:00"},
                    "friday": {"is_open": True, "open_time": "07:00", "close_time": "18:00"},
                    "saturday": {"is_open": True, "open_time": "08:00", "close_time": "14:00"},
                    "sunday": {"is_open": False, "open_time": "08:00", "close_time": "17:00"}
                },
                "weather_thresholds": {
                    "rain_probability_percent": 70,
                    "min_temperature_f": 32,
                    "max_temperature_f": 105,
                    "max_wind_speed_mph": 35,
                    "enabled": True
                },
                "notification_settings": {
                    "appointment_reminder_hours": 24,
                    "reschedule_notify": True,
                    "new_client_notify": True,
                    "daily_digest": True,
                    "digest_time": "06:00"
                },
                "min_gap_between_jobs_minutes": 30,
                "max_daily_appointments": 20,
                "allow_same_day_booking": True,
                "advance_booking_days": 60,
                "default_appointment_duration_minutes": 60,
                "weather_enabled": True,
                "ai_receptionist_enabled": False,
                "online_booking_enabled": True,
                "customer_portal_enabled": True,
                "primary_color": "#4CAF50",
                "logo_url": None
            },
            "total_clients": 0,
            "total_staff": 0,
            "total_appointments": 0,
            "created_at": datetime.utcnow() - timedelta(days=365),
            "updated_at": datetime.utcnow()
        },
        {
            "business_id": generate_id("bus"),
            "owner_id": "",  # Will be updated after user creation
            "name": "Sunshine Lawn Care",
            "slug": "sunshine-lawn-care",
            "vertical": "lawn_care",
            "description": "Your trusted lawn care partner in Central Florida",
            "email": "contact@sunshinelawncare.com",
            "phone": "4075559876",
            "website": "https://sunshinelawncare.com",
            "address_line1": "500 Orange Ave",
            "city": "Orlando",
            "state": "FL",
            "zip_code": "32801",
            "country": "US",
            "service_radius_miles": 25,
            "plan": "starter",
            "subscription_status": "active",
            "timezone": "America/New_York",
            "config": {
                "business_hours": {
                    "monday": {"is_open": True, "open_time": "08:00", "close_time": "17:00"},
                    "tuesday": {"is_open": True, "open_time": "08:00", "close_time": "17:00"},
                    "wednesday": {"is_open": True, "open_time": "08:00", "close_time": "17:00"},
                    "thursday": {"is_open": True, "open_time": "08:00", "close_time": "17:00"},
                    "friday": {"is_open": True, "open_time": "08:00", "close_time": "17:00"},
                    "saturday": {"is_open": False, "open_time": "08:00", "close_time": "12:00"},
                    "sunday": {"is_open": False, "open_time": "08:00", "close_time": "17:00"}
                },
                "weather_thresholds": {
                    "rain_probability_percent": 60,
                    "min_temperature_f": 40,
                    "max_temperature_f": 100,
                    "max_wind_speed_mph": 30,
                    "enabled": True
                },
                "notification_settings": {
                    "appointment_reminder_hours": 48,
                    "reschedule_notify": True,
                    "new_client_notify": True,
                    "daily_digest": True,
                    "digest_time": "07:00"
                },
                "min_gap_between_jobs_minutes": 30,
                "max_daily_appointments": 15,
                "allow_same_day_booking": False,
                "advance_booking_days": 45,
                "default_appointment_duration_minutes": 45,
                "weather_enabled": True,
                "ai_receptionist_enabled": False,
                "online_booking_enabled": True,
                "customer_portal_enabled": True,
                "primary_color": "#FF9800",
                "logo_url": None
            },
            "total_clients": 0,
            "total_staff": 0,
            "total_appointments": 0,
            "created_at": datetime.utcnow() - timedelta(days=180),
            "updated_at": datetime.utcnow()
        }
    ]

    await db.businesses.insert_many(businesses)
    return businesses


async def create_users(db, businesses: list) -> list:
    """Create owner users for each business"""
    users = []
    hashed_password = pwd_context.hash("demo123")

    owner_data = [
        ("Mike", "Johnson", "mike@greenscapepro.com"),
        ("Sarah", "Williams", "sarah@sunshinelawncare.com")
    ]

    for i, business in enumerate(businesses):
        first, last, email = owner_data[i]
        user_id = generate_id("usr")
        user = {
            "user_id": user_id,
            "business_id": business["business_id"],
            "email": email,
            "hashed_password": hashed_password,
            "first_name": first,
            "last_name": last,
            "phone": business["phone"],
            "role": "owner",
            "permissions": ["*"],
            "is_active": True,
            "is_verified": True,
            "created_at": business["created_at"],
            "updated_at": datetime.utcnow()
        }
        users.append(user)

        # Update business with owner_id
        await db.businesses.update_one(
            {"business_id": business["business_id"]},
            {"$set": {"owner_id": user_id}}
        )

    await db.users.insert_many(users)
    return users


async def create_services(db, businesses: list) -> dict:
    """Create lawn care services for each business"""
    services_by_business = {}

    base_services = [
        ("Standard Mowing", "mowing", "Complete lawn mowing service including edging and blowing", 45, 45, True, True),
        ("Premium Mowing", "mowing", "Full service with striping, double-cut, and detailed edging", 75, 60, True, True),
        ("Edging Only", "edging", "Professional edging along sidewalks, driveways, and beds", 25, 20, True, False),
        ("Hedge Trimming", "trimming", "Shape and trim hedges and shrubs", 60, 45, True, False),
        ("Leaf Removal", "leaf_removal", "Complete leaf cleanup and removal", 85, 90, True, False),
        ("Fertilization", "fertilization", "Professional lawn fertilizer application", 55, 30, True, True),
        ("Weed Control", "weed_control", "Pre and post-emergent weed treatment", 65, 30, True, False),
        ("Aeration", "aeration", "Core aeration to improve soil health", 120, 60, True, False),
        ("Overseeding", "seeding", "Spread grass seed to fill in bare spots", 95, 45, True, False),
        ("Mulch Installation", "mulching", "Fresh mulch for flower beds", 150, 120, False, False),
        ("Spring Cleanup", "cleanup", "Full spring yard cleanup and preparation", 175, 180, True, False),
        ("Fall Cleanup", "cleanup", "Complete fall cleanup with leaf removal", 195, 180, True, False),
        ("Irrigation Check", "irrigation", "Inspect and adjust sprinkler system", 45, 30, False, False),
        ("Lawn Consultation", "consultation", "Professional assessment and recommendations", 0, 30, False, False),
    ]

    for business in businesses:
        services = []
        for i, (name, category, desc, price, duration, active, featured) in enumerate(base_services):
            # Vary prices slightly between businesses
            price_variance = random.uniform(0.9, 1.15)
            service = {
                "service_id": generate_id("svc"),
                "business_id": business["business_id"],
                "name": name,
                "description": desc,
                "category": category,
                "pricing_type": "quote" if price == 0 else "fixed",
                "base_price": round(price * price_variance, 2) if price > 0 else 0,
                "duration_minutes": duration,
                "is_active": active,
                "is_featured": featured,
                "allow_online_booking": active,
                "booking_buffer_hours": 24,
                "min_staff_required": 1,
                "max_staff_allowed": 2 if duration > 60 else 1,
                "sort_order": i,
                "times_booked": random.randint(5, 150) if active else 0,
                "total_revenue": 0,  # Will update after appointments
                "created_at": business["created_at"] + timedelta(days=random.randint(0, 30)),
                "updated_at": datetime.utcnow()
            }
            services.append(service)

        await db.services.insert_many(services)
        services_by_business[business["business_id"]] = services

    return services_by_business


async def create_staff(db, businesses: list) -> dict:
    """Create staff members for each business"""
    staff_by_business = {}

    roles_config = [
        ("manager", "full_time", True, ["Pesticide Applicator License", "OSHA Safety Certified"]),
        ("crew_lead", "full_time", True, ["Commercial Driver's License (CDL)", "First Aid/CPR"]),
        ("crew_lead", "full_time", True, ["OSHA Safety Certified"]),
        ("technician", "full_time", False, ["First Aid/CPR"]),
        ("technician", "full_time", False, []),
        ("technician", "part_time", False, []),
        ("technician", "seasonal", False, []),
    ]

    for business in businesses:
        staff_list = []
        used_names = set()

        for role, emp_type, can_lead, certs in roles_config:
            # Generate unique name
            while True:
                first = random.choice(FIRST_NAMES)
                last = random.choice(LAST_NAMES)
                if f"{first}{last}" not in used_names:
                    used_names.add(f"{first}{last}")
                    break

            hire_date = business["created_at"] + timedelta(days=random.randint(0, 180))
            completed = random.randint(50, 500)
            hours = completed * random.uniform(0.75, 1.5)

            staff_member = {
                "staff_id": generate_id("stf"),
                "business_id": business["business_id"],
                "first_name": first,
                "last_name": last,
                "email": f"{first.lower()}.{last.lower()}@example.com",
                "phone": f"555{random.randint(1000000, 9999999)}",
                "role": role,
                "employment_type": emp_type,
                "hire_date": hire_date,
                "hourly_rate": random.uniform(15, 35) if role != "manager" else random.uniform(25, 45),
                "is_active": True if emp_type != "seasonal" else random.choice([True, False]),
                "can_lead_crew": can_lead,
                "max_daily_appointments": 8 if emp_type == "full_time" else 4,
                "skills": [],
                "certifications": certs,
                "equipment_trained": [],
                "default_availability": {
                    "monday": {"start": "08:00", "end": "17:00"},
                    "tuesday": {"start": "08:00", "end": "17:00"},
                    "wednesday": {"start": "08:00", "end": "17:00"},
                    "thursday": {"start": "08:00", "end": "17:00"},
                    "friday": {"start": "08:00", "end": "17:00"},
                    "saturday": {"start": "08:00", "end": "13:00"} if emp_type == "full_time" else None,
                    "sunday": None
                },
                "total_appointments": completed + random.randint(0, 50),
                "completed_appointments": completed,
                "average_rating": round(random.uniform(4.2, 5.0), 1),
                "total_hours_worked": round(hours, 1),
                "created_at": hire_date,
                "updated_at": datetime.utcnow()
            }
            staff_list.append(staff_member)

        await db.staff.insert_many(staff_list)
        staff_by_business[business["business_id"]] = staff_list

    return staff_by_business


async def create_clients(db, businesses: list) -> dict:
    """Create clients for each business"""
    clients_by_business = {}

    is_austin = lambda b: b["state"] == "TX"

    for business in businesses:
        clients = []
        used_names = set()
        cities = CITIES_TX if is_austin(business) else CITIES_FL

        # Create 15-20 clients per business
        num_clients = random.randint(15, 20)

        for i in range(num_clients):
            # Generate unique name
            while True:
                first = random.choice(FIRST_NAMES)
                last = random.choice(LAST_NAMES)
                if f"{first}{last}" not in used_names:
                    used_names.add(f"{first}{last}")
                    break

            city, zip_code = random.choice(cities)
            street_num = random.randint(100, 9999)
            street = f"{random.choice(STREET_NAMES)} {random.choice(STREET_TYPES)}"

            # Determine status and activity level
            is_active = random.random() > 0.15
            is_commercial = random.random() > 0.85

            # Generate realistic stats
            if is_active:
                total_appts = random.randint(5, 60)
                completed = int(total_appts * random.uniform(0.85, 1.0))
                canceled = total_appts - completed
                lifetime = completed * random.uniform(40, 120)
            else:
                total_appts = random.randint(1, 10)
                completed = random.randint(0, total_appts)
                canceled = total_appts - completed
                lifetime = completed * random.uniform(40, 80)

            # Pick random tags
            client_tags = random.sample(CLIENT_TAGS, random.randint(1, 4))
            if is_commercial:
                client_tags.append("Commercial")
            else:
                client_tags.append("Residential")

            client = {
                "client_id": generate_id("cli"),
                "business_id": business["business_id"],
                "first_name": first,
                "last_name": last,
                "email": f"{first.lower()}.{last.lower()}{random.randint(1,99)}@email.com",
                "phone": f"555{random.randint(1000000, 9999999)}",
                "addresses": [{
                    "address_line1": f"{street_num} {street}",
                    "address_line2": f"Unit {random.randint(1, 20)}" if random.random() > 0.8 else None,
                    "city": city,
                    "state": business["address_state"],
                    "zip_code": zip_code,
                    "is_primary": True,
                    "notes": random.choice(SERVICE_NOTES) if random.random() > 0.6 else None
                }],
                "status": "active" if is_active else random.choice(["inactive", "prospect"]),
                "source": random.choice(CLIENT_SOURCES),
                "preferences": {
                    "preferred_contact_method": random.choice(["sms", "email", "phone"]),
                    "reminder_hours_before": random.choice([24, 48]),
                    "allow_sms": True,
                    "allow_email": True,
                    "allow_marketing": random.choice([True, False]),
                    "preferred_days": random.sample(["monday", "tuesday", "wednesday", "thursday", "friday"],
                                                   random.randint(3, 5)),
                    "preferred_time_start": random.choice(["08:00", "09:00", "10:00"]),
                    "preferred_time_end": random.choice(["16:00", "17:00", "18:00"]),
                    "notes": random.choice(SERVICE_NOTES) if random.random() > 0.7 else None
                },
                "total_appointments": total_appts,
                "completed_appointments": completed,
                "canceled_appointments": canceled,
                "lifetime_value": round(lifetime, 2),
                "last_service_date": datetime.utcnow() - timedelta(days=random.randint(1, 60)) if is_active else None,
                "tags": list(set(client_tags)),
                "created_at": business["created_at"] + timedelta(days=random.randint(0, 300)),
                "updated_at": datetime.utcnow()
            }
            clients.append(client)

        await db.clients.insert_many(clients)
        clients_by_business[business["business_id"]] = clients

    return clients_by_business


async def create_appointments(db, businesses: list, clients: dict, services: dict, staff: dict) -> list:
    """Create appointments across past, present, and future"""
    all_appointments = []

    statuses_past = ["completed", "completed", "completed", "completed", "canceled", "no_show"]
    statuses_future = ["scheduled", "scheduled", "scheduled", "confirmed"]

    for business in businesses:
        business_id = business["business_id"]
        biz_clients = clients[business_id]
        biz_services = [s for s in services[business_id] if s["is_active"]]
        biz_staff = [s for s in staff[business_id] if s["is_active"]]

        # Past appointments (last 90 days)
        for days_ago in range(90, 0, -1):
            # 3-8 appointments per day
            num_appts = random.randint(3, 8)
            apt_date = (datetime.utcnow() - timedelta(days=days_ago)).date()

            # Skip Sundays
            if apt_date.weekday() == 6:
                continue

            for _ in range(num_appts):
                client = random.choice(biz_clients)
                service = random.choice(biz_services)
                assigned_staff = random.sample(biz_staff, min(2, len(biz_staff)))

                hour = random.randint(8, 16)
                minute = random.choice([0, 15, 30, 45])

                status = random.choice(statuses_past)

                appt = create_appointment(
                    business_id, client, service, assigned_staff,
                    apt_date, f"{hour:02d}:{minute:02d}", status
                )
                all_appointments.append(appt)

        # Today's appointments
        today = datetime.utcnow().date()
        for _ in range(random.randint(4, 8)):
            client = random.choice(biz_clients)
            service = random.choice(biz_services)
            assigned_staff = random.sample(biz_staff, min(2, len(biz_staff)))

            hour = random.randint(8, 16)
            minute = random.choice([0, 15, 30, 45])

            # Mix of statuses for today
            status = random.choice(["scheduled", "confirmed", "in_progress", "completed"])

            appt = create_appointment(
                business_id, client, service, assigned_staff,
                today, f"{hour:02d}:{minute:02d}", status
            )
            all_appointments.append(appt)

        # Future appointments (next 30 days)
        for days_ahead in range(1, 31):
            num_appts = random.randint(2, 6)
            apt_date = (datetime.utcnow() + timedelta(days=days_ahead)).date()

            # Skip Sundays
            if apt_date.weekday() == 6:
                continue

            for _ in range(num_appts):
                client = random.choice([c for c in biz_clients if c["status"] == "active"])
                service = random.choice(biz_services)
                assigned_staff = random.sample(biz_staff, min(2, len(biz_staff)))

                hour = random.randint(8, 16)
                minute = random.choice([0, 15, 30, 45])

                status = random.choice(statuses_future)

                appt = create_appointment(
                    business_id, client, service, assigned_staff,
                    apt_date, f"{hour:02d}:{minute:02d}", status
                )
                all_appointments.append(appt)

    if all_appointments:
        await db.appointments.insert_many(all_appointments)

    return all_appointments


def create_appointment(business_id: str, client: dict, service: dict,
                       assigned_staff: list, apt_date: date, apt_time: str, status: str) -> dict:
    """Helper to create a single appointment"""

    # Calculate end time
    duration = service["duration_minutes"]
    hour, minute = map(int, apt_time.split(":"))
    start_dt = datetime.combine(apt_date, datetime.strptime(apt_time, "%H:%M").time())
    end_dt = start_dt + timedelta(minutes=duration)
    end_time = end_dt.strftime("%H:%M")

    # Price with some variance
    price = service["base_price"] * random.uniform(0.95, 1.10)

    appt = {
        "appointment_id": generate_id("apt"),
        "business_id": business_id,
        "client_id": client["client_id"],
        "client_name": f"{client['first_name']} {client['last_name']}",
        "scheduled_date": apt_date.isoformat(),
        "scheduled_time": apt_time,
        "end_time": end_time,
        "duration_minutes": duration,
        "services": [{
            "service_id": service["service_id"],
            "service_name": service["name"],
            "quantity": 1,
            "unit_price": service["base_price"],
            "total_price": round(price, 2)
        }],
        "total_price": round(price, 2),
        "status": status,
        "staff_ids": [s["staff_id"] for s in assigned_staff],
        "address": client["addresses"][0] if client["addresses"] else None,
        "notes": random.choice(SERVICE_NOTES) if random.random() > 0.7 else None,
        "created_at": datetime.utcnow() - timedelta(days=random.randint(1, 30)),
        "updated_at": datetime.utcnow()
    }

    # Add completion details for completed appointments
    if status == "completed":
        appt["completed_at"] = datetime.combine(apt_date, end_dt.time())
        appt["actual_duration_minutes"] = duration + random.randint(-10, 15)

    return appt


async def create_invoices(db, appointments: list) -> list:
    """Create invoices for completed appointments"""
    invoices = []

    completed_appts = [a for a in appointments if a["status"] == "completed"]

    # Create invoices for ~80% of completed appointments
    for appt in random.sample(completed_appts, int(len(completed_appts) * 0.8)):
        # Determine invoice status
        days_old = (datetime.utcnow() - appt.get("completed_at", datetime.utcnow())).days

        if days_old > 30:
            status = random.choice(["paid", "paid", "paid", "overdue"])
        elif days_old > 7:
            status = random.choice(["paid", "paid", "sent", "sent"])
        else:
            status = random.choice(["draft", "sent", "sent"])

        invoice = {
            "invoice_id": generate_id("inv"),
            "business_id": appt["business_id"],
            "client_id": appt["client_id"],
            "appointment_id": appt["appointment_id"],
            "invoice_number": f"INV-{random.randint(1000, 9999)}",
            "status": status,
            "subtotal": appt["total_price"],
            "tax_rate": 0.0825,  # 8.25% tax
            "tax_amount": round(appt["total_price"] * 0.0825, 2),
            "total": round(appt["total_price"] * 1.0825, 2),
            "amount_paid": round(appt["total_price"] * 1.0825, 2) if status == "paid" else 0,
            "amount_due": 0 if status == "paid" else round(appt["total_price"] * 1.0825, 2),
            "line_items": appt["services"],
            "due_date": (appt.get("completed_at", datetime.utcnow()) + timedelta(days=30)).isoformat(),
            "issued_date": appt.get("completed_at", datetime.utcnow()).isoformat(),
            "paid_date": appt.get("completed_at", datetime.utcnow()).isoformat() if status == "paid" else None,
            "created_at": appt.get("completed_at", datetime.utcnow()),
            "updated_at": datetime.utcnow()
        }
        invoices.append(invoice)

    if invoices:
        await db.invoices.insert_many(invoices)

    return invoices


if __name__ == "__main__":
    asyncio.run(seed_database())
