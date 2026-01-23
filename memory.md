# ServicePro (Mowtime v2) - Development Memory Log

## Project Overview
- **App Name:** ServicePro
- **Type:** Multi-vertical Service Business Operating System (SaaS)
- **Primary Vertical:** Lawn Care (configurable)
- **Tech Stack:** FastAPI (Python) + React Native (Expo) + MongoDB

## Current State (2026-01-23)

### ALL PHASES COMPLETE ✓

- [x] Project structure established
- [x] Design documentation complete (10 spec documents)
- [x] **Phase 1A: Backend Foundation** - COMPLETE
- [x] **Phase 1B: Frontend Foundation** - COMPLETE
- [x] **Phase 1C: Core Features UI (Basic)** - COMPLETE
- [x] **Phase 1D: Scheduling Engine** - COMPLETE
- [x] **Phase 1E: Notifications System** - COMPLETE
- [x] **Phase 2: AI Voice Receptionist** - COMPLETE
- [x] **Phase 3: Payments & Advanced Features** - COMPLETE
- [x] **Stage 2A: Multi-Vertical Integration** - COMPLETE
- [x] **Phase 1 (TheWorx Foundation)**: HVAC Vertical - COMPLETE
- [x] **Phase 2 (Dispatch)**: Technician & Schedule Management - COMPLETE
- [x] **Phase 3 (SMS)**: Twilio SMS with Templates - COMPLETE

---

## Development Log

### Session: 2026-01-23 (Continued)

#### Phase 2 - Dispatch & Scheduling ✓
Full dispatch board with technician management and GPS tracking.

**Backend (Technicians & Scheduling)**:
- `backend/app/models/technician.py` - Technician with GPS, status, skills, stats
- `backend/app/models/schedule_entry.py` - Job-tech scheduling entries
- `backend/app/routers/technicians.py` - Full CRUD + status/location
- `backend/app/routers/dispatch_schedule.py` - Schedule management, assignment
- `backend/app/routers/dispatch.py` - Queue, map-data, tech suggestions, routes, stats
- Haversine distance calculation for ETA estimates
- AI-powered tech suggestion scoring (distance, skills, availability)

**Frontend (Dispatch Board)**:
- `frontend/services/dispatchApi.ts` - API service with TypeScript types
- `frontend/components/technicians/TechCard.tsx` - Status badges, skills
- `frontend/components/technicians/TechForm.tsx` - Create/edit form
- `frontend/app/technicians/index.tsx` - List with search/filters
- `frontend/app/technicians/[id].tsx` - Detail with schedule, stats
- `frontend/app/technicians/add.tsx` - Add form modal
- `frontend/app/dispatch/index.tsx` - Dispatch board with job queue, tech panel

#### Phase 3 - SMS Communications ✓
Twilio SMS integration with templates, triggers, and conversation management.

**Backend**:
- `backend/app/models/sms.py` - SMSMessage, SMSTemplate, SMSSettings
- `backend/app/services/sms_service.py` - Twilio integration, templates, triggers
- `backend/app/routers/sms.py` - Messages, templates, settings, webhooks
- 6 default templates (scheduled, reminder, enroute, 15_min, arrived, complete)
- Opt-in/opt-out handling (STOP/START keywords)
- Template variable substitution ({{customer_first_name}}, etc.)

**Frontend**:
- `frontend/services/smsApi.ts` - Full API service
- `frontend/app/sms/index.tsx` - Conversations list with stats
- `frontend/app/sms/conversation/[id].tsx` - Chat view with message bubbles
- `frontend/app/sms/settings.tsx` - Toggle triggers, reminder timing
- `frontend/app/sms/templates.tsx` - Template editor with variable insertion

---

### Session: 2026-01-23 (Earlier)

#### Stage 2A - Multi-Vertical Integration ✓
- BrandingContext: White-label support with dynamic logo/colors
- VerticalContext: Active vertical management with persistence
- Vertical Switcher: Settings UI for enabling/disabling verticals
- Conditional Tabs: HVAC Hub tab shown when vertical enabled
- Dashboard Widgets: HVAC and Lawn Care specific widgets
- Demo Mode: Pre-configured demo businesses for testing
- ErrorBoundary: App-level, screen-level, widget-level error handling

