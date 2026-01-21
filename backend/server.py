from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from contextlib import asynccontextmanager

# Load environment
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Import database
from app.database import Database

# Import routers
from app.routers import auth, appointments, clients, services, staff, businesses
from app.routers import availability, scheduling, equipment, notifications, payments, voice
from app.routers import portal, analytics

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


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

# CORS middleware
cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:19006,http://localhost:8081").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins + ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

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

# Include versioned router
app.include_router(api_v1)


# Health check endpoints
@app.get("/", tags=["Health"])
async def root():
    return {"message": "ServicePro API", "version": "1.0.0"}


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "healthy"}
