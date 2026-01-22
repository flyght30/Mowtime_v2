# Deployment Configurations

This directory contains deployment configurations for different branded versions of the app.

## Available Deployments

| App | Branding ID | Primary Vertical | Description |
|-----|-------------|------------------|-------------|
| MowTime | `mowtime` | Lawn Care | Single-vertical lawn care app |
| HVAC Pro | `hvac_pro` | HVAC | Single-vertical HVAC contractor app |
| ServicePro | `servicepro` | All | Multi-vertical service platform |

## How to Deploy Different Versions

### Backend

Set the `APP_BRANDING` environment variable:

```bash
# Deploy as MowTime (lawn care only)
APP_BRANDING=mowtime python -m uvicorn backend.server:app

# Deploy as HVAC Pro
APP_BRANDING=hvac_pro python -m uvicorn backend.server:app

# Deploy as ServicePro (all verticals)
APP_BRANDING=servicepro python -m uvicorn backend.server:app
```

### Frontend (React Native / Expo)

Use the corresponding app config:

```bash
# Build MowTime
cp deploy/mowtime/app.config.js frontend/app.config.js
cd frontend && eas build --platform all

# Build HVAC Pro
cp deploy/hvac_pro/app.config.js frontend/app.config.js
cd frontend && eas build --platform all

# Build ServicePro
cp deploy/servicepro/app.config.js frontend/app.config.js
cd frontend && eas build --platform all
```

## Directory Structure

```
deploy/
├── mowtime/
│   ├── app.config.js      # Expo config
│   ├── .env               # Environment variables
│   └── assets/            # Branded assets (logos, icons)
├── hvac_pro/
│   ├── app.config.js
│   ├── .env
│   └── assets/
├── servicepro/
│   ├── app.config.js
│   ├── .env
│   └── assets/
└── README.md
```

## Environment Variables

### Backend (.env)

```bash
# App branding
APP_BRANDING=mowtime           # mowtime | hvac_pro | servicepro

# MongoDB
MONGODB_URL=mongodb://localhost:27017
DATABASE_NAME=servicepro

# Auth
JWT_SECRET=your-secret-key
JWT_ALGORITHM=HS256

# External services (optional per deployment)
STRIPE_SECRET_KEY=sk_...
TWILIO_ACCOUNT_SID=AC...
SENDGRID_API_KEY=SG...
```

### Frontend (.env)

```bash
# API
EXPO_PUBLIC_API_URL=https://api.mowtime.app/api/v1

# Branding (fetched from API, but can override)
EXPO_PUBLIC_APP_NAME=MowTime
EXPO_PUBLIC_PRIMARY_COLOR=#4CAF50
```

## Creating a New Branded Deployment

1. **Define branding** in `backend/app/branding.py`:

```python
MY_APP_BRANDING = AppBranding(
    app_id="my_app",
    app_name="My App",
    app_tagline="My Tagline",
    primary_color="#FF5722",
    enabled_verticals=["plumbing", "electrical"],
    # ...
)

BRANDING_REGISTRY["my_app"] = MY_APP_BRANDING
```

2. **Create deploy config**:

```bash
mkdir -p deploy/my_app/assets
```

3. **Create app.config.js**:

```javascript
export default {
  name: "My App",
  slug: "my-app",
  version: "1.0.0",
  // ...
};
```

4. **Create assets**: Logo, icon, splash screen

5. **Deploy**:
```bash
APP_BRANDING=my_app ./deploy.sh
```

## Selling a Vertical

If you sell the lawn care business:

1. Transfer the MowTime branding and domain
2. Continue running ServicePro or HVAC Pro with remaining verticals
3. Data is isolated - lawn care customers stay with MowTime
4. Disable lawn_care vertical in your deployment:

```python
# Your remaining deployment
MY_REMAINING_BRANDING = AppBranding(
    app_id="my_business",
    enabled_verticals=["hvac", "plumbing"],  # No lawn_care
    # ...
)
```
