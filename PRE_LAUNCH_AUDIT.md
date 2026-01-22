# Pre-Launch Audit Report - MowTime/ServicePro

## Executive Summary

**Overall Production Readiness: 55%**

Your app has solid foundations but needs work before App Store/Play Store submission. The backend is feature-rich but lacks tests. The mobile app is ~70% complete but missing critical App Store requirements.

---

## Critical Issues (MUST FIX BEFORE LAUNCH)

### 1. 🔴 App Store Requirements Missing

| Requirement | Status | Action Needed |
|-------------|--------|---------------|
| App Name | ❌ Shows "frontend" | Change to "MowTime" or "ServicePro" |
| iOS Bundle ID | ❌ Missing | Add `com.mowtime.app` to app.json |
| Android Package | ❌ Missing | Add `com.mowtime.app` to app.json |
| Splash Screen | ❌ Broken | Fix splash-icon.png path in app.json |
| Privacy Policy | ❌ Missing | Create and host privacy policy |
| Terms of Service | ❌ Missing | Create and host terms of service |

### 2. 🔴 Security Critical

| Issue | Severity | Action |
|-------|----------|--------|
| Default JWT Secret | CRITICAL | Change `JWT_SECRET_KEY` in production |
| Twilio Webhooks | CRITICAL | Add signature verification |
| CORS Wildcard | CRITICAL | Configure specific origins |
| Password Reset Tokens | HIGH | Hash tokens before storing |

### 3. 🔴 Missing User Flows

| Flow | Status | Impact |
|------|--------|--------|
| Password Reset (Frontend) | ❌ Not coded | Users can't recover accounts |
| Email Verification | ❌ Not coded | Anyone can register fake emails |
| Onboarding | ❌ Not coded | New users have no guidance |

---

## What's Working Well ✅

### Backend (7/10)
- ✅ 163 API endpoints across 17 routers
- ✅ Full CRUD for appointments, clients, services, staff
- ✅ Stripe payment integration
- ✅ QuickBooks integration
- ✅ SMS reminders (Twilio)
- ✅ Route optimization
- ✅ Analytics dashboard
- ✅ Proper error handling with 28 custom exceptions
- ✅ Role-based access control
- ✅ Database indexes for performance

### Mobile App (7/10)
- ✅ Authentication (login/register/logout)
- ✅ Full appointment management
- ✅ Full client management
- ✅ Service and staff management
- ✅ Dashboard with stats
- ✅ Analytics charts
- ✅ Route optimization with maps
- ✅ QuickBooks and SMS settings
- ✅ Consistent UI theme
- ✅ Loading and error states

### Infrastructure (5/10)
- ✅ Docker setup works for development
- ✅ MongoDB with indexes
- ✅ Environment variable templates
- ✅ Health check endpoints

---

## Detailed Action Plan

### Phase 1: App Store Blockers (Do This Week)

#### 1. Fix app.json Configuration

```json
{
  "expo": {
    "name": "MowTime",
    "slug": "mowtime",
    "version": "1.0.0",
    "ios": {
      "bundleIdentifier": "com.mowtime.app",
      "buildNumber": "1"
    },
    "android": {
      "package": "com.mowtime.app",
      "versionCode": 1
    },
    "splash": {
      "image": "./assets/images/splash-image.png"
    }
  }
}
```

#### 2. Create Privacy Policy
- Host at: `https://yourdomain.com/privacy`
- Must include: data collection, storage, third-party sharing
- Add link to Settings screen

#### 3. Create Terms of Service
- Host at: `https://yourdomain.com/terms`
- Add link to Settings screen

#### 4. Build Password Reset Screen
Create `/frontend/app/(auth)/reset-password.tsx`:
- Email input to request reset
- Token verification
- New password form

### Phase 2: Security Hardening (Do Before Launch)

#### 1. Environment Variables
```env
# Generate new secret: python -c "import secrets; print(secrets.token_urlsafe(32))"
JWT_SECRET_KEY=<generate-new-64-char-secret>

# Explicit origins (no wildcards)
CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com

# Production mode
DEBUG=false
```

#### 2. Add Security Headers
Add to `backend/server.py`:
```python
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
from starlette.middleware import Middleware

# Add security headers
@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    return response
```

#### 3. Hash Password Reset Tokens
Update `auth_service.py` to hash tokens:
```python
import hashlib

# When creating token:
token = secrets.token_urlsafe(32)
token_hash = hashlib.sha256(token.encode()).hexdigest()
# Store token_hash, return token

# When verifying:
token_hash = hashlib.sha256(token.encode()).hexdigest()
# Compare token_hash with stored value
```

### Phase 3: Complete Missing Screens

