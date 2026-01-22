from fastapi import FastAPI, APIRouter, Request
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import time
from pathlib import Path
from contextlib import asynccontextmanager
from collections import defaultdict

# Load environment
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Import database
from app.database import Database

# Import routers
from app.routers import auth, appointments, clients, services, staff, businesses
from app.routers import availability, scheduling, equipment, notifications, payments, voice
from app.routers import portal, analytics, quickbooks, routes, reminders, integrations

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# ============== Simple Rate Limiter ==============

class RateLimiter:
    """Simple in-memory rate limiter for public endpoints"""

    def __init__(self, requests_per_minute: int = 60):
        self.requests_per_minute = requests_per_minute
        self.requests = defaultdict(list)

    def is_allowed(self, client_ip: str) -> bool:
        """Check if request is allowed"""
        now = time.time()
        minute_ago = now - 60

        # Clean old requests
        self.requests[client_ip] = [
            t for t in self.requests[client_ip] if t > minute_ago
        ]

        # Check limit
        if len(self.requests[client_ip]) >= self.requests_per_minute:
            return False

        # Record request
        self.requests[client_ip].append(now)
        return True

    def get_retry_after(self, client_ip: str) -> int:
        """Get seconds until next request allowed"""
        if not self.requests[client_ip]:
            return 0
        oldest = min(self.requests[client_ip])
        return max(0, int(60 - (time.time() - oldest)))


# Rate limiters for different endpoints
portal_rate_limiter = RateLimiter(requests_per_minute=60)  # 60 req/min for portal
auth_rate_limiter = RateLimiter(requests_per_minute=10)    # 10 req/min for auth


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler"""
    # Startup
    logger.info("Starting ServicePro API...")
    await Database.connect()

    # Add slug index for portal
    if Database.db is not None:
        await Database.db.businesses.create_index("slug", sparse=True)

    yield

    # Shutdown
    logger.info("Shutting down ServicePro API...")
    await Database.disconnect()


# Create the main app
app = FastAPI(
    title="ServicePro API",
    description="Multi-vertical service business operating system",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware - explicit origins for security
# Default includes: Next.js portal (3000), Expo web (19006, 8081)
default_origins = [
    "http://localhost:3000",      # Next.js portal dev
    "http://localhost:19006",     # Expo web dev
    "http://localhost:8081",      # Expo web dev alt
    "http://127.0.0.1:3000",
    "http://127.0.0.1:19006",
    "http://127.0.0.1:8081",
]

# Add custom origins from env (comma-separated)
custom_origins = os.getenv("CORS_ORIGINS", "").split(",")
custom_origins = [o.strip() for o in custom_origins if o.strip()]

# Portal domain from env
portal_domain = os.getenv("PORTAL_DOMAIN", "")
if portal_domain:
    custom_origins.append(f"https://{portal_domain}")
    custom_origins.append(f"http://{portal_domain}")

all_origins = list(set(default_origins + custom_origins))

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=all_origins,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


# Rate limiting middleware for public endpoints
@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    """Apply rate limiting to public portal and auth endpoints"""
    path = request.url.path

    # Get client IP
    client_ip = request.client.host if request.client else "unknown"
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()

    # Apply rate limiting to portal endpoints
    if path.startswith("/api/v1/portal"):
        if not portal_rate_limiter.is_allowed(client_ip):
            retry_after = portal_rate_limiter.get_retry_after(client_ip)
            return JSONResponse(
                status_code=429,
                content={
                    "success": False,
                    "error": {
                        "code": "RATE_LIMITED",
                        "message": "Too many requests. Please try again later."
                    }
                },
                headers={"Retry-After": str(retry_after)}
            )

    # Stricter rate limiting for auth endpoints
    if path.startswith("/api/v1/auth/") and path in [
        "/api/v1/auth/login",
        "/api/v1/auth/register",
        "/api/v1/auth/forgot-password"
    ]:
        if not auth_rate_limiter.is_allowed(client_ip):
            retry_after = auth_rate_limiter.get_retry_after(client_ip)
            return JSONResponse(
                status_code=429,
                content={
                    "success": False,
                    "error": {
                        "code": "RATE_LIMITED",
                        "message": "Too many attempts. Please wait before trying again."
                    }
                },
                headers={"Retry-After": str(retry_after)}
            )

    return await call_next(request)

# Create versioned API router
api_v1 = APIRouter(prefix="/api/v1")

# Include all routers
api_v1.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_v1.include_router(businesses.router, prefix="/businesses", tags=["Businesses"])
api_v1.include_router(appointments.router, prefix="/appointments", tags=["Appointments"])
api_v1.include_router(clients.router, prefix="/clients", tags=["Clients"])
api_v1.include_router(services.router, prefix="/services", tags=["Services"])
api_v1.include_router(staff.router, prefix="/staff", tags=["Staff"])
api_v1.include_router(availability.router, prefix="/availability", tags=["Availability"])
api_v1.include_router(scheduling.router, prefix="/scheduling", tags=["Scheduling"])
api_v1.include_router(equipment.router, prefix="/equipment", tags=["Equipment"])
api_v1.include_router(notifications.router, prefix="/notifications", tags=["Notifications"])
api_v1.include_router(payments.router, prefix="/payments", tags=["Payments"])
api_v1.include_router(voice.router, prefix="/voice", tags=["Voice AI"])

# Portal router (public endpoints)
api_v1.include_router(portal.router, prefix="/portal", tags=["Public Portal"])

# Analytics router
api_v1.include_router(analytics.router, prefix="/analytics", tags=["Analytics"])

# QuickBooks integration router
api_v1.include_router(quickbooks.router, prefix="/quickbooks", tags=["QuickBooks"])

# Routes optimization router
api_v1.include_router(routes.router, prefix="/routes", tags=["Routes"])

# SMS Reminders router
api_v1.include_router(reminders.router, prefix="/reminders", tags=["Reminders"])

# Integrations status router
api_v1.include_router(integrations.router, prefix="/integrations", tags=["Integrations"])

# Include versioned router
app.include_router(api_v1)


# Health check endpoints
@app.get("/", tags=["Health"])
async def root():
    return {"message": "ServicePro API", "version": "1.0.0"}


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "healthy"}
