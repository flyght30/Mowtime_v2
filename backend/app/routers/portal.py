"""
Portal API Router
Public-facing endpoints for customer booking portal
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional
from datetime import date, datetime, timedelta
from pydantic import BaseModel, EmailStr, Field, ConfigDict

from app.database import get_database
from app.models.business import PublicBusinessResponse
from app.models.service import ServiceResponse
from app.models.client import Address
from app.models.common import generate_id, utc_now

router = APIRouter()


# ============== Request/Response Models ==============

class GuestInfo(BaseModel):
    """Guest booking information"""
    first_name: str = Field(min_length=1, max_length=50)
    last_name: str = Field(min_length=1, max_length=50)
    email: EmailStr
    phone: str = Field(min_length=10, max_length=20)

    model_config = ConfigDict(str_strip_whitespace=True)


class BookingAddress(BaseModel):
    """Service address for booking"""
    address_line1: str
    address_line2: Optional[str] = None
    city: str
    state: str
    zip_code: str

    model_config = ConfigDict(str_strip_whitespace=True)


class CreateBookingRequest(BaseModel):
    """Request to create a booking"""
    service_id: str
    scheduled_date: date
    scheduled_time: str  # HH:MM format
    guest: GuestInfo
    address: BookingAddress
    notes: Optional[str] = None

    model_config = ConfigDict(str_strip_whitespace=True)


class TimeSlot(BaseModel):
    """Available time slot"""
    time: str  # HH:MM format
    available: bool = True


class AvailabilityResponse(BaseModel):
    """Response for availability check"""
    date: str
    available: bool
    slots: list[TimeSlot]
    business_open: bool = True
    close_reason: Optional[str] = None


class BookingConfirmation(BaseModel):
    """Booking confirmation response"""
    appointment_id: str
    confirmation_number: str
    business: dict
    service: dict
    scheduled_date: str
    scheduled_time: str
    total_price: float
    client: dict
    address: dict


class PublicServiceResponse(BaseModel):
    """Public service response for portal"""
    service_id: str
    name: str
    description: Optional[str] = None
    category: str
    pricing_type: str
    base_price: float
    unit_label: Optional[str] = None
    duration_minutes: int
    is_featured: bool = False

    model_config = ConfigDict(from_attributes=True)


# ============== Endpoints ==============

@router.get(
    "/business/{slug}",
    response_model=dict,
    summary="Get business by slug"
)
async def get_business_by_slug(
    slug: str,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get public business information by slug"""
    business = await db.businesses.find_one({
        "slug": slug,
        "deleted_at": None
    })

    if not business:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "BUSINESS_NOT_FOUND", "message": "Business not found"}
        )

    # Check if online booking is enabled
    config = business.get("config", {})
    if not config.get("online_booking_enabled", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "BOOKING_DISABLED", "message": "Online booking is not enabled for this business"}
        )

    return {
        "success": True,
        "data": {
            "business_id": business["business_id"],
            "name": business["name"],
            "slug": business.get("slug"),
            "description": business.get("description"),
            "vertical": business.get("vertical", "lawn_care"),
            "phone": business["phone"],
            "email": business["email"],
            "city": business["city"],
            "state": business["state"],
            "timezone": business.get("timezone", "America/Chicago"),
            "config": {
                "primary_color": config.get("primary_color", "#2563EB"),
                "logo_url": config.get("logo_url"),
                "advance_booking_days": config.get("advance_booking_days", 60),
                "allow_same_day_booking": config.get("allow_same_day_booking", True)
            }
        }
    }


