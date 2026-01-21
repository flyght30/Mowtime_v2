"""
Business API Router
Business account management for multi-tenant system
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional

from app.database import get_database
from app.models.business import Business, BusinessCreate, BusinessUpdate, BusinessResponse, BusinessConfig
from app.models.user import User, UserRole
from app.models.common import generate_id, utc_now
from app.middleware.auth import get_current_user, require_roles
from app.schemas.common import (
    PaginatedResponse, SingleResponse, MessageResponse, ErrorResponse,
    create_pagination_meta
)

router = APIRouter()


@router.get(
    "",
    response_model=PaginatedResponse[BusinessResponse],
    summary="List businesses (Admin only)"
)
async def list_businesses(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """List all businesses (admin only)"""
    query = {"deleted_at": None}

    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}}
        ]

    total = await db.businesses.count_documents(query)
    skip = (page - 1) * per_page

    cursor = db.businesses.find(query).sort("created_at", -1).skip(skip).limit(per_page)
    docs = await cursor.to_list(length=per_page)

    businesses = [BusinessResponse(**doc) for doc in docs]
    meta = create_pagination_meta(total, page, per_page)

    return PaginatedResponse(data=businesses, meta=meta)


@router.get(
    "/me",
    response_model=SingleResponse[BusinessResponse],
    summary="Get current user's business"
)
async def get_my_business(
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get the business associated with the current user"""
    if not current_user.business_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NO_BUSINESS", "message": "User is not associated with a business"}
        )

    doc = await db.businesses.find_one({
        "business_id": current_user.business_id,
        "deleted_at": None
    })

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "BUSINESS_NOT_FOUND", "message": "Business not found"}
        )

    return SingleResponse(data=BusinessResponse(**doc))


@router.get(
    "/{business_id}",
    response_model=SingleResponse[BusinessResponse],
    summary="Get business by ID"
)
async def get_business(
    business_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get business by ID (admin or own business only)"""
    # Check access
    if current_user.role != UserRole.ADMIN and current_user.business_id != business_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "ACCESS_DENIED", "message": "Access denied to this business"}
        )

    doc = await db.businesses.find_one({
        "business_id": business_id,
        "deleted_at": None
    })

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "BUSINESS_NOT_FOUND", "message": "Business not found"}
        )

    return SingleResponse(data=BusinessResponse(**doc))


@router.put(
    "/me",
    response_model=SingleResponse[BusinessResponse],
    summary="Update current user's business"
)
async def update_my_business(
    data: BusinessUpdate,
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Update current user's business"""
    if not current_user.business_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NO_BUSINESS", "message": "User is not associated with a business"}
        )

    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_at"] = utc_now()

    result = await db.businesses.find_one_and_update(
        {"business_id": current_user.business_id, "deleted_at": None},
        {"$set": update_data},
        return_document=True
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "BUSINESS_NOT_FOUND", "message": "Business not found"}
        )

    return SingleResponse(data=BusinessResponse(**result))


@router.put(
    "/me/config",
    response_model=SingleResponse[BusinessResponse],
    summary="Update business configuration"
)
async def update_business_config(
    config: BusinessConfig,
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Update business configuration (hours, weather thresholds, etc.)"""
    if not current_user.business_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NO_BUSINESS", "message": "User is not associated with a business"}
        )

    result = await db.businesses.find_one_and_update(
        {"business_id": current_user.business_id, "deleted_at": None},
        {"$set": {"config": config.model_dump(), "updated_at": utc_now()}},
        return_document=True
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "BUSINESS_NOT_FOUND", "message": "Business not found"}
        )

    return SingleResponse(data=BusinessResponse(**result))


@router.get(
    "/me/stats",
    summary="Get business statistics"
)
async def get_business_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get statistics for current user's business"""
    if not current_user.business_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NO_BUSINESS", "message": "User is not associated with a business"}
        )

    business_id = current_user.business_id

    # Count active entities
    clients_count = await db.clients.count_documents({
        "business_id": business_id,
        "deleted_at": None,
        "status": "active"
    })

    staff_count = await db.staff.count_documents({
        "business_id": business_id,
        "deleted_at": None,
        "is_active": True
    })

    services_count = await db.services.count_documents({
        "business_id": business_id,
        "deleted_at": None,
        "is_active": True
    })

    # Count appointments by status
    scheduled_count = await db.appointments.count_documents({
        "business_id": business_id,
        "deleted_at": None,
        "status": {"$in": ["scheduled", "confirmed"]}
    })

    completed_count = await db.appointments.count_documents({
        "business_id": business_id,
        "deleted_at": None,
        "status": "completed"
    })

    return {
        "success": True,
        "data": {
            "clients": clients_count,
            "staff": staff_count,
            "services": services_count,
            "appointments": {
                "scheduled": scheduled_count,
                "completed": completed_count
            }
        }
    }
