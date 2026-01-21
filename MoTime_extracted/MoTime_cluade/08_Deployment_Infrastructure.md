# ServicePro Platform - Deployment & Infrastructure Guide

**Status:** Phase 1 Design  
**Primary Platform:** Railway or Render (simple) / AWS (scalable)  
**Database:** MongoDB Atlas (Cloud)

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Local Development](#local-development)
3. [Production Deployment](#production-deployment)
4. [Monitoring & Logging](#monitoring--logging)
5. [Database Backups](#database-backups)
6. [Scaling](#scaling)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│         Mobile App (React Native)                │
│       iOS (App Store) + Android (Play)           │
└────────────────────────┬────────────────────────┘
                         │
              HTTPS (TLS 1.3)
                         │
        ┌────────────────┼────────────────┐
        │                │                │
┌───────▼──────┐  ┌──────▼──────┐  ┌─────▼─────┐
│ API Gateway  │  │Twilio Voice │  │ ElevenLabs│
│ (FastAPI)    │  │  & SMS      │  │ Voice AI  │
└───────┬──────┘  └─────────────┘  └───────────┘
        │
    Balancer
        │
┌───────▼──────────────────────────┐
│  FastAPI Application Servers     │
│  (2+ instances for HA)           │
└───────┬──────────────────────────┘
        │
        │ HTTPS (TLS 1.3)
        │
┌───────▼──────────────────────────┐
│   MongoDB Atlas (Cloud)          │
│   - Multi-region replication     │
│   - Daily automated backups      │
└──────────────────────────────────┘

Cache Layer:
┌──────────────────────────┐
│   Redis (optional)       │
│   - Session storage      │
│   - Rate limiting        │
│   - Weather cache        │
└──────────────────────────┘

External Services:
┌──────────────────────────────────────────────┐
│ - OpenWeatherMap API                         │
│ - Twilio (SMS/Voice)                         │
│ - ElevenLabs (Voice AI)                      │
│ - Firebase (Push Notifications)              │
│ - Sentry (Error Tracking)                    │
│ - Datadog (Monitoring)                       │
└──────────────────────────────────────────────┘
```

---

## Local Development

### Prerequisites

```bash
# Python 3.11+
python --version

# Node.js 18+ (for React Native)
node --version

# Docker (optional, for local MongoDB)
docker --version

# Git
git --version
```

### Environment Setup

```bash
# Clone repository
git clone https://github.com/servicepro/servicepro.git
cd servicepro

# Backend setup
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

pip install -r requirements.txt

# Copy environment template
cp .env.local.example .env.local

# Fill in .env.local with local values
# SECRET_KEY=your-dev-secret-key
# DATABASE_URL=mongodb://localhost:27017/servicepro_dev
# TWILIO_ACCOUNT_SID=your-twilio-sid
# etc.

# Frontend setup
cd ../frontend
npm install

# Copy environment
cp .env.example .env.local
# REACT_APP_API_URL=http://localhost:8000
```

### Running Locally

**Backend:**

```bash
cd backend
source venv/bin/activate

# Run with auto-reload
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Logs:
# INFO:     Uvicorn running on http://0.0.0.0:8000
# INFO:     Application startup complete
```

**Frontend (Expo):**

```bash
cd frontend
npm start

# Follow prompts:
# › Press w │ open web
# › Press a │ open Android
# › Press i │ open iOS
```

**Database (Docker):**

```bash
# Run MongoDB locally
docker run -d \
  --name mongodb \
  -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=password \
  mongo:latest

# Or use MongoDB Atlas (cloud) during development
```

---

## Production Deployment

### Option 1: Railway (Recommended for Phase 1)

**Why:** Simple, fast, Git-integrated, good for startups

**Setup:**

1. Sign up at [railway.app](https://railway.app)
2. Connect GitHub repository
3. Add PostgreSQL (for sessions, optional) or use MongoDB Atlas
4. Set environment variables
5. Deploy

**Configuration:**

```
railway.json:
{
  "buildCommand": "pip install -r requirements.txt",
  "startCommand": "uvicorn app.main:app --host 0.0.0.0 --port $PORT"
}
```

**Cost:** ~$5-50/month (depending on usage)

**Pros:** Simple, automatic scaling, built-in monitoring  
**Cons:** Limited customization, vendor lock-in

### Option 2: AWS EC2 (Recommended for Phase 2+)

**Why:** Full control, scalable, enterprise-grade

**Setup:**

```bash
# Launch EC2 instance (Ubuntu 22.04 LTS, t3.small)
# Security group: Allow 80 (HTTP), 443 (HTTPS), 22 (SSH)

# SSH into instance
ssh -i "key.pem" ubuntu@ec2-xxx.compute.amazonaws.com

# Install dependencies
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3.11 python3.11-venv git nginx

# Clone and setup
git clone https://github.com/servicepro/servicepro.git
cd servicepro/backend
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Create systemd service
sudo tee /etc/systemd/system/servicepro.service > /dev/null <<EOF
[Unit]
Description=ServicePro API
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/servicepro/backend
Environment="PATH=/home/ubuntu/servicepro/backend/venv/bin"
ExecStart=/home/ubuntu/servicepro/backend/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl start servicepro
sudo systemctl enable servicepro

# Configure Nginx as reverse proxy
sudo tee /etc/nginx/sites-available/servicepro > /dev/null <<EOF
server {
    listen 80;
    server_name api.servicepro.app;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/servicepro /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# SSL Certificate (Let's Encrypt)
sudo apt install -y certbot python3-certbot-nginx
sudo certbot certonly --nginx -d api.servicepro.app
```

**Cost:** ~$10-50/month

### Option 3: Render

Similar to Railway, also good for startups.

---

## Environment Variables

### Development (.env.local)

```
# Application
SECRET_KEY=dev-secret-key-change-in-production
DEBUG=true
LOG_LEVEL=DEBUG

# Database
DATABASE_URL=mongodb://admin:password@localhost:27017/servicepro_dev

# API Services
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1-205-555-0100

ELEVENLABS_API_KEY=sk-xxxxxxxxxxxxx
ELEVENLABS_VOICE_ID=EXAVITQu4vr4xnSDxMaL

OPENWEATHERMAP_API_KEY=xxxxxxxxxxxxx

FIREBASE_CREDENTIALS_PATH=./firebase-credentials.json

# Frontend
REACT_APP_API_URL=http://localhost:8000
REACT_APP_ENV=development
```

### Production (.env)

```
# Application
SECRET_KEY=$(openssl rand -hex 32)  # Generate securely
DEBUG=false
LOG_LEVEL=INFO

# Database
DATABASE_URL=mongodb+srv://user:password@cluster.mongodb.net/servicepro_prod?retryWrites=true&w=majority

# API Services
TWILIO_ACCOUNT_SID=AC...  # Production SID
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1-XXX-XXX-XXXX  # Business number

ELEVENLABS_API_KEY=sk_...  # Production key
ELEVENLABS_VOICE_ID=...

OPENWEATHERMAP_API_KEY=...  # Production key

FIREBASE_CREDENTIALS_PATH=/etc/servicepro/firebase-credentials.json

# Frontend
REACT_APP_API_URL=https://api.servicepro.app
REACT_APP_ENV=production
```

---

## Monitoring & Logging

### Sentry (Error Tracking)

```python
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.logging import LoggingIntegration

sentry_sdk.init(
    dsn="https://xxxxx@o123456.ingest.sentry.io/1234567",
    integrations=[
        FastApiIntegration(),
        LoggingIntegration(level=logging.INFO, event_level=logging.ERROR)
    ],
    traces_sample_rate=0.1,  # 10% of transactions
    environment="production"
)
```

### Datadog (Monitoring, optional)

```python
from datadog import initialize, api

options = {
    'api_key': 'your_datadog_api_key',
    'app_key': 'your_datadog_app_key'
}

initialize(**options)

# Track custom metrics
api.Metric.send(
    metric='servicepro.appointments.created',
    points=1,
    tags=['env:production', 'business:lawn_care']
)
```

### Application Logging

```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('app.log'),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)

# Usage
logger.info("Appointment created", extra={
    "appointment_id": apt_id,
    "client_id": client_id,
    "user_id": user_id
})

logger.error("Weather API failed", exc_info=True)
```

---

## Database Backups

### MongoDB Atlas Automatic Backups

```
MongoDB Atlas provides:
- Daily snapshots (30-day retention)
- Continuous incremental backups
- Point-in-time recovery
```

### Manual Backup

```bash
# Backup database
mongodump --uri="mongodb+srv://user:pass@cluster.mongodb.net/servicepro_prod" --out=backup_$(date +%Y%m%d)

# Restore from backup
mongorestore --uri="mongodb+srv://user:pass@cluster.mongodb.net/servicepro_prod" backup_20250117
```

---

## Scaling

### Horizontal Scaling (Multiple Servers)

```
Load Balancer (AWS ALB / Nginx)
    ├── API Server 1
    ├── API Server 2
    └── API Server 3
    
All connected to same MongoDB Atlas
```

### Vertical Scaling (Larger Server)

```
Initial: t3.small (1 vCPU, 2 GB RAM)
→ t3.medium (2 vCPU, 4 GB RAM)
→ t3.large (2 vCPU, 8 GB RAM)
```

### Caching Layer (Optional)

```python
import redis

redis_client = redis.Redis(host='localhost', port=6379, db=0)

# Cache weather forecast
redis_client.setex(f"weather:{lat}:{lon}", 3600 * 6, weather_data)

# Cache business config
redis_client.setex(f"business:{business_id}:config", 3600, config)

# Check cache first
weather = redis_client.get(f"weather:{lat}:{lon}")
if not weather:
    weather = fetch_weather_api(lat, lon)
    redis_client.setex(f"weather:{lat}:{lon}", 3600 * 6, weather)
```

---

## Deployment Checklist

- [ ] Database: Set up MongoDB Atlas production cluster
- [ ] Secrets: Generate SECRET_KEY and store in environment
- [ ] API Keys: Configure Twilio, ElevenLabs, OpenWeatherMap, Firebase
- [ ] SSL/TLS: Obtain Let's Encrypt certificate
- [ ] CORS: Configure allowed origins for mobile app
- [ ] Monitoring: Set up Sentry and Datadog
- [ ] Logging: Configure centralized logging (Datadog or ELK)
- [ ] Backups: Enable automated MongoDB backups
- [ ] CDN: (Phase 2) Configure CloudFront for static assets
- [ ] DNS: Point domain to load balancer
- [ ] Health Checks: Configure load balancer health checks
- [ ] Auto-scaling: (Phase 2) Configure autoscaling policies

---

## TODO

- [ ] Decide between Railway vs AWS vs Render
- [ ] Set up production MongoDB Atlas cluster
- [ ] Configure production domain and SSL
- [ ] Set up Sentry error tracking
- [ ] Create deployment runbook (step-by-step guide)
- [ ] Set up CI/CD pipeline (GitHub Actions)
- [ ] Configure monitoring alerts and dashboards
- [ ] Document rollback procedures
- [ ] Schedule regular backup testing
