# ServicePro Platform - API Specification

**Version:** 1.0  
**Platform:** ServicePro (Multi-Vertical Service Business Operating System)  
**Initial Vertical:** Lawn Care  
**Status:** Phase 1 Design (Days 1-7)

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Base Endpoints](#base-endpoints)
4. [Core Entities](#core-entities)
5. [Error Handling](#error-handling)
6. [Rate Limiting](#rate-limiting)
7. [Webhooks](#webhooks)
8. [Phase 2 Stubs](#phase-2-stubs)

---

## Overview

### API Standards

- **Base URL:** `https://api.servicepro.app/v1`
- **Format:** JSON
- **Authentication:** JWT Bearer Token
- **Content-Type:** `application/json`
- **CORS:** Enabled for mobile (Expo) + web

### Design Principles

- **Configurable-First:** Every feature supports multi-tenant configuration
- **Audit-Ready:** All write operations logged (Phase 2 reporting uses this)
- **Payment-Agnostic:** Payment fields present, processing deferred to Phase 2
- **Vertical-Aware:** Endpoints support vertical switching via `vertical_id` parameter

---

## Authentication

### Token Generation

**Endpoint:** `POST /auth/register`

```json
{
  "email": "owner@servicepro.app",
  "password": "securepassword",
  "business_name": "Southern Lawn Care Co",
  "vertical": "lawn_care",
  "phone": "+1-205-555-1234"
}
```

**Response:** `201 Created`

```json
{
  "user_id": "usr_abc123",
  "email": "owner@servicepro.app",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "ref_xyz789",
  "business_id": "bus_abc123",
  "role": "owner"
}
```

### Login

**Endpoint:** `POST /auth/login`

```json
{
  "email": "owner@servicepro.app",
  "password": "securepassword"
}
```

**Response:** `200 OK`

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "ref_xyz789",
  "expires_in": 3600
}
```

### Token Refresh

**Endpoint:** `POST /auth/refresh`

```json
{
  "refresh_token": "ref_xyz789"
}
```

**Response:** `200 OK`

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expires_in": 3600
}
```

### Password Reset

**Endpoint:** `POST /auth/password-reset`

```json
{
  "email": "owner@servicepro.app"
}
```

**Response:** `200 OK`

```json
{
  "message": "Reset link sent to email",
  "reset_token": "rst_abc123"
}
```

---

## Base Endpoints

### Health Check

**Endpoint:** `GET /health`

**Response:** `200 OK`

```json
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2025-01-17T14:30:00Z"
}
```

---

## Core Entities

### 1. Business / Account Management

#### Get Business Profile

**Endpoint:** `GET /business`

**Response:** `200 OK`

```json
{
  "business_id": "bus_abc123",
  "name": "Southern Lawn Care Co",
  "vertical": "lawn_care",
  "phone": "+1-205-555-1234",
  "address": "123 Main St, Birmingham, AL 35203",
  "timezone": "America/Chicago",
  "config": {
    "weather_enabled": true,
    "ai_receptionist_enabled": true,
    "reschedule_window_hours": 48,
    "min_gap_between_jobs_minutes": 30,
    "weather_thresholds": {
      "rain_percent": 70,
      "temp_max_fahrenheit": 105,
      "wind_speed_mph": 35
    },
    "default_service_duration_minutes": 60,
    "allow_crew_stacking": true
  },
  "created_at": "2025-01-15T10:00:00Z"
}
```

#### Update Business Profile

**Endpoint:** `PATCH /business`

```json
{
  "name": "Southern Lawn Care Co",
  "config": {
    "weather_thresholds": {
      "rain_percent": 75,
      "temp_max_fahrenheit": 105,
      "wind_speed_mph": 40
    }
  }
}
```

**Response:** `200 OK` (same schema as GET)

---

### 2. Clients / Customers

#### Create Client

**Endpoint:** `POST /clients`

```json
{
  "first_name": "John",
  "last_name": "Smith",
  "email": "john@example.com",
  "phone": "+1-205-555-5678",
  "address": "456 Oak Ave, Birmingham, AL 35209",
  "latitude": 33.5185,
  "longitude": -86.8104,
  "service_type_ids": ["svc_001", "svc_002"],
  "notes": "Prefer morning appointments"
}
```

**Response:** `201 Created`

```json
{
  "client_id": "cli_xyz789",
  "first_name": "John",
  "last_name": "Smith",
  "email": "john@example.com",
  "phone": "+1-205-555-5678",
  "address": "456 Oak Ave, Birmingham, AL 35209",
  "latitude": 33.5185,
  "longitude": -86.8104,
  "service_type_ids": ["svc_001", "svc_002"],
  "notes": "Prefer morning appointments",
  "total_spent": 0,
  "job_count": 0,
  "avg_rating": null,
  "created_at": "2025-01-17T12:00:00Z",
  "updated_at": "2025-01-17T12:00:00Z"
}
```

#### List Clients

**Endpoint:** `GET /clients?limit=20&offset=0&search=john`

**Response:** `200 OK`

```json
{
  "data": [
    { /* client object */ }
  ],
  "total": 150,
  "limit": 20,
  "offset": 0
}
```

#### Get Client Detail

**Endpoint:** `GET /clients/{client_id}`

**Response:** `200 OK` (same as create response)

#### Update Client

**Endpoint:** `PATCH /clients/{client_id}`

**Response:** `200 OK`

#### Delete Client

**Endpoint:** `DELETE /clients/{client_id}`

**Response:** `204 No Content`

---

### 3. Service Types

#### Create Service Type

**Endpoint:** `POST /services`

```json
{
  "name": "Full Lawn Maintenance",
  "description": "Mowing, edging, blowing",
  "default_duration_minutes": 60,
  "default_price": 85.00,
  "vertical": "lawn_care",
  "requires_equipment_ids": ["eq_mower_01", "eq_edger_01"],
  "can_have_multiple_crews": true
}
```

**Response:** `201 Created`

```json
{
  "service_id": "svc_001",
  "name": "Full Lawn Maintenance",
  "description": "Mowing, edging, blowing",
  "default_duration_minutes": 60,
  "default_price": 85.00,
  "vertical": "lawn_care",
  "requires_equipment_ids": ["eq_mower_01", "eq_edger_01"],
  "can_have_multiple_crews": true,
  "created_at": "2025-01-15T10:00:00Z"
}
```

#### List Services

**Endpoint:** `GET /services?vertical=lawn_care`

**Response:** `200 OK`

```json
{
  "data": [
    { /* service object */ }
  ],
  "total": 12,
  "limit": 50,
  "offset": 0
}
```

---

### 4. Staff / Crew Members

#### Create Staff Member

**Endpoint:** `POST /staff`

```json
{
  "first_name": "Marcus",
  "last_name": "Johnson",
  "email": "marcus@servicepro.app",
  "phone": "+1-205-555-9999",
  "role": "crew_lead",
  "assigned_equipment_ids": ["eq_mower_01", "eq_edger_01"],
  "availability_schedule": {
    "monday": { "start": "08:00", "end": "17:00" },
    "tuesday": { "start": "08:00", "end": "17:00" },
    "wednesday": { "start": "08:00", "end": "17:00" },
    "thursday": { "start": "08:00", "end": "17:00" },
    "friday": { "start": "08:00", "end": "17:00" },
    "saturday": null,
    "sunday": null
  }
}
```

**Response:** `201 Created`

```json
{
  "staff_id": "stf_marcus01",
  "first_name": "Marcus",
  "last_name": "Johnson",
  "email": "marcus@servicepro.app",
  "phone": "+1-205-555-9999",
  "role": "crew_lead",
  "assigned_equipment_ids": ["eq_mower_01", "eq_edger_01"],
  "availability_schedule": { /* as above */ },
  "current_availability_status": "available",
  "jobs_assigned_today": 3,
  "created_at": "2025-01-15T10:00:00Z"
}
```

#### Get Staff Availability Slots

**Endpoint:** `GET /staff/{staff_id}/availability?date=2025-01-20&duration_minutes=60`

**Response:** `200 OK`

```json
{
  "staff_id": "stf_marcus01",
  "date": "2025-01-20",
  "available_slots": [
    { "start": "08:00", "end": "09:00" },
    { "start": "10:00", "end": "11:00" },
    { "start": "13:00", "end": "14:00" }
  ]
}
```

#### List Staff

**Endpoint:** `GET /staff?role=crew_lead`

**Response:** `200 OK`

```json
{
  "data": [
    { /* staff object */ }
  ],
  "total": 8,
  "limit": 50,
  "offset": 0
}
```

---

### 5. Equipment

#### Create Equipment

**Endpoint:** `POST /equipment`

```json
{
  "name": "John Deere Z925 Zero-Turn",
  "category": "mower",
  "serial_number": "JD-2025-001",
  "purchase_date": "2024-01-15",
  "maintenance_due_date": "2025-07-15",
  "status": "active",
  "notes": "Main production mower"
}
```

**Response:** `201 Created`

```json
{
  "equipment_id": "eq_mower_01",
  "name": "John Deere Z925 Zero-Turn",
  "category": "mower",
  "serial_number": "JD-2025-001",
  "purchase_date": "2024-01-15",
  "maintenance_due_date": "2025-07-15",
  "status": "active",
  "notes": "Main production mower",
  "assigned_staff_ids": ["stf_marcus01", "stf_john02"],
  "created_at": "2025-01-15T10:00:00Z"
}
```

#### List Equipment

**Endpoint:** `GET /equipment?category=mower&status=active`

**Response:** `200 OK`

---

### 6. Appointments / Jobs

#### Create Appointment

**Endpoint:** `POST /appointments`

```json
{
  "client_id": "cli_xyz789",
  "service_id": "svc_001",
  "scheduled_date": "2025-01-20",
  "scheduled_start_time": "09:00",
  "estimated_duration_minutes": 60,
  "assigned_staff_ids": ["stf_marcus01"],
  "assigned_equipment_ids": ["eq_mower_01", "eq_edger_01"],
  "notes": "Customer requested early morning",
  "custom_price": null
}
```

**Response:** `201 Created`

```json
{
  "appointment_id": "apt_abc123",
  "client_id": "cli_xyz789",
  "service_id": "svc_001",
  "scheduled_date": "2025-01-20",
  "scheduled_start_time": "09:00",
  "estimated_duration_minutes": 60,
  "assigned_staff_ids": ["stf_marcus01"],
  "assigned_equipment_ids": ["eq_mower_01", "eq_edger_01"],
  "status": "scheduled",
  "notes": "Customer requested early morning",
  "custom_price": null,
  "price": 85.00,
  "created_at": "2025-01-17T12:00:00Z",
  "updated_at": "2025-01-17T12:00:00Z",
  "audit_log": [
    {
      "action": "created",
      "user_id": "usr_abc123",
      "timestamp": "2025-01-17T12:00:00Z"
    }
  ]
}
```

#### List Appointments (with Filters)

**Endpoint:** `GET /appointments?date_from=2025-01-20&date_to=2025-01-27&status=scheduled&staff_id=stf_marcus01`

**Response:** `200 OK`

```json
{
  "data": [
    { /* appointment object */ }
  ],
  "total": 24,
  "limit": 50,
  "offset": 0
}
```

#### Get Appointment Detail

**Endpoint:** `GET /appointments/{appointment_id}`

**Response:** `200 OK` (same as create response)

#### Update Appointment

**Endpoint:** `PATCH /appointments/{appointment_id}`

```json
{
  "scheduled_start_time": "10:00",
  "assigned_staff_ids": ["stf_marcus01", "stf_john02"],
  "status": "scheduled"
}
```

**Response:** `200 OK` (includes updated audit_log)

#### Complete Appointment

**Endpoint:** `POST /appointments/{appointment_id}/complete`

```json
{
  "actual_duration_minutes": 65,
  "notes": "Completed on time, trimmed extra around mailbox",
  "photos_urls": ["https://..."],
  "amount_charged": 85.00
}
```

**Response:** `200 OK`

```json
{
  "appointment_id": "apt_abc123",
  "status": "completed",
  "actual_duration_minutes": 65,
  "notes": "...",
  "photos_urls": ["..."],
  "amount_charged": 85.00,
  "completed_at": "2025-01-20T10:05:00Z"
}
```

#### Cancel Appointment

**Endpoint:** `POST /appointments/{appointment_id}/cancel`

```json
{
  "reason": "customer_requested",
  "notes": "Customer rescheduled"
}
```

**Response:** `200 OK`

---

### 7. Availability / Schedule Management

#### Get Business Availability for Date Range

**Endpoint:** `GET /availability/business?date_from=2025-01-20&date_to=2025-01-27`

**Response:** `200 OK`

```json
{
  "date_from": "2025-01-20",
  "date_to": "2025-01-27",
  "availability": [
    {
      "date": "2025-01-20",
      "day_of_week": "monday",
      "working": true,
      "hours": { "start": "08:00", "end": "17:00" },
      "total_slots": 480,
      "booked_slots": 240,
      "available_slots": 240
    }
  ]
}
```

#### Set Business Hours

**Endpoint:** `POST /availability/business-hours`

```json
{
  "monday": { "start": "08:00", "end": "17:00" },
  "tuesday": { "start": "08:00", "end": "17:00" },
  "wednesday": { "start": "08:00", "end": "17:00" },
  "thursday": { "start": "08:00", "end": "17:00" },
  "friday": { "start": "08:00", "end": "17:00" },
  "saturday": null,
  "sunday": null
}
```

**Response:** `200 OK`

#### Add Time-Off (Staff or Business)

**Endpoint:** `POST /availability/time-off`

```json
{
  "staff_id": "stf_marcus01",
  "date_from": "2025-02-10",
  "date_to": "2025-02-14",
  "reason": "vacation",
  "notes": "Family trip"
}
```

**Response:** `201 Created`

```json
{
  "time_off_id": "tof_xyz789",
  "staff_id": "stf_marcus01",
  "date_from": "2025-02-10",
  "date_to": "2025-02-14",
  "reason": "vacation",
  "notes": "Family trip",
  "created_at": "2025-01-17T12:00:00Z"
}
```

---

### 8. Weather & Autonomous Rescheduling

#### Check Weather & Trigger Rescheduling (AI System)

**Endpoint:** `POST /weather/check-and-reschedule`

**Internal Use Only** (called by scheduler, not via API)

```json
{
  "date": "2025-01-20",
  "latitude": 33.5185,
  "longitude": -86.8104
}
```

**Response:** `200 OK`

```json
{
  "weather_data": {
    "date": "2025-01-20",
    "rain_percent": 65,
    "temp_max_fahrenheit": 92,
    "wind_speed_mph": 18,
    "conditions": "partly_cloudy"
  },
  "threshold_exceeded": false,
  "rescheduled_appointments": [],
  "failed_reschedules": []
}
```

#### Get Weather Forecast for Location

**Endpoint:** `GET /weather/forecast?latitude=33.5185&longitude=-86.8104&days=7`

**Response:** `200 OK`

```json
{
  "location": "Birmingham, AL",
  "latitude": 33.5185,
  "longitude": -86.8104,
  "forecast": [
    {
      "date": "2025-01-20",
      "condition": "partly_cloudy",
      "rain_percent": 35,
      "temp_high_fahrenheit": 72,
      "temp_low_fahrenheit": 45,
      "wind_speed_mph": 12,
      "will_trigger_reschedule": false
    }
  ]
}
```

---

### 9. Notifications

#### Send SMS Notification

**Endpoint:** `POST /notifications/sms`

```json
{
  "client_id": "cli_xyz789",
  "message": "Your appointment on Jan 20 at 9:00 AM is confirmed. Crew: Marcus Johnson",
  "type": "appointment_confirmation"
}
```

**Response:** `201 Created`

```json
{
  "notification_id": "ntf_abc123",
  "client_id": "cli_xyz789",
  "phone": "+1-205-555-5678",
  "message": "...",
  "type": "appointment_confirmation",
  "status": "sent",
  "sent_at": "2025-01-17T12:00:00Z"
}
```

#### Send Push Notification (Mobile)

**Endpoint:** `POST /notifications/push`

```json
{
  "user_id": "usr_abc123",
  "title": "New Appointment",
  "body": "You have a job scheduled for Jan 20 at 9:00 AM",
  "data": {
    "appointment_id": "apt_abc123"
  }
}
```

**Response:** `201 Created`

---

### 10. Voice AI Receptionist (Optional)

#### Start Voice Call Session

**Endpoint:** `POST /voice/start-session`

**Triggered by Twilio Webhook**

```json
{
  "caller_phone": "+1-205-555-5678",
  "incoming_call_id": "twilio_call_abc123"
}
```

**Response:** `200 OK`

```json
{
  "session_id": "vcs_xyz789",
  "status": "initiated",
  "should_route_to_ai": true,
  "ai_greeting": "Thanks for calling Southern Lawn Care. How can I help you today?"
}
```

#### Log Voice Interaction

**Endpoint:** `POST /voice/log-interaction`

```json
{
  "session_id": "vcs_xyz789",
  "transcription": "I'd like to book a mowing appointment for next Monday",
  "intent_detected": "book_appointment",
  "confidence": 0.92,
  "response_given": "I'd be happy to help you book an appointment..."
}
```

**Response:** `201 Created`

---

## Error Handling

### Standard Error Response

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input provided",
    "details": [
      {
        "field": "email",
        "message": "Email format invalid"
      }
    ],
    "timestamp": "2025-01-17T12:00:00Z",
    "request_id": "req_xyz789"
  }
}
```

### HTTP Status Codes

| Code | Meaning | Example |
|------|---------|---------|
| 200 | Success | Appointment retrieved |
| 201 | Created | New client created |
| 204 | No Content | Delete successful |
| 400 | Bad Request | Invalid date format |
| 401 | Unauthorized | Invalid token |
| 403 | Forbidden | User lacks permission |
| 404 | Not Found | Client doesn't exist |
| 409 | Conflict | Double-booking detected |
| 422 | Unprocessable Entity | Validation failed |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Server Error | Internal error |

---

## Rate Limiting

- **Standard:** 1000 requests/hour per API token
- **Burst:** 50 requests/minute
- **Headers:** `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

## Webhooks

### Voice AI Receptionist Webhook (Twilio)

**Event:** Inbound call received

```json
{
  "event": "incoming_call",
  "call_id": "twilio_call_abc123",
  "caller_phone": "+1-205-555-5678",
  "timestamp": "2025-01-17T12:00:00Z"
}
```

### Appointment Rescheduled (Autonomous)

**Event:** Weather triggered automatic reschedule

```json
{
  "event": "appointment_rescheduled_auto",
  "appointment_id": "apt_abc123",
  "old_time": "2025-01-20T09:00:00Z",
  "new_time": "2025-01-21T10:00:00Z",
  "reason": "weather_trigger",
  "client_notified": true
}
```

### SMS Inbound Webhook (Twilio)

**Event:** Customer texts the business

```json
{
  "event": "sms_inbound",
  "from": "+1-205-555-5678",
  "body": "Can I book an appointment for Monday?",
  "timestamp": "2025-01-17T12:00:00Z"
}
```

---

## Phase 2 Stubs

The following endpoints are designed but not fully implemented in Phase 1. Schemas are documented for Phase 2+ development:

### Payments

- `POST /payments/create` – Stripe/payment processor integration
- `GET /payments/{payment_id}` – Retrieve payment details
- `POST /invoices/send` – Email invoice to client

### Customer Portal

- `GET /clients/self/appointments` – Clients view their own appointments
- `POST /clients/{client_id}/reschedule-request` – Client proposes reschedule
- `POST /clients/{client_id}/ratings` – Leave job rating/feedback

### Reporting & Analytics

- `GET /reports/revenue?date_from=...&date_to=...` – Revenue summary
- `GET /reports/staff-performance` – Hours, completion rate, ratings
- `GET /reports/job-completion` – On-time delivery, quality metrics

### Real-Time Dispatch

- `POST /dispatch/assign` – Push job to crew in real-time
- `GET /dispatch/crew-location` – GPS tracking (opt-in)
- `POST /dispatch/job-photo` – Crew uploads completion photos

### Accounting Integration

- `POST /integrations/quickbooks/connect` – QBO OAuth
- `POST /integrations/xero/sync` – Auto-sync invoices to Xero

### Demand Forecasting

- `GET /forecast/staffing-needs?days=30` – ML-based staffing recommendations
- `GET /forecast/revenue-projection` – Revenue forecast based on bookings

---

## Conclusion

This API is designed for **vertical expansion.** Each endpoint supports configurable behavior via the `business` config object. Phase 1 launches with core functionality; Phase 2+ adds payments, reporting, dispatch, and integrations without architectural redesign.

**TODO:**
- [ ] Confirm payment processor (Stripe vs Square)
- [ ] Confirm SMS/voice provider details (Twilio specifics)
- [ ] Define custom fields for client/staff extension
- [ ] Document rate limit exceptions for high-volume businesses
