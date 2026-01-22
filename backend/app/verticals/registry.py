"""
Vertical Registry

Central registry for managing service verticals. Handles:
- Registration of vertical modules
- Dynamic route loading
- Business vertical configuration
- Feature availability checks
"""

import logging
from typing import Dict, List, Optional, Set, Type, Any
from fastapi import APIRouter

from app.verticals.base import BaseVertical, VerticalConfig, VerticalFeature

logger = logging.getLogger(__name__)


class VerticalRegistry:
    """
    Central registry for all service verticals.

    The registry manages vertical modules and provides:
    - Registration of vertical implementations
    - Dynamic route loading based on enabled verticals
    - Feature discovery across verticals
    - Business-specific vertical configuration

    Usage:
        # Register a vertical (typically in the vertical's __init__.py)
        from app.verticals import vertical_registry
        vertical_registry.register(HVACVertical())

        # Check if a vertical exists
        if vertical_registry.has_vertical("hvac"):
            hvac = vertical_registry.get_vertical("hvac")

        # Get router for enabled verticals
        router = vertical_registry.get_combined_router(enabled_verticals)
    """

    def __init__(self):
        self._verticals: Dict[str, BaseVertical] = {}
        self._initialized: bool = False

    def register(self, vertical: BaseVertical) -> None:
        """
        Register a vertical with the registry.

        Args:
            vertical: An instance of a BaseVertical subclass

        Raises:
            ValueError: If a vertical with the same ID is already registered
        """
        vertical_id = vertical.vertical_id

        if vertical_id in self._verticals:
            raise ValueError(
                f"Vertical '{vertical_id}' is already registered. "
                "Each vertical can only be registered once."
            )

        self._verticals[vertical_id] = vertical
        logger.info(f"Registered vertical: {vertical.config.display_name} ({vertical_id})")

    def unregister(self, vertical_id: str) -> bool:
        """
        Unregister a vertical from the registry.

        Args:
            vertical_id: The ID of the vertical to unregister

        Returns:
            True if the vertical was unregistered, False if it wasn't found
        """
        if vertical_id in self._verticals:
            del self._verticals[vertical_id]
            logger.info(f"Unregistered vertical: {vertical_id}")
            return True
        return False

    def get_vertical(self, vertical_id: str) -> Optional[BaseVertical]:
        """
        Get a registered vertical by ID.

        Args:
            vertical_id: The vertical identifier

        Returns:
            The vertical instance or None if not found
        """
        return self._verticals.get(vertical_id)

    def has_vertical(self, vertical_id: str) -> bool:
        """Check if a vertical is registered."""
        return vertical_id in self._verticals

    def get_all_verticals(self) -> Dict[str, BaseVertical]:
        """Get all registered verticals."""
        return self._verticals.copy()

    def get_vertical_ids(self) -> List[str]:
        """Get list of all registered vertical IDs."""
        return list(self._verticals.keys())

    def get_vertical_configs(self) -> List[VerticalConfig]:
        """Get configurations for all registered verticals."""
        return [v.config for v in self._verticals.values()]

    def get_router(self, vertical_id: str) -> Optional[APIRouter]:
        """
        Get the API router for a specific vertical.

        Args:
            vertical_id: The vertical identifier

        Returns:
            The FastAPI router or None
        """
        vertical = self.get_vertical(vertical_id)
        if vertical:
            return vertical.get_router()
        return None

    def get_combined_router(
        self,
        enabled_vertical_ids: Optional[List[str]] = None,
        prefix: str = "/verticals"
    ) -> APIRouter:
        """
        Get a combined router for multiple verticals.

        Args:
            enabled_vertical_ids: List of vertical IDs to include.
                                  If None, includes all registered verticals.
            prefix: URL prefix for the combined router

        Returns:
            A FastAPI router combining all specified vertical routes
        """
        combined = APIRouter(prefix=prefix)

        vertical_ids = enabled_vertical_ids or list(self._verticals.keys())

        for vertical_id in vertical_ids:
            vertical = self._verticals.get(vertical_id)
            if not vertical:
                logger.warning(f"Vertical '{vertical_id}' not found, skipping")
                continue

            router = vertical.get_router()
            if router:
                # Use vertical's configured prefix or default to vertical_id
                api_prefix = vertical.config.api_prefix or f"/{vertical_id}"
                combined.include_router(
                    router,
                    prefix=api_prefix,
                    tags=[vertical.config.display_name]
                )
                logger.debug(f"Added routes for vertical: {vertical_id}")

        return combined

    def get_verticals_with_feature(self, feature: VerticalFeature) -> List[BaseVertical]:
        """
        Get all verticals that provide a specific feature.

        Args:
            feature: The feature to search for

        Returns:
            List of verticals that have the feature
        """
        return [
            v for v in self._verticals.values()
            if feature in v.config.features
        ]

    def vertical_has_feature(self, vertical_id: str, feature: VerticalFeature) -> bool:
        """Check if a specific vertical has a feature."""
        vertical = self.get_vertical(vertical_id)
        if vertical:
            return feature in vertical.config.features
        return False

    async def enable_vertical_for_business(
        self,
        vertical_id: str,
        business_id: str
    ) -> bool:
        """
        Enable a vertical for a specific business.

        This triggers the vertical's on_enable callback to perform
        any necessary setup (seed data, create records, etc.)

        Args:
            vertical_id: The vertical to enable
            business_id: The business ID

        Returns:
            True if successful, False otherwise
        """
        vertical = self.get_vertical(vertical_id)
        if not vertical:
            logger.error(f"Cannot enable unknown vertical: {vertical_id}")
            return False

        try:
            await vertical.on_enable(business_id)
            logger.info(f"Enabled vertical '{vertical_id}' for business '{business_id}'")
            return True
        except Exception as e:
            logger.error(f"Error enabling vertical '{vertical_id}': {e}")
            return False

    async def disable_vertical_for_business(
        self,
        vertical_id: str,
        business_id: str
    ) -> bool:
        """
        Disable a vertical for a specific business.

        This triggers the vertical's on_disable callback to perform
        any necessary cleanup (archive data, etc.)

        Args:
            vertical_id: The vertical to disable
            business_id: The business ID

        Returns:
            True if successful, False otherwise
        """
        vertical = self.get_vertical(vertical_id)
        if not vertical:
            logger.error(f"Cannot disable unknown vertical: {vertical_id}")
            return False

        try:
            await vertical.on_disable(business_id)
            logger.info(f"Disabled vertical '{vertical_id}' for business '{business_id}'")
            return True
        except Exception as e:
            logger.error(f"Error disabling vertical '{vertical_id}': {e}")
            return False

    def get_default_services(self, vertical_id: str) -> List[Dict[str, Any]]:
        """
        Get default services for a vertical.

        Args:
            vertical_id: The vertical identifier

        Returns:
            List of default service configurations
        """
        vertical = self.get_vertical(vertical_id)
        if vertical:
            return [s.model_dump() for s in vertical.get_default_services()]
        return []

    def get_all_collections(self) -> Set[str]:
        """Get all MongoDB collections used by registered verticals."""
        collections = set()
        for vertical in self._verticals.values():
            collections.update(vertical.get_collections())
        return collections

    def get_all_indexes(self) -> List[Dict[str, Any]]:
        """Get all MongoDB indexes for registered verticals."""
        indexes = []
        for vertical in self._verticals.values():
            indexes.extend(vertical.get_indexes())
        return indexes


# Global registry instance
vertical_registry = VerticalRegistry()


def register_vertical(vertical: BaseVertical) -> BaseVertical:
    """
    Decorator/function to register a vertical with the global registry.

    Can be used as a decorator:
        @register_vertical
        class HVACVertical(BaseVertical):
            ...

    Or called directly:
        register_vertical(HVACVertical())
    """
    if isinstance(vertical, type):
        # Used as decorator on class
        instance = vertical()
        vertical_registry.register(instance)
        return instance
    else:
        # Called with instance
        vertical_registry.register(vertical)
        return vertical


__all__ = [
    "VerticalRegistry",
    "vertical_registry",
    "register_vertical",
]
