# Phase 10: SMS Appointment Reminders - Progress

## Status: Complete

## Overview
Phase 10 adds automated SMS appointment reminders using Twilio, with configurable timing, message templates, and support for client replies.

## Backend Implementation

### New Service: `/backend/app/services/reminders.py`
Complete reminder system with Twilio integration.

#### Features
- **24-Hour Reminders**: Sent day before appointment
- **2-Hour Reminders**: "On the way" notification
- **Template System**: Customizable message templates with variable substitution
- **Reply Handling**: Process CONFIRM/RESCHEDULE responses
- **Delivery Tracking**: Track SMS delivery status via webhooks
- **Per-Business Settings**: Enable/disable reminders per business

#### Key Methods
- `send_sms()` - Send SMS via Twilio and log it
- `send_24h_reminders()` - Send batch 24-hour reminders
- `send_2h_reminders()` - Send batch 2-hour reminders
- `handle_incoming_sms()` - Process reply messages
- `get_reminder_settings()` / `update_reminder_settings()` - Manage settings
- `update_delivery_status()` - Update from Twilio webhook

### New Router: `/backend/app/routers/reminders.py`

#### Settings Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/reminders/settings` | GET | Get reminder settings |
| `/reminders/settings` | PUT | Update reminder settings |

#### Send Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/reminders/send` | POST | Send reminder for specific appointment |
| `/reminders/send-bulk` | POST | Trigger batch sending (24h or 2h) |

#### Log Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/reminders/log` | GET | Get sent reminder history |
| `/reminders/replies` | GET | Get SMS reply history |

#### Twilio Webhooks
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/reminders/webhook/status` | POST | Delivery status callback |
| `/reminders/webhook/incoming` | POST | Incoming SMS handler |

### Message Templates

#### 24-Hour Reminder (Default)
```
Reminder: Your {service} appointment is tomorrow at {time}.
Reply CONFIRM or RESCHEDULE.
```

Variables: `{service}`, `{time}`, `{date}`, `{client_name}`, `{business_name}`, `{address}`

#### 2-Hour Reminder (Default)
```
Your technician {staff_name} is on the way. ETA: {eta}.
Reply if you need to reschedule.
```

Variables: `{staff_name}`, `{eta}`, `{time}`, `{service}`

### Reply Processing

| Reply | Action | Response |
|-------|--------|----------|
| CONFIRM, YES, Y | Set status to "confirmed" | "Thank you! Your appointment is confirmed." |
| RESCHEDULE, CANCEL, CHANGE | Flag for reschedule | "We'll contact you shortly to reschedule." |
| Other | No action | "Reply CONFIRM to confirm or RESCHEDULE to request a new time." |

### Database Collections

#### `reminder_settings`
```javascript
{
  business_id: string,
  enabled: boolean,
  reminder_24h_enabled: boolean,
  reminder_2h_enabled: boolean,
  reminder_24h_template: string,
  reminder_2h_template: string,
  allow_replies: boolean,
  updated_at: datetime
}
```

#### `reminder_logs`
```javascript
{
  log_id: string,
  business_id: string,
  appointment_id: string,
  to_phone: string,
  message: string,
  reminder_type: string,  // "24h", "2h", "manual"
  twilio_sid: string,
  status: string,  // "queued", "sent", "delivered", "failed"
  sent_at: datetime,
  delivered_at: datetime,
  error: string
}
```

#### `reminder_replies`
```javascript
{
  reply_id: string,
  from_phone: string,
  body: string,
  twilio_sid: string,
  appointment_id: string,
  original_reminder_id: string,
  received_at: datetime,
  action_taken: string  // "confirmed", "reschedule_requested"
}
```

## Frontend Implementation

### Settings Screen Updates
Added SMS Reminders section in `/frontend/app/(tabs)/settings.tsx`.

#### Features
- **Master Toggle**: Enable/disable all reminders
- **24-Hour Toggle**: Enable/disable day-before reminders
- **2-Hour Toggle**: Enable/disable on-the-way reminders
- **Visual Feedback**: Color-coded switches, loading states

#### UI Elements
- Icon header with "Appointment Reminders" title
- Three toggle switches with descriptions
- Info footer explaining reply keywords
- Smooth animations on toggle

## Environment Variables Required
```bash
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890
```

## Twilio Webhook Configuration
Set these webhook URLs in Twilio console:

1. **Status Callback URL**:
   `https://your-domain.com/api/v1/reminders/webhook/status`

2. **Incoming Message URL**:
   `https://your-domain.com/api/v1/reminders/webhook/incoming`

## Files Created/Modified

### Created
- `backend/app/services/reminders.py` - Reminder service
- `backend/app/routers/reminders.py` - API endpoints
- `phase-10-progress.md` - This documentation

### Modified
- `backend/server.py` - Added reminders router
- `frontend/app/(tabs)/settings.tsx` - Added reminder settings UI

## Scheduled Jobs (Future)
For production, set up scheduled tasks to call:
- `POST /reminders/send-bulk { "reminder_type": "24h" }` - Run daily at 9am
- `POST /reminders/send-bulk { "reminder_type": "2h" }` - Run every 15 minutes

## Security Considerations
- Twilio signature validation (recommended for production)
- Phone number sanitization
- Rate limiting on webhook endpoints
- Business-scoped data access

## Future Enhancements
- Email reminders in addition to SMS
- WhatsApp Business integration
- Custom reminder timing (e.g., 48h, 1h)
- A/B testing for message templates
- Analytics on confirmation rates
- Scheduled job integration (APScheduler/Celery)
- MMS support with appointment details image
