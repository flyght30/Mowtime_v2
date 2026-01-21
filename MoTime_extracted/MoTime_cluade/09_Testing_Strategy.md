# ServicePro Platform - Testing Strategy

**Status:** Phase 1 Design  
**Target Coverage:** 80%+ critical paths  
**Tools:** pytest (backend), Jest (frontend), Detox (e2e)

---

## Table of Contents

1. [Testing Pyramid](#testing-pyramid)
2. [Unit Testing](#unit-testing)
3. [Integration Testing](#integration-testing)
4. [E2E Testing](#e2e-testing)
5. [Performance Testing](#performance-testing)
6. [Test Data](#test-data)

---

## Testing Pyramid

```
                    ╱╲
                   ╱  ╲   E2E Tests (5-10%)
                  ╱    ╲  Slow, brittle, catch integration issues
                 ╱______╲
               ╱╲       ╱╲
              ╱  ╲  I  ╱  ╲ Integration Tests (20-30%)
             ╱    ╲  ╱    ╲  Test APIs, database interactions
            ╱______╲╱______╲
          ╱╲       ╱╲       ╱╲
         ╱  ╲ U   ╱  ╲  C  ╱  ╲ Unit Tests (60-70%)
        ╱    ╲  ╱    ╲  ╱    ╲  Fast, isolated, pure functions
       ╱______╲╱______╲╱______╲

Ideal Ratio: 70% Unit, 20% Integration, 10% E2E
```

---

## Unit Testing

### Backend (pytest)

**File Structure:**

```
backend/
├── app/
│   ├── scheduling/
│   │   ├── engine.py
│   │   └── conflicts.py
│   ├── weather/
│   │   ├── service.py
│   │   └── rules.py
│   └── notifications/
│       └── sms.py
├── tests/
│   ├── test_scheduling_engine.py
│   ├── test_weather_rules.py
│   ├── test_conflicts.py
│   ├── test_sms_notifications.py
│   └── conftest.py  # Shared fixtures
```

### Example: Scheduling Logic Tests

```python
# tests/test_scheduling_engine.py
import pytest
from app.scheduling.engine import create_appointment, check_conflict
from app.models import Appointment, Staff
from datetime import datetime, timedelta

@pytest.fixture
def business_config():
    """Sample business configuration."""
    return {
        "business_id": "bus_test",
        "timezone": "America/Chicago",
        "business_hours": {
            "monday": {"start": "08:00", "end": "17:00"},
            "tuesday": {"start": "08:00", "end": "17:00"},
            "wednesday": {"start": "08:00", "end": "17:00"},
            "thursday": {"start": "08:00", "end": "17:00"},
            "friday": {"start": "08:00", "end": "17:00"},
            "saturday": None,
            "sunday": None
        },
        "min_gap_between_jobs_minutes": 30
    }

@pytest.fixture
def existing_appointment(business_config):
    """Sample appointment for conflict testing."""
    return {
        "appointment_id": "apt_existing",
        "business_id": business_config["business_id"],
        "scheduled_date": "2025-01-20",
        "scheduled_start_time": "09:00",
        "scheduled_end_time": "10:00",
        "assigned_staff_ids": ["staff_1"],
        "status": "scheduled"
    }

def test_create_appointment_success(business_config):
    """Test successful appointment creation."""
    result = create_appointment(
        business_id="bus_test",
        client_id="cli_test",
        service_id="svc_test",
        scheduled_date="2025-01-20",
        scheduled_start_time="08:00",
        estimated_duration_minutes=60,
        assigned_staff_ids=["staff_1"],
        assigned_equipment_ids=["eq_1"]
    )
    
    assert result["status"] == "created"
    assert result["appointment"]["appointment_id"] is not None

def test_create_appointment_outside_business_hours(business_config):
    """Test appointment creation fails outside business hours."""
    result = create_appointment(
        business_id="bus_test",
        client_id="cli_test",
        service_id="svc_test",
        scheduled_date="2025-01-20",
        scheduled_start_time="18:00",  # After 5pm
        estimated_duration_minutes=60,
        assigned_staff_ids=["staff_1"],
        assigned_equipment_ids=["eq_1"]
    )
    
    assert result["status"] == "error"
    assert "outside business hours" in result["message"]

def test_check_conflict_detects_overlap(existing_appointment):
    """Test conflict detection identifies overlapping appointments."""
    conflict = check_conflict(
        business_id="bus_test",
        staff_ids=["staff_1"],
        scheduled_date="2025-01-20",
        scheduled_start_time="09:30",  # Overlaps with 09:00-10:00
        estimated_duration_minutes=60,
        existing_appointments=[existing_appointment],
        min_gap_minutes=30
    )
    
    assert conflict is True

def test_check_conflict_allows_gap(existing_appointment):
    """Test conflict detection respects min gap."""
    conflict = check_conflict(
        business_id="bus_test",
        staff_ids=["staff_1"],
        scheduled_date="2025-01-20",
        scheduled_start_time="10:30",  # 30 min after 09:00-10:00 ends
        estimated_duration_minutes=60,
        existing_appointments=[existing_appointment],
        min_gap_minutes=30
    )
    
    assert conflict is False

def test_check_conflict_no_existing_appointments():
    """Test conflict detection with empty schedule."""
    conflict = check_conflict(
        business_id="bus_test",
        staff_ids=["staff_1"],
        scheduled_date="2025-01-20",
        scheduled_start_time="09:00",
        estimated_duration_minutes=60,
        existing_appointments=[],
        min_gap_minutes=30
    )
    
    assert conflict is False
```

### Weather Rules Tests

```python
# tests/test_weather_rules.py
import pytest
from app.weather.rules import exceeds_thresholds, calculate_weather_risk

@pytest.fixture
def southern_thresholds():
    """Southern lawn care weather thresholds."""
    return {
        "rain_percent": 70,
        "temp_min_fahrenheit": 32,
        "temp_max_fahrenheit": 105,
        "wind_speed_mph": 35
    }

def test_light_rain_does_not_trigger_reschedule(southern_thresholds):
    """35% rain is below 70% threshold."""
    weather = {
        "rain_percent": 35,
        "temp_max_fahrenheit": 85,
        "temp_min_fahrenheit": 55,
        "wind_speed_mph": 12
    }
    
    assert exceeds_thresholds(weather, southern_thresholds) is False

def test_heavy_rain_triggers_reschedule(southern_thresholds):
    """75% rain exceeds 70% threshold."""
    weather = {
        "rain_percent": 75,
        "temp_max_fahrenheit": 85,
        "temp_min_fahrenheit": 55,
        "wind_speed_mph": 12
    }
    
    assert exceeds_thresholds(weather, southern_thresholds) is True

def test_extreme_heat_triggers_reschedule(southern_thresholds):
    """110°F exceeds 105° threshold."""
    weather = {
        "rain_percent": 20,
        "temp_max_fahrenheit": 110,
        "temp_min_fahrenheit": 85,
        "wind_speed_mph": 12
    }
    
    assert exceeds_thresholds(weather, southern_thresholds) is True

def test_high_wind_triggers_reschedule(southern_thresholds):
    """40 mph exceeds 35 mph threshold."""
    weather = {
        "rain_percent": 20,
        "temp_max_fahrenheit": 85,
        "temp_min_fahrenheit": 55,
        "wind_speed_mph": 40
    }
    
    assert exceeds_thresholds(weather, southern_thresholds) is True
```

### Running Unit Tests

```bash
# Install testing dependencies
pip install pytest pytest-cov pytest-asyncio

# Run all tests
pytest tests/

# Run specific test file
pytest tests/test_scheduling_engine.py

# Run with coverage report
pytest tests/ --cov=app --cov-report=html

# Run tests with verbose output
pytest tests/ -v

# Stop on first failure
pytest tests/ -x
```

---

## Integration Testing

### API Endpoint Tests

```python
# tests/test_api_endpoints.py
import pytest
from fastapi.testclient import TestClient
from app.main import app
import json

client = TestClient(app)

@pytest.fixture
def auth_token(db):
    """Create test user and return auth token."""
    response = client.post(
        "/auth/register",
        json={
            "email": "test@example.com",
            "password": "TestPass123!",
            "business_name": "Test Lawn Care",
            "vertical": "lawn_care"
        }
    )
    return response.json()["token"]

def test_create_appointment_endpoint(auth_token, db):
    """Test full appointment creation flow via API."""
    
    # First create a client
    client_response = client.post(
        "/clients",
        headers={"Authorization": f"Bearer {auth_token}"},
        json={
            "first_name": "John",
            "last_name": "Doe",
            "email": "john@example.com",
            "phone": "+1-205-555-5678",
            "address": "123 Main St"
        }
    )
    assert client_response.status_code == 201
    client_id = client_response.json()["client_id"]
    
    # Create appointment
    apt_response = client.post(
        "/appointments",
        headers={"Authorization": f"Bearer {auth_token}"},
        json={
            "client_id": client_id,
            "service_id": "svc_001",
            "scheduled_date": "2025-01-20",
            "scheduled_start_time": "09:00",
            "estimated_duration_minutes": 60,
            "assigned_staff_ids": ["stf_001"],
            "assigned_equipment_ids": ["eq_001"]
        }
    )
    
    assert apt_response.status_code == 201
    assert apt_response.json()["status"] == "scheduled"

def test_list_appointments_with_filters(auth_token, db):
    """Test filtering appointments by date and status."""
    
    response = client.get(
        "/appointments?date_from=2025-01-20&date_to=2025-01-27&status=scheduled",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert isinstance(data["data"], list)
    assert "total" in data

def test_unauthorized_access_denied(db):
    """Test that requests without token are rejected."""
    response = client.get("/appointments")
    assert response.status_code == 401
```

---

## E2E Testing

### React Native (Expo) Tests with Detox

```javascript
// e2e/bookAppointment.e2e.js
describe('Book Appointment Flow', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('should book an appointment successfully', async () => {
    // Navigate to login
    await waitFor(element(by.id('login_screen'))).toBeVisible().withTimeout(5000);
    
    // Enter credentials
    await element(by.id('email_input')).typeText('owner@servicepro.app');
    await element(by.id('password_input')).typeText('TestPass123!');
    
    // Tap login button
    await element(by.id('login_button')).tap();
    
    // Wait for dashboard to load
    await waitFor(element(by.id('dashboard_screen'))).toBeVisible().withTimeout(5000);
    
    // Navigate to appointments
    await element(by.id('tab_appointments')).tap();
    
    // Tap create appointment button
    await element(by.id('create_appointment_button')).tap();
    
    // Select client
    await element(by.id('client_search')).typeText('John Smith');
    await element(by.text('John Smith')).tap();
    
    // Select service
    await element(by.id('service_picker')).tap();
    await element(by.text('Full Lawn Maintenance')).tap();
    
    // Select date
    await element(by.id('date_picker')).tap();
    await element(by.text('20')).tap();  // Day 20
    await element(by.id('date_confirm')).tap();
    
    // Select time
    await element(by.id('time_picker')).tap();
    await element(by.text('09:00 AM')).tap();
    
    // Tap confirm
    await element(by.id('confirm_booking_button')).tap();
    
    // Verify success message
    await waitFor(element(by.text('Appointment booked successfully!'))).toBeVisible().withTimeout(5000);
  });

  it('should show error when double-booking', async () => {
    // ... setup similar to above
    
    // Try to book same time as existing appointment
    await element(by.id('create_appointment_button')).tap();
    // ... fill in details
    await element(by.id('confirm_booking_button')).tap();
    
    // Verify error message
    await waitFor(element(by.text('This time is already booked'))).toBeVisible().withTimeout(5000);
  });
});
```

### Running E2E Tests

```bash
# Install Detox
npm install --save-dev detox-cli detox

# Build app for testing
detox build-framework-cache
detox build-app --configuration ios.sim.debug

# Run tests
detox test --configuration ios.sim.debug --cleanup
```

---

## Performance Testing

### Load Testing (Apache JMeter or Locust)

```python
# tests/load_test.py
from locust import HttpUser, task, between
import random

class ServiceProUser(HttpUser):
    wait_time = between(1, 3)
    
    def on_start(self):
        # Login and get token
        response = self.client.post(
            "/auth/login",
            json={
                "email": "test@servicepro.app",
                "password": "TestPass123!"
            }
        )
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    @task(3)
    def list_appointments(self):
        """Simulate viewing appointments (3x frequency)."""
        self.client.get(
            "/appointments?limit=20",
            headers=self.headers
        )
    
    @task(1)
    def create_appointment(self):
        """Simulate booking appointment (1x frequency)."""
        self.client.post(
            "/appointments",
            json={
                "client_id": f"cli_{random.randint(1, 100)}",
                "service_id": "svc_001",
                "scheduled_date": "2025-01-20",
                "scheduled_start_time": f"{random.randint(8, 16):02d}:00",
                "estimated_duration_minutes": 60,
                "assigned_staff_ids": ["stf_001"],
                "assigned_equipment_ids": ["eq_001"]
            },
            headers=self.headers
        )
```

**Running:**

```bash
# Install Locust
pip install locust

# Run load test
locust -f tests/load_test.py --host https://api.servicepro.app --users 100 --spawn-rate 10
```

---

## Test Data

### Mock Database (for testing)

```python
# tests/conftest.py
import pytest
from mongomock import MongoClient

@pytest.fixture(scope="session")
def mock_db():
    """In-memory MongoDB for testing."""
    client = MongoClient()
    return client["servicepro_test"]

@pytest.fixture
def seed_test_data(mock_db):
    """Populate test database with sample data."""
    
    # Create test business
    mock_db.businesses.insert_one({
        "business_id": "bus_test",
        "name": "Test Lawn Care",
        "vertical": "lawn_care",
        "config": {
            "weather_enabled": True,
            "weather_thresholds": {
                "rain_percent": 70,
                "temp_max_fahrenheit": 105,
                "wind_speed_mph": 35
            }
        }
    })
    
    # Create test staff
    mock_db.staff.insert_one({
        "staff_id": "stf_001",
        "business_id": "bus_test",
        "first_name": "Marcus",
        "last_name": "Johnson",
        "availability_schedule": {
            "monday": {"start": "08:00", "end": "17:00"},
            # ... all days
        }
    })
    
    # Create test client
    mock_db.clients.insert_one({
        "client_id": "cli_test",
        "business_id": "bus_test",
        "first_name": "John",
        "last_name": "Smith",
        "phone": "+1-205-555-5678",
        "email": "john@example.com"
    })
    
    return mock_db
```

---

## Coverage Targets

| Component | Target Coverage | Priority |
|-----------|-----------------|----------|
| Scheduling engine | 90% | Critical |
| Weather rules | 85% | Critical |
| Conflict detection | 90% | Critical |
| API endpoints | 80% | High |
| Notifications | 75% | High |
| Voice AI | 70% | Medium |
| Utilities | 60% | Low |

---

## CI/CD Testing

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: '3.11'
    
    - name: Install dependencies
      run: |
        pip install -r requirements.txt
        pip install pytest pytest-cov
    
    - name: Run tests
      run: pytest tests/ --cov=app --cov-report=xml
    
    - name: Upload coverage
      uses: codecov/codecov-action@v3
```

---

## TODO

- [ ] Set up pytest configuration
- [ ] Write unit tests for scheduling logic (target: 90% coverage)
- [ ] Write unit tests for weather rules (target: 85% coverage)
- [ ] Write integration tests for API endpoints
- [ ] Set up E2E testing with Detox
- [ ] Configure CI/CD pipeline for automated testing
- [ ] Set up code coverage reporting (CodeCov)
- [ ] Document test data setup process
- [ ] Schedule regular performance testing
