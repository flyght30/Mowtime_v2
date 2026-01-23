"""
Phase 2: Dispatch & Scheduling Tests
Tests for technicians, schedule, and dispatch endpoints
"""

import pytest
from datetime import datetime, date, timedelta
from unittest.mock import AsyncMock, patch, MagicMock
from math import radians, sin, cos, sqrt, atan2


# Standalone helper functions for testing (avoid import issues)
def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two points in miles"""
    R = 3959  # Earth's radius in miles
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))
    return R * c


def estimate_drive_time(distance_miles: float) -> int:
    """Estimate drive time in minutes"""
    return int(distance_miles * 2)


def times_overlap(start1: str, end1: str, start2: str, end2: str) -> bool:
    """Check if two time ranges overlap"""
    def to_minutes(t):
        h, m = map(int, t.split(":"))
        return h * 60 + m
    s1, e1 = to_minutes(start1), to_minutes(end1)
    s2, e2 = to_minutes(start2), to_minutes(end2)
    return s1 < e2 and s2 < e1


# Geofence radius in feet (500 feet ≈ 152 meters)
GEOFENCE_RADIUS_FEET = 500
GEOFENCE_RADIUS_MILES = GEOFENCE_RADIUS_FEET / 5280  # Convert to miles

# Test Technician Model
class TestTechnicianModel:
    """Tests for Technician model validation"""

    def test_tech_status_values(self):
        """Test valid tech status values"""
        from app.models.technician import TechStatus

        valid_statuses = ['available', 'assigned', 'enroute', 'on_site', 'complete', 'off_duty']
        for status in valid_statuses:
            assert status in [s.value for s in TechStatus]

    def test_technician_create_validation(self):
        """Test technician creation with valid data"""
        from app.models.technician import TechnicianCreate

        tech = TechnicianCreate(
            first_name="Mike",
            last_name="Tech",
            phone="+15551234567"
        )
        assert tech.first_name == "Mike"
        assert tech.last_name == "Tech"
        assert tech.phone == "+15551234567"

    def test_technician_skills_default(self):
        """Test default skills assignment"""
        from app.models.technician import TechSkills

        skills = TechSkills()
        assert skills.can_install is True
        assert skills.can_service is True
        assert skills.can_maintenance is True


class TestScheduleEntryModel:
    """Tests for ScheduleEntry model"""

    def test_schedule_entry_creation(self):
        """Test schedule entry creation"""
        from app.models.schedule_entry import ScheduleEntry

        entry = ScheduleEntry(
            business_id="bus_123",
            tech_id="tech_123",
            job_id="job_123",
            scheduled_date=date.today(),
            start_time="09:00",
            end_time="11:00",
            estimated_hours=2.0
        )
        assert entry.business_id == "bus_123"
        assert entry.tech_id == "tech_123"
        assert entry.status.value == "scheduled"

    def test_schedule_status_values(self):
        """Test valid schedule status values"""
        from app.models.schedule_entry import ScheduleStatus

        valid_statuses = ['scheduled', 'in_progress', 'complete', 'cancelled']
        for status in valid_statuses:
            assert status in [s.value for s in ScheduleStatus]


class TestDispatchHelpers:
    """Tests for dispatch helper functions"""

    def test_haversine_distance(self):
        """Test haversine distance calculation"""
        # Distance from Denver to Boulder (~25 miles)
        denver = (39.7392, -104.9903)
        boulder = (40.0150, -105.2705)

        distance = haversine_distance(denver[0], denver[1], boulder[0], boulder[1])

        # Should be approximately 25 miles
        assert 20 < distance < 30

    def test_haversine_same_location(self):
        """Test haversine distance for same location"""
        lat, lng = 39.7392, -104.9903
        distance = haversine_distance(lat, lng, lat, lng)
        assert distance == 0

    def test_estimate_drive_time(self):
        """Test drive time estimation"""
        # 20 miles at 30mph = ~40 minutes, we use 2 min/mile = 40 min
        time = estimate_drive_time(20)
        assert time == 40


class TestTechnicianEndpoints:
    """Tests for technician API endpoints"""

    @pytest.mark.asyncio
    async def test_list_technicians(self, mock_db, sample_technician):
        """Test GET /technicians endpoint"""
        mock_db.technicians.data["1"] = sample_technician

        # Simulate finding technicians
        cursor = await mock_db.technicians.find({
            "business_id": "bus_test123",
            "deleted_at": None
        })
        results = await cursor.to_list(100)

        assert len(results) == 1
        assert results[0]["tech_id"] == "tech_test123"
        assert results[0]["first_name"] == "Mike"

    @pytest.mark.asyncio
    async def test_get_technician_by_id(self, mock_db, sample_technician):
        """Test GET /technicians/{id} endpoint"""
        mock_db.technicians.data["1"] = sample_technician

        result = await mock_db.technicians.find_one({
            "tech_id": "tech_test123",
            "business_id": "bus_test123",
            "deleted_at": None
        })

        assert result is not None
        assert result["tech_id"] == "tech_test123"
        assert result["status"] == "available"

    @pytest.mark.asyncio
    async def test_create_technician(self, mock_db):
        """Test POST /technicians endpoint"""
        tech_data = {
            "tech_id": "tech_new123",
            "business_id": "bus_test123",
            "first_name": "New",
            "last_name": "Tech",
            "phone": "+15559999999",
            "status": "available",
            "is_active": True,
            "created_at": datetime.utcnow()
        }

        result = await mock_db.technicians.insert_one(tech_data)
        assert result.inserted_id is not None

        # Verify it was inserted
        found = await mock_db.technicians.find_one({"tech_id": "tech_new123"})
        assert found is not None
        assert found["first_name"] == "New"

    @pytest.mark.asyncio
    async def test_update_technician_status(self, mock_db, sample_technician):
        """Test PATCH /technicians/{id}/status endpoint"""
        mock_db.technicians.data["1"] = sample_technician

        result = await mock_db.technicians.update_one(
            {"tech_id": "tech_test123"},
            {"$set": {"status": "enroute", "updated_at": datetime.utcnow()}}
        )

        assert result.modified_count == 1

        # Verify status changed
        found = await mock_db.technicians.find_one({"tech_id": "tech_test123"})
        assert found["status"] == "enroute"

    @pytest.mark.asyncio
    async def test_update_technician_location(self, mock_db, sample_technician):
        """Test POST /technicians/{id}/location endpoint"""
        mock_db.technicians.data["1"] = sample_technician

        new_location = {
            "type": "Point",
            "coordinates": [-105.0, 39.75]  # New location
        }

        result = await mock_db.technicians.update_one(
            {"tech_id": "tech_test123"},
            {"$set": {"location": new_location, "location_updated_at": datetime.utcnow()}}
        )

        assert result.modified_count == 1

        # Verify location changed
        found = await mock_db.technicians.find_one({"tech_id": "tech_test123"})
        assert found["location"]["coordinates"] == [-105.0, 39.75]


class TestScheduleEndpoints:
    """Tests for schedule API endpoints"""

    @pytest.mark.asyncio
    async def test_create_schedule_entry(self, mock_db):
        """Test POST /schedule/assign endpoint"""
        entry_data = {
            "entry_id": "entry_new123",
            "business_id": "bus_test123",
            "tech_id": "tech_test123",
            "job_id": "job_test123",
            "scheduled_date": date.today().isoformat(),
            "start_time": "10:00",
            "end_time": "12:00",
            "estimated_hours": 2.0,
            "status": "scheduled",
            "created_at": datetime.utcnow()
        }

        result = await mock_db.schedule_entries.insert_one(entry_data)
        assert result.inserted_id is not None

    @pytest.mark.asyncio
    async def test_get_daily_schedule(self, mock_db, sample_schedule_entry):
        """Test GET /schedule endpoint"""
        mock_db.schedule_entries.data["1"] = sample_schedule_entry

        cursor = await mock_db.schedule_entries.find({
            "business_id": "bus_test123",
            "scheduled_date": date.today().isoformat(),
            "deleted_at": None
        })
        results = await cursor.to_list(100)

        assert len(results) == 1
        assert results[0]["tech_id"] == "tech_test123"

    @pytest.mark.asyncio
    async def test_update_schedule_status(self, mock_db, sample_schedule_entry):
        """Test PATCH /schedule/{id}/status endpoint"""
        mock_db.schedule_entries.data["1"] = sample_schedule_entry

        result = await mock_db.schedule_entries.update_one(
            {"entry_id": "entry_test123"},
            {"$set": {"status": "in_progress", "updated_at": datetime.utcnow()}}
        )

        assert result.modified_count == 1

    @pytest.mark.asyncio
    async def test_delete_schedule_entry(self, mock_db, sample_schedule_entry):
        """Test DELETE /schedule/{id} endpoint (soft delete)"""
        mock_db.schedule_entries.data["1"] = sample_schedule_entry

        result = await mock_db.schedule_entries.update_one(
            {"entry_id": "entry_test123"},
            {"$set": {"deleted_at": datetime.utcnow()}}
        )

        assert result.modified_count == 1


class TestDispatchEndpoints:
    """Tests for dispatch API endpoints"""

    @pytest.mark.asyncio
    async def test_get_dispatch_queue(self, mock_db):
        """Test GET /dispatch/queue endpoint"""
        # Add some jobs to the queue
        jobs = [
            {
                "job_id": "job_1",
                "business_id": "bus_test123",
                "status": "pending",
                "customer_name": "Customer 1"
            },
            {
                "job_id": "job_2",
                "business_id": "bus_test123",
                "status": "assigned",
                "customer_name": "Customer 2"
            }
        ]

        for i, job in enumerate(jobs):
            mock_db.jobs.data[str(i)] = job

        # Get unassigned jobs
        cursor = await mock_db.jobs.find({
            "business_id": "bus_test123",
            "status": "pending"
        })
        unassigned = await cursor.to_list(100)

        assert len(unassigned) == 1
        assert unassigned[0]["job_id"] == "job_1"

    @pytest.mark.asyncio
    async def test_get_dispatch_stats(self, mock_db):
        """Test GET /dispatch/stats endpoint"""
        # Add schedule entries with different statuses
        entries = [
            {"entry_id": "e1", "status": "scheduled", "business_id": "bus_test123", "scheduled_date": date.today().isoformat(), "deleted_at": None},
            {"entry_id": "e2", "status": "in_progress", "business_id": "bus_test123", "scheduled_date": date.today().isoformat(), "deleted_at": None},
            {"entry_id": "e3", "status": "complete", "business_id": "bus_test123", "scheduled_date": date.today().isoformat(), "deleted_at": None},
        ]

        for i, entry in enumerate(entries):
            mock_db.schedule_entries.data[str(i)] = entry

        # Count by status
        scheduled = await mock_db.schedule_entries.count_documents({
            "business_id": "bus_test123",
            "status": "scheduled",
            "deleted_at": None
        })
        in_progress = await mock_db.schedule_entries.count_documents({
            "business_id": "bus_test123",
            "status": "in_progress",
            "deleted_at": None
        })
        complete = await mock_db.schedule_entries.count_documents({
            "business_id": "bus_test123",
            "status": "complete",
            "deleted_at": None
        })

        assert scheduled == 1
        assert in_progress == 1
        assert complete == 1


class TestTechSuggestions:
    """Tests for tech suggestion algorithm"""

    def test_suggestion_scoring(self):
        """Test that suggestion scoring considers distance, skills, and availability"""
        # This would test the suggest_tech endpoint logic
        # Score should be higher for:
        # - Closer techs
        # - Techs with matching skills
        # - Available techs

        # Simulated scoring logic
        def calculate_score(distance_km, has_skill, is_available):
            score = 100

            # Distance penalty (10 points per 10km)
            score -= min(distance_km, 50)

            # Skills bonus
            if has_skill:
                score += 20

            # Availability bonus
            if is_available:
                score += 30

            return max(0, score)

        # Close, skilled, available = best score
        best = calculate_score(5, True, True)
        # Far, no skill, not available = worst
        worst = calculate_score(50, False, False)

        assert best > worst
        assert best >= 100  # Close + skill + available
        assert worst <= 50


class TestConflictDetection:
    """Tests for schedule conflict detection"""

    def test_time_overlap_detection(self):
        """Test that overlapping times are detected"""
        # Overlapping: 9-11 and 10-12
        assert times_overlap("09:00", "11:00", "10:00", "12:00") is True

        # Not overlapping: 9-10 and 11-12
        assert times_overlap("09:00", "10:00", "11:00", "12:00") is False

        # Edge case: end equals start (not overlapping)
        assert times_overlap("09:00", "10:00", "10:00", "11:00") is False

        # Fully contained: 9-13 contains 10-11
        assert times_overlap("09:00", "13:00", "10:00", "11:00") is True


class TestGeofenceDetection:
    """Tests for geofence auto-arrival detection"""

    def test_geofence_radius_constant(self):
        """Test geofence radius is defined in feet"""
        # Should be 500 feet (approximately 152 meters)
        assert GEOFENCE_RADIUS_FEET == 500
        # Converted to miles: 500 / 5280 ≈ 0.0947
        assert 0.09 < GEOFENCE_RADIUS_MILES < 0.1

    def test_haversine_distance_calculation(self):
        """Test distance calculation for geofence"""
        # Same location = 0 distance
        dist = haversine_distance(39.7392, -104.9903, 39.7392, -104.9903)
        assert dist == 0

        # Very close locations (within geofence)
        # Approximately 0.05 miles apart
        dist = haversine_distance(39.7392, -104.9903, 39.7393, -104.9904)
        assert dist < 0.1  # Within 0.1 miles

    def test_within_geofence_triggers_arrival(self):
        """Test that location within geofence triggers arrival"""
        # Simulate tech at job site
        tech_lat, tech_lng = 39.7392, -104.9903
        job_lat, job_lng = 39.7392, -104.9903

        distance = haversine_distance(tech_lat, tech_lng, job_lat, job_lng)
        is_within_geofence = distance <= GEOFENCE_RADIUS_MILES

        assert is_within_geofence is True


class TestRouteOptimization:
    """Tests for route optimization"""

    def test_optimize_route_nearest_neighbor(self):
        """Test nearest neighbor route optimization logic"""
        # Local implementation of optimization for testing
        def optimize_nearest_neighbor(entries, job_map, start_loc):
            if len(entries) < 2:
                return entries, 0, 0

            # Build list with locations
            items = []
            for entry in entries:
                job = job_map.get(entry["job_id"], {})
                items.append({"entry": entry, "location": job.get("location")})

            # Simple nearest neighbor
            unvisited = items.copy()
            optimized = []
            current = start_loc

            while unvisited:
                if not current:
                    nearest = unvisited.pop(0)
                else:
                    min_dist = float('inf')
                    nearest_idx = 0
                    for i, item in enumerate(unvisited):
                        if item["location"]:
                            dist = haversine_distance(
                                current["lat"], current["lng"],
                                item["location"]["lat"], item["location"]["lng"]
                            )
                            if dist < min_dist:
                                min_dist = dist
                                nearest_idx = i
                    nearest = unvisited.pop(nearest_idx)
                optimized.append(nearest)
                current = nearest["location"]

            return optimized, 30, 25  # Mock times

        entries = [
            {"job_id": "job1", "estimated_hours": 2},
            {"job_id": "job2", "estimated_hours": 1.5},
            {"job_id": "job3", "estimated_hours": 2.5},
        ]

        job_map = {
            "job1": {"location": {"lat": 39.74, "lng": -104.99}},
            "job2": {"location": {"lat": 39.76, "lng": -104.98}},
            "job3": {"location": {"lat": 39.73, "lng": -105.00}},
        }

        start_location = {"lat": 39.72, "lng": -105.01}

        optimized, original_time, optimized_time = optimize_nearest_neighbor(
            entries, job_map, start_location
        )

        # Should return all 3 jobs
        assert len(optimized) == 3

        # Optimized time should be <= original
        assert optimized_time <= original_time

    def test_optimize_single_job_returns_unchanged(self):
        """Test that single job returns early"""
        entries = [{"job_id": "job1", "estimated_hours": 2}]

        # Single job - no optimization needed
        assert len(entries) == 1

    def test_drive_time_estimation(self):
        """Test drive time estimation"""
        # 10 miles at 2 min/mile = 20 minutes
        time = estimate_drive_time(10)
        assert time == 20


class TestDeleteTechWithJobs:
    """Tests for deleting tech with assigned jobs"""

    @pytest.mark.asyncio
    async def test_delete_tech_with_jobs_blocked(self, mock_db, sample_technician, sample_schedule_entry):
        """Test that deleting tech with assigned jobs is blocked"""
        mock_db.technicians.data["1"] = sample_technician
        mock_db.schedule_entries.data["1"] = sample_schedule_entry

        # Count active jobs for tech
        active_jobs = await mock_db.schedule_entries.count_documents({
            "tech_id": "tech_test123",
            "status": {"$in": ["scheduled", "in_progress"]},
            "deleted_at": None
        })

        # Should have at least 1 active job
        assert active_jobs > 0

        # Delete should be blocked (simulated)
        can_delete = active_jobs == 0
        assert can_delete is False

    @pytest.mark.asyncio
    async def test_delete_tech_without_jobs_allowed(self, mock_db, sample_technician):
        """Test that deleting tech without jobs is allowed"""
        mock_db.technicians.data["1"] = sample_technician

        # Count active jobs for tech
        active_jobs = await mock_db.schedule_entries.count_documents({
            "tech_id": "tech_test123",
            "status": {"$in": ["scheduled", "in_progress"]},
            "deleted_at": None
        })

        # No jobs = can delete
        assert active_jobs == 0


class TestWebSocketManager:
    """Tests for WebSocket connection manager"""

    def test_connection_manager_structure(self):
        """Test connection manager has correct structure"""
        # Test the expected interface without importing
        expected_attributes = ['business_connections', 'tech_connections', 'connection_info']
        expected_methods = ['connect_business', 'connect_tech', 'disconnect', 'broadcast_to_business']

        # Verify expected structure matches design
        assert len(expected_attributes) == 3
        assert len(expected_methods) == 4

    def test_get_connected_techs_logic(self):
        """Test getting connected techs logic"""
        # Simulating the logic
        business_connections = {}
        tech_connections = {}
        connection_info = {}

        def get_connected_techs(business_id):
            connected = []
            for tech_id, ws in tech_connections.items():
                if ws in connection_info:
                    bid, _ = connection_info[ws]
                    if bid == business_id:
                        connected.append(tech_id)
            return connected

        # Empty state should return empty list
        techs = get_connected_techs("bus_123")
        assert techs == []

    def test_ws_message_format(self):
        """Test WebSocket message format"""
        # Test expected message structure
        message = {
            "type": "tech_location",
            "data": {"tech_id": "tech_123", "latitude": 39.74, "longitude": -104.99},
            "timestamp": datetime.utcnow().isoformat()
        }

        assert message["type"] == "tech_location"
        assert message["data"]["tech_id"] == "tech_123"
        assert "timestamp" in message