@router.get(
    "/business/{business_id}/services",
    response_model=dict,
    summary="Get business services"
)
async def get_business_services(
    business_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get services available for online booking"""
    # Verify business exists
    business = await db.businesses.find_one({
        "business_id": business_id,
        "deleted_at": None
    })

    if not business:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "BUSINESS_NOT_FOUND", "message": "Business not found"}
        )

    # Get active services that allow online booking
    cursor = db.services.find({
        "business_id": business_id,
        "is_active": True,
        "allow_online_booking": True,
        "deleted_at": None
    }).sort([("is_featured", -1), ("sort_order", 1), ("name", 1)])

    services = await cursor.to_list(length=100)

    public_services = [
        {
            "service_id": s["service_id"],
            "name": s["name"],
            "description": s.get("description"),
            "category": s.get("category", "other"),
            "pricing_type": s.get("pricing_type", "fixed"),
            "base_price": s["base_price"],
            "unit_label": s.get("unit_label"),
            "duration_minutes": s["duration_minutes"],
            "is_featured": s.get("is_featured", False)
        }
        for s in services
    ]

    return {
        "success": True,
        "data": public_services,
        "count": len(public_services)
    }


@router.get(
    "/availability",
    response_model=dict,
    summary="Get available time slots"
)
async def get_availability(
    business_id: str,
    service_id: str,
    date_str: str = Query(..., alias="date", description="Date in YYYY-MM-DD format"),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get available time slots for a specific date and service"""
    # Parse and validate date
    try:
        check_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_DATE", "message": "Invalid date format. Use YYYY-MM-DD"}
        )

    # Can't book in the past
    today = date.today()
    if check_date < today:
        return {
            "success": True,
            "data": {
                "date": date_str,
                "available": False,
                "business_open": False,
                "close_reason": "Cannot book dates in the past",
                "slots": []
            }
        }

    # Get business
    business = await db.businesses.find_one({
        "business_id": business_id,
        "deleted_at": None
    })

    if not business:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "BUSINESS_NOT_FOUND", "message": "Business not found"}
        )

    config = business.get("config", {})

    # Check advance booking limit
    max_days = config.get("advance_booking_days", 60)
    max_date = today + timedelta(days=max_days)
    if check_date > max_date:
        return {
            "success": True,
            "data": {
                "date": date_str,
                "available": False,
                "business_open": False,
                "close_reason": f"Cannot book more than {max_days} days in advance",
                "slots": []
            }
        }

    # Check same-day booking
    if check_date == today and not config.get("allow_same_day_booking", True):
        return {
            "success": True,
            "data": {
                "date": date_str,
                "available": False,
                "business_open": False,
                "close_reason": "Same-day booking is not available",
                "slots": []
            }
        }

    # Get service for duration
    service = await db.services.find_one({
        "service_id": service_id,
        "business_id": business_id,
        "is_active": True,
        "deleted_at": None
    })

    if not service:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "SERVICE_NOT_FOUND", "message": "Service not found"}
        )

    duration_minutes = service["duration_minutes"]
    buffer_hours = service.get("booking_buffer_hours", 24)

    # Check business hours for this day
    business_hours = config.get("business_hours", {})
    day_name = check_date.strftime("%A").lower()
    day_hours = business_hours.get(day_name, {"is_open": True, "open_time": "08:00", "close_time": "17:00"})

    if not day_hours.get("is_open", True):
        return {
            "success": True,
            "data": {
                "date": date_str,
                "available": False,
                "business_open": False,
                "close_reason": "Business is closed on this day",
                "slots": []
            }
        }

    open_time = day_hours.get("open_time", "08:00")
    close_time = day_hours.get("close_time", "17:00")

    # Get existing appointments for this date
    existing_appointments = await db.appointments.find({
        "business_id": business_id,
        "scheduled_date": date_str,
        "status": {"$in": ["scheduled", "confirmed", "in_progress"]},
        "deleted_at": None
    }).to_list(length=100)

    # Generate time slots
    gap_minutes = config.get("min_gap_between_jobs_minutes", 30)
    slots = []

    open_hour, open_min = map(int, open_time.split(":"))
    close_hour, close_min = map(int, close_time.split(":"))
    close_minutes = close_hour * 60 + close_min

    current_hour = open_hour
    current_min = open_min

    # Current time for buffer checking
    now = datetime.now()
    now_minutes = now.hour * 60 + now.minute if check_date == today else 0
    buffer_minutes = buffer_hours * 60

    while True:
        current_minutes = current_hour * 60 + current_min
        end_minutes = current_minutes + duration_minutes

        # Can't end after closing
        if end_minutes > close_minutes:
            break

        slot_time = f"{current_hour:02d}:{current_min:02d}"
        slot_end = f"{end_minutes // 60:02d}:{end_minutes % 60:02d}"

        # Check if slot is available
        is_available = True

        # Check buffer time for today
        if check_date == today and current_minutes < (now_minutes + buffer_minutes):
            is_available = False

        # Check conflicts with existing appointments
        for apt in existing_appointments:
            apt_start = apt["scheduled_time"]
            apt_end = apt["end_time"]

            # Include gap time in conflict check
            apt_start_mins = int(apt_start.split(":")[0]) * 60 + int(apt_start.split(":")[1])
            apt_end_mins = int(apt_end.split(":")[0]) * 60 + int(apt_end.split(":")[1]) + gap_minutes

            # Check overlap
            if current_minutes < apt_end_mins and end_minutes > apt_start_mins:
                is_available = False
                break

        slots.append({
            "time": slot_time,
            "available": is_available
        })

        # Next slot (30 min increments)
        current_min += 30
        if current_min >= 60:
            current_hour += 1
            current_min = 0

    available_slots = [s for s in slots if s["available"]]

    return {
        "success": True,
        "data": {
            "date": date_str,
            "available": len(available_slots) > 0,
            "business_open": True,
            "slots": slots,
            "available_count": len(available_slots)
        }
    }


