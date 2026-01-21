# ServicePro Platform - Business Logic Specification

**Version:** 1.0  
**Status:** Phase 1 Design  
**Vertical:** Lawn Care (Primary) / Multi-Vertical (Configurable)

---

## Table of Contents

1. [Overview](#overview)
2. [Scheduling Logic](#scheduling-logic)
3. [Weather & Autonomous Rescheduling](#weather--autonomous-rescheduling)
4. [Staff & Crew Management](#staff--crew-management)
5. [Equipment Management](#equipment-management)
6. [Pricing & Payments](#pricing--payments)
7. [Notifications](#notifications)
8. [Configuration Management](#configuration-management)

---

## Overview

### Core Principle

**All business rules are configurable per business.** There are no hard-coded restrictions; everything is driven by the `business.config` document.

### Scope

Phase 1 implements core scheduling, weather, and notification logic. Phase 2 adds payments, dispatch, and reporting.

---

## Scheduling Logic

### Appointment Creation Rules

**When a user creates an appointment, validate:**

1. **Client exists and is active**
   - Query: `clients.find({ client_id, business_id })`
   - Error: 404 if not found
   - Error: 400 if deleted (`deleted_at != null`)

2. **Service exists and is active**
   - Query: `services.find({ service_id, business_id })`
   - Error: 404 if not found
   - Error: 400 if deleted

3. **Appointment date/time is within business hours**
   - Get business timezone from `business.timezone`
   - Convert appointment time to business timezone
   - Check against `business.config.business_hours[day_of_week]`
   - Error: 400 if outside hours

4. **No double-booking (conflict detection)**
   - Get all appointments for assigned staff on that date
   - For each staff member:
     - Query: `appointments.find({ business_id, assigned_staff_ids: staff_id, scheduled_date })`
     - Calculate time slots: [scheduled_start_time, scheduled_end_time]
     - Check for overlap with existing appointments
     - Account for `business.config.min_gap_between_jobs_minutes`
   - Error: 409 if conflict detected

5. **Required equipment available**
   - For service, get `services[service_id].requires_equipment_ids`
   - For each equipment:
     - Check if assigned staff can use it: `equipment[eq_id].assigned_staff_ids` includes staff
     - Check equipment status: `status == "active"`
   - Error: 400 if equipment unavailable

6. **Staff availability confirmed**
   - For each assigned staff member:
     - Check `staff[staff_id].availability_schedule[day_of_week]`
     - Verify time falls within available hours
     - Check for time-off: `availability.find({ staff_id, type: "time_off", date_from <= appointment_date, date_to >= appointment_date })`
   - Error: 400 if staff unavailable

7. **Duration is reasonable**
   - Use `service[service_id].default_duration_minutes` if not specified
   - Verify duration > 0 and < 480 minutes (8 hours)
   - Error: 400 if invalid

### Appointment Confirmation

Once all validations pass:

1. **Create appointment document**
   ```javascript
   appointment = {
     appointment_id: generate_uuid(),
     business_id,
     client_id,
     service_id,
     scheduled_date,
     scheduled_start_time,
     estimated_duration_minutes,
     assigned_staff_ids,
     assigned_equipment_ids,
     status: "scheduled",
     created_at: now(),
     audit_log: [{ action: "created", timestamp: now() }]
   }
   ```

2. **Send confirmation notification**
   - Create SMS: `"Your appointment on {date} at {time} is confirmed. Crew: {staff_names}"`
   - Or push notification if mobile app user
   - Log in `notifications` collection

3. **Trigger weather check (if enabled)**
   - See [Weather & Autonomous Rescheduling](#weather--autonomous-rescheduling)

---

## Weather & Autonomous Rescheduling

### Weather Check Process (Hourly Job)

**Schedule:** Every 6 hours, check appointments in next 48 hours

```python
def check_weather_and_reschedule():
    for business in businesses.find({ config.weather_enabled: true }):
        appointments = appointments.find({
            business_id,
            scheduled_date: { $gte: today, $lte: today + 2 days },
            status: "scheduled"
        })
        
        for appt in appointments:
            weather = fetch_weather(appt.client_latitude, appt.client_longitude, appt.scheduled_date)
            
            if exceeds_thresholds(weather, business.config.weather_thresholds):
                attempt_reschedule(appt, business)
```

### Weather Threshold Check

**Compare weather against business config thresholds:**

```python
def exceeds_thresholds(weather, thresholds):
    checks = {
        "rain": weather.rain_percent > thresholds.rain_percent,
        "temp_high": weather.temp_high_fahrenheit > thresholds.temp_max_fahrenheit,
        "temp_low": weather.temp_low_fahrenheit < thresholds.temp_min_fahrenheit,
        "wind": weather.wind_speed_mph > thresholds.wind_speed_mph
    }
    return any(checks.values())
```

### Southern Lawn Care Defaults

- **Rain Percent:** 70%
- **Temp Max:** 105°F
- **Temp Min:** 32°F
- **Wind Speed:** 35 mph

**Rationale:**
- 70% rain captures only serious thunderstorms, not pop-ups
- 105°F is heat advisory level in the South (routine summer temp ignored)
- 35 mph wind is significant operational risk

---

### Rescheduling Logic (If Weather Exceeded)

**Goal:** Find alternative time slot within 48 hours, respecting business availability

```python
def attempt_reschedule(appt, business):
    # Step 1: Collect all viable alternative slots
    candidates = []
    
    for day_offset in range(0, business.config.reschedule_window_hours / 24):
        candidate_date = appt.scheduled_date + day_offset
        
        # Only consider business working days
        day_of_week = candidate_date.day_of_week
        if not business.config.business_hours[day_of_week]:
            continue
        
        # Get available time slots for all assigned staff
        for staff_id in appt.assigned_staff_ids:
            available_slots = get_available_slots(staff_id, candidate_date, appt.estimated_duration_minutes)
            
            for slot in available_slots:
                candidate_appt = {
                    date: candidate_date,
                    start_time: slot.start,
                    end_time: slot.end,
                    confidence: calculate_confidence(candidate_date, appt.scheduled_date)
                }
                candidates.append(candidate_appt)
    
    if not candidates:
        # No slots available; escalate to owner notification (Phase 2)
        notify_owner_manual_reschedule_needed(appt)
        return
    
    # Step 2: Rank candidates
    # Prefer: earlier dates, morning times, same day if possible
    best_candidate = rank_and_select(candidates)
    
    # Step 3: Check weather on new candidate date
    weather_new = fetch_weather(..., best_candidate.date)
    if exceeds_thresholds(weather_new, business.config.weather_thresholds):
        # Try next candidate
        candidates.remove(best_candidate)
        if candidates:
            best_candidate = rank_and_select(candidates)
        else:
            # Still no viable slot
            notify_owner_manual_reschedule_needed(appt)
            return
    
    # Step 4: Execute reschedule
    old_appt_id = appt.appointment_id
    new_appt = copy_and_update_appointment(appt, best_candidate)
    new_appt.rescheduled_from_appointment_id = old_appt_id
    new_appt.was_rescheduled_due_to_weather = true
    
    # Cancel old appointment
    appt.status = "rescheduled"
    appt.cancellation_reason = "weather_forecast"
    appt.audit_log.append({
        action: "rescheduled_due_to_weather",
        new_appointment_id: new_appt.appointment_id,
        old_time: appt.scheduled_start_time,
        new_time: new_appt.scheduled_start_time,
        timestamp: now()
    })
    
    # Step 5: Notify customer
    send_reschedule_notification(appt.client_id, new_appt)
    appt.reschedule_notification_sent = true
    
    # Step 6: Log weather decision
    log_weather_decision(appt, new_appt, weather, best_candidate)
```

### Helper Functions

#### Get Available Slots

```python
def get_available_slots(staff_id, date, duration_minutes):
    """Find consecutive time slots when staff is free."""
    
    # Get business hours
    day_of_week = date.day_of_week
    business_hours = business.config.business_hours[day_of_week]
    if not business_hours:
        return []
    
    # Get existing appointments for this staff
    existing_appts = appointments.find({
        assigned_staff_ids: staff_id,
        scheduled_date: date,
        status: { $in: ["scheduled", "in_progress"] }
    }).sort({ scheduled_start_time: 1 })
    
    # Get time-off periods
    time_offs = availability.find({
        staff_id,
        type: "time_off",
        date_from: { $lte: date },
        date_to: { $gte: date }
    })
    
    # Build blocked time periods
    blocked_periods = []
    
    # Add business non-working hours
    blocked_periods.append({
        start: "00:00",
        end: business_hours.start
    })
    blocked_periods.append({
        start: business_hours.end,
        end: "23:59"
    })
    
    # Add existing appointments + gap
    min_gap = business.config.min_gap_between_jobs_minutes
    for appt in existing_appts:
        blocked_periods.append({
            start: time_subtract(appt.scheduled_start_time, min_gap),
            end: time_add(appt.scheduled_end_time, min_gap)
        })
    
    # Add time-off
    for tf in time_offs:
        blocked_periods.append({
            start: "00:00",
            end: "23:59"
        })
    
    # Generate slots from gaps
    slots = []
    current_time = business_hours.start
    
    for blocked in sorted(blocked_periods, key=lambda x: x.start):
        if current_time < blocked.start:
            slot_duration = time_diff(current_time, blocked.start)
            if slot_duration >= duration_minutes:
                slots.append({
                    start: current_time,
                    end: time_add(current_time, duration_minutes)
                })
        current_time = max(current_time, blocked.end)
    
    # Check remaining time until end of business hours
    if current_time < business_hours.end:
        slot_duration = time_diff(current_time, business_hours.end)
        if slot_duration >= duration_minutes:
            slots.append({
                start: current_time,
                end: time_add(current_time, duration_minutes)
            })
    
    return slots
```

#### Rank Candidates

```python
def rank_and_select(candidates):
    """Prefer earlier dates, morning times, same-day if possible."""
    
    scores = []
    for candidate in candidates:
        score = 0
        
        # Prefer same-day reschedule
        if candidate.date == appt.scheduled_date:
            score += 100
        else:
            # Prefer earlier dates
            days_offset = (candidate.date - appt.scheduled_date).days
            score += max(0, 50 - days_offset * 10)
        
        # Prefer morning (8am-12pm)
        hour = int(candidate.start_time.split(":")[0])
        if 8 <= hour < 12:
            score += 30
        elif 12 <= hour < 17:
            score += 20
        else:
            score += 0
        
        # Weather confidence
        weather_new = fetch_weather(..., candidate.date)
        confidence = 1.0 - calculate_weather_risk(weather_new)
        score += confidence * 20
        
        scores.append((score, candidate))
    
    return sorted(scores, key=lambda x: -x[0])[0][1]
```

---

## Staff & Crew Management

### Staff Availability Logic

1. **Recurring Schedule (Weekly Pattern)**
   - `staff.availability_schedule` defines default hours per day
   - Example: Monday-Friday 8am-5pm, Saturday-Sunday off

2. **Time-Off Periods**
   - Override recurring schedule for specific date ranges
   - Types: vacation, sick_day, training, holiday
   - Example: Feb 10-14 (vacation) overrides weekly pattern

3. **Availability Query**
   - When checking if staff is available on a specific date/time:
     ```python
     def is_staff_available(staff_id, date, start_time, end_time):
         # Check time-off first (highest priority)
         time_off = availability.find_one({
             staff_id,
             type: "time_off",
             date_from: { $lte: date },
             date_to: { $gte: date }
         })
         if time_off:
             return False
         
         # Check weekly schedule
         day_of_week = date.day_of_week
         schedule = staff[staff_id].availability_schedule[day_of_week]
         if not schedule:
             return False
         
         # Check time falls within schedule
         return start_time >= schedule.start and end_time <= schedule.end
     ```

---

## Equipment Management

### Equipment Assignment Rules

1. **Service may require specific equipment**
   - `services[service_id].requires_equipment_ids` lists required items

2. **Equipment must be assigned to staff**
   - `equipment[eq_id].assigned_staff_ids` lists which staff can use it
   - When assigning staff to appointment, verify they're assigned to all required equipment

3. **Equipment status must be active**
   - If `equipment.status != "active"`, cannot assign to appointments
   - Statuses: active, maintenance, retired

4. **Maintenance tracking (Phase 2)**
   - Log maintenance dates and costs
   - Flag when maintenance is due

---

## Pricing & Payments

### Phase 1 (Pricing Only)

1. **Service Default Price**
   - Each service has `default_price`
   - Applied when creating appointment

2. **Custom Price Override**
   - Appointment can have `custom_price` (for special deals or adjustments)
   - If not set, use service default

3. **Price Calculation**
   - `appointment.price = custom_price OR service.default_price`

### Phase 2+ (Payment Processing)

- Integration with Stripe or Square
- Customer payment methods stored
- Invoicing and payment tracking
- See API Specification for stubs

---

## Notifications

### Types

1. **Appointment Confirmation**
   - Sent immediately after booking
   - Message: "Your appointment on {date} at {time} is confirmed. Crew: {names}"

2. **Appointment Reminder**
   - Sent `business.config.sms_before_appointment_hours` before
   - Default: 24 hours
   - Message: "Reminder: {service_name} tomorrow at {time}"

3. **Reschedule Notification**
   - Sent when appointment is rescheduled
   - Message: "Your appointment has been rescheduled to {new_date} at {new_time} due to weather"

4. **Urgent Alert**
   - For operational issues (staff cancellation, emergency)
   - Manual trigger by owner

### Channels

- **SMS (Twilio):** Primary for lawn care (field crews)
- **Push Notification:** For mobile app users
- **Email:** Phase 2+

### Notification Preferences

- `client.preferred_contact_method`: sms, email, phone, push
- Respect opt-outs: STOP, DO NOT CALL lists

---

## Configuration Management

### Owner-Controlled Settings

All business rules are configurable in `business.config`:

| Setting | Default | Type | Range |
|---------|---------|------|-------|
| weather_enabled | true | boolean | – |
| weather_thresholds.rain_percent | 70 | number | 0-100 |
| weather_thresholds.temp_max | 105 | number | 50-120°F |
| weather_thresholds.temp_min | 32 | number | -20-80°F |
| weather_thresholds.wind_speed | 35 | number | 10-60 mph |
| reschedule_window_hours | 48 | number | 24-168 |
| min_gap_between_jobs | 30 | number | 0-120 minutes |
| allow_crew_stacking | true | boolean | – |
| allow_same_day_reschedule | true | boolean | – |
| ai_receptionist_enabled | false | boolean | – |
| sms_enabled | true | boolean | – |
| sms_before_appointment_hours | 24 | number | 1-72 |
| payments_enabled | false | boolean | – |

### Configuration Update Endpoint

```
PATCH /business

{
  "config": {
    "weather_thresholds": {
      "rain_percent": 75,
      "temp_max_fahrenheit": 105
    }
  }
}
```

---

## Error Handling

### Scheduling Errors

| Error | Cause | Resolution |
|-------|-------|-----------|
| DOUBLE_BOOKING | Staff already assigned to overlapping appointment | Choose different time or staff |
| STAFF_UNAVAILABLE | Staff not available on that date | Check availability_schedule, time-off |
| EQUIPMENT_UNAVAILABLE | Required equipment not active or not assigned to staff | Assign equipment to staff or repair |
| OUTSIDE_BUSINESS_HOURS | Appointment time outside business operating hours | Choose time within business hours |
| INVALID_SERVICE | Service doesn't exist or is deleted | Confirm service_id |
| INVALID_CLIENT | Client doesn't exist or is deleted | Create or reactivate client |

### Weather Errors

| Error | Cause | Resolution |
|-------|-------|-----------|
| WEATHER_API_UNREACHABLE | OpenWeatherMap API down | Fallback: skip weather check, proceed with booking |
| NO_AVAILABLE_RESCHEDULE_SLOTS | No open slots in reschedule window | Owner must manually reschedule (Phase 2 notification) |
| ALL_CANDIDATES_HAVE_BAD_WEATHER | Every alternative slot also exceeds weather thresholds | Owner notified, appointment kept as-is |

---

## TODO

- [ ] Confirm exact weather API integration (OpenWeatherMap API docs)
- [ ] Define edge case: what if reschedule_window extends past weekend? (confirm logic)
- [ ] Define Phase 2 payment validation rules (Stripe charge logic)
- [ ] Define refund policy when weather reschedules occur
- [ ] Document crew stacking constraints (max 2 crews per job?)
- [ ] Define cancellation fees (if any)
- [ ] Confirm time-off approval workflow (Phase 2)
