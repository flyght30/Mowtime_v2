# ServicePro Platform - Error Handling & Edge Cases

**Status:** Phase 1 Design  
**Version:** 1.0

---

## Table of Contents

1. [Error Categories](#error-categories)
2. [Scheduling Errors](#scheduling-errors)
3. [Weather Errors](#weather-errors)
4. [External Service Errors](#external-service-errors)
5. [Data Integrity](#data-integrity)
6. [Recovery Strategies](#recovery-strategies)

---

## Error Categories

### Severity Levels

| Level | Example | Response |
|-------|---------|----------|
| **Critical** | Database down, API unreachable | Alert owner immediately, disable feature |
| **High** | Double-booking detected, validation fails | Return error to user, log event |
| **Medium** | Weather API slow, SMS delivery delayed | Retry, log, user notified if needed |
| **Low** | Timestamp format issue, minor validation | Log, continue execution |

### Standard Error Response Format

```json
{
  "error": {
    "code": "DOUBLE_BOOKING",
    "message": "Staff member already assigned to overlapping appointment",
    "details": {
      "field": "assigned_staff_ids",
      "conflict_appointment_id": "apt_existing",
      "conflict_time": "09:00-10:00"
    },
    "timestamp": "2025-01-17T14:30:00Z",
    "request_id": "req_12345",
    "action": "Choose different time or staff member"
  }
}
```

---

## Scheduling Errors

### 1. Double-Booking Detection

**Trigger:** Staff member has overlapping appointments

**Example:**
```
Existing:  09:00 - 10:00
New:       09:30 - 10:30  ← Overlap!
```

**Error Response:**
```python
{
    "status": 409,
    "error": {
        "code": "DOUBLE_BOOKING",
        "message": "Staff member Marcus Johnson is already assigned from 09:00-10:00",
        "details": {
            "existing_appointment": "apt_12345",
            "staff_name": "Marcus Johnson",
            "conflict_start": "09:00",
            "conflict_end": "10:00"
        },
        "action": "Choose a different time or assign different staff"
    }
}
```

**Recovery:**
```python
def attempt_reschedule_to_next_available(
    client_id: str,
    service_id: str,
    assigned_staff_ids: list,
    original_date: str,
    original_start_time: str,
    duration_minutes: int
) -> dict:
    """
    If requested time is booked, offer next available alternatives.
    """
    
    alternatives = find_next_available_slots(
        staff_ids=assigned_staff_ids,
        date=original_date,
        start_time=original_start_time,
        duration=duration_minutes,
        max_options=3
    )
    
    if alternatives:
        return {
            "status": "conflict_detected",
            "suggested_alternatives": alternatives,
            "message": "This time is booked. Here are alternatives:"
        }
    else:
        return {
            "status": "no_availability",
            "message": "No available slots on this date. Try another day."
        }
```

### 2. Staff Unavailability

**Trigger:** Staff member not available on requested date

**Causes:**
- Time-off scheduled (vacation, sick)
- Outside business hours
- Weekly schedule shows unavailable

**Error Response:**
```json
{
    "status": 400,
    "error": {
        "code": "STAFF_UNAVAILABLE",
        "message": "Marcus Johnson is not available on January 20th",
        "details": {
            "staff_id": "stf_marcus01",
            "staff_name": "Marcus Johnson",
            "reason": "time_off",
            "time_off_type": "vacation",
            "date_from": "2025-01-19",
            "date_to": "2025-01-24"
        },
        "action": "Choose different staff or reschedule to after January 24th"
    }
}
```

**Recovery:**
```python
def find_alternative_staff(
    service_id: str,
    scheduled_date: str,
    scheduled_start_time: str,
    duration_minutes: int,
    exclude_staff_ids: list = []
) -> list:
    """Find other staff available for the requested time."""
    
    # Get all staff qualified for service
    qualified_staff = db.staff.find({
        "business_id": current_user.business_id,
        "staff_id": { "$nin": exclude_staff_ids },
        "is_active": True
    })
    
    available_staff = []
    for staff in qualified_staff:
        is_available = check_staff_availability(
            staff_id=staff["staff_id"],
            date=scheduled_date,
            start_time=scheduled_start_time,
            duration=duration_minutes
        )
        
        if is_available:
            available_staff.append({
                "staff_id": staff["staff_id"],
                "name": f"{staff['first_name']} {staff['last_name']}",
                "avg_rating": staff.get("avg_rating", 0)
            })
    
    # Sort by rating (best first)
    return sorted(available_staff, key=lambda x: -x["avg_rating"])
```

### 3. Equipment Unavailability

**Trigger:** Required equipment not available or assigned to staff

**Error Response:**
```json
{
    "status": 400,
    "error": {
        "code": "EQUIPMENT_UNAVAILABLE",
        "message": "Equipment 'John Deere Mower' is not assigned to Marcus Johnson",
        "details": {
            "equipment_id": "eq_mower_01",
            "equipment_name": "John Deere Mower",
            "equipment_status": "active",
            "staff_id": "stf_marcus01",
            "reason": "not_assigned"
        },
        "action": "Assign equipment to staff, or choose different staff/equipment"
    }
}
```

**Recovery:**
```python
def suggest_equipment_solutions(
    service_id: str,
    assigned_staff_ids: list,
    required_equipment_ids: list
) -> dict:
    """
    Identify which equipment is missing and suggest solutions.
    """
    
    required_equipment = db.equipment.find({"equipment_id": {"$in": required_equipment_ids}})
    missing = []
    
    for equipment in required_equipment:
        staff_with_equipment = [
            s for s in assigned_staff_ids
            if s in equipment.get("assigned_staff_ids", [])
        ]
        
        if not staff_with_equipment:
            missing.append({
                "equipment_id": equipment["equipment_id"],
                "equipment_name": equipment["name"],
                "status": equipment["status"],
                "assigned_staff": equipment.get("assigned_staff_ids", []),
                "suggestion": f"Assign to {assigned_staff_ids[0]} or choose different staff"
            })
    
    if missing:
        return {
            "status": "equipment_missing",
            "missing_equipment": missing,
            "action": "Resolve missing equipment before booking"
        }
    else:
        return {"status": "ok"}
```

---

## Weather Errors

### 1. Weather API Unavailable

**Trigger:** OpenWeatherMap API down or rate-limited

**Behavior:**
- **Phase 1 (Graceful Degradation):** Skip weather check, proceed with booking
- **Phase 2 (Retry):** Exponential backoff, retry up to 3 times

**Implementation:**
```python
import asyncio
from httpx import AsyncClient

async def fetch_weather_with_retry(
    latitude: float,
    longitude: float,
    max_retries: int = 3
) -> dict:
    """
    Fetch weather with exponential backoff retry.
    Falls back gracefully if all retries fail.
    """
    
    for attempt in range(max_retries):
        try:
            async with AsyncClient() as client:
                response = await client.get(
                    f"https://api.openweathermap.org/data/3.0/onecall",
                    params={
                        "lat": latitude,
                        "lon": longitude,
                        "appid": WEATHER_API_KEY
                    },
                    timeout=5.0
                )
                
                if response.status_code == 200:
                    return response.json()
                elif response.status_code == 429:  # Rate limited
                    logger.warning("Weather API rate limited, retrying...")
                    await asyncio.sleep(2 ** attempt)  # Exponential backoff
                    continue
                else:
                    raise Exception(f"API error: {response.status_code}")
        
        except (asyncio.TimeoutError, ConnectionError) as e:
            logger.error(f"Weather API error (attempt {attempt+1}/{max_retries}): {e}")
            if attempt < max_retries - 1:
                await asyncio.sleep(2 ** attempt)
                continue
            else:
                break
    
    # All retries failed - graceful degradation
    logger.warning("Weather API unavailable, proceeding without weather check")
    return None
```

### 2. Weather Forecast Unavailable for Specific Date

**Trigger:** Weather API returns forecast but missing data for requested date

**Error Response:**
```json
{
    "status": 206,  # Partial content
    "warning": {
        "code": "WEATHER_PARTIAL",
        "message": "Weather data unavailable for requested date, using default thresholds",
        "details": {
            "requested_date": "2025-03-20",
            "available_until": "2025-02-20",
            "action": "Booking allowed; weather check skipped for out-of-range dates"
        }
    }
}
```

### 3. All Rescheduled Slots Have Bad Weather

**Trigger:** Every alternative slot within reschedule window exceeds weather thresholds

**Implementation:**
```python
async def handle_all_slots_bad_weather(
    appointment_id: str,
    client_id: str,
    all_candidates_exhausted: bool
) -> dict:
    """
    Handle case where all rescheduling candidates have poor weather.
    Options: Cancel, keep original time, or extend search window.
    """
    
    # Option 1: Notify owner for manual review
    owner = get_business_owner(appointment_id)
    
    send_email(
        to=owner.email,
        subject="Rescheduling Issue - Manual Review Needed",
        body=f"""
        Appointment {appointment_id} has weather concerns, but all 
        alternative slots in the next 48 hours also have poor forecasts.
        
        Options:
        1. Keep original time (customer assumes risk)
        2. Extend search window to 7 days
        3. Cancel appointment and notify customer
        
        Please review in app.
        """
    )
    
    # Option 2: Store in pending review queue
    db.pending_rescheduling.insert_one({
        "appointment_id": appointment_id,
        "reason": "all_candidates_bad_weather",
        "status": "awaiting_owner_decision",
        "created_at": datetime.utcnow(),
        "deadline": datetime.utcnow() + timedelta(hours=24)
    })
    
    # Option 3: Allow customer to choose
    send_sms(
        phone=client.phone,
        body=f"""
        Hi! We detected poor weather for your appointment on {appointment_date}.
        All rescheduling options also have weather concerns.
        
        Keep original time: Reply KEEP
        Cancel appointment: Reply CANCEL
        """
    )
    
    return {
        "status": "awaiting_decision",
        "action": "Owner notified; customer given options"
    }
```

---

## External Service Errors

### 1. SMS Delivery Failure (Twilio)

**Trigger:** Twilio API returns error or SMS fails to send

**Implementation:**
```python
async def send_sms_with_fallback(
    phone: str,
    message: str,
    notification_type: str
) -> dict:
    """
    Send SMS with fallback to push notification if SMS fails.
    """
    
    try:
        # Attempt SMS send
        response = twilio_client.messages.create(
            body=message,
            from_=TWILIO_PHONE_NUMBER,
            to=phone
        )
        
        # Log successful send
        db.notifications.insert_one({
            "notification_id": generate_id(),
            "channel": "sms",
            "status": "sent",
            "twilio_sid": response.sid,
            "created_at": datetime.utcnow()
        })
        
        return {"status": "sent", "channel": "sms"}
    
    except Exception as e:
        logger.error(f"SMS send failed: {e}")
        
        # Fallback: Send push notification instead
        try:
            send_push_notification(
                user_id=user_id,
                title="Appointment Confirmation",
                body=message
            )
            
            db.notifications.insert_one({
                "notification_id": generate_id(),
                "channel": "push",
                "status": "sent",
                "fallback_reason": "sms_failed",
                "created_at": datetime.utcnow()
            })
            
            return {"status": "sent", "channel": "push", "fallback": True}
        
        except Exception as push_error:
            logger.error(f"Push notification also failed: {push_error}")
            
            # Log notification failure
            db.notifications.insert_one({
                "notification_id": generate_id(),
                "channel": "failed",
                "status": "failed",
                "error": str(push_error),
                "created_at": datetime.utcnow()
            })
            
            return {
                "status": "failed",
                "error": "Could not send notification via SMS or push",
                "action": "Owner should contact customer manually"
            }
```

### 2. Voice AI Timeout

**Trigger:** ElevenLabs or Twilio voice session times out or errors

**Implementation:**
```python
async def handle_voice_timeout(
    session_id: str,
    error_message: str
) -> dict:
    """
    Handle voice call timeout or error.
    Escalate to human or offer alternative contact.
    """
    
    session = db.voice_sessions.find_one({"voice_session_id": session_id})
    
    if session:
        # Log error
        db.voice_sessions.update_one(
            {"voice_session_id": session_id},
            {
                "$set": {
                    "status": "failed",
                    "error_message": error_message,
                    "escalated_to_human": True
                }
            }
        )
        
        # Send fallback SMS to customer
        send_sms(
            phone=session.get("caller_phone"),
            body=f"""
            Sorry, there was a technical issue with our automated system.
            Please reply to this message or call us at {BUSINESS_PHONE} to book.
            Thanks!
            """
        )
        
        # Alert owner
        send_email(
            to=owner.email,
            subject="Voice Call Error - Manual Follow-up Needed",
            body=f"Call from {session['caller_phone']} failed. SMS sent as backup."
        )
    
    return {
        "status": "error",
        "escalated": True,
        "action": "Customer offered alternative contact methods"
    }
```

---

## Data Integrity

### 1. Appointment Date/Time Mismatch

**Trigger:** Appointment has inconsistent date/time values

**Validation:**
```python
def validate_appointment_dates(appointment: dict) -> tuple[bool, str]:
    """Validate appointment date/time consistency."""
    
    scheduled_date = datetime.fromisoformat(appointment["scheduled_date"])
    start_time = datetime.strptime(appointment["scheduled_start_time"], "%H:%M").time()
    end_time = datetime.strptime(appointment["scheduled_end_time"], "%H:%M").time()
    
    # Check: start < end
    if start_time >= end_time:
        return False, "Start time must be before end time"
    
    # Check: duration matches
    expected_duration = (
        datetime.combine(datetime.today(), end_time) -
        datetime.combine(datetime.today(), start_time)
    ).seconds // 60
    
    if expected_duration != appointment["estimated_duration_minutes"]:
        return False, "Duration doesn't match start/end times"
    
    # Check: not in past
    if scheduled_date < datetime.utcnow().date():
        return False, "Cannot schedule appointment in the past"
    
    return True, ""
```

### 2. Orphaned Records

**Trigger:** Client or staff deleted but appointments still exist

**Cleanup:**
```python
async def cleanup_orphaned_appointments():
    """
    Find appointments with missing clients/staff and handle.
    Runs nightly as background job.
    """
    
    # Find appointments with deleted clients
    orphaned_client = db.appointments.find({
        "client_id": {"$nin": db.clients.distinct("client_id")},
        "deleted_at": None
    })
    
    for apt in orphaned_client:
        logger.warning(f"Orphaned appointment: {apt['appointment_id']}")
        
        # Option 1: Mark as deleted
        db.appointments.update_one(
            {"appointment_id": apt["appointment_id"]},
            {"$set": {"deleted_at": datetime.utcnow()}}
        )
        
        # Option 2: Alert owner
        send_email(
            to=owner.email,
            subject="Data Integrity Issue Detected",
            body=f"Appointment {apt['appointment_id']} has missing client. Marked as deleted."
        )
```

---

## Recovery Strategies

### Automatic Recovery

| Error | Strategy |
|-------|----------|
| Temporary API down | Retry with exponential backoff |
| Stale cache | Invalidate and refresh |
| SMS delivery failure | Fallback to push notification |
| Weather API missing forecast | Use default thresholds |

### Manual Recovery (Owner)

| Error | Owner Action |
|-------|-------------|
| Double-booking not auto-resolved | Review suggestions, choose new time/staff |
| Weather reschedule needs approval | Review in app, approve or cancel |
| Voice call escalation | Call customer directly |

### System Recovery

| Error | System Action |
|-------|-------------|
| Database connection lost | Alert owner, disable writes, queue operations |
| Payment processor down | Queue payments, retry when available |
| Audit log write fails | Log to file, sync to database later |

---

## Logging & Alerting

### Error Logging

```python
import logging

logger = logging.getLogger(__name__)

logger.error(
    "Scheduling error",
    extra={
        "error_code": "DOUBLE_BOOKING",
        "appointment_id": apt_id,
        "staff_id": staff_id,
        "business_id": business_id,
        "user_id": user_id
    },
    exc_info=True  # Include stack trace
)
```

### Alert Thresholds

```python
# Alert owner if:
# - 5+ SMS failures in 1 hour
# - Weather API down for >30 minutes
# - Error rate > 5% for 10 minutes
# - Database connection fails
```

---

## TODO

- [ ] Implement comprehensive error logging
- [ ] Set up error alerting (Sentry, PagerDuty)
- [ ] Test all error scenarios in staging
- [ ] Create runbook for common errors
- [ ] Set up monitoring dashboards
- [ ] Document customer-facing error messages
- [ ] Plan incident response procedures
- [ ] Schedule error scenario drills
