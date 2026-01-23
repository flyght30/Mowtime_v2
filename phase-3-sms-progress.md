# Phase 3: SMS Communications Progress

## Overview
Twilio SMS integration with automated triggers, templates, and conversation management.

## Status: COMPLETE
Completed: 2026-01-23

---

## Backend Implementation

### Models (`backend/app/models/sms.py`)
- [x] SMSDirection enum (inbound, outbound)
- [x] SMSTriggerType enum (scheduled, reminder, enroute, 15_min, arrived, complete, manual, reply)
- [x] SMSStatus enum (queued, sent, delivered, failed, received)
- [x] SMSMessage model with full tracking fields
- [x] SMSTemplate model with variables support
- [x] SMSSettings model for business configuration
- [x] DEFAULT_TEMPLATES array (6 trigger types)

### Service (`backend/app/services/sms_service.py`)
- [x] Twilio API integration
- [x] Phone number normalization (E.164)
- [x] Template variable rendering
- [x] Template fetching (custom + defaults)
- [x] Build variables from database records
- [x] send_sms() - Core Twilio sending
- [x] send_and_log() - Send with database logging
- [x] send_triggered_sms() - Automated SMS based on triggers
- [x] process_webhook() - Handle Twilio callbacks
- [x] seed_default_templates() - Initialize templates
- [x] Opt-in/opt-out handling (STOP/START)

### Router (`backend/app/routers/sms.py`)
- [x] GET /sms - List messages with filters
- [x] GET /sms/conversations - List grouped by customer
- [x] GET /sms/conversation/{id} - Full conversation
- [x] POST /sms/send - Send manual SMS
- [x] POST /sms/webhook - Twilio callback
- [x] GET /sms/stats - SMS statistics
- [x] GET /sms/templates - List templates
- [x] GET /sms/templates/{id} - Get template
- [x] POST /sms/templates - Create custom template
- [x] PUT /sms/templates/{id} - Update template
- [x] DELETE /sms/templates/{id} - Delete custom template
- [x] POST /sms/templates/preview - Preview with sample data
- [x] POST /sms/templates/seed - Initialize defaults
- [x] GET /sms/settings - Get SMS settings
- [x] PUT /sms/settings - Update settings
- [x] POST /sms/trigger/{type} - Manual trigger

---

## Frontend Implementation

### API Service (`frontend/services/smsApi.ts`)
- [x] TypeScript types for all SMS entities
- [x] smsApi.listMessages()
- [x] smsApi.listConversations()
- [x] smsApi.getConversation()
- [x] smsApi.sendSMS()
- [x] smsApi.getStats()
- [x] smsApi.listTemplates()
- [x] smsApi.updateTemplate()
- [x] smsApi.previewTemplate()
- [x] smsApi.getSettings()
- [x] smsApi.updateSettings()
- [x] Helper functions (TRIGGER_TYPE_LABELS, STATUS_COLORS, formatPhoneNumber)

### Screens
- [x] `frontend/app/sms/_layout.tsx` - Stack navigation
- [x] `frontend/app/sms/index.tsx` - Conversations list
  - Stats bar (today, month, delivery rate)
  - Search functionality
  - Quick action buttons (settings, templates)
  - Conversation cards with unread badges
- [x] `frontend/app/sms/conversation/[id].tsx` - Chat view
  - Customer header with call button
  - Message bubbles (inbound/outbound)
  - Date headers
  - Status indicators (sent, delivered, failed)
  - Message input with character counter
- [x] `frontend/app/sms/settings.tsx` - SMS configuration
  - Master enable/disable switch
  - Individual trigger toggles
  - Reminder timing configuration
  - Opt-out message customization
- [x] `frontend/app/sms/templates.tsx` - Template management
  - Template cards with preview
  - Template editor modal
  - Variable insertion
  - Live preview
  - Enable/disable toggles

---

## Files Created

### Backend
- `backend/app/models/sms.py`
- `backend/app/routers/sms.py`
- Updated: `backend/app/services/sms_service.py`
- Updated: `backend/app/main.py` (router registration)

### Frontend
- `frontend/services/smsApi.ts`
- `frontend/app/sms/_layout.tsx`
- `frontend/app/sms/index.tsx`
- `frontend/app/sms/conversation/[id].tsx`
- `frontend/app/sms/settings.tsx`
- `frontend/app/sms/templates.tsx`
- `frontend/components/sms/RecentMessages.tsx` - Dashboard widget
- `frontend/components/sms/index.ts`

---

## Default Templates

| Trigger | Name | Variables |
|---------|------|-----------|
| scheduled | Job Scheduled | customer_first_name, company_name, scheduled_date, scheduled_time |
| reminder | Appointment Reminder | customer_first_name, scheduled_time, company_name |
| enroute | Technician En Route | customer_first_name, tech_first_name, eta_minutes |
| 15_min | 15 Minute ETA | customer_first_name, tech_first_name |
| arrived | Technician Arrived | customer_first_name, tech_first_name |
| complete | Job Complete | customer_first_name, company_name, invoice_link |

---

## Integration Points

1. **Dispatch Integration**: When tech status changes (enroute, arrived, complete), SMS is automatically triggered
2. **Scheduling Integration**: When job is assigned, "scheduled" SMS is automatically sent
3. **Location/Geofence Integration**: 15-min ETA SMS and auto-arrival SMS triggered by location updates
4. **Webhook Processing**: Status updates from Twilio (delivered, failed)
5. **Opt-out Handling**: STOP/START keyword responses

---

## Automatic SMS Triggers (Hooked)

| Trigger | When | Location |
|---------|------|----------|
| SCHEDULED | Job assigned to tech | `dispatch_schedule.py:assign_job()` |
| ENROUTE | Tech status → enroute | `technicians.py:update_tech_status()` |
| 15_MIN | Tech within 15-min ETA | `technicians.py:update_tech_location()` |
| ARRIVED | Tech enters geofence / status → on_site | `technicians.py:update_tech_location()` |
| COMPLETE | Tech status → complete | `technicians.py:update_tech_status()` |
| REMINDER | Day-before at 6 PM | **Requires scheduler (see below)** |

---

## Reminder Scheduler (Production Setup)

The day-before reminder requires a background task scheduler. Options:

### Option 1: APScheduler (Simple)
```python
# backend/app/tasks/scheduler.py
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

scheduler = AsyncIOScheduler()

@scheduler.scheduled_job(CronTrigger(hour=18, minute=0))  # 6 PM daily
async def send_reminder_sms():
    # Find jobs scheduled for tomorrow
    # Send reminder SMS for each
    pass

# Start in main.py: scheduler.start()
```

### Option 2: Celery Beat (Production)
```python
# For larger deployments with Redis/RabbitMQ
CELERY_BEAT_SCHEDULE = {
    'send-reminders': {
        'task': 'tasks.send_reminder_sms',
        'schedule': crontab(hour=18, minute=0),
    },
}
```

### Option 3: External Cron
```bash
# System cron calling API endpoint
0 18 * * * curl -X POST http://localhost:8000/api/v1/sms/send-reminders
```

---

## Configuration Required

For production, set in environment:
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`

Or per-business via SMS settings with `twilio_phone`.
