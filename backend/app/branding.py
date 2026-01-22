"""
App Branding Configuration

Defines branding for different app deployments based on primary vertical.
Each vertical can have its own app identity (name, logo, colors, etc.)
allowing the same codebase to be deployed as different branded apps.

Usage:
    # Get branding for current deployment
    from app.branding import get_app_branding, AppBranding

    branding = get_app_branding()
    print(branding.app_name)  # "MowTime" or "ServicePro HVAC"

    # Or get branding for a specific vertical
    branding = get_branding_for_vertical("hvac")
"""

import os
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum


class AppBranding(BaseModel):
    """Complete app branding configuration"""

    # App Identity
    app_id: str                          # e.g., "mowtime", "servicepro_hvac"
    app_name: str                        # e.g., "MowTime", "ServicePro HVAC"
    app_tagline: str                     # e.g., "Professional Lawn Care Made Simple"
    company_name: str = "ServicePro"     # Legal company name

    # Visual Identity
    primary_color: str = "#4CAF50"       # Main brand color
    secondary_color: str = "#2196F3"     # Accent color
    background_color: str = "#FFFFFF"
    text_color: str = "#1F2937"

    # Logo paths (relative to assets)
    logo_light: str = "logo-light.png"   # For dark backgrounds
    logo_dark: str = "logo-dark.png"     # For light backgrounds
    icon: str = "icon.png"               # App icon
    splash_image: str = "splash.png"     # Splash screen

    # App Store / Play Store
    bundle_id_ios: str = ""              # com.servicepro.mowtime
    bundle_id_android: str = ""          # com.servicepro.mowtime
    app_store_url: Optional[str] = None
    play_store_url: Optional[str] = None

    # Contact
    support_email: str = "support@servicepro.app"
    support_phone: Optional[str] = None
    website_url: str = "https://servicepro.app"
    privacy_url: str = "https://servicepro.app/privacy"
    terms_url: str = "https://servicepro.app/terms"

    # Features to show/hide in UI
    show_vertical_switcher: bool = True  # Allow switching verticals in app
    show_other_verticals: bool = True    # Show other vertical options
    default_vertical: str = "lawn_care"  # Default vertical for new businesses

    # Enabled verticals for this deployment
    enabled_verticals: List[str] = Field(default_factory=lambda: ["lawn_care"])

    # Social links
    social_links: Dict[str, str] = Field(default_factory=dict)

    # Custom text overrides
    text_overrides: Dict[str, str] = Field(default_factory=dict)


# ============== Pre-defined App Brandings ==============

MOWTIME_BRANDING = AppBranding(
    app_id="mowtime",
    app_name="MowTime",
    app_tagline="Professional Lawn Care Made Simple",
    company_name="MowTime LLC",

    primary_color="#4CAF50",      # Green
    secondary_color="#8BC34A",    # Light green
    background_color="#FFFFFF",
    text_color="#1F2937",

    logo_light="mowtime-logo-light.png",
    logo_dark="mowtime-logo-dark.png",
    icon="mowtime-icon.png",
    splash_image="mowtime-splash.png",

    bundle_id_ios="com.mowtime.app",
    bundle_id_android="com.mowtime.app",

    support_email="support@mowtime.app",
    website_url="https://mowtime.app",
    privacy_url="https://mowtime.app/privacy",
    terms_url="https://mowtime.app/terms",

    show_vertical_switcher=False,  # Single vertical app
    show_other_verticals=False,
    default_vertical="lawn_care",
    enabled_verticals=["lawn_care"],

    social_links={
        "facebook": "https://facebook.com/mowtime",
        "instagram": "https://instagram.com/mowtime",
    },

    text_overrides={
        "appointments": "Jobs",
        "clients": "Customers",
    }
)

