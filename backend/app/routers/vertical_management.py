"""
Vertical Management Router

API endpoints for managing service verticals for a business.
Allows businesses to enable/disable verticals and configure them.
"""

from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.middleware.auth import get_current_user, get_current_business
from app.database import Database
from app.models.user import User
from app.models.business import Business

router = APIRouter()


# ============== Response Models ==============

class VerticalInfo(BaseModel):
    """Information about an available vertical"""
    vertical_id: str
    name: str
    display_name: str
    description: str
    icon: str
    color: str
    features: List[str]
    is_enabled: bool = False
    enabled_at: Optional[str] = None


class VerticalListResponse(BaseModel):
    """Response for listing verticals"""
    success: bool = True
    available_verticals: List[VerticalInfo]
    enabled_verticals: List[str]


class EnableVerticalRequest(BaseModel):
    """Request to enable a vertical"""
    vertical_id: str
    custom_config: dict = Field(default_factory=dict)


class VerticalStatusResponse(BaseModel):
    """Response for vertical status"""
    success: bool = True
    vertical_id: str
    enabled: bool
    message: str


# ============== Endpoints ==============

@router.get("/", response_model=VerticalListResponse)
async def list_verticals(
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """
    List all available verticals and their status for the current business.

    Returns both available verticals (from the registry) and which ones
    are currently enabled for this business.
    """
    from app.verticals import vertical_registry

    # Get enabled verticals for this business
    enabled_ids = []
    enabled_at_map = {}
    for vs in business.config.enabled_verticals:
        if vs.enabled:
            enabled_ids.append(vs.vertical_id)
            enabled_at_map[vs.vertical_id] = vs.enabled_at

    # Also include the primary vertical
    if business.vertical.value not in enabled_ids:
        enabled_ids.append(business.vertical.value)

    # Build response with all registered verticals
    available = []
    for v in vertical_registry.get_all_verticals().values():
        config = v.config
        available.append(VerticalInfo(
            vertical_id=config.vertical_id,
            name=config.name,
            display_name=config.display_name,
            description=config.description,
            icon=config.icon,
            color=config.color,
            features=[f.value for f in config.features],
            is_enabled=config.vertical_id in enabled_ids,
            enabled_at=enabled_at_map.get(config.vertical_id),
        ))

    return VerticalListResponse(
        available_verticals=available,
        enabled_verticals=enabled_ids,
    )


@router.post("/enable", response_model=VerticalStatusResponse)
async def enable_vertical(
    data: EnableVerticalRequest,
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """
    Enable a vertical for the current business.

    This will:
    1. Verify the vertical exists in the registry
    2. Run the vertical's on_enable callback (seeds data, etc.)
    3. Update the business configuration
    """
    from app.verticals import vertical_registry

    # Check if vertical exists
    if not vertical_registry.has_vertical(data.vertical_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vertical '{data.vertical_id}' not found"
        )

    # Check if already enabled
    enabled_verticals = business.config.enabled_verticals or []
    for vs in enabled_verticals:
        if vs.vertical_id == data.vertical_id and vs.enabled:
            return VerticalStatusResponse(
                vertical_id=data.vertical_id,
                enabled=True,
                message="Vertical is already enabled"
            )

    # Run the vertical's on_enable callback
    success = await vertical_registry.enable_vertical_for_business(
        data.vertical_id,
        business.business_id
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to initialize vertical"
        )

    # Update business config
    now = datetime.utcnow().isoformat()
    vertical_setting = {
        "vertical_id": data.vertical_id,
        "enabled": True,
        "enabled_at": now,
        "disabled_at": None,
        "custom_config": data.custom_config,
    }

    # Check if this vertical was previously in the list
    found = False
    for i, vs in enumerate(enabled_verticals):
        if vs.vertical_id == data.vertical_id:
            enabled_verticals[i] = vertical_setting
            found = True
            break

    if not found:
        enabled_verticals.append(vertical_setting)

    # Update business in database
    await Database.db.businesses.update_one(
        {"business_id": business.business_id},
        {
            "$set": {
                "config.enabled_verticals": [
                    vs if isinstance(vs, dict) else vs.model_dump()
                    for vs in enabled_verticals
                ],
                f"config.vertical_configs.{data.vertical_id}": data.custom_config,
                "updated_at": now,
            }
        }
    )

    vertical = vertical_registry.get_vertical(data.vertical_id)
    return VerticalStatusResponse(
        vertical_id=data.vertical_id,
        enabled=True,
        message=f"{vertical.config.display_name} has been enabled for your business"
    )


@router.post("/disable/{vertical_id}", response_model=VerticalStatusResponse)
async def disable_vertical(
    vertical_id: str,
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """
    Disable a vertical for the current business.

    This will:
    1. Verify the vertical can be disabled (not the primary vertical)
    2. Run the vertical's on_disable callback (archives data)
    3. Update the business configuration

    Note: Disabling a vertical does NOT delete data. Data is archived
    and can be restored by re-enabling the vertical.
    """
    from app.verticals import vertical_registry

    # Check if trying to disable primary vertical
    if business.vertical.value == vertical_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot disable your primary vertical. Change your primary vertical first."
        )

    # Check if vertical exists and is enabled
    if not vertical_registry.has_vertical(vertical_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vertical '{vertical_id}' not found"
        )

    enabled_verticals = business.config.enabled_verticals or []
    is_enabled = False
    for vs in enabled_verticals:
        if vs.vertical_id == vertical_id and vs.enabled:
            is_enabled = True
            break

    if not is_enabled:
        return VerticalStatusResponse(
            vertical_id=vertical_id,
            enabled=False,
            message="Vertical is not currently enabled"
        )

    # Run the vertical's on_disable callback
    await vertical_registry.disable_vertical_for_business(
        vertical_id,
        business.business_id
    )

    # Update business config
    now = datetime.utcnow().isoformat()
    for i, vs in enumerate(enabled_verticals):
        if vs.vertical_id == vertical_id:
            if isinstance(vs, dict):
                enabled_verticals[i]["enabled"] = False
                enabled_verticals[i]["disabled_at"] = now
            else:
                enabled_verticals[i] = {
                    "vertical_id": vertical_id,
                    "enabled": False,
                    "enabled_at": vs.enabled_at,
                    "disabled_at": now,
                    "custom_config": vs.custom_config if hasattr(vs, 'custom_config') else {},
                }
            break

    # Update business in database
    await Database.db.businesses.update_one(
        {"business_id": business.business_id},
        {
            "$set": {
                "config.enabled_verticals": [
                    vs if isinstance(vs, dict) else vs.model_dump()
                    for vs in enabled_verticals
                ],
                "updated_at": now,
            }
        }
    )

    vertical = vertical_registry.get_vertical(vertical_id)
    return VerticalStatusResponse(
        vertical_id=vertical_id,
        enabled=False,
        message=f"{vertical.config.display_name} has been disabled. Your data is archived and can be restored."
    )


@router.get("/{vertical_id}/config", response_model=dict)
async def get_vertical_config(
    vertical_id: str,
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """Get the configuration for a specific vertical."""
    from app.verticals import vertical_registry

    if not vertical_registry.has_vertical(vertical_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vertical '{vertical_id}' not found"
        )

    vertical = vertical_registry.get_vertical(vertical_id)

    # Get business-specific config
    custom_config = business.config.vertical_configs.get(vertical_id, {})

    # Check if enabled
    is_enabled = False
    for vs in business.config.enabled_verticals:
        if vs.vertical_id == vertical_id and vs.enabled:
            is_enabled = True
            break

    return {
        "success": True,
        "vertical_id": vertical_id,
        "display_name": vertical.config.display_name,
        "is_enabled": is_enabled,
        "default_config": vertical.config.model_dump(),
        "custom_config": custom_config,
        "default_services": vertical_registry.get_default_services(vertical_id),
    }


@router.put("/{vertical_id}/config", response_model=dict)
async def update_vertical_config(
    vertical_id: str,
    config: dict,
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business)
):
    """Update the configuration for a specific vertical."""
    from app.verticals import vertical_registry

    if not vertical_registry.has_vertical(vertical_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vertical '{vertical_id}' not found"
        )

    # Validate config with vertical
    vertical = vertical_registry.get_vertical(vertical_id)
    if not vertical.validate_business_config(config):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid configuration for this vertical"
        )

    # Update config
    now = datetime.utcnow().isoformat()
    await Database.db.businesses.update_one(
        {"business_id": business.business_id},
        {
            "$set": {
                f"config.vertical_configs.{vertical_id}": config,
                "updated_at": now,
            }
        }
    )

    return {
        "success": True,
        "message": "Vertical configuration updated",
        "vertical_id": vertical_id,
        "config": config,
    }


@router.get("/{vertical_id}/services", response_model=dict)
async def get_vertical_default_services(
    vertical_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get the default services for a vertical."""
    from app.verticals import vertical_registry

    if not vertical_registry.has_vertical(vertical_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vertical '{vertical_id}' not found"
        )

    services = vertical_registry.get_default_services(vertical_id)

    return {
        "success": True,
        "vertical_id": vertical_id,
        "services": services,
        "count": len(services),
    }


@router.get("/{vertical_id}/dashboard", response_model=dict)
async def get_vertical_dashboard_config(
    vertical_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get dashboard widget configuration for a vertical."""
    from app.verticals import vertical_registry

    vertical = vertical_registry.get_vertical(vertical_id)
    if not vertical:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vertical '{vertical_id}' not found"
        )

    return {
        "success": True,
        "vertical_id": vertical_id,
        "widgets": vertical.get_dashboard_widgets(),
        "reports": vertical.get_reports(),
    }