#### 1. Settings Screen Placeholders
These buttons do nothing and need implementation:
- Edit Profile
- Change Password
- Notification Preferences
- Business Hours
- Help & Support
- Theme/Appearance

#### 2. Email Verification
- Add endpoint: `POST /api/v1/auth/verify-email`
- Send verification email on registration
- Add verification screen in app

### Phase 4: Testing & Quality

#### 1. Create Basic Tests
```bash
mkdir backend/tests
# Create test files for:
# - test_auth.py (login, register, password reset)
# - test_appointments.py (CRUD operations)
# - test_payments.py (Stripe integration)
```

#### 2. Run Security Scan
```bash
pip install bandit safety
bandit -r backend/app
safety check
```

---

## What You Need to Do Before First Build

### For iOS (App Store):

1. **Apple Developer Account** ($99/year)
   - https://developer.apple.com/programs/

2. **App Store Connect Setup**
   - Create new app
   - Set bundle ID: `com.mowtime.app`
   - Upload screenshots (6.5" and 5.5" sizes)
   - Write app description
   - Set age rating
   - Add privacy policy URL

3. **Certificates & Provisioning**
   - EAS Build handles this automatically
   - Or manually create in Apple Developer portal

### For Android (Play Store):

1. **Google Play Developer Account** ($25 one-time)
   - https://play.google.com/console

2. **Play Console Setup**
   - Create new app
   - Complete store listing
   - Upload screenshots
   - Privacy policy URL required
   - Content rating questionnaire

3. **Signing Key**
   - EAS Build can manage this
   - Or create your own keystore

### EAS Build Setup

Create `frontend/eas.json`:
```json
{
  "cli": {
    "version": ">= 3.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "env": {
        "EXPO_PUBLIC_API_URL": "https://staging-api.yourdomain.com"
      }
    },
    "production": {
      "env": {
        "EXPO_PUBLIC_API_URL": "https://api.yourdomain.com"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

Then run:
```bash
cd frontend
npx eas-cli login
npx eas build --platform all --profile production
npx eas submit --platform all
```

---

## Deployment Checklist

### Backend Deployment

- [ ] Set up cloud server (AWS, GCP, DigitalOcean)
- [ ] Install Docker and docker-compose
- [ ] Configure domain and SSL certificate
- [ ] Set all environment variables
- [ ] Run database migrations
- [ ] Set up backup strategy
- [ ] Configure monitoring (optional but recommended)

### Mobile App Deployment

- [ ] Update app.json with correct bundle IDs
- [ ] Create privacy policy and terms pages
- [ ] Fix splash screen configuration
- [ ] Generate app icons (if using custom)
- [ ] Create eas.json
- [ ] Build with EAS: `eas build --platform all`
- [ ] Submit to stores: `eas submit --platform all`

### DNS/Domain Setup

- [ ] `api.yourdomain.com` → Backend server
- [ ] `portal.yourdomain.com` → Next.js portal (optional)
- [ ] `yourdomain.com/privacy` → Privacy policy
- [ ] `yourdomain.com/terms` → Terms of service

---

## Cost Estimates

| Service | Cost | Notes |
|---------|------|-------|
| Apple Developer | $99/year | Required for iOS |
| Google Play | $25 one-time | Required for Android |
| Server (DigitalOcean/AWS) | $20-50/month | For backend API |
| MongoDB Atlas | $0-57/month | Free tier available |
| Twilio | Pay per use | ~$0.0075/SMS |
| SendGrid | $0-20/month | Free tier: 100 emails/day |
| Stripe | 2.9% + $0.30 | Per transaction |
| EAS Build | $0-29/month | Free tier: 30 builds/month |

---

## Quick Reference: File Locations

| What | Where |
|------|-------|
| Backend config | `/backend/app/config.py` |
| Environment template | `/.env.example` |
| Mobile app config | `/frontend/app.json` |
| API client | `/frontend/services/api.ts` |
| Theme/colors | `/frontend/constants/theme.ts` |
| Auth screens | `/frontend/app/(auth)/` |
| Main screens | `/frontend/app/(tabs)/` |
| Backend routers | `/backend/app/routers/` |
| Database setup | `/backend/scripts/mongo-init.js` |

---

## Summary: What to Do Next

1. **Today**: Fix app.json (name, bundle IDs, splash screen)
2. **This Week**: Create privacy policy and terms of service
3. **This Week**: Build password reset screen
4. **Before Launch**: Fix security issues (JWT secret, CORS, token hashing)
5. **Before Launch**: Set up EAS and build configs
6. **Launch Day**: Submit to App Store and Play Store

**Questions?** The code is well-structured. Focus on the App Store requirements first since those are blocking, then security hardening, then polish.
