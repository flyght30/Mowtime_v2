"""
Distributors Router
CRUD operations for equipment and parts distributors
"""

import logging
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_database
from app.models.user import User
from app.models.distributor import (
    Distributor, DistributorCreate, DistributorUpdate, DistributorResponse
)
from app.middleware.auth import BusinessContext, get_business_context, get_current_user
from app.schemas.common import SingleResponse, PaginatedResponse, MessageResponse, create_pagination_meta

router = APIRouter()
logger = logging.getLogger(__name__)


def distributor_to_response(d: dict) -> DistributorResponse:
    """Convert database document to response"""
    return DistributorResponse(
        distributor_id=d["distributor_id"],
        business_id=d["business_id"],
        name=d["name"],
        contact_name=d.get("contact_name"),
        email=d.get("email"),
        phone=d.get("phone"),
        account_number=d.get("account_number"),
        address=d.get("address"),
        city=d.get("city"),
        state=d.get("state"),
        zip_code=d.get("zip_code"),
        website=d.get("website"),
        notes=d.get("notes"),
        price_list_updated=d.get("price_list_updated"),
        price_list_items_count=d.get("price_list_items_count", 0),
        is_active=d.get("is_active", True),
        is_preferred=d.get("is_preferred", False),
        created_at=d["created_at"]
    )


@router.post(
    "",
    response_model=SingleResponse[DistributorResponse],
    summary="Create distributor"
)
async def create_distributor(
    request: DistributorCreate,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Create a new distributor"""
    distributor = Distributor(
        business_id=ctx.business_id,
        **request.model_dump()
    )

    await db.distributors.insert_one(distributor.model_dump())

    logger.info(f"Created distributor {distributor.distributor_id}: {distributor.name}")

    return SingleResponse(data=distributor_to_response(distributor.model_dump()))


@router.get(
    "",
    response_model=PaginatedResponse[DistributorResponse],
    summary="List distributors"
)
async def list_distributors(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    is_preferred: Optional[bool] = None,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """List all distributors"""
    query = {
        "business_id": ctx.business_id,
        "deleted_at": None
    }

    if is_active is not None:
        query["is_active"] = is_active
    if is_preferred is not None:
        query["is_preferred"] = is_preferred
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"contact_name": {"$regex": search, "$options": "i"}},
            {"account_number": {"$regex": search, "$options": "i"}}
        ]

    total = await db.distributors.count_documents(query)

    distributors = await db.distributors.find(query).sort(
        "name", 1
    ).skip((page - 1) * per_page).limit(per_page).to_list(length=per_page)

    meta = create_pagination_meta(total, page, per_page)

    return PaginatedResponse(
        data=[distributor_to_response(d) for d in distributors],
        meta=meta
    )


@router.get(
    "/{distributor_id}",
    response_model=SingleResponse[DistributorResponse],
    summary="Get distributor"
)
async def get_distributor(
    distributor_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get a specific distributor"""
    distributor = await db.distributors.find_one({
        "distributor_id": distributor_id,
        "business_id": ctx.business_id,
        "deleted_at": None
    })

    if not distributor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "DISTRIBUTOR_NOT_FOUND", "message": "Distributor not found"}
        )

    return SingleResponse(data=distributor_to_response(distributor))


@router.put(
    "/{distributor_id}",
    response_model=SingleResponse[DistributorResponse],
    summary="Update distributor"
)
async def update_distributor(
    distributor_id: str,
    request: DistributorUpdate,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Update a distributor"""
    distributor = await db.distributors.find_one({
        "distributor_id": distributor_id,
        "business_id": ctx.business_id,
        "deleted_at": None
    })

    if not distributor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "DISTRIBUTOR_NOT_FOUND", "message": "Distributor not found"}
        )

    update_data = {
        k: v for k, v in request.model_dump().items()
        if v is not None
    }
    update_data["updated_at"] = datetime.utcnow()

    await db.distributors.update_one(
        {"distributor_id": distributor_id},
        {"$set": update_data}
    )

    updated = await db.distributors.find_one({"distributor_id": distributor_id})

    return SingleResponse(data=distributor_to_response(updated))


@router.delete(
    "/{distributor_id}",
    response_model=MessageResponse,
    summary="Delete distributor"
)
async def delete_distributor(
    distributor_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Soft delete a distributor"""
    result = await db.distributors.update_one(
        {
            "distributor_id": distributor_id,
            "business_id": ctx.business_id,
            "deleted_at": None
        },
        {
            "$set": {
                "deleted_at": datetime.utcnow(),
                "is_active": False,
                "updated_at": datetime.utcnow()
            }
        }
    )

    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "DISTRIBUTOR_NOT_FOUND", "message": "Distributor not found"}
        )

    return MessageResponse(message="Distributor deleted")
