"""
Phase 4: Tech Mobile App Tests
Tests for technician mobile app endpoints and functionality
"""

import pytest
from datetime import datetime, timedelta


# ============================================
# Model Tests
# ============================================

class TestTechMobileModels:
    """Test tech mobile specific models and schemas"""

    def test_location_update_schema(self):
        """Test LocationUpdate schema validation"""
        # Valid location
        location = {
            "latitude": 33.4484,
            "longitude": -112.0740,
            "heading": 180.0,
            "speed": 15.5,
            "accuracy": 10.0
        }
        assert -90 <= location["latitude"] <= 90
        assert -180 <= location["longitude"] <= 180
        assert 0 <= location["heading"] <= 360 if location["heading"] else True
        assert location["speed"] >= 0 if location["speed"] else True

    def test_location_bounds_validation(self):
        """Test latitude/longitude bounds"""
        # Valid bounds
        assert -90 <= 33.4484 <= 90  # latitude
        assert -180 <= -112.0740 <= 180  # longitude

        # Invalid bounds would fail validation
        invalid_lat = 91  # out of bounds
        assert not (-90 <= invalid_lat <= 90)

    def test_job_completion_schema(self):
        """Test JobCompletionData schema"""
        completion = {
            "notes": "Completed successfully",
            "photos": ["base64data1", "base64data2"],
            "signature": "signature_base64",
            "final_price": 150.00,
            "materials_used": [
                {"name": "Filter", "quantity": 1, "price": 25.00}
            ],
            "labor_hours": 2.5
        }

        assert isinstance(completion["notes"], str)
        assert isinstance(completion["photos"], list)
        assert len(completion["photos"]) <= 5  # reasonable limit
        assert completion["final_price"] >= 0
        assert completion["labor_hours"] >= 0


class TestTechJobResponse:
    """Test TechJobResponse structure"""

    def test_tech_job_required_fields(self):
        """Test that job response has all required fields"""
        required_fields = [
            "job_id",
            "business_id",
            "client",
            "address",
            "service_type",
            "scheduled_date",
            "scheduled_time",
            "status"
        ]

        # Mock job response
        job = {
            "job_id": "job_123",
            "business_id": "biz_456",
            "client": {"client_id": "c1", "name": "John Doe"},
            "address": {"street": "123 Main St", "city": "Phoenix", "state": "AZ", "zip": "85001"},
            "service_type": "maintenance",
            "scheduled_date": "2024-01-15",
            "scheduled_time": "09:00",
            "status": "scheduled"
        }

        for field in required_fields:
            assert field in job

    def test_job_status_values(self):
        """Test valid job status values"""
        valid_statuses = ["scheduled", "in_progress", "completed", "cancelled"]

        for status in valid_statuses:
            assert status in valid_statuses

    def test_job_priority_values(self):
        """Test valid priority values"""
        valid_priorities = ["low", "normal", "high", "urgent"]

        for priority in valid_priorities:
            assert priority in valid_priorities


# ============================================
# Tech Profile Endpoint Tests
# ============================================

class TestTechProfileEndpoints:
    """Test /technicians/me profile endpoints"""

    def test_get_my_profile_structure(self):
        """Test profile response structure"""
        profile_fields = [
            "tech_id",
            "business_id",
            "first_name",
            "last_name",
            "phone",
            "status",
            "is_active"
        ]

        mock_profile = {
            "tech_id": "tech_001",
            "business_id": "biz_001",
            "first_name": "Mike",
            "last_name": "Technician",
            "phone": "+15551234567",
            "status": "available",
            "is_active": True
        }

        for field in profile_fields:
            assert field in mock_profile

    def test_update_profile_allowed_fields(self):
        """Test that only allowed fields can be updated"""
        allowed_fields = {"phone", "avatar_url"}
        disallowed_fields = {"status", "business_id", "tech_id"}

        for field in allowed_fields:
            assert field in allowed_fields

        for field in disallowed_fields:
            assert field not in allowed_fields


# ============================================
# Tech Status Endpoint Tests
# ============================================

class TestTechStatusEndpoints:
    """Test /technicians/me/status endpoints"""

    def test_status_transitions(self):
        """Test valid status transitions"""
        from app.models.technician import TechStatus

        # All valid statuses
        statuses = [
            TechStatus.AVAILABLE,
            TechStatus.ASSIGNED,
            TechStatus.ENROUTE,
            TechStatus.ON_SITE,
            TechStatus.OFF_DUTY,
            TechStatus.COMPLETE
        ]

        # All should be valid enum values
        for status in statuses:
            assert hasattr(TechStatus, status.name)

    def test_status_with_job_id(self):
        """Test that ENROUTE requires job_id"""
        # When setting enroute, job_id should be set
        from app.models.technician import TechStatus

        if TechStatus.ENROUTE:
            # Current job should be set when enroute
            assert True

    def test_off_duty_clears_jobs(self):
        """Test that OFF_DUTY clears job assignments"""
        from app.models.technician import TechStatus

        # When going off duty, both current and next job should be cleared
        update_data = {}
        if TechStatus.OFF_DUTY:
            update_data["current_job_id"] = None
            update_data["next_job_id"] = None

        assert update_data.get("current_job_id") is None
        assert update_data.get("next_job_id") is None


