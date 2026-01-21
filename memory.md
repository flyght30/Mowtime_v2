# ServicePro (Mowtime v2) - Development Memory Log

## Project Overview
- **App Name:** ServicePro
- **Type:** Multi-vertical Service Business Operating System (SaaS)
- **Primary Vertical:** Lawn Care (configurable)
- **Tech Stack:** FastAPI (Python) + React Native (Expo) + MongoDB

## Current State (2026-01-21)

### Completed
- [x] Project structure established
- [x] Design documentation complete (10 spec documents)
- [x] Basic FastAPI starter with CORS
- [x] Basic React Native/Expo starter with landing page
- [x] Requirements.txt and package.json configured

### In Progress
- [ ] Phase 1A: Backend Foundation

### Pending
- [ ] Phase 1B: Frontend Foundation
- [ ] Phase 1C: Core Features
- [ ] Phase 1D: Scheduling Engine
- [ ] Phase 1E: Notifications
- [ ] Phase 2: AI Voice Receptionist
- [ ] Phase 3: Payments & Advanced Features

---

## Development Log

### Session: 2026-01-21

#### Milestone: Project Review & Planning
- **Status:** Complete
- **Summary:** Reviewed entire codebase, analyzed 10 design documents
- **Key Findings:**
  - Comprehensive API spec exists in `/MoTime_extracted/MoTime_cluade/`
  - MongoDB schema designed for 11 collections
  - JWT auth with RBAC planned
  - Weather integration with OpenWeatherMap
  - Voice AI via Twilio + ElevenLabs

#### Milestone: Phase 1A - Backend Foundation
- **Status:** Starting
- **Tasks:**
  1. [ ] Database models (Pydantic)
  2. [ ] MongoDB connection & initialization
  3. [ ] JWT Authentication system
  4. [ ] RBAC Middleware
  5. [ ] Core CRUD APIs
  6. [ ] Error handling & validation

---

## Environment Variables Needed
```
MONGO_URL=mongodb+srv://...
DB_NAME=servicepro
JWT_SECRET_KEY=<generate-secret>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=30

# Phase 1D+
OPENWEATHER_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
FIREBASE_CONFIG=

# Phase 2+
ELEVENLABS_API_KEY=
STRIPE_SECRET_KEY=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```

---

## Architecture Decisions
1. **Database:** MongoDB (document-oriented, flexible schema)
2. **Auth:** JWT with access/refresh tokens
3. **API Style:** RESTful with versioning (/api/v1/)
4. **Multi-tenant:** business_id on all documents
5. **Soft Deletes:** deleted_at timestamp instead of hard delete

---

## File Structure Target
```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app entry
│   ├── config.py            # Settings & env vars
│   ├── database.py          # MongoDB connection
│   ├── models/              # Pydantic models
│   │   ├── __init__.py
│   │   ├── user.py
│   │   ├── business.py
│   │   ├── client.py
│   │   ├── appointment.py
│   │   ├── service.py
│   │   ├── staff.py
│   │   └── equipment.py
│   ├── schemas/             # Request/Response schemas
│   ├── routers/             # API routes
│   │   ├── __init__.py
│   │   ├── auth.py
│   │   ├── users.py
│   │   ├── businesses.py
│   │   ├── clients.py
│   │   ├── appointments.py
│   │   ├── services.py
│   │   ├── staff.py
│   │   └── equipment.py
│   ├── services/            # Business logic
│   │   ├── auth_service.py
│   │   ├── scheduling_service.py
│   │   └── weather_service.py
│   ├── middleware/          # Auth, RBAC
│   └── utils/               # Helpers
└── tests/
```
