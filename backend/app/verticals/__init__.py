"""
Modular Vertical System for ServicePro

This module provides a plugin architecture for service verticals.
Each vertical is self-contained and can be enabled/disabled independently.

Architecture:
- Each vertical is a Python package under /verticals/
- Verticals register themselves with the VerticalRegistry
- Routes are dynamically loaded based on enabled verticals
- Shared infrastructure (auth, payments, etc.) remains in core

Usage:
    from app.verticals import vertical_registry

    # Check if vertical is available
    if vertical_registry.has_vertical("hvac"):
        hvac = vertical_registry.get_vertical("hvac")

    # Get all enabled verticals for a business
    verticals = vertical_registry.get_enabled_verticals(business)
"""

from app.verticals.registry import VerticalRegistry, vertical_registry
from app.verticals.base import BaseVertical, VerticalConfig, VerticalFeature

__all__ = [
    "VerticalRegistry",
    "vertical_registry",
    "BaseVertical",
    "VerticalConfig",
    "VerticalFeature",
]