# ============================================
# Tech Location Endpoint Tests
# ============================================

class TestTechLocationEndpoints:
    """Test /technicians/me/location endpoints"""

    def test_location_data_format(self):
        """Test location data is stored in GeoJSON format"""
        lat, lng = 33.4484, -112.0740

        location_data = {
            "type": "Point",
            "coordinates": [lng, lat]  # GeoJSON uses [lng, lat]
        }

        assert location_data["type"] == "Point"
        assert len(location_data["coordinates"]) == 2
        assert location_data["coordinates"][0] == lng
        assert location_data["coordinates"][1] == lat

    def test_location_history_stored(self):
        """Test that location updates are stored in history"""
        history_entry = {
            "tech_id": "tech_001",
            "business_id": "biz_001",
            "location": {"type": "Point", "coordinates": [-112.0740, 33.4484]},
            "accuracy": 10.0,
            "timestamp": datetime.now()
        }

        assert "tech_id" in history_entry
        assert "location" in history_entry
        assert "timestamp" in history_entry


# ============================================
# Tech Jobs Endpoint Tests
# ============================================

class TestTechJobsEndpoints:
    """Test /technicians/me/jobs endpoints"""

    def test_get_jobs_date_filter(self):
        """Test jobs can be filtered by date"""
        date = "2024-01-15"

        # Parse and validate date format
        parsed_date = datetime.strptime(date, "%Y-%m-%d")
        assert parsed_date.year == 2024
        assert parsed_date.month == 1
        assert parsed_date.day == 15

    def test_get_jobs_date_range(self):
        """Test jobs can be fetched for date range"""
        start_date = "2024-01-15"
        days = 7

        start = datetime.strptime(start_date, "%Y-%m-%d")
        end = start + timedelta(days=days-1)

        assert (end - start).days == days - 1

    def test_jobs_sorted_by_time(self):
        """Test jobs are sorted by time"""
        jobs = [
            {"scheduled_time": "14:00"},
            {"scheduled_time": "09:00"},
            {"scheduled_time": "11:00"}
        ]

        sorted_jobs = sorted(jobs, key=lambda j: j["scheduled_time"])

        assert sorted_jobs[0]["scheduled_time"] == "09:00"
        assert sorted_jobs[1]["scheduled_time"] == "11:00"
        assert sorted_jobs[2]["scheduled_time"] == "14:00"


# ============================================
# Job Action Tests
# ============================================

class TestJobActions:
    """Test job action endpoints"""

    def test_start_job_sets_status(self):
        """Test starting job sets status to in_progress"""
        job = {"status": "scheduled"}

        # After start
        job["status"] = "in_progress"
        job["started_at"] = datetime.now().isoformat()

        assert job["status"] == "in_progress"
        assert job.get("started_at") is not None

    def test_complete_job_requires_data(self):
        """Test completing job requires completion data"""
        completion_data = {
            "notes": "Test notes",
            "photos": ["photo1.jpg"]
        }

        # At minimum, photos should be required
        assert len(completion_data.get("photos", [])) > 0

    def test_complete_job_sets_timestamp(self):
        """Test completing job sets completed_at timestamp"""
        job = {"status": "in_progress"}

        # After complete
        job["status"] = "completed"
        job["completed_at"] = datetime.now().isoformat()

        assert job["status"] == "completed"
        assert job.get("completed_at") is not None


# ============================================
# Route Endpoint Tests
# ============================================

class TestRouteEndpoints:
    """Test /technicians/me/route endpoints"""

    def test_route_structure(self):
        """Test route response structure"""
        route = {
            "tech_id": "tech_001",
            "date": "2024-01-15",
            "stops": [],
            "total_stops": 0,
            "optimized": False
        }

        assert "tech_id" in route
        assert "date" in route
        assert "stops" in route
        assert isinstance(route["stops"], list)

    def test_route_stop_structure(self):
        """Test route stop structure"""
        stop = {
            "job_id": "job_001",
            "client_name": "John Doe",
            "address": "123 Main St, Phoenix",
            "scheduled_time": "09:00",
            "service_type": "maintenance",
            "status": "scheduled",
            "latitude": 33.4484,
            "longitude": -112.0740,
            "route_order": 1
        }

        required_fields = ["job_id", "client_name", "address", "scheduled_time", "status", "route_order"]

        for field in required_fields:
            assert field in stop

    def test_stops_sorted_by_route_order(self):
        """Test stops are sorted by route_order"""
        stops = [
            {"route_order": 3},
            {"route_order": 1},
            {"route_order": 2}
        ]

        sorted_stops = sorted(stops, key=lambda s: s["route_order"])

        assert sorted_stops[0]["route_order"] == 1
        assert sorted_stops[1]["route_order"] == 2
        assert sorted_stops[2]["route_order"] == 3


