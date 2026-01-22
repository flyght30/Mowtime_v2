"""
Branding API Router

Public endpoints for retrieving app branding configuration.
These endpoints do not require authentication.
"""

from fastapi import APIRouter
from app.branding import get_app_branding, AppBranding, is_vertical_enabled

router = APIRouter()


@router.get("/", response_model=AppBranding)
async def get_branding():
    """
    Get the current app branding configuration.

    This is a public endpoint that returns branding info for the current
    deployment. Used by the frontend to dynamically configure:
    - App name and tagline
    - Colors and theme
    - Logo URLs
    - Enabled verticals
    - Support contact info

    The branding is determined by the APP_BRANDING environment variable.
    """
    return get_app_branding()


@router.get("/minimal", response_model=dict)
async def get_minimal_branding():
    """
    Get minimal branding info for splash screen / initial load.

    Returns only essential info needed before full app load.
    """
    branding = get_app_branding()
    return {
        "app_id": branding.app_id,
        "app_name": branding.app_name,
        "primary_color": branding.primary_color,
        "logo_dark": branding.logo_dark,
        "icon": branding.icon,
        "default_vertical": branding.default_vertical,
    }


@router.get("/verticals", response_model=dict)
async def get_enabled_verticals():
    """
    Get list of enabled verticals for this deployment.

    Used by frontend to determine which vertical options to show.
    """
    branding = get_app_branding()
    return {
        "enabled_verticals": branding.enabled_verticals,
        "default_vertical": branding.default_vertical,
        "show_vertical_switcher": branding.show_vertical_switcher,
    }


@router.get("/vertical/{vertical_id}/enabled", response_model=dict)
async def check_vertical_enabled(vertical_id: str):
    """Check if a specific vertical is enabled."""
    enabled = is_vertical_enabled(vertical_id)
    return {
        "vertical_id": vertical_id,
        "enabled": enabled,
    }


@router.get("/theme", response_model=dict)
async def get_theme():
    """
    Get theme configuration for styling the app.
    """
    branding = get_app_branding()
    return {
        "colors": {
            "primary": branding.primary_color,
            "secondary": branding.secondary_color,
            "background": branding.background_color,
            "text": branding.text_color,
        },
        "assets": {
            "logo_light": branding.logo_light,
            "logo_dark": branding.logo_dark,
            "icon": branding.icon,
            "splash": branding.splash_image,
        },
    }


@router.get("/text", response_model=dict)
async def get_text_overrides():
    """
    Get text/label overrides for this branding.

    Different verticals may use different terminology.
    e.g., "appointments" vs "jobs" vs "service calls"
    """
    branding = get_app_branding()
    return {
        "overrides": branding.text_overrides,
        "app_name": branding.app_name,
        "tagline": branding.app_tagline,
    }
