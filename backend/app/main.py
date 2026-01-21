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


# Request timing middleware
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    """Add processing time to response headers"""
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(round(process_time * 1000, 2))
    return response


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handle unexpected exceptions"""
    logger.error(f"Unexpected error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "An unexpected error occurred"
            }
        }
    )


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


# Import and include routers (will be added as we build them)
# from app.routers import auth, users, businesses, clients, appointments, services, staff, equipment

# app.include_router(auth.router, prefix=f"{settings.API_V1_PREFIX}/auth", tags=["Authentication"])
# app.include_router(users.router, prefix=f"{settings.API_V1_PREFIX}/users", tags=["Users"])
# app.include_router(businesses.router, prefix=f"{settings.API_V1_PREFIX}/businesses", tags=["Businesses"])
# app.include_router(clients.router, prefix=f"{settings.API_V1_PREFIX}/clients", tags=["Clients"])
# app.include_router(appointments.router, prefix=f"{settings.API_V1_PREFIX}/appointments", tags=["Appointments"])
# app.include_router(services.router, prefix=f"{settings.API_V1_PREFIX}/services", tags=["Services"])
# app.include_router(staff.router, prefix=f"{settings.API_V1_PREFIX}/staff", tags=["Staff"])
# app.include_router(equipment.router, prefix=f"{settings.API_V1_PREFIX}/equipment", tags=["Equipment"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG
    )