#### Phase 1 (TheWorx Foundation) - HVAC Vertical ✓
Integrated TheWorx HVAC platform features into ServicePro:

**Pricing Settings Page** (`/frontend/app/settings/pricing.tsx`):
- Labor rate configuration (install tech, helper)
- Overhead percentage
- Profit margin percentage
- Tax rate
- Default job duration
- Real-time sample job calculation preview

**Job Number Format** (JOB-YYYY-NNNN):
- Added `job_number_sequence` to Business model
- Atomic sequence increment on quote creation
- Format: JOB-2025-0001, JOB-2025-0002, etc.

**Line Item Editor** (`/frontend/app/hvac/quotes/[id].tsx`):
- Tap line item to edit (draft quotes only)
- Long-press to delete
- Add new line items
- Modal editor with type/description/quantity/price
- Auto-recalculates totals
- Unsaved changes indicator
- PUT /hvac/quotes/{id} for persistence

**Backend Enhancements**:
- PATCH /api/v1/businesses/me for deep nested config updates
- QuoteResponse includes job_number field
- updateQuote API in hvacApi.ts

### Session: 2026-01-21

#### Phase 1A - Backend Foundation ✓
- Config: pydantic-settings with env file support
- Database: Motor async MongoDB driver with index creation
- Models: User, Business, Client, Appointment, Service, Staff, Equipment, Availability, Notification
- Auth: JWT with access/refresh tokens, bcrypt password hashing
- RBAC: Role-based middleware (owner, admin, staff, customer)
- APIs: Full CRUD for all entities with business-scoping
- Errors: Custom exception classes with consistent JSON responses

#### Phase 1B - Frontend Foundation ✓
- Navigation: Expo Router with auth/tabs layouts
- Auth Context: JWT token management with expo-secure-store
- API Client: Fetch-based client with automatic token refresh on 401
- Auth Screens: Login and Register with validation
- UI Components: Button, Input, Card with consistent styling
- Theme System: Colors, typography, spacing, shadows

#### Phase 1C - Core Features UI ✓
- Dashboard with key metrics and quick actions
- Appointments tab with list view
- Clients tab with customer list
- Settings tab with user preferences

#### Phase 1D - Scheduling Engine ✓
- Weather service with OpenWeatherMap integration (15-min caching)
- Scheduling service with conflict detection
- Available slots calculation based on business hours
- Weather forecast and suitability checks
- Auto-reschedule for inclement weather

#### Phase 1E - Notifications System ✓
- SMS service with Twilio integration
- Push notification service with Firebase FCM
- Email service with SendGrid (HTML templates)
- Notification orchestration service
- Queue processing for background jobs
- Appointment confirmation and reminder scheduling

#### Phase 2 - AI Voice Receptionist ✓
- Call model with tracking, conversation, and voicemail
- Voice service with ElevenLabs TTS integration
- Call service for Twilio programmable voice
- Twilio webhooks for inbound calls
- AI-powered intent detection (booking, reschedule, cancel)
- Voicemail recording and transcription
- Call transfer to human support
- Outbound calling capability

#### Phase 3 - Payments & Invoicing ✓
- Payment and invoice models with line items
- Stripe customer management service
- Payment intent creation and confirmation
- Invoice creation, finalization, and voiding
- Payment refund support (full and partial)
- Stripe webhook handler for async events
- Client balance calculation
- Invoice creation from appointments

---

## API Summary (18 Routers, 150+ Endpoints)

### Core APIs
- `/api/v1/auth/*` - Authentication & user management
- `/api/v1/businesses/*` - Business management
- `/api/v1/clients/*` - Customer management
- `/api/v1/services/*` - Service offerings
- `/api/v1/staff/*` - Team management
- `/api/v1/equipment/*` - Tools/machinery
- `/api/v1/appointments/*` - Scheduling
- `/api/v1/availability/*` - Time-off management

### Advanced APIs
- `/api/v1/scheduling/*` - Weather-aware scheduling
- `/api/v1/notifications/*` - Multi-channel notifications
- `/api/v1/voice/*` - AI voice receptionist
- `/api/v1/payments/*` - Stripe payments & invoicing