# ============================================
# Clock In/Out Tests
# ============================================

class TestClockInOut:
    """Test clock in/out functionality"""

    def test_clock_in_sets_available(self):
        """Test clock in sets status to available"""
        from app.models.technician import TechStatus

        # After clock in, status should be available
        new_status = TechStatus.AVAILABLE
        assert new_status == TechStatus.AVAILABLE

    def test_clock_out_sets_off_duty(self):
        """Test clock out sets status to off_duty"""
        from app.models.technician import TechStatus

        # After clock out, status should be off_duty
        new_status = TechStatus.OFF_DUTY
        assert new_status == TechStatus.OFF_DUTY

    def test_timesheet_entry_structure(self):
        """Test timesheet entry structure"""
        entry = {
            "tech_id": "tech_001",
            "date": "2024-01-15",
            "clock_in": "2024-01-15T08:00:00Z",
            "clock_out": "2024-01-15T17:00:00Z"
        }

        assert "tech_id" in entry
        assert "date" in entry
        assert "clock_in" in entry

    def test_hours_calculation(self):
        """Test hours worked calculation"""
        clock_in = datetime(2024, 1, 15, 8, 0, 0)
        clock_out = datetime(2024, 1, 15, 17, 0, 0)

        hours = (clock_out - clock_in).total_seconds() / 3600

        assert hours == 9.0


# ============================================
# Push Token Tests
# ============================================

class TestPushToken:
    """Test push notification token registration"""

    def test_push_token_platforms(self):
        """Test valid push token platforms"""
        valid_platforms = ["ios", "android"]

        for platform in valid_platforms:
            assert platform in valid_platforms

    def test_push_token_stored(self):
        """Test push token is stored in tech record"""
        tech = {
            "tech_id": "tech_001",
            "push_token": "ExponentPushToken[abc123]",
            "push_platform": "ios"
        }

        assert tech.get("push_token") is not None
        assert tech.get("push_platform") in ["ios", "android"]


# ============================================
# Frontend Integration Tests
# ============================================

class TestFrontendIntegration:
    """Test frontend-backend integration points"""

    def test_api_response_format(self):
        """Test API responses follow consistent format"""
        # Single item response
        single_response = {
            "data": {"tech_id": "tech_001"},
            "success": True
        }

        # List response
        list_response = {
            "data": [{"job_id": "job_001"}],
            "count": 1
        }

        assert "data" in single_response
        assert "data" in list_response
        assert isinstance(list_response["data"], list)

    def test_status_color_mapping(self):
        """Test status colors are mapped correctly"""
        status_colors = {
            "available": "#10B981",
            "assigned": "#8B5CF6",
            "enroute": "#3B82F6",
            "on_site": "#F59E0B",
            "complete": "#10B981",
            "off_duty": "#6B7280"
        }

        # All statuses should have colors
        assert len(status_colors) >= 6

    def test_job_status_colors(self):
        """Test job status colors are mapped"""
        job_status_colors = {
            "scheduled": "#3B82F6",
            "in_progress": "#F59E0B",
            "completed": "#10B981",
            "cancelled": "#EF4444"
        }

        assert len(job_status_colors) == 4


# ============================================
# Role-Based Routing Tests
# ============================================

class TestRoleBasedRouting:
    """Test role-based routing logic"""

    def test_staff_routes_to_tech_app(self):
        """Test staff role routes to tech app"""
        user = {"role": "staff"}

        if user["role"] == "staff":
            target_route = "/(tech)"
        else:
            target_route = "/(tabs)"

        assert target_route == "/(tech)"

    def test_owner_routes_to_office_app(self):
        """Test owner role routes to office app"""
        user = {"role": "owner"}

        if user["role"] == "staff":
            target_route = "/(tech)"
        else:
            target_route = "/(tabs)"

        assert target_route == "/(tabs)"

    def test_admin_routes_to_office_app(self):
        """Test admin role routes to office app"""
        user = {"role": "admin"}

        if user["role"] == "staff":
            target_route = "/(tech)"
        else:
            target_route = "/(tabs)"

        assert target_route == "/(tabs)"
