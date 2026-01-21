# ServicePro

A multi-vertical service business operating system. Primary vertical is lawn care, but the architecture supports any service business.

## Tech Stack

- **Backend**: FastAPI (Python 3.11) + MongoDB (Motor async driver)
- **Frontend**: React Native + Expo SDK 50+ + Expo Router
- **Auth**: JWT with access/refresh tokens

## Quick Start with Docker

The fastest way to get ServicePro running locally:

```bash
# 1. Clone the repository
git clone <repository-url>
cd Mowtime_v2

# 2. Copy environment file
cp .env.example .env

# 3. Start services (MongoDB + Backend)
docker-compose up -d

# 4. Seed the database with demo data
docker-compose --profile seed up seed

# 5. Backend API is now running at http://localhost:8000
```

### Demo Credentials

After seeding, use these accounts to log in:

| Business | Email | Password |
|----------|-------|----------|
| GreenScape Pro (Austin, TX) | mike@greenscapepro.com | demo123 |
| Sunshine Lawn Care (Orlando, FL) | sarah@sunshinelawncare.com | demo123 |

### API Documentation

Once running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Manual Setup (Development)

### Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start MongoDB (if not using Docker)
# Make sure MongoDB is running on localhost:27017

# Set environment variables
export MONGO_URL="mongodb://localhost:27017/servicepro_dev"
export JWT_SECRET_KEY="your-secret-key"

# Run the server
uvicorn app.main:app --reload --port 8000

# Seed demo data
python -m scripts.seed
```

### Frontend (Expo)

```bash
cd frontend

# Install dependencies
npm install

# Start Expo dev server
npx expo start

# Run on specific platform
npx expo start --ios
npx expo start --android
npx expo start --web
```

Update `frontend/services/api.ts` with your backend URL if not running on localhost.

## Project Structure

```
├── backend/
│   ├── app/
│   │   ├── models/        # Pydantic models
│   │   ├── routers/       # API endpoints
│   │   ├── services/      # Business logic
│   │   └── middleware/    # Auth middleware
│   ├── scripts/
│   │   └── seed.py        # Database seeder
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/
│   ├── app/               # Expo Router screens
│   │   ├── (auth)/        # Login, register
│   │   ├── (tabs)/        # Main app tabs
│   │   ├── appointment/   # Appointment CRUD
│   │   ├── client/        # Client CRUD
│   │   ├── services/      # Services CRUD
│   │   └── staff/         # Staff CRUD
│   ├── components/ui/     # Reusable components
│   ├── services/          # API client
│   └── constants/         # Theme, config
│
├── docker-compose.yml
├── .env.example
└── CLAUDE.md             # AI context file
```

## API Endpoints Overview

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/refresh` - Refresh token
- `GET /api/v1/auth/me` - Current user

### Core Resources
- `/api/v1/appointments` - Appointment CRUD
- `/api/v1/clients` - Client CRUD
- `/api/v1/services` - Service CRUD
- `/api/v1/staff` - Staff CRUD
- `/api/v1/invoices` - Invoice management
- `/api/v1/payments` - Payment processing

### Scheduling
- `/api/v1/scheduling/availability` - Staff availability
- `/api/v1/scheduling/routes` - Route optimization

### Notifications
- `/api/v1/notifications` - SMS/Email/Push notifications

## Demo Data

The seed script creates:
- **2 businesses** (Austin, TX and Orlando, FL)
- **15-20 clients per business** (mix of residential/commercial)
- **14 services** (mowing, trimming, fertilization, etc.)
- **7 staff members per business** (managers, crew leads, technicians)
- **500+ appointments** (past 90 days, today, next 30 days)
- **Invoices** in various states (draft, sent, paid, overdue)

## Environment Variables

See `.env.example` for all available configuration options.

Required for basic operation:
- `MONGO_URL` - MongoDB connection string
- `JWT_SECRET_KEY` - Secret for JWT tokens

Optional integrations:
- `TWILIO_*` - SMS and voice calls
- `SENDGRID_*` - Email delivery
- `STRIPE_*` - Payment processing
- `FIREBASE_*` - Push notifications
- `ELEVENLABS_*` - AI voice synthesis

## Docker Commands

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop services
docker-compose down

# Rebuild after code changes
docker-compose up -d --build

# Run seed (populates demo data)
docker-compose --profile seed up seed

# Connect to MongoDB
docker exec -it servicepro-mongodb mongosh -u admin -p admin123

# Clean slate (removes data)
docker-compose down -v
```

## License

Private - All rights reserved
