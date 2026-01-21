"""
Route Optimization Service
Calculates optimal routes for daily crew scheduling using OSRM or Google Directions API
"""

import os
import httpx
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any, Tuple
from motor.motor_asyncio import AsyncIOMotorDatabase
import math

logger = logging.getLogger(__name__)

# OSRM public demo server (for development)
OSRM_BASE_URL = os.getenv("OSRM_BASE_URL", "https://router.project-osrm.org")
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")


class RoutingService:
    """Service for route optimization and travel time calculations"""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.use_google = bool(GOOGLE_MAPS_API_KEY)

    # ============== Distance/Time Calculations ==============

    def haversine_distance(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculate distance between two points in km (fallback when no API available)"""
        R = 6371  # Earth's radius in km

        lat1_rad = math.radians(lat1)
        lat2_rad = math.radians(lat2)
        delta_lat = math.radians(lat2 - lat1)
        delta_lon = math.radians(lon2 - lon1)

        a = (math.sin(delta_lat / 2) ** 2 +
             math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2)
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

        return R * c

    async def get_travel_time_osrm(
        self,
        origin: Tuple[float, float],
        destination: Tuple[float, float]
    ) -> Dict[str, Any]:
        """Get travel time and distance using OSRM"""
        origin_str = f"{origin[1]},{origin[0]}"  # OSRM uses lon,lat
        dest_str = f"{destination[1]},{destination[0]}"

        url = f"{OSRM_BASE_URL}/route/v1/driving/{origin_str};{dest_str}"
        params = {"overview": "full", "geometries": "geojson"}

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(url, params=params, timeout=10.0)

                if response.status_code == 200:
                    data = response.json()
                    if data.get("routes"):
                        route = data["routes"][0]
                        return {
                            "duration_seconds": route["duration"],
                            "duration_minutes": round(route["duration"] / 60),
                            "distance_meters": route["distance"],
                            "distance_miles": round(route["distance"] / 1609.34, 1),
                            "geometry": route.get("geometry"),
                        }
        except Exception as e:
            logger.error(f"OSRM request failed: {e}")

        # Fallback to straight-line estimate
        distance_km = self.haversine_distance(origin[0], origin[1], destination[0], destination[1])
        estimated_minutes = round(distance_km / 0.5)  # Assume ~30 km/h average

        return {
            "duration_seconds": estimated_minutes * 60,
            "duration_minutes": estimated_minutes,
            "distance_meters": distance_km * 1000,
            "distance_miles": round(distance_km * 0.621371, 1),
            "geometry": None,
            "estimated": True
        }

    async def get_travel_time_google(
        self,
        origin: Tuple[float, float],
        destination: Tuple[float, float]
    ) -> Dict[str, Any]:
        """Get travel time and distance using Google Directions API"""
        url = "https://maps.googleapis.com/maps/api/directions/json"
        params = {
            "origin": f"{origin[0]},{origin[1]}",
            "destination": f"{destination[0]},{destination[1]}",
            "key": GOOGLE_MAPS_API_KEY,
            "mode": "driving",
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(url, params=params, timeout=10.0)

                if response.status_code == 200:
                    data = response.json()
                    if data.get("routes"):
                        leg = data["routes"][0]["legs"][0]
                        return {
                            "duration_seconds": leg["duration"]["value"],
                            "duration_minutes": round(leg["duration"]["value"] / 60),
                            "distance_meters": leg["distance"]["value"],
                            "distance_miles": round(leg["distance"]["value"] / 1609.34, 1),
                            "polyline": data["routes"][0].get("overview_polyline", {}).get("points"),
                        }
        except Exception as e:
            logger.error(f"Google Directions request failed: {e}")

        return await self.get_travel_time_osrm(origin, destination)

    async def get_travel_time(
        self,
        origin: Tuple[float, float],
        destination: Tuple[float, float]
    ) -> Dict[str, Any]:
        """Get travel time using available API"""
        if self.use_google:
            return await self.get_travel_time_google(origin, destination)
        return await self.get_travel_time_osrm(origin, destination)

    # ============== Route Matrix ==============

    async def get_distance_matrix_osrm(
        self,
        locations: List[Tuple[float, float]]
    ) -> List[List[Dict[str, Any]]]:
        """Get distance/duration matrix using OSRM Table service"""
        if len(locations) < 2:
            return []

        coords = ";".join([f"{loc[1]},{loc[0]}" for loc in locations])
        url = f"{OSRM_BASE_URL}/table/v1/driving/{coords}"
        params = {"annotations": "duration,distance"}

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(url, params=params, timeout=30.0)

                if response.status_code == 200:
                    data = response.json()
                    durations = data.get("durations", [])
                    distances = data.get("distances", [])

                    matrix = []
                    for i, dur_row in enumerate(durations):
                        row = []
                        for j, duration in enumerate(dur_row):
                            distance = distances[i][j] if distances else 0
                            row.append({
                                "duration_seconds": duration or 0,
                                "duration_minutes": round((duration or 0) / 60),
                                "distance_meters": distance or 0,
                                "distance_miles": round((distance or 0) / 1609.34, 1),
                            })
                        matrix.append(row)
                    return matrix
        except Exception as e:
            logger.error(f"OSRM matrix request failed: {e}")

        # Fallback to pairwise haversine
        matrix = []
        for i, loc1 in enumerate(locations):
            row = []
            for j, loc2 in enumerate(locations):
                if i == j:
                    row.append({"duration_seconds": 0, "duration_minutes": 0, "distance_meters": 0, "distance_miles": 0})
                else:
                    dist_km = self.haversine_distance(loc1[0], loc1[1], loc2[0], loc2[1])
                    row.append({
                        "duration_seconds": round(dist_km / 0.5 * 60),
                        "duration_minutes": round(dist_km / 0.5),
                        "distance_meters": round(dist_km * 1000),
                        "distance_miles": round(dist_km * 0.621371, 1),
                        "estimated": True
                    })
            matrix.append(row)
        return matrix

    # ============== Route Optimization ==============

    def nearest_neighbor_tsp(
        self,
        matrix: List[List[Dict[str, Any]]],
        start_index: int = 0
    ) -> List[int]:
        """Simple nearest neighbor TSP algorithm for route optimization"""
        n = len(matrix)
        if n <= 2:
            return list(range(n))

        visited = [False] * n
        route = [start_index]
        visited[start_index] = True

        current = start_index
        while len(route) < n:
            nearest = -1
            nearest_dist = float('inf')

            for j in range(n):
                if not visited[j]:
                    dist = matrix[current][j]["duration_seconds"]
                    if dist < nearest_dist:
                        nearest = j
                        nearest_dist = dist

            if nearest != -1:
                route.append(nearest)
                visited[nearest] = True
                current = nearest

        return route

    async def optimize_route(
        self,
        appointments: List[Dict[str, Any]],
        start_location: Optional[Tuple[float, float]] = None
    ) -> Dict[str, Any]:
        """
        Optimize appointment order to minimize travel time.
        Returns optimized order with ETAs and travel times.
        """
        if not appointments:
            return {"stops": [], "total_duration_minutes": 0, "total_distance_miles": 0}

        # Extract locations from appointments
        locations = []
        valid_appointments = []

        for apt in appointments:
            location = apt.get("location")
            if location and location.get("lat") and location.get("lng"):
                locations.append((location["lat"], location["lng"]))
                valid_appointments.append(apt)
            elif apt.get("address"):
                # If no geocoded location, try to use address coordinates if available
                addr = apt["address"]
                if addr.get("latitude") and addr.get("longitude"):
                    locations.append((addr["latitude"], addr["longitude"]))
                    valid_appointments.append(apt)

        if not locations:
            # Return appointments in original order with no route info
            return {
                "stops": [{
                    "appointment_id": apt.get("appointment_id"),
                    "order": i + 1,
                    "scheduled_time": apt.get("scheduled_time"),
                    "client_name": apt.get("client_name", "Unknown"),
                    "address": apt.get("address_display", ""),
                    "travel_time_minutes": 0,
                    "travel_distance_miles": 0,
                    "eta": apt.get("scheduled_time"),
                } for i, apt in enumerate(appointments)],
                "total_duration_minutes": 0,
                "total_distance_miles": 0,
                "optimized": False,
                "message": "No geocoded locations available"
            }

        # Add start location if provided (e.g., office or home base)
        if start_location:
            locations.insert(0, start_location)
            has_start = True
        else:
            has_start = False

        # Get distance matrix
        matrix = await self.get_distance_matrix_osrm(locations)

        if not matrix:
            return {
                "stops": [],
                "total_duration_minutes": 0,
                "total_distance_miles": 0,
                "optimized": False,
                "error": "Failed to calculate distance matrix"
            }

        # Optimize route
        optimal_order = self.nearest_neighbor_tsp(matrix, start_index=0)

        # Build result with travel times and ETAs
        stops = []
        total_travel_minutes = 0
        total_distance_miles = 0

        # Parse first appointment time to calculate ETAs
        if valid_appointments:
            first_time_str = valid_appointments[0].get("scheduled_time", "08:00")
            try:
                base_time = datetime.strptime(first_time_str, "%H:%M")
            except:
                base_time = datetime.strptime("08:00", "%H:%M")
        else:
            base_time = datetime.strptime("08:00", "%H:%M")

        current_time = base_time
        prev_idx = 0

        for order_num, route_idx in enumerate(optimal_order):
            if has_start and route_idx == 0:
                continue  # Skip start location

            apt_idx = route_idx - 1 if has_start else route_idx
            if apt_idx < 0 or apt_idx >= len(valid_appointments):
                continue

            apt = valid_appointments[apt_idx]

            # Calculate travel time from previous stop
            travel_info = matrix[prev_idx][route_idx]
            travel_minutes = travel_info["duration_minutes"]
            travel_miles = travel_info["distance_miles"]

            total_travel_minutes += travel_minutes
            total_distance_miles += travel_miles

            # Calculate ETA
            current_time = current_time + timedelta(minutes=travel_minutes)

            stops.append({
                "appointment_id": apt.get("appointment_id"),
                "order": len(stops) + 1,
                "scheduled_time": apt.get("scheduled_time"),
                "client_name": apt.get("client_name", "Unknown"),
                "address": apt.get("address_display", ""),
                "location": {
                    "lat": locations[route_idx][0],
                    "lng": locations[route_idx][1]
                },
                "travel_time_minutes": travel_minutes,
                "travel_distance_miles": travel_miles,
                "eta": current_time.strftime("%H:%M"),
                "services": apt.get("services", []),
                "duration_minutes": apt.get("duration_minutes", 60),
            })

            # Add service duration for next ETA calculation
            service_duration = apt.get("duration_minutes", 60)
            current_time = current_time + timedelta(minutes=service_duration)
            prev_idx = route_idx

        return {
            "stops": stops,
            "total_travel_minutes": total_travel_minutes,
            "total_distance_miles": round(total_distance_miles, 1),
            "optimized": True,
            "start_location": start_location if has_start else None,
        }

    # ============== Daily Route ==============

    async def get_daily_route(
        self,
        business_id: str,
        date: str,
        staff_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get optimized route for a specific day and optionally a specific staff member"""

        # Build query
        query = {
            "business_id": business_id,
            "scheduled_date": date,
            "status": {"$in": ["scheduled", "confirmed", "in_progress"]},
            "deleted_at": None
        }

        if staff_id:
            query["staff_ids"] = staff_id

        # Get appointments
        appointments = await self.db.appointments.find(query).sort("scheduled_time", 1).to_list(length=100)

        if not appointments:
            return {
                "date": date,
                "staff_id": staff_id,
                "stops": [],
                "total_travel_minutes": 0,
                "total_distance_miles": 0,
                "message": "No appointments found for this date"
            }

        # Enrich appointments with client info
        client_ids = list(set(apt.get("client_id") for apt in appointments if apt.get("client_id")))
        clients = await self.db.clients.find({"client_id": {"$in": client_ids}}).to_list(length=100)
        client_map = {c["client_id"]: c for c in clients}

        enriched_appointments = []
        for apt in appointments:
            client = client_map.get(apt.get("client_id"), {})

            # Get location from appointment or client
            location = apt.get("location") or {}
            address = apt.get("address") or client.get("address") or {}

            if not location.get("lat") and address:
                location = {
                    "lat": address.get("latitude") or address.get("lat"),
                    "lng": address.get("longitude") or address.get("lng") or address.get("lon")
                }

            enriched_appointments.append({
                "appointment_id": apt.get("appointment_id"),
                "client_name": f"{client.get('first_name', '')} {client.get('last_name', '')}".strip() or "Unknown",
                "scheduled_time": apt.get("scheduled_time", ""),
                "duration_minutes": apt.get("duration_minutes", 60),
                "services": apt.get("services", []),
                "location": location,
                "address": address,
                "address_display": self._format_address(address),
                "status": apt.get("status"),
                "notes": apt.get("notes"),
            })

        # Get business start location (office)
        business = await self.db.businesses.find_one({"business_id": business_id})
        start_location = None
        if business and business.get("address"):
            addr = business["address"]
            if addr.get("latitude") and addr.get("longitude"):
                start_location = (addr["latitude"], addr["longitude"])

        # Optimize route
        result = await self.optimize_route(enriched_appointments, start_location)
        result["date"] = date
        result["staff_id"] = staff_id

        return result

    def _format_address(self, address: Dict) -> str:
        """Format address dict to display string"""
        if not address:
            return ""

        parts = []
        if address.get("street"):
            parts.append(address["street"])
        if address.get("city"):
            city_state = address["city"]
            if address.get("state"):
                city_state += f", {address['state']}"
            parts.append(city_state)
        if address.get("zip"):
            parts.append(address["zip"])

        return ", ".join(parts) if parts else ""

    # ============== Navigation Links ==============

    def get_google_maps_url(self, lat: float, lng: float, label: Optional[str] = None) -> str:
        """Generate Google Maps navigation URL"""
        if label:
            return f"https://www.google.com/maps/dir/?api=1&destination={lat},{lng}&destination_place_id={label}"
        return f"https://www.google.com/maps/dir/?api=1&destination={lat},{lng}"

    def get_apple_maps_url(self, lat: float, lng: float, label: Optional[str] = None) -> str:
        """Generate Apple Maps navigation URL"""
        if label:
            return f"http://maps.apple.com/?daddr={lat},{lng}&dirflg=d&t=m"
        return f"http://maps.apple.com/?daddr={lat},{lng}&dirflg=d"

    def get_waze_url(self, lat: float, lng: float) -> str:
        """Generate Waze navigation URL"""
        return f"https://waze.com/ul?ll={lat},{lng}&navigate=yes"
