# Phase 2: Dispatch & Scheduling Progress

## Overview
Full dispatch board with GPS tracking and scheduling for HVAC technicians.

## Status: IN PROGRESS
Started: 2026-01-23

---

## Sprint 4 (Week 7-8): Technician Management

### Technician Backend
- [x] Create `backend/app/models/technician.py`
- [x] Create `backend/app/routers/technicians.py`:
  - [x] GET `/technicians`
  - [x] GET `/technicians/active` (brief list)
  - [x] GET `/technicians/{id}`
  - [x] POST `/technicians`
  - [x] PUT `/technicians/{id}`
  - [x] DELETE `/technicians/{id}`
  - [x] PATCH `/technicians/{id}/status`
  - [x] POST `/technicians/{id}/location`
  - [x] GET `/technicians/{id}/location/history`
  - [x] PATCH `/technicians/{id}/toggle-active`
- [ ] Add geospatial index on location
- [ ] Write tests

### Schedule Backend
- [x] Create `backend/app/models/schedule_entry.py`
- [x] Create `backend/app/routers/dispatch_schedule.py`:
  - [x] GET `/schedule` - Daily schedule by tech
  - [x] GET `/schedule/week` - Week view
  - [x] POST `/schedule/assign` - Assign job to tech
  - [x] GET `/schedule/{id}` - Get entry
  - [x] PUT `/schedule/{id}` - Update entry
  - [x] DELETE `/schedule/{id}` - Unassign job
  - [x] PATCH `/schedule/{id}/status` - Update entry status
  - [x] POST `/schedule/optimize` - Route optimization

### Dispatch Backend
- [x] Create `backend/app/routers/dispatch.py`:
  - [x] GET `/dispatch/queue` - Unassigned and today's jobs
  - [x] GET `/dispatch/map-data` - Tech locations and job pins
  - [x] POST `/dispatch/suggest-tech` - AI tech suggestions
  - [x] GET `/dispatch/route` - Tech's daily route
  - [x] GET `/dispatch/stats` - Dispatch statistics

### Technician Frontend
- [ ] Create `frontend/app/technicians/index.tsx` - List page
- [ ] Create `frontend/app/technicians/[id].tsx` - Detail page
- [ ] Create `frontend/app/technicians/add.tsx` - Add form
- [ ] Create `frontend/components/technicians/TechCard.tsx`
- [ ] Create `frontend/components/technicians/TechForm.tsx`

---

## Sprint 5 (Week 9-10): Dispatch Board

### Map Integration
- [ ] Install Mapbox/react-native-maps
- [ ] Create MapView component
- [ ] Add tech location markers
- [ ] Add job location pins
- [ ] Add route polylines

### Dispatch Board Layout
- [ ] Create `frontend/app/dispatch/index.tsx`
- [ ] Create DispatchBoard component
- [ ] Create JobQueue component
- [ ] Create TechPanel component
- [ ] Day/week toggle

---

## Sprint 6 (Week 11-12): GPS & Real-time

### GPS Tracking
- [ ] Location ping endpoint
- [ ] TechLocation model for history
- [ ] TTL index (7 day expiry)

### WebSocket
- [ ] FastAPI WebSocket endpoint
- [ ] Connection manager
- [ ] Broadcast location updates
- [ ] Real-time status changes

### Route Optimization
- [ ] Routing service (Mapbox integration)
- [ ] Optimize endpoint
- [ ] Route view component

---

## Files Created

### Backend
- `backend/app/models/technician.py`
- `backend/app/models/schedule_entry.py`
- `backend/app/routers/technicians.py`
- `backend/app/routers/schedule.py`
- `backend/app/routers/dispatch.py`
- `backend/app/services/dispatch_service.py`
- `backend/app/services/routing_service.py`

### Frontend
- `frontend/app/technicians/index.tsx`
- `frontend/app/technicians/[id].tsx`
- `frontend/app/technicians/add.tsx`
- `frontend/app/dispatch/index.tsx`
- `frontend/components/technicians/TechCard.tsx`
- `frontend/components/technicians/TechForm.tsx`
- `frontend/components/dispatch/DispatchBoard.tsx`
- `frontend/components/dispatch/JobQueue.tsx`
- `frontend/components/dispatch/MapView.tsx`
- `frontend/services/dispatchApi.ts`
