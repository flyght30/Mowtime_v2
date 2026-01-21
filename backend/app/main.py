"""
ServicePro API - Main Application Entry Point
Multi-vertical Service Business Operating System
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
import time

from app.config import get_settings
from app.database import Database
from app.utils.exceptions import register_exception_handlers

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management - startup and shutdown"""
    # Startup
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")

    # Validate production settings
    errors = settings.validate_production_settings()
    if errors:
        for error in errors:
            logger.warning(f"Configuration warning: {error}")

    # Connect to database
    await Database.connect()

    yield

    # Shutdown
    logger.info("Shutting down application")
    await Database.disconnect()


# Create FastAPI application
app = FastAPI(
    title=settings.APP_NAME,
    description="Multi-vertical Service Business Operating System API",
    version=settings.APP_VERSION,
    docs_url="/api/docs" if settings.DEBUG else None,
    redoc_url="/api/redoc" if settings.DEBUG else None,
    openapi_url="/api/openapi.json" if settings.DEBUG else None,
    lifespan=lifespan
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register exception handlers
register_exception_handlers(app)


# Request timing middleware
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    """Add processing time to response headers"""
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(round(process_time * 1000, 2))
    return response


# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint for load balancers and monitoring"""
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION
    }


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/api/docs" if settings.DEBUG else "Disabled in production",
        "api_prefix": settings.API_V1_PREFIX
    }


# Import routers
from app.routers.auth import router as auth_router
from app.routers.businesses import router as businesses_router
from app.routers.clients import router as clients_router
from app.routers.services import router as services_router
from app.routers.staff import router as staff_router
from app.routers.equipment import router as equipment_router
from app.routers.appointments import router as appointments_router
from app.routers.availability import router as availability_router
from app.routers.scheduling import router as scheduling_router
from app.routers.notifications import router as notifications_router
from app.routers.voice import router as voice_router
from app.routers.payments import router as payments_router

# API v1 routers
app.include_router(auth_router, prefix=f"{settings.API_V1_PREFIX}/auth", tags=["Authentication"])
app.include_router(businesses_router, prefix=f"{settings.API_V1_PREFIX}/businesses", tags=["Businesses"])
app.include_router(clients_router, prefix=f"{settings.API_V1_PREFIX}/clients", tags=["Clients"])
app.include_router(services_router, prefix=f"{settings.API_V1_PREFIX}/services", tags=["Services"])
app.include_router(staff_router, prefix=f"{settings.API_V1_PREFIX}/staff", tags=["Staff"])
app.include_router(equipment_router, prefix=f"{settings.API_V1_PREFIX}/equipment", tags=["Equipment"])
app.include_router(appointments_router, prefix=f"{settings.API_V1_PREFIX}/appointments", tags=["Appointments"])
app.include_router(availability_router, prefix=f"{settings.API_V1_PREFIX}/availability", tags=["Availability"])
app.include_router(scheduling_router, prefix=f"{settings.API_V1_PREFIX}/scheduling", tags=["Scheduling"])
app.include_router(notifications_router, prefix=f"{settings.API_V1_PREFIX}/notifications", tags=["Notifications"])
app.include_router(voice_router, prefix=f"{settings.API_V1_PREFIX}/voice", tags=["Voice"])
app.include_router(payments_router, prefix=f"{settings.API_V1_PREFIX}/payments", tags=["Payments"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG
    )
