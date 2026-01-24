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
from app.routers.technicians import router as technicians_router
from app.routers.tech_mobile import router as tech_mobile_router
from app.routers.dispatch_schedule import router as schedule_router
from app.routers.dispatch import router as dispatch_router
from app.routers.sms import router as sms_router
from app.routers.websocket import router as websocket_router
from app.routers.voice_notes import router as voice_notes_router
from app.routers.predictions import router as predictions_router
from app.routers.ai_analysis import router as ai_analysis_router
from app.routers.troubleshoot import router as troubleshoot_router
from app.routers.followup import router as followup_router
from app.routers.distributors import router as distributors_router
from app.routers.pricelist import router as pricelist_router
from app.routers.inventory import router as inventory_router
from app.routers.purchase_orders import router as purchase_orders_router
from app.routers.costing import router as costing_router
from app.routers.integrations import router as integrations_router
from app.routers.webhooks import router as webhooks_router
from app.routers.analytics import router as analytics_router
from app.routers.reports import router as reports_router

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
app.include_router(technicians_router, prefix=f"{settings.API_V1_PREFIX}/technicians", tags=["Technicians"])
app.include_router(tech_mobile_router, prefix=f"{settings.API_V1_PREFIX}/technicians", tags=["Tech Mobile"])
app.include_router(schedule_router, prefix=f"{settings.API_V1_PREFIX}/schedule", tags=["Schedule"])
app.include_router(dispatch_router, prefix=f"{settings.API_V1_PREFIX}/dispatch", tags=["Dispatch"])
app.include_router(sms_router, prefix=f"{settings.API_V1_PREFIX}/sms", tags=["SMS"])
app.include_router(voice_notes_router, prefix=f"{settings.API_V1_PREFIX}/voice-notes", tags=["Voice Notes"])
app.include_router(predictions_router, prefix=f"{settings.API_V1_PREFIX}/predictions", tags=["Predictions"])
app.include_router(ai_analysis_router, prefix=f"{settings.API_V1_PREFIX}/ai", tags=["AI Analysis"])
app.include_router(troubleshoot_router, prefix=f"{settings.API_V1_PREFIX}/troubleshoot", tags=["Troubleshooting"])
app.include_router(followup_router, prefix=f"{settings.API_V1_PREFIX}/followups", tags=["Follow-Ups"])
app.include_router(distributors_router, prefix=f"{settings.API_V1_PREFIX}/distributors", tags=["Distributors"])
app.include_router(pricelist_router, prefix=f"{settings.API_V1_PREFIX}/pricelist", tags=["Price List"])
app.include_router(inventory_router, prefix=f"{settings.API_V1_PREFIX}/inventory", tags=["Inventory"])
app.include_router(purchase_orders_router, prefix=f"{settings.API_V1_PREFIX}/purchase-orders", tags=["Purchase Orders"])
app.include_router(costing_router, prefix=f"{settings.API_V1_PREFIX}/costing", tags=["Job Costing"])
app.include_router(integrations_router, prefix=f"{settings.API_V1_PREFIX}/integrations", tags=["Integrations"])
app.include_router(webhooks_router, prefix=f"{settings.API_V1_PREFIX}/webhooks", tags=["Webhooks"])
app.include_router(analytics_router, prefix=f"{settings.API_V1_PREFIX}/analytics", tags=["Analytics"])
app.include_router(reports_router, prefix=f"{settings.API_V1_PREFIX}", tags=["Reports"])
app.include_router(websocket_router, prefix="/ws", tags=["WebSocket"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG
    )
