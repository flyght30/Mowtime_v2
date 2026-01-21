# ServicePro - Project Context for Claude Code

## Overview
ServicePro (Mowtime v2) is a multi-vertical service business operating system. Primary vertical is lawn care but architecture supports any service business.

## Tech Stack
- **Backend**: FastAPI (Python 3.11+) + MongoDB (Motor async driver)
- **Frontend**: React Native + Expo SDK 50+ + Expo Router (file-based routing)
- **Auth**: JWT with access/refresh tokens stored in expo-secure-store

## Project Structure
```
/backend/app/          - FastAPI application
  /models/             - Pydantic models
  /routers/            - API endpoints
  /services/           - Business logic
  /middleware/         - Auth middleware

/frontend/             - React Native Expo app
  /app/                - Expo Router screens (file-based routing)
    /(auth)/           - Login, register screens
    /(tabs)/           - Main app tab screens
  /components/ui/      - Reusable UI components
  /contexts/           - React contexts (AuthContext)
  /services/           - API client
  /constants/          - Config, theme
```

## Frontend Conventions

### File-based Routing (Expo Router)
- `app/_layout.tsx` - Root layout
- `app/(auth)/` - Auth group (login, register)
- `app/(tabs)/` - Main app with bottom tabs
- Dynamic routes: `[id].tsx` for detail screens

### Component Patterns
- Use functional components with TypeScript
- Keep components in `/components/` organized by domain or `/ui/` for reusable
- Use the theme constants from `/constants/theme.ts`
- Use the API client from `/services/api.ts`

### Styling
- Use StyleSheet.create() for styles
- Follow the theme: colors, typography, spacing, shadows from theme.ts
- Consistent padding: 16px (spacing.md)
- Border radius: 8px (borderRadius.md)
- Primary color: #4CAF50 (green)

### API Integration
- All API calls go through `/services/api.ts`
- API client handles token refresh automatically
- Use try/catch with proper error handling
- Show loading states during API calls

### State Management
- Local state: useState
- Auth state: AuthContext
- Forms: controlled components with useState

## API Endpoints (Key ones for frontend)
```
POST /api/v1/auth/login          - Login
POST /api/v1/auth/register       - Register
GET  /api/v1/auth/me             - Current user

GET  /api/v1/appointments        - List appointments
POST /api/v1/appointments        - Create appointment
GET  /api/v1/appointments/{id}   - Get appointment
PUT  /api/v1/appointments/{id}   - Update appointment

GET  /api/v1/clients             - List clients
POST /api/v1/clients             - Create client
GET  /api/v1/clients/{id}        - Get client

GET  /api/v1/services            - List services
GET  /api/v1/staff               - List staff
```

## Current State
- Backend: Complete (12 routers, 100+ endpoints)
- Frontend: Foundation complete (auth, basic tabs)
- Phase 4: Building out full frontend screens

## Naming Conventions
- Files: kebab-case for routes, PascalCase for components
- Components: PascalCase
- Functions: camelCase
- Constants: UPPER_SNAKE_CASE
- Types/Interfaces: PascalCase with descriptive names
