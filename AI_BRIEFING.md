# AI Briefing: ServicePro (Mowtime_v2)

## Project Overview
ServicePro is a **multi-vertical service business operating system**. Primary vertical is lawn care but architecture supports any service business (HVAC, plumbing, etc.).

### Current State: Production-Ready MVP
All core features implemented through Phase 4 plus Phases 7-11 and Stage 2A.

---

## Completed Work Summary

| Phase | Feature | Status |
|-------|---------|--------|
| Phase 1 | Core Backend & Auth | ✅ Complete |
| Phase 2 | Dispatch & Scheduling | ✅ Complete |
| Phase 3 | SMS Communications | ✅ Complete |
| Phase 4 | Technician Mobile App | ✅ Complete |
| Phase 5-6 | (Skipped or TBD) | - |
| Phase 7 | Business Analytics Dashboard | ✅ Complete |
| Phase 8 | QuickBooks Integration | ✅ Complete |
| Phase 9 | Route Optimization | ✅ Complete |
| Phase 10 | SMS Appointment Reminders | ✅ Complete |
| Phase 11 | Launch Hardening | ✅ Complete |
| Stage 2A | Multi-Vertical Integration | ✅ Complete |

---

## Tech Stack

### Backend
- **Framework**: FastAPI (Python 3.11+)
- **Database**: MongoDB with Motor async driver
- **Auth**: JWT with access/refresh tokens
- **External APIs**: Twilio (SMS), Stripe (payments), QuickBooks, Google Maps, OSRM

### Frontend
- **Framework**: React Native + Expo SDK 50+
- **Navigation**: Expo Router (file-based routing)
- **State**: React Context (AuthContext, TechContext, VerticalContext, BrandingContext, DemoContext)
- **Storage**: expo-secure-store for tokens

---

## Project Structure

```
/backend/app/
  /models/          - Pydantic models
  /routers/         - API endpoints (29 router files)
  /services/        - Business logic (sms_service, routing, quickbooks, etc.)
  /middleware/      - Auth middleware

/frontend/
  /app/             - Expo Router screens
    /(auth)/        - Login, register
    /(tabs)/        - Main office app tabs
    /(tech)/        - Technician mobile app (separate experience)
  /components/      - Reusable components
    /ui/            - Generic UI components
    /tech/          - Tech app components (SignaturePad, VoiceRecorder, JobChecklist)
    /dashboard/     - Dashboard widgets
  /contexts/        - React contexts
  /services/        - API clients (api.ts, techApi.ts, notifications.ts)
  /hooks/           - Custom hooks (useOfflineQueue.ts)
  /constants/       - Theme, config
```

---

## Key Backend Routers

| Router | Purpose |
|--------|---------|
| `auth.py` | JWT auth, password reset |
| `clients.py` | Customer management |
| `appointments.py` | Job/appointment CRUD |
| `staff.py` | Employee management |
| `technicians.py` | Technician profiles, status, location |
| `tech_mobile.py` | Mobile app endpoints for techs |
| `dispatch.py` | Dispatch queue, map data |
| `dispatch_schedule.py` | Schedule entries, assignments |
| `sms.py` | SMS messaging, templates, conversations |
| `analytics.py` | Business metrics, revenue |
| `routes.py` | Route optimization |
| `quickbooks.py` | QB OAuth and sync |
| `reminders.py` | Automated SMS reminders |
| `integrations.py` | External API status |

---

## Key Frontend Screens

### Office App (`/(tabs)/`)
- Dashboard with vertical-specific widgets
- Clients, Appointments, Staff, Services
- Dispatch board with drag-drop scheduling
- SMS conversations
- Analytics dashboard
- Settings with vertical switching

### Tech Mobile App (`/(tech)/`)
- Today's jobs list
- Weekly calendar view
- Route map with markers
- Job detail, active job, completion screens
- Profile with clock in/out

---

## Important Patterns

### Role-Based Routing
In `frontend/app/_layout.tsx`, users are routed based on role:
- `staff` role → Tech app (`/(tech)/`)
- `owner`, `admin`, `manager` → Office app (`/(tabs)/`)

### SMS Auto-Triggers
Status changes trigger automatic SMS:
- `en_route` → 15-min ETA message
- `on_site` → Arrival notification
- `completed` → Completion message

### Geofence Detection
Tech location is tracked every 30 seconds. When within 500 feet of job site, auto-arrival can be triggered.

### Offline Support
`useOfflineQueue` hook queues API requests when offline, auto-retries when connectivity restored.

### Multi-Vertical Architecture
- `VerticalContext` manages active vertical (lawn_care, hvac, etc.)
- `BrandingContext` provides white-label customization
- Dashboard widgets are vertical-specific

---

## Test Coverage

**97 tests passing** (all in backend):
- Phase 2 Dispatch: 32 tests
- Phase 3 SMS: 31 tests
- Phase 4 Mobile: 34 tests

Run tests:
```bash
cd backend && python -m pytest tests/ -v
```

---

## External Service Configuration

| Service | Env Variables | Fallback |
|---------|---------------|----------|
| Stripe | `STRIPE_SECRET_KEY` | Returns 503 |
| Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | SMS disabled |
| Google Maps | `GOOGLE_MAPS_API_KEY` | Falls back to OSRM |
| QuickBooks | OAuth flow via `/quickbooks/connect` | Manual entry |

---

## Gotchas & Notes

1. **No npm test in frontend** - Tests are backend-only currently
2. **package.json is in /frontend**, not root
3. **Geofence radius is 500 feet**, not meters (see `technicians.py:23`)
4. **JWT tokens** stored in expo-secure-store, auto-refresh handled by `api.ts`
5. **MongoDB indexes** - Geospatial 2dsphere index on technician locations
6. **WebSocket** for real-time dispatch updates at `/ws/dispatch`
7. **Demo mode** available via DemoContext for testing different business types

---

## What's NOT Done / Potential Phase 5-6

Based on typical field service needs, possible next features:
- **Customer Portal** (self-service booking, payment)
- **Invoicing/Payments** (Stripe checkout flows)
- **Recurring Jobs** (subscription scheduling)
- **Inventory Management** (parts/materials tracking)
- **Crew/Team Features** (multi-tech jobs)
- **Reporting/Export** (PDF reports, Excel exports)
- **Native Push Notifications** (Firebase Cloud Messaging)

---

## Git Status

Branch: `claude/review-and-plan-8jM1B`

Recent commits:
```
24787d5 feat: Complete Phase 4 - SignaturePad, VoiceRecorder, Checklist, Offline support
8efcc58 feat: Complete Phase 4 - Technician Mobile App
1f3e2eb feat: Complete Phase 3 SMS - auto-triggers, dashboard widget
582a316 test: Fix Phase 3 SMS tests - all 31 tests passing
a17a254 refactor: Change geofence radius constant from meters to feet (500 ft)
```

---

## Quick Start Commands

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npx expo start

# Tests
cd backend && python -m pytest tests/ -v
```

---

## Files to Read First

1. `CLAUDE.md` - Project instructions and conventions
2. `backend/app/main.py` - All router registrations
3. `frontend/app/_layout.tsx` - Root layout with providers and role routing
4. `frontend/services/api.ts` - API client with auth handling
5. `frontend/services/techApi.ts` - Tech mobile API client

---

*Last updated: 2026-01-23 after Phase 4 completion*
