"""
Test configuration and fixtures
"""

import asyncio
import pytest
from typing import AsyncGenerator, Dict, Any
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime, date

from fastapi import FastAPI
from fastapi.testclient import TestClient
from httpx import AsyncClient, ASGITransport

# Mock database
class MockCollection:
    """Mock MongoDB collection"""

    def __init__(self):
        self.data = {}
        self.counter = 0

    async def find_one(self, query: dict, *args, **kwargs):
        for doc in self.data.values():
            if self._match(doc, query):
                return doc
        return None

    async def find(self, query: dict = None, *args, **kwargs):
        results = []
        for doc in self.data.values():
            if query is None or self._match(doc, query):
                results.append(doc)
        return MockCursor(results)

    async def insert_one(self, doc: dict):
        self.counter += 1
        doc_id = doc.get("_id") or f"mock_id_{self.counter}"
        doc["_id"] = doc_id
        self.data[doc_id] = doc
        return MagicMock(inserted_id=doc_id)

    async def update_one(self, query: dict, update: dict, *args, **kwargs):
        for doc_id, doc in self.data.items():
            if self._match(doc, query):
                if "$set" in update:
                    doc.update(update["$set"])
                return MagicMock(modified_count=1, matched_count=1)
        return MagicMock(modified_count=0, matched_count=0)

    async def delete_one(self, query: dict):
        for doc_id, doc in list(self.data.items()):
            if self._match(doc, query):
                del self.data[doc_id]
                return MagicMock(deleted_count=1)
        return MagicMock(deleted_count=0)

    async def count_documents(self, query: dict = None):
        if query is None:
            return len(self.data)
        count = 0
        for doc in self.data.values():
            if self._match(doc, query):
                count += 1
        return count

    async def create_index(self, *args, **kwargs):
        return "mock_index"

    async def aggregate(self, pipeline):
        # Simple aggregation mock
        return MockCursor([])

    def _match(self, doc: dict, query: dict) -> bool:
        for key, value in query.items():
            if key.startswith("$"):
                continue
            if "." in key:
                parts = key.split(".")
                current = doc
                for part in parts:
                    if isinstance(current, dict) and part in current:
                        current = current[part]
                    else:
                        return False
                if current != value:
                    return False
            elif key not in doc:
                return False
            elif isinstance(value, dict):
                # Handle operators
                for op, op_val in value.items():
                    if op == "$ne" and doc[key] == op_val:
                        return False
                    elif op == "$eq" and doc[key] != op_val:
                        return False
                    elif op == "$in" and doc[key] not in op_val:
                        return False
            elif doc[key] != value:
                return False
        return True


class MockCursor:
    """Mock MongoDB cursor"""

    def __init__(self, data: list):
        self._data = data
        self._skip = 0
        self._limit = None

    def skip(self, n: int):
        self._skip = n
        return self

    def limit(self, n: int):
        self._limit = n
        return self

    def sort(self, *args, **kwargs):
        return self

    async def to_list(self, length: int = None):
        data = self._data[self._skip:]
        if self._limit:
            data = data[:self._limit]
        if length:
            data = data[:length]
        return data


class MockDatabase:
    """Mock MongoDB database"""

    def __init__(self):
        self._collections = {}

    def __getattr__(self, name: str):
        if name.startswith("_"):
            return super().__getattribute__(name)
        if name not in self._collections:
            self._collections[name] = MockCollection()
        return self._collections[name]


@pytest.fixture
def mock_db():
    """Create a mock database"""
    return MockDatabase()


@pytest.fixture
def sample_business():
    """Sample business data"""
    return {
        "business_id": "bus_test123",
        "name": "Test HVAC Co",
        "owner_id": "user_owner123",
        "config": {
            "sms": {
                "enabled": True,
                "twilio_phone": "+15551234567",
                "auto_scheduled": True,
                "auto_reminder": True,
                "auto_enroute": True,
                "auto_15_min": True,
                "auto_arrived": True,
                "auto_complete": True,
                "reminder_hours": 24,
                "opt_out_message": "You have been unsubscribed."
            }
        },
        "created_at": datetime.utcnow(),
    }


