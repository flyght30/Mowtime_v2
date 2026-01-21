"""
Routes API Router
Daily route optimization for crew scheduling
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional, List
from pydantic import BaseModel
from datetime import date

from app.database import get_database
from app.middleware.auth import get_current_user
from app.models.user import User
from app.services.routing import RoutingService

router = APIRouter()


# ============== Request/Response Models ==============

class OptimizeRouteRequest(BaseModel):
    appointment_ids: List[str]
    start_lat: Optional[float] = None
    start_lng: Optional[float] = None


class StopResponse(BaseModel):
    appointment_id: str
    order: int
    scheduled_time: str
    client_name: str
    address: str
    travel_time_minutes: int
    travel_distance_miles: float
    eta: str


class RouteResponse(BaseModel):
    date: Optional[str] = None
    staff_id: Optional[str] = None
    stops: List[dict]
    total_travel_minutes: int
    total_distance_miles: float
    optimized: bool = False
    message: Optional[str] = None


# ============== Endpoints ==============

@router.get(
    "/daily",
    response_model=dict,
    summary="Get optimized daily route"
)
async def get_daily_route(
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
    staff_id: Optional[str] = Query(None, description="Filter by staff member"),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Get optimized route for a specific day.
    Returns ordered stops with ETAs, travel times, and total mileage.
    """
    routing_service = RoutingService(db)

    try:
        result = await routing_service.get_daily_route(
            business_id=current_user.business_id,
            date=date,
            staff_id=staff_id
        )

        return {
            "success": True,
            "data": result
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to calculate route: {str(e)}"
        )


@router.post(
    "/optimize",
    response_model=dict,
    summary="Optimize route for given appointments"
)
async def optimize_route(
    request: OptimizeRouteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Calculate optimal order for a set of appointments.
    Optionally provide a start location (e.g., office or home).
    """
    routing_service = RoutingService(db)

    # Get appointments
    appointments = await db.appointments.find({
        "appointment_id": {"$in": request.appointment_ids},
        "business_id": current_user.business_id,
        "deleted_at": None
    }).to_list(length=100)

    if not appointments:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No appointments found"
        )

    # Get client info for each appointment
    client_ids = list(set(apt.get("client_id") for apt in appointments if apt.get("client_id")))
    clients = await db.clients.find({"client_id": {"$in": client_ids}}).to_list(length=100)
    client_map = {c["client_id"]: c for c in clients}

    # Enrich appointments
    enriched = []
    for apt in appointments:
        client = client_map.get(apt.get("client_id"), {})
        address = apt.get("address") or client.get("address") or {}
        location = apt.get("location") or {}

        if not location.get("lat") and address:
            location = {
                "lat": address.get("latitude") or address.get("lat"),
                "lng": address.get("longitude") or address.get("lng") or address.get("lon")
            }

        enriched.append({
            "appointment_id": apt.get("appointment_id"),
            "client_name": f"{client.get('first_name', '')} {client.get('last_name', '')}".strip() or "Unknown",
            "scheduled_time": apt.get("scheduled_time", ""),
            "duration_minutes": apt.get("duration_minutes", 60),
            "services": apt.get("services", []),
            "location": location,
            "address": address,
            "address_display": routing_service._format_address(address),
            "status": apt.get("status"),
        })

    # Set start location if provided
    start_location = None
    if request.start_lat and request.start_lng:
        start_location = (request.start_lat, request.start_lng)

    try:
        result = await routing_service.optimize_route(enriched, start_location)

        return {
            "success": True,
            "data": result
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to optimize route: {str(e)}"
        )


@router.get(
    "/travel-time",
    response_model=dict,
    summary="Get travel time between two points"
)
async def get_travel_time(
    origin_lat: float = Query(..., description="Origin latitude"),
    origin_lng: float = Query(..., description="Origin longitude"),
    dest_lat: float = Query(..., description="Destination latitude"),
    dest_lng: float = Query(..., description="Destination longitude"),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get travel time and distance between two coordinates"""
    routing_service = RoutingService(db)

    try:
        result = await routing_service.get_travel_time(
            origin=(origin_lat, origin_lng),
            destination=(dest_lat, dest_lng)
        )

        return {
            "success": True,
            "data": result
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to calculate travel time: {str(e)}"
        )


@router.get(
    "/navigation-links",
    response_model=dict,
    summary="Get navigation app URLs for a location"
)
async def get_navigation_links(
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude"),
    label: Optional[str] = Query(None, description="Location label/name"),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get deep links for Google Maps, Apple Maps, and Waze"""
    routing_service = RoutingService(db)

    return {
        "success": True,
        "data": {
            "google_maps": routing_service.get_google_maps_url(lat, lng, label),
            "apple_maps": routing_service.get_apple_maps_url(lat, lng, label),
            "waze": routing_service.get_waze_url(lat, lng),
        }
    }


@router.get(
    "/staff-routes",
    response_model=dict,
    summary="Get routes for all staff on a given date"
)
async def get_staff_routes(
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get optimized routes for all staff members on a given date"""
    routing_service = RoutingService(db)

    # Get all active staff
    staff_list = await db.staff.find({
        "business_id": current_user.business_id,
        "is_active": True,
        "deleted_at": None
    }).to_list(length=50)

    routes = []
    for staff in staff_list:
        staff_id = staff.get("staff_id")
        route = await routing_service.get_daily_route(
            business_id=current_user.business_id,
            date=date,
            staff_id=staff_id
        )

        if route.get("stops"):
            routes.append({
                "staff_id": staff_id,
                "staff_name": f"{staff.get('first_name', '')} {staff.get('last_name', '')}".strip(),
                "route": route
            })

    return {
        "success": True,
        "data": {
            "date": date,
            "staff_routes": routes,
            "total_staff_with_appointments": len(routes)
        }
    }