### Dispatch APIs
- `/api/v1/technicians/*` - Technician CRUD, status, GPS tracking
- `/api/v1/schedule/*` - Job scheduling, assignment, optimization
- `/api/v1/dispatch/*` - Queue, map-data, tech suggestions, routes

### SMS APIs
- `/api/v1/sms/*` - Messages, conversations, templates, settings, webhooks

### Vertical APIs
- `/api/v1/verticals/*` - Vertical management
- `/api/v1/hvac/*` - HVAC vertical (load calc, equipment, quotes, maintenance)
- `/api/v1/lawn-care/*` - Lawn care vertical (properties, treatments)

---

## Environment Variables

```bash
# Core
MONGO_URL=mongodb+srv://...
DB_NAME=servicepro
JWT_SECRET_KEY=<generate-secret>
JWT_ALGORITHM=HS256
DEBUG=true

# Weather
OPENWEATHER_API_KEY=

# Notifications
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
FIREBASE_PROJECT_ID=
FIREBASE_CREDENTIALS_PATH=
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=

# AI Voice
ELEVENLABS_API_KEY=

# Payments
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

---

## File Structure

### Backend (60+ files)
```
backend/app/
├── main.py, config.py, database.py
├── models/ (15 models)
│   └── user, business, client, appointment, service, staff,
│       equipment, availability, notification, call, payment,
│       technician, schedule_entry, sms
├── routers/ (18 routers)
│   └── auth, businesses, clients, services, staff, equipment,
│       appointments, availability, scheduling, notifications,
│       voice, payments, verticals, technicians, dispatch_schedule,
│       dispatch, sms
├── services/ (12 services)
│   └── auth, base, weather, scheduling, sms, push, email,
│       notification, voice, call, payment, dispatch
├── verticals/ (modular vertical system)
│   ├── base/ (BaseVertical, VerticalConfig)
│   ├── registry.py (VerticalRegistry)
│   ├── lawn_care/ (LawnCareVertical, router)
│   └── hvac/ (HVACVertical, router, models, services)
├── middleware/ (auth.py)
└── utils/ (security.py, exceptions.py)
```

### Frontend (70+ files)
```
frontend/
├── app/
│   ├── (auth)/ (login, register)
│   ├── (tabs)/ (dashboard, appointments, clients, hvac-hub, settings)
│   ├── hvac/ (calculate, equipment, quotes, maintenance, inventory)
│   ├── technicians/ (index, [id], add)
│   ├── dispatch/ (index)
│   ├── sms/ (index, settings, templates, conversation/[id])
│   └── settings/ (pricing.tsx)
├── components/
│   ├── ui/ (Button, Input, Card)
│   ├── dashboard/ (HVACWidgets, LawnCareWidgets)
│   ├── technicians/ (TechCard, TechForm)
│   └── ErrorBoundary.tsx
├── contexts/ (AuthContext, BrandingContext, VerticalContext, DemoContext)
├── services/ (api.ts, hvacApi.ts, dispatchApi.ts, smsApi.ts)
└── constants/ (config, theme)
```

---

## Summary

ServicePro is a **complete multi-vertical service business operating system** with:

- ✓ Full CRUD APIs for all business entities
- ✓ JWT Authentication with RBAC
- ✓ Weather-aware scheduling
- ✓ Multi-channel notifications (SMS, Email, Push)
- ✓ AI Voice Receptionist (Twilio + ElevenLabs)
- ✓ Stripe Payments with invoicing and refunds
- ✓ React Native mobile app with Expo Router
- ✓ Modular vertical architecture (enable/disable verticals)
- ✓ HVAC vertical with load calc, quoting, maintenance
- ✓ White-label branding support
- ✓ Multi-vertical dashboard with widgets
- ✓ Technician dispatch with GPS tracking
- ✓ Job scheduling with tech assignment
- ✓ Dispatch board with AI tech suggestions
- ✓ SMS communications with Twilio
- ✓ Automated SMS triggers (scheduled, reminder, enroute, arrived, complete)
- ✓ SMS template management with variable substitution

**All phases completed. Full dispatch system and SMS communications integrated.**