@pytest.fixture
def sample_user():
    """Sample user data"""
    return {
        "user_id": "user_test123",
        "email": "test@example.com",
        "business_id": "bus_test123",
        "role": "admin",
        "first_name": "Test",
        "last_name": "User",
        "created_at": datetime.utcnow(),
    }


@pytest.fixture
def sample_technician():
    """Sample technician data"""
    return {
        "tech_id": "tech_test123",
        "business_id": "bus_test123",
        "user_id": "user_tech123",
        "first_name": "Mike",
        "last_name": "Technician",
        "phone": "+15559876543",
        "email": "mike@example.com",
        "status": "available",
        "current_job_id": None,
        "next_job_id": None,
        "is_active": True,
        "location": {
            "type": "Point",
            "coordinates": [-104.9903, 39.7392]  # Denver
        },
        "location_updated_at": datetime.utcnow(),
        "certifications": ["EPA 608", "NATE"],
        "skills": {
            "can_install": True,
            "can_service": True,
            "can_maintenance": True
        },
        "schedule": {
            "work_days": [1, 2, 3, 4, 5],
            "start_time": "08:00",
            "end_time": "17:00",
            "lunch_start": "12:00",
            "lunch_duration": 60
        },
        "stats": {
            "jobs_completed": 150,
            "avg_rating": 4.8,
            "on_time_percentage": 95.5
        },
        "color": "#4CAF50",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
        "deleted_at": None
    }


@pytest.fixture
def sample_client():
    """Sample client/customer data"""
    return {
        "client_id": "client_test123",
        "business_id": "bus_test123",
        "first_name": "John",
        "last_name": "Customer",
        "email": "john@customer.com",
        "phone": "+15551112222",
        "address": "123 Main St",
        "city": "Denver",
        "state": "CO",
        "zip_code": "80202",
        "sms_opt_out": False,
        "created_at": datetime.utcnow(),
        "deleted_at": None
    }


@pytest.fixture
def sample_schedule_entry():
    """Sample schedule entry data"""
    return {
        "entry_id": "entry_test123",
        "business_id": "bus_test123",
        "tech_id": "tech_test123",
        "job_id": "job_test123",
        "scheduled_date": date.today().isoformat(),
        "start_time": "09:00",
        "end_time": "11:00",
        "estimated_hours": 2.0,
        "status": "scheduled",
        "notes": None,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
        "deleted_at": None
    }


@pytest.fixture
def sample_sms_message():
    """Sample SMS message data"""
    return {
        "message_id": "msg_test123",
        "business_id": "bus_test123",
        "customer_id": "client_test123",
        "job_id": "job_test123",
        "tech_id": None,
        "direction": "outbound",
        "to_phone": "+15551112222",
        "from_phone": "+15551234567",
        "body": "Hello, your appointment is scheduled for tomorrow at 9 AM.",
        "trigger_type": "reminder",
        "status": "sent",
        "twilio_sid": "SM123456789",
        "sent_at": datetime.utcnow(),
        "delivered_at": None,
        "error_message": None,
        "created_at": datetime.utcnow(),
        "deleted_at": None
    }


@pytest.fixture
def sample_sms_template():
    """Sample SMS template data"""
    return {
        "template_id": "tmpl_test123",
        "business_id": "bus_test123",
        "name": "Appointment Reminder",
        "trigger_type": "reminder",
        "body": "Hi {{customer_first_name}}, reminder: your {{job_type}} appointment is tomorrow at {{scheduled_time}}. - {{company_name}}",
        "is_active": True,
        "is_default": False,
        "variables": ["customer_first_name", "job_type", "scheduled_time", "company_name"],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
        "deleted_at": None
    }


@pytest.fixture
def auth_headers():
    """Mock authentication headers"""
    return {"Authorization": "Bearer mock_token_123"}


# Event loop for async tests
@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for async tests"""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()