@router.post(
    "/bookings",
    response_model=dict,
    status_code=status.HTTP_201_CREATED,
    summary="Create a booking"
)
async def create_booking(
    business_id: str,
    data: CreateBookingRequest,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Create a new booking as a guest"""
    # Verify business
    business = await db.businesses.find_one({
        "business_id": business_id,
        "deleted_at": None
    })

    if not business:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "BUSINESS_NOT_FOUND", "message": "Business not found"}
        )

    config = business.get("config", {})
    if not config.get("online_booking_enabled", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "BOOKING_DISABLED", "message": "Online booking is not enabled"}
        )

    # Verify service
    service = await db.services.find_one({
        "service_id": data.service_id,
        "business_id": business_id,
        "is_active": True,
        "allow_online_booking": True,
        "deleted_at": None
    })

    if not service:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "SERVICE_NOT_FOUND", "message": "Service not found or not available for online booking"}
        )

    # Find or create client
    existing_client = await db.clients.find_one({
        "business_id": business_id,
        "email": data.guest.email,
        "deleted_at": None
    })

    if existing_client:
        client_id = existing_client["client_id"]
        # Update address if new
        addresses = existing_client.get("addresses", [])
        address_exists = any(
            a["address_line1"] == data.address.address_line1 and
            a["zip_code"] == data.address.zip_code
            for a in addresses
        )
        if not address_exists:
            addresses.append({
                "address_line1": data.address.address_line1,
                "address_line2": data.address.address_line2,
                "city": data.address.city,
                "state": data.address.state,
                "zip_code": data.address.zip_code,
                "country": "US",
                "is_primary": False
            })
            await db.clients.update_one(
                {"client_id": client_id},
                {"$set": {"addresses": addresses}}
            )
        address_index = len(addresses) - 1 if not address_exists else next(
            (i for i, a in enumerate(addresses)
             if a["address_line1"] == data.address.address_line1 and a["zip_code"] == data.address.zip_code),
            0
        )
    else:
        # Create new client
        client_id = generate_id("cli")
        new_client = {
            "client_id": client_id,
            "business_id": business_id,
            "first_name": data.guest.first_name,
            "last_name": data.guest.last_name,
            "email": data.guest.email,
            "phone": data.guest.phone,
            "addresses": [{
                "address_line1": data.address.address_line1,
                "address_line2": data.address.address_line2,
                "city": data.address.city,
                "state": data.address.state,
                "zip_code": data.address.zip_code,
                "country": "US",
                "is_primary": True
            }],
            "status": "active",
            "source": "online_booking",
            "preferences": {
                "preferred_contact_method": "email",
                "reminder_hours_before": 24,
                "allow_sms": True,
                "allow_email": True,
                "allow_marketing": False
            },
            "total_appointments": 0,
            "completed_appointments": 0,
            "canceled_appointments": 0,
            "lifetime_value": 0.0,
            "tags": ["online_booking"],
            "created_at": utc_now(),
            "updated_at": utc_now()
        }
        await db.clients.insert_one(new_client)
        address_index = 0

        # Update business client count
        await db.businesses.update_one(
            {"business_id": business_id},
            {"$inc": {"total_clients": 1}}
        )

    # Calculate appointment details
    duration_minutes = service["duration_minutes"]
    start_hour, start_min = map(int, data.scheduled_time.split(":"))
    end_minutes = start_hour * 60 + start_min + duration_minutes
    end_time = f"{end_minutes // 60:02d}:{end_minutes % 60:02d}"

    # Generate confirmation number
    import random
    import string
    confirmation_number = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))

    # Create appointment
    appointment_id = generate_id("apt")
    appointment = {
        "appointment_id": appointment_id,
        "business_id": business_id,
        "client_id": client_id,
        "address_index": address_index,
        "scheduled_date": data.scheduled_date.isoformat(),
        "scheduled_time": data.scheduled_time,
        "end_time": end_time,
        "duration_minutes": duration_minutes,
        "timezone": business.get("timezone", "America/Chicago"),
        "status": "scheduled",
        "staff_ids": [],
        "equipment_ids": [],
        "services": [{
            "service_id": service["service_id"],
            "service_name": service["name"],
            "quantity": 1,
            "unit_price": service["base_price"],
            "total_price": service["base_price"],
            "duration_minutes": duration_minutes
        }],
        "total_price": service["base_price"],
        "customer_notes": data.notes,
        "source": "online_booking",
        "confirmation_number": confirmation_number,
        "created_at": utc_now(),
        "updated_at": utc_now()
    }

    await db.appointments.insert_one(appointment)

    # Update stats
    await db.businesses.update_one(
        {"business_id": business_id},
        {"$inc": {"total_appointments": 1}}
    )

    await db.clients.update_one(
        {"client_id": client_id},
        {
            "$inc": {"total_appointments": 1},
            "$set": {"next_scheduled_date": data.scheduled_date.isoformat()}
        }
    )

    # Return confirmation
    return {
        "success": True,
        "data": {
            "appointment_id": appointment_id,
            "confirmation_number": confirmation_number,
            "business": {
                "name": business["name"],
                "phone": business["phone"],
                "email": business["email"]
            },
            "service": {
                "name": service["name"],
                "duration_minutes": duration_minutes
            },
            "scheduled_date": data.scheduled_date.isoformat(),
            "scheduled_time": data.scheduled_time,
            "total_price": service["base_price"],
            "client": {
                "first_name": data.guest.first_name,
                "last_name": data.guest.last_name,
                "email": data.guest.email,
                "phone": data.guest.phone
            },
            "address": {
                "address_line1": data.address.address_line1,
                "city": data.address.city,
                "state": data.address.state,
                "zip_code": data.address.zip_code
            }
        }
    }


@router.get(
    "/bookings/{booking_id}",
    response_model=dict,
    summary="Get booking confirmation"
)
async def get_booking(
    booking_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get booking confirmation details"""
    appointment = await db.appointments.find_one({
        "appointment_id": booking_id,
        "deleted_at": None
    })

    if not appointment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "BOOKING_NOT_FOUND", "message": "Booking not found"}
        )

    # Get business
    business = await db.businesses.find_one({
        "business_id": appointment["business_id"]
    })

    # Get client
    client = await db.clients.find_one({
        "client_id": appointment["client_id"]
    })

    # Get address
    address_index = appointment.get("address_index", 0)
    addresses = client.get("addresses", []) if client else []
    address = addresses[address_index] if address_index < len(addresses) else {}

    # Get service info
    services = appointment.get("services", [])
    service_info = services[0] if services else {"name": "Unknown", "duration_minutes": 60}

    return {
        "success": True,
        "data": {
            "appointment_id": appointment["appointment_id"],
            "confirmation_number": appointment.get("confirmation_number", appointment["appointment_id"][:8].upper()),
            "business": {
                "name": business["name"] if business else "Unknown",
                "phone": business.get("phone", "") if business else "",
                "email": business.get("email", "") if business else ""
            },
            "service": {
                "name": service_info.get("service_name", service_info.get("name", "Unknown")),
                "duration_minutes": service_info.get("duration_minutes", 60)
            },
            "scheduled_date": appointment["scheduled_date"],
            "scheduled_time": appointment["scheduled_time"],
            "total_price": appointment.get("total_price", 0),
            "client": {
                "first_name": client.get("first_name", "") if client else "",
                "last_name": client.get("last_name", "") if client else "",
                "email": client.get("email", "") if client else "",
                "phone": client.get("phone", "") if client else ""
            },
            "address": {
                "address_line1": address.get("address_line1", ""),
                "city": address.get("city", ""),
                "state": address.get("state", ""),
                "zip_code": address.get("zip_code", "")
            },
            "status": appointment.get("status", "scheduled")
        }
    }