HVAC_PRO_BRANDING = AppBranding(
    app_id="hvac_pro",
    app_name="HVAC Pro",
    app_tagline="Complete HVAC Business Management",
    company_name="ServicePro Inc",

    primary_color="#2196F3",      # Blue
    secondary_color="#03A9F4",    # Light blue
    background_color="#FFFFFF",
    text_color="#1F2937",

    logo_light="hvac-logo-light.png",
    logo_dark="hvac-logo-dark.png",
    icon="hvac-icon.png",
    splash_image="hvac-splash.png",

    bundle_id_ios="com.servicepro.hvac",
    bundle_id_android="com.servicepro.hvac",

    support_email="support@hvacpro.app",
    website_url="https://hvacpro.app",
    privacy_url="https://hvacpro.app/privacy",
    terms_url="https://hvacpro.app/terms",

    show_vertical_switcher=False,
    show_other_verticals=False,
    default_vertical="hvac",
    enabled_verticals=["hvac"],

    social_links={
        "facebook": "https://facebook.com/hvacpro",
        "linkedin": "https://linkedin.com/company/hvacpro",
    },

    text_overrides={
        "appointments": "Service Calls",
        "services": "Service Types",
    }
)

SERVICEPRO_BRANDING = AppBranding(
    app_id="servicepro",
    app_name="ServicePro",
    app_tagline="The Complete Service Business Platform",
    company_name="ServicePro Inc",

    primary_color="#6366F1",      # Indigo
    secondary_color="#8B5CF6",    # Purple
    background_color="#FFFFFF",
    text_color="#1F2937",

    logo_light="servicepro-logo-light.png",
    logo_dark="servicepro-logo-dark.png",
    icon="servicepro-icon.png",
    splash_image="servicepro-splash.png",

    bundle_id_ios="com.servicepro.app",
    bundle_id_android="com.servicepro.app",

    support_email="support@servicepro.app",
    website_url="https://servicepro.app",
    privacy_url="https://servicepro.app/privacy",
    terms_url="https://servicepro.app/terms",

    show_vertical_switcher=True,   # Multi-vertical app
    show_other_verticals=True,
    default_vertical="lawn_care",
    enabled_verticals=[
        "lawn_care", "hvac", "plumbing", "electrical",
        "cleaning", "pest_control", "pool_service",
        "painting", "roofing", "landscaping"
    ],

    social_links={
        "twitter": "https://twitter.com/servicepro",
        "linkedin": "https://linkedin.com/company/servicepro",
    },
)

# Registry of all brandings
BRANDING_REGISTRY: Dict[str, AppBranding] = {
    "mowtime": MOWTIME_BRANDING,
    "hvac_pro": HVAC_PRO_BRANDING,
    "servicepro": SERVICEPRO_BRANDING,
}


def get_app_branding() -> AppBranding:
    """
    Get the app branding for the current deployment.

    Reads from APP_BRANDING environment variable.
    Defaults to "servicepro" (multi-vertical) if not set.
    """
    branding_id = os.getenv("APP_BRANDING", "servicepro")
    return BRANDING_REGISTRY.get(branding_id, SERVICEPRO_BRANDING)


def get_branding_for_vertical(vertical_id: str) -> AppBranding:
    """
    Get recommended branding for a specific vertical.

    Used when deploying a single-vertical app.
    """
    vertical_branding_map = {
        "lawn_care": "mowtime",
        "hvac": "hvac_pro",
    }

    branding_id = vertical_branding_map.get(vertical_id, "servicepro")
    return BRANDING_REGISTRY.get(branding_id, SERVICEPRO_BRANDING)


def register_branding(branding: AppBranding) -> None:
    """Register a custom branding configuration."""
    BRANDING_REGISTRY[branding.app_id] = branding


def is_vertical_enabled(vertical_id: str) -> bool:
    """Check if a vertical is enabled for the current deployment."""
    branding = get_app_branding()
    return vertical_id in branding.enabled_verticals


def get_enabled_verticals() -> List[str]:
    """Get list of enabled verticals for current deployment."""
    branding = get_app_branding()
    return branding.enabled_verticals


__all__ = [
    "AppBranding",
    "get_app_branding",
    "get_branding_for_vertical",
    "register_branding",
    "is_vertical_enabled",
    "get_enabled_verticals",
    "MOWTIME_BRANDING",
    "HVAC_PRO_BRANDING",
    "SERVICEPRO_BRANDING",
]
