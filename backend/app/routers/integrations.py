"""
Integrations Status Router
Provides unified status endpoint for all external service integrations
"""

import os
from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_database
from app.middleware.auth import get_current_user
from app.models.user import User

router = APIRouter()


def check_stripe_configured() -> dict:
    """Check if Stripe is configured"""
    secret_key = os.getenv("STRIPE_SECRET_KEY", "")
    publishable_key = os.getenv("STRIPE_PUBLISHABLE_KEY", "")
    configured = bool(secret_key and publishable_key)
    return {
        "name": "stripe",
        "display_name": "Stripe Payments",
        "configured": configured,
        "description": "Process credit card payments" if configured else "Set STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY to enable"
    }


def check_twilio_configured() -> dict:
    """Check if Twilio SMS is configured"""
    account_sid = os.getenv("TWILIO_ACCOUNT_SID", "")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "")
    phone_number = os.getenv("TWILIO_PHONE_NUMBER", "")
    configured = bool(account_sid and auth_token and phone_number)
    return {
        "name": "twilio",
        "display_name": "Twilio SMS",
        "configured": configured,
        "description": "Send SMS notifications and reminders" if configured else "Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER to enable"
    }


def check_sendgrid_configured() -> dict:
    """Check if SendGrid email is configured"""
    api_key = os.getenv("SENDGRID_API_KEY", "")
    configured = bool(api_key)
    return {
        "name": "sendgrid",
        "display_name": "SendGrid Email",
        "configured": configured,
        "description": "Send transactional emails" if configured else "Set SENDGRID_API_KEY to enable email notifications"
    }


def check_quickbooks_configured() -> dict:
    """Check if QuickBooks is configured"""
    client_id = os.getenv("QUICKBOOKS_CLIENT_ID", "")
    client_secret = os.getenv("QUICKBOOKS_CLIENT_SECRET", "")
    configured = bool(client_id and client_secret)
    return {
        "name": "quickbooks",
        "display_name": "QuickBooks Online",
        "configured": configured,
        "description": "Sync customers and invoices with QuickBooks" if configured else "Set QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET to enable"
    }


def check_google_maps_configured() -> dict:
    """Check if Google Maps API is configured"""
    api_key = os.getenv("GOOGLE_MAPS_API_KEY", "")
    configured = bool(api_key)
    return {
        "name": "google_maps",
        "display_name": "Google Maps",
        "configured": configured,
        "description": "Enhanced route optimization with traffic data" if configured else "Set GOOGLE_MAPS_API_KEY to enable (falls back to OSRM)"
    }


def check_openweather_configured() -> dict:
    """Check if OpenWeatherMap is configured"""
    api_key = os.getenv("OPENWEATHER_API_KEY", "")
    configured = bool(api_key)
    return {
        "name": "openweather",
        "display_name": "Weather Data",
        "configured": configured,
        "description": "Show weather forecasts for scheduling" if configured else "Set OPENWEATHER_API_KEY to enable weather data"
    }


def check_elevenlabs_configured() -> dict:
    """Check if ElevenLabs is configured"""
    api_key = os.getenv("ELEVENLABS_API_KEY", "")
    configured = bool(api_key)
    return {
        "name": "elevenlabs",
        "display_name": "ElevenLabs Voice AI",
        "configured": configured,
        "description": "AI voice responses for phone calls" if configured else "Set ELEVENLABS_API_KEY to enable voice AI"
    }


def check_firebase_configured() -> dict:
    """Check if Firebase push notifications are configured"""
    credentials_path = os.getenv("FIREBASE_CREDENTIALS_PATH", "")
    configured = bool(credentials_path and os.path.exists(credentials_path))
    return {
        "name": "firebase",
        "display_name": "Firebase Push",
        "configured": configured,
        "description": "Mobile push notifications" if configured else "Set FIREBASE_CREDENTIALS_PATH to enable push notifications"
    }


@router.get(
    "/status",
    summary="Get all integration statuses"
)
async def get_integrations_status(
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Get configuration status for all external service integrations.
    Returns which services are configured and ready to use.
    """
    integrations = [
        check_stripe_configured(),
        check_twilio_configured(),
        check_sendgrid_configured(),
        check_quickbooks_configured(),
        check_google_maps_configured(),
        check_openweather_configured(),
        check_elevenlabs_configured(),
        check_firebase_configured(),
    ]

    configured_count = sum(1 for i in integrations if i["configured"])

    return {
        "success": True,
        "data": {
            "integrations": integrations,
            "summary": {
                "total": len(integrations),
                "configured": configured_count,
                "not_configured": len(integrations) - configured_count
            }
        }
    }


@router.get(
    "/status/{service_name}",
    summary="Get specific integration status"
)
async def get_integration_status(
    service_name: str,
    current_user: User = Depends(get_current_user)
):
    """Get configuration status for a specific integration"""
    checkers = {
        "stripe": check_stripe_configured,
        "twilio": check_twilio_configured,
        "sendgrid": check_sendgrid_configured,
        "quickbooks": check_quickbooks_configured,
        "google_maps": check_google_maps_configured,
        "openweather": check_openweather_configured,
        "elevenlabs": check_elevenlabs_configured,
        "firebase": check_firebase_configured,
    }

    checker = checkers.get(service_name.lower())
    if not checker:
        return {
            "success": False,
            "error": f"Unknown integration: {service_name}. Valid options: {', '.join(checkers.keys())}"
        }

    return {
        "success": True,
        "data": checker()
    }
