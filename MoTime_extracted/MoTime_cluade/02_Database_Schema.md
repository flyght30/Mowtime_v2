# ServicePro Platform - Database Schema

**Database:** MongoDB Atlas (Cloud)  
**Version:** 1.0  
**Status:** Phase 1 Design  

---

## Table of Contents

1. [Overview](#overview)
2. [Collections](#collections)
3. [Indexes](#indexes)
4. [Relationships](#relationships)
5. [Data Types](#data-types)

---

## Overview

### Design Principles

- **Document-Oriented:** Each entity is a self-contained document
- **Denormalization:** Frequently accessed fields duplicated for query performance
- **Soft Deletes:** Deleted records marked `deleted_at`, not removed
- **Audit Trails:** `audit_log` array tracks all modifications
- **Timezone Aware:** All timestamps in UTC; business timezone stored separately
- **Vertical-Agnostic:** Schema supports any service vertical

### Connection String

```
mongodb+srv://servicepro_user:password@cluster.mongodb.net/servicepro_prod?retryWrites=true&w=majority
```

---

## Collections

### 1. users

Owners, staff, and system admins.

```javascript
{
  "_id": ObjectId("..."),
  "user_id": "usr_abc123",
  "email": "owner@servicepro.app",
  "password_hash": "bcrypt_hash_...",
  "first_name": "John",
  "last_name": "Smith",
  "phone": "+1-205-555-1234",
  "role": "owner", // owner, staff, admin, customer
  "business_id": "bus_abc123",
  "is_active": true,
  "last_login_at": ISODate("2025-01-17T14:30:00Z"),
  "created_at": ISODate("2025-01-15T10:00:00Z"),
  "updated_at": ISODate("2025-01-17T12:00:00Z"),
  "deleted_at": null,
  "audit_log": [
    {
      "action": "created",
      "user_id": "usr_abc123",
      "timestamp": ISODate("2025-01-15T10:00:00Z")
    }
  ]
}
```

**Indexes:**
- `email` (unique)
- `business_id`
- `role`
- `is_active`

---

### 2. businesses

Business accounts, multi-tenant.

```javascript
{
  "_id": ObjectId("..."),
  "business_id": "bus_abc123",
  "name": "Southern Lawn Care Co",
  "vertical": "lawn_care", // lawn_care, construction, hvac, plumbing, cleaning, etc.
  "plan": "professional", // free, professional, enterprise
  "phone": "+1-205-555-1234",
  "email": "contact@southernlawncare.app",
  "address": "123 Main St, Birmingham, AL 35203",
  "timezone": "America/Chicago",
  "owner_id": "usr_abc123",
  "staff_count": 5,
  "client_count": 150,
  "subscription_status": "active", // active, paused, canceled
  "subscription_renewal_date": ISODate("2025-02-15T00:00:00Z"),
  
  // Configuration (per-business customization)
  "config": {
    // Weather
    "weather_enabled": true,
    "weather_api_provider": "openweathermap", // openweathermap, weatherapi
    "reschedule_window_hours": 48, // How far ahead to check weather
    "weather_thresholds": {
      "rain_percent": 70,
      "temp_min_fahrenheit": 32,
      "temp_max_fahrenheit": 105,
      "wind_speed_mph": 35
    },
    
    // Scheduling
    "min_gap_between_jobs_minutes": 30,
    "default_service_duration_minutes": 60,
    "allow_crew_stacking": true, // Multiple crews per job
    "allow_same_day_reschedule": true,
    "business_hours": {
      "monday": { "start": "08:00", "end": "17:00" },
      "tuesday": { "start": "08:00", "end": "17:00" },
      "wednesday": { "start": "08:00", "end": "17:00" },
      "thursday": { "start": "08:00", "end": "17:00" },
      "friday": { "start": "08:00", "end": "17:00" },
      "saturday": null,
      "sunday": null
    },
    
    // AI Receptionist
    "ai_receptionist_enabled": false,
    "ai_voice_id": "none",
    "sms_enabled": true,
    "sms_provider": "twilio",
    
    // Payments (Phase 2)
    "payments_enabled": false,
    "payment_processor": "stripe",
    "default_payment_method": null,
    
    // Notifications
    "notifications_enabled": true,
    "sms_before_appointment_hours": 24,
    "push_enabled": true,
    "email_enabled": false // Phase 2
  },
  
  "created_at": ISODate("2025-01-15T10:00:00Z"),
  "updated_at": ISODate("2025-01-17T12:00:00Z"),
  "deleted_at": null,
  "audit_log": [...]
}
```

**Indexes:**
- `business_id` (unique)
- `owner_id`
- `vertical`
- `subscription_status`

---

### 3. clients

Customers/service recipients.

```javascript
{
  "_id": ObjectId("..."),
  "client_id": "cli_xyz789",
  "business_id": "bus_abc123",
  "first_name": "John",
  "last_name": "Smith",
  "email": "john@example.com",
  "phone": "+1-205-555-5678",
  "address": "456 Oak Ave, Birmingham, AL 35209",
  "latitude": 33.5185,
  "longitude": -86.8104,
  "city": "Birmingham",
  "state": "AL",
  "zip_code": "35209",
  "service_type_ids": ["svc_001", "svc_002"],
  "preferred_staff_ids": [], // Phase 2
  "notes": "Prefer morning appointments, no chemicals",
  
  // Metrics
  "total_spent": 510.00,
  "job_count": 6,
  "avg_rating": 4.8,
  "last_job_date": ISODate("2025-01-10T11:00:00Z"),
  "preferred_contact_method": "sms", // sms, email, phone, push
  
  // Payment (Phase 2)
  "payment_method_id": null,
  "balance_due": 0,
  
  "is_active": true,
  "created_at": ISODate("2025-01-15T10:00:00Z"),
  "updated_at": ISODate("2025-01-17T12:00:00Z"),
  "deleted_at": null,
  "audit_log": [...]
}
```

**Indexes:**
- `client_id` (unique)
- `business_id`
- `phone`
- `email`
- `service_type_ids`
- `latitude, longitude` (geospatial)

---

### 4. services

Service types offered by the business.

```javascript
{
  "_id": ObjectId("..."),
  "service_id": "svc_001",
  "business_id": "bus_abc123",
  "vertical": "lawn_care",
  "name": "Full Lawn Maintenance",
  "description": "Mowing, edging, blowing, weed control",
  "category": "maintenance", // maintenance, specialty, consultation
  "default_duration_minutes": 60,
  "default_price": 85.00,
  "currency": "USD",
  "requires_equipment_ids": ["eq_mower_01", "eq_edger_01", "eq_blower_01"],
  "minimum_staff_count": 1,
  "can_have_multiple_crews": true,
  "is_active": true,
  "sort_order": 1,
  "created_at": ISODate("2025-01-15T10:00:00Z"),
  "updated_at": ISODate("2025-01-17T12:00:00Z"),
  "deleted_at": null,
  "audit_log": [...]
}
```

**Indexes:**
- `service_id` (unique)
- `business_id`
- `vertical`
- `is_active`

---

### 5. staff

Staff members / crew members.

```javascript
{
  "_id": ObjectId("..."),
  "staff_id": "stf_marcus01",
  "business_id": "bus_abc123",
  "first_name": "Marcus",
  "last_name": "Johnson",
  "email": "marcus@servicepro.app",
  "phone": "+1-205-555-9999",
  "role": "crew_lead", // crew_lead, crew_member, manager
  "assigned_equipment_ids": ["eq_mower_01", "eq_edger_01"],
  "service_certifications": [], // Phase 2
  
  // Availability
  "availability_schedule": {
    "monday": { "start": "08:00", "end": "17:00" },
    "tuesday": { "start": "08:00", "end": "17:00" },
    "wednesday": { "start": "08:00", "end": "17:00" },
    "thursday": { "start": "08:00", "end": "17:00" },
    "friday": { "start": "08:00", "end": "17:00" },
    "saturday": null,
    "sunday": null
  },
  "current_availability_status": "available", // available, busy, on_break, off_duty
  "jobs_assigned_today": 3,
  "hours_worked_this_week": 38,
  
  // Performance
  "total_jobs_completed": 124,
  "avg_completion_time_minutes": 65,
  "avg_customer_rating": 4.9,
  "cancellation_rate": 0.02,
  
  // GPS Tracking (Phase 2, opt-in)
  "location_tracking_enabled": false,
  "current_location": null,
  
  "is_active": true,
  "hire_date": ISODate("2023-06-15T00:00:00Z"),
  "created_at": ISODate("2025-01-15T10:00:00Z"),
  "updated_at": ISODate("2025-01-17T12:00:00Z"),
  "deleted_at": null,
  "audit_log": [...]
}
```

**Indexes:**
- `staff_id` (unique)
- `business_id`
- `role`
- `is_active`

---

### 6. equipment

Equipment/vehicles/tools.

```javascript
{
  "_id": ObjectId("..."),
  "equipment_id": "eq_mower_01",
  "business_id": "bus_abc123",
  "name": "John Deere Z925 Zero-Turn",
  "category": "mower", // mower, edger, blower, truck, etc.
  "subcategory": "zero_turn",
  "serial_number": "JD-2025-001",
  "purchase_date": ISODate("2024-01-15T00:00:00Z"),
  "purchase_price": 12500.00,
  "status": "active", // active, maintenance, retired
  "assigned_staff_ids": ["stf_marcus01", "stf_john02"],
  "maintenance_due_date": ISODate("2025-07-15T00:00:00Z"),
  "last_maintenance_date": ISODate("2025-01-10T00:00:00Z"),
  "maintenance_notes": [
    {
      "date": ISODate("2025-01-10T00:00:00Z"),
      "type": "oil_change",
      "notes": "Routine oil change performed",
      "cost": 45.00
    }
  ],
  "total_maintenance_cost": 45.00,
  "hours_used": 240,
  "notes": "Primary production mower, well-maintained",
  "is_active": true,
  "created_at": ISODate("2025-01-15T10:00:00Z"),
  "updated_at": ISODate("2025-01-17T12:00:00Z"),
  "deleted_at": null,
  "audit_log": [...]
}
```

**Indexes:**
- `equipment_id` (unique)
- `business_id`
- `category`
- `status`
- `assigned_staff_ids`

---

### 7. appointments

Jobs/appointments/service records.

```javascript
{
  "_id": ObjectId("..."),
  "appointment_id": "apt_abc123",
  "business_id": "bus_abc123",
  "client_id": "cli_xyz789",
  "service_id": "svc_001",
  "scheduled_date": ISODate("2025-01-20T00:00:00Z"),
  "scheduled_start_time": "09:00",
  "scheduled_end_time": "10:00",
  "estimated_duration_minutes": 60,
  "assigned_staff_ids": ["stf_marcus01"],
  "assigned_equipment_ids": ["eq_mower_01", "eq_edger_01"],
  "status": "scheduled", // scheduled, in_progress, completed, canceled, rescheduled
  "cancellation_reason": null,
  "notes": "Customer requested early morning, no edging on flower beds",
  
  // Pricing
  "service_price": 85.00,
  "custom_price": null,
  "discount": 0,
  "total_price": 85.00,
  "currency": "USD",
  
  // Actual (filled on completion)
  "actual_start_time": null,
  "actual_end_time": null,
  "actual_duration_minutes": null,
  "amount_charged": null,
  "completed_at": null,
  "completion_notes": null,
  "completion_photos": [],
  
  // Weather tracking
  "weather_checked": false,
  "weather_data_at_time": null,
  "was_rescheduled_due_to_weather": false,
  "rescheduled_from_appointment_id": null,
  "rescheduled_from_datetime": null,
  
  // Notification tracking
  "client_notified_at": ISODate("2025-01-17T12:00:00Z"),
  "client_notification_method": "sms",
  "reminder_sent_at": null,
  "reschedule_notification_sent": false,
  
  // Customer feedback (Phase 2)
  "client_rating": null,
  "client_review": null,
  "rated_at": null,
  
  "created_at": ISODate("2025-01-17T12:00:00Z"),
  "updated_at": ISODate("2025-01-17T12:00:00Z"),
  "deleted_at": null,
  "audit_log": [
    {
      "action": "created",
      "user_id": "usr_abc123",
      "timestamp": ISODate("2025-01-17T12:00:00Z")
    },
    {
      "action": "assigned_staff",
      "user_id": "usr_abc123",
      "changes": { "assigned_staff_ids": ["stf_marcus01"] },
      "timestamp": ISODate("2025-01-17T12:05:00Z")
    }
  ]
}
```

**Indexes:**
- `appointment_id` (unique)
- `business_id`
- `client_id`
- `scheduled_date`
- `status`
- `assigned_staff_ids`
- `compound: [scheduled_date, status]`

---

### 8. availability

Business/staff availability schedules and time-off.

```javascript
{
  "_id": ObjectId("..."),
  "availability_id": "ava_xyz789",
  "business_id": "bus_abc123",
  "staff_id": "stf_marcus01", // null if business-wide
  "type": "time_off", // recurring_schedule, time_off, special_hours
  "date_from": ISODate("2025-02-10T00:00:00Z"),
  "date_to": ISODate("2025-02-14T00:00:00Z"),
  "reason": "vacation", // vacation, sick_day, training, holiday, etc.
  "notes": "Family trip to Florida",
  "is_recurring": false,
  "recurrence_rule": null, // RRULE format for recurring
  "created_by_user_id": "usr_abc123",
  "created_at": ISODate("2025-01-17T12:00:00Z"),
  "audit_log": [...]
}
```

**Indexes:**
- `availability_id` (unique)
- `business_id`
- `staff_id`
- `date_from, date_to`

---

### 9. weather_cache

Cached weather data to minimize API calls.

```javascript
{
  "_id": ObjectId("..."),
  "weather_cache_id": "wch_abc123",
  "business_id": "bus_abc123",
  "latitude": 33.5185,
  "longitude": -86.8104,
  "check_date": ISODate("2025-01-20T00:00:00Z"),
  "weather_data": {
    "date": "2025-01-20",
    "condition": "partly_cloudy",
    "rain_percent": 35,
    "temp_high_fahrenheit": 72,
    "temp_low_fahrenheit": 45,
    "wind_speed_mph": 12,
    "uv_index": 4,
    "humidity_percent": 55
  },
  "threshold_exceeded": false,
  "threshold_details": {
    "rain_check": { "threshold": 70, "value": 35, "exceeded": false },
    "temp_max_check": { "threshold": 105, "value": 72, "exceeded": false },
    "wind_check": { "threshold": 35, "value": 12, "exceeded": false }
  },
  "cached_at": ISODate("2025-01-17T12:00:00Z"),
  "expires_at": ISODate("2025-01-17T18:00:00Z"),
  "audit_log": [...]
}
```

**Indexes:**
- `weather_cache_id` (unique)
- `business_id`
- `check_date`
- `expires_at` (TTL index, auto-delete after expiry)

---

### 10. notifications

Notification log (SMS, push, email).

```javascript
{
  "_id": ObjectId("..."),
  "notification_id": "ntf_abc123",
  "business_id": "bus_abc123",
  "client_id": "cli_xyz789",
  "appointment_id": "apt_abc123",
  "type": "appointment_confirmation", // appointment_confirmation, appointment_reminder, reschedule_notification, urgent_alert
  "channel": "sms", // sms, push, email, voice
  "recipient_phone": "+1-205-555-5678",
  "recipient_email": "john@example.com",
  "message": "Your appointment on Jan 20 at 9:00 AM is confirmed. Crew: Marcus Johnson",
  "status": "sent", // pending, sent, failed, bounced, opted_out
  "sent_at": ISODate("2025-01-17T12:00:00Z"),
  "delivery_status": "delivered", // delivered, bounced, failed
  "failure_reason": null,
  "retry_count": 0,
  "created_at": ISODate("2025-01-17T12:00:00Z"),
  "audit_log": [...]
}
```

**Indexes:**
- `notification_id` (unique)
- `business_id`
- `client_id`
- `appointment_id`
- `type`
- `status`

---

### 11. voice_sessions

Voice AI call logs (Phase 1 optional).

```javascript
{
  "_id": ObjectId("..."),
  "voice_session_id": "vcs_xyz789",
  "business_id": "bus_abc123",
  "caller_phone": "+1-205-555-5678",
  "client_id": null, // populated if customer identified
  "twilio_call_id": "twilio_call_abc123",
  "start_time": ISODate("2025-01-17T12:00:00Z"),
  "end_time": ISODate("2025-01-17T12:08:30Z"),
  "duration_seconds": 510,
  "status": "completed", // initiated, in_progress, completed, failed
  "transcript": "Customer: Hello... AI: Thanks for calling...",
  "intents_detected": ["book_appointment"],
  "outcome": "appointment_booked", // appointment_booked, reschedule_confirmed, info_provided, escalated, no_action
  "appointment_id_created": "apt_abc123",
  "escalated_to_human": false,
  "escalation_reason": null,
  "recording_url": "https://...",
  "ai_performance_rating": 0.89, // Confidence/quality metric
  "created_at": ISODate("2025-01-17T12:00:00Z"),
  "audit_log": [...]
}
```

**Indexes:**
- `voice_session_id` (unique)
- `business_id`
- `client_id`
- `start_time`
- `outcome`

---

### 12. payment_methods (Phase 2)

Stored payment information.

```javascript
{
  "_id": ObjectId("..."),
  "payment_method_id": "pm_stripe_abc123",
  "business_id": "bus_abc123",
  "client_id": "cli_xyz789", // or null if business card
  "type": "credit_card", // credit_card, bank_account, ach
  "processor": "stripe",
  "processor_id": "pm_stripe_abc123",
  "last_four": "4242",
  "brand": "visa",
  "expiry_month": 12,
  "expiry_year": 2027,
  "is_default": true,
  "is_active": true,
  "created_at": ISODate("2025-01-15T10:00:00Z"),
  "audit_log": [...]
}
```

---

## Indexes

### Performance Optimization

```javascript
// appointments - Fast lookup by date range + status
db.appointments.createIndex({ business_id: 1, scheduled_date: 1, status: 1 })

// appointments - Find by staff assigned
db.appointments.createIndex({ assigned_staff_ids: 1, scheduled_date: 1 })

// clients - Geospatial search (find nearby clients)
db.clients.createIndex({ latitude: "2dsphere", longitude: "2dsphere" })

// notifications - Fast filter by status
db.notifications.createIndex({ business_id: 1, status: 1, created_at: -1 })

// weather_cache - Auto-expiry
db.weather_cache.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 })

// voice_sessions - Track by outcome
db.voice_sessions.createIndex({ business_id: 1, outcome: 1, created_at: -1 })
```

---

## Relationships

### Data Flow Diagram

```
businesses (1) ──┬─── (N) users
                 ├─── (N) clients
                 ├─── (N) staff
                 ├─── (N) services
                 ├─── (N) equipment
                 └─── (N) appointments

appointments (1) ──┬─── (1) client
                   ├─── (1) service
                   ├─── (N) staff (assigned_staff_ids)
                   ├─── (N) equipment (assigned_equipment_ids)
                   ├─── (1) weather_cache
                   └─── (N) notifications

staff (1) ──── (N) equipment (assigned_equipment_ids)

clients (N) ──── (N) services (service_type_ids)
```

---

## Data Types

| Type | Example | Storage |
|------|---------|---------|
| ObjectId | ObjectId("...") | 12 bytes |
| String | "Southern Lawn Care" | Variable |
| ISODate | ISODate("2025-01-17T12:00:00Z") | 8 bytes |
| Number | 85.00 | 8 bytes (double) |
| Boolean | true | 1 byte |
| Array | ["svc_001", "svc_002"] | Variable |
| Object | { start: "08:00", end: "17:00" } | Variable |
| Null | null | – |

---

## TODO

- [ ] Determine custom field requirements per vertical
- [ ] Define payment processor field structure (Stripe, Square)
- [ ] Confirm SMS/voice provider IDs and credentials handling
- [ ] Design backup/replication strategy
- [ ] Set up read replicas for reporting (Phase 2)
- [ ] Define data retention policies (logs, voice recordings)
- [ ] Encryption at rest for sensitive fields (passwords, payment tokens)