@router.get(
    "/bookings/{booking_id}/cancel",
    response_model=dict,
    summary="Cancel a booking"
)
async def cancel_booking(
    booking_id: str,
    email: str = Query(..., description="Email address to verify ownership"),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Cancel a booking (requires email verification)"""
    appointment = await db.appointments.find_one({
        "appointment_id": booking_id,
        "deleted_at": None
    })

    if not appointment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "BOOKING_NOT_FOUND", "message": "Booking not found"}
        )

    # Verify email matches client
    client = await db.clients.find_one({
        "client_id": appointment["client_id"]
    })

    if not client or client.get("email", "").lower() != email.lower():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "UNAUTHORIZED", "message": "Email does not match booking"}
        )

    # Check if can be cancelled (not already cancelled, not completed)
    if appointment.get("status") in ["canceled", "completed"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "CANNOT_CANCEL", "message": f"Booking is already {appointment.get('status')}"}
        )

    # Cancel the appointment
    await db.appointments.update_one(
        {"appointment_id": booking_id},
        {
            "$set": {
                "status": "canceled",
                "canceled_at": utc_now(),
                "cancel_reason": "Cancelled by customer",
                "updated_at": utc_now()
            }
        }
    )

    # Update client stats
    await db.clients.update_one(
        {"client_id": appointment["client_id"]},
        {"$inc": {"canceled_appointments": 1}}
    )

    return {
        "success": True,
        "message": "Booking cancelled successfully"
    }
