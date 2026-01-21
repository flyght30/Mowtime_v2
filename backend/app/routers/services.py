"""
Services API Router
Service offerings management (lawn mowing, maintenance, etc.)
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional

from app.database import get_database
from app.models.service import (
    Service, ServiceCreate, ServiceUpdate, ServiceResponse,
    ServiceCategory, PricingType
)
from app.models.user import User, UserRole
from app.models.common import generate_id, utc_now
from app.middleware.auth import get_current_user, require_roles, BusinessContext, get_business_context
from app.schemas.common import (
    PaginatedResponse, SingleResponse, ListResponse, MessageResponse,
    create_pagination_meta
)

router = APIRouter()


@router.get(
    "",
    response_model=PaginatedResponse[ServiceResponse],
    summary="List services"
)
async def list_services(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    category: Optional[ServiceCategory] = None,
    active_only: bool = Query(True),
    search: Optional[str] = None,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """List services for the current business"""
    query = ctx.filter_query({"deleted_at": None})

    if active_only:
        query["is_active"] = True

    if category:
        query["category"] = category.value

    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}}
        ]

    total = await db.services.count_documents(query)
    skip = (page - 1) * per_page

    cursor = db.services.find(query).sort("sort_order", 1).skip(skip).limit(per_page)
    docs = await cursor.to_list(length=per_page)

    services = [ServiceResponse(**doc) for doc in docs]
    meta = create_pagination_meta(total, page, per_page)

    return PaginatedResponse(data=services, meta=meta)


@router.get(
    "/featured",
    response_model=ListResponse[ServiceResponse],
    summary="List featured services"
)
async def list_featured_services(
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get featured services for display"""
    query = ctx.filter_query({
        "deleted_at": None,
        "is_active": True,
        "is_featured": True
    })

    cursor = db.services.find(query).sort("sort_order", 1).limit(10)
    docs = await cursor.to_list(length=10)

    services = [ServiceResponse(**doc) for doc in docs]

    return ListResponse(data=services, count=len(services))


@router.post(
    "",
    response_model=SingleResponse[ServiceResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create service"
)
async def create_service(
    data: ServiceCreate,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Create a new service"""
    # Check for duplicate name
    existing = await db.services.find_one({
        "business_id": ctx.business_id,
        "name": {"$regex": f"^{data.name}$", "$options": "i"},
        "deleted_at": None
    })

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "SERVICE_EXISTS", "message": "A service with this name already exists"}
        )

    service = Service(
        business_id=ctx.business_id,
        **data.model_dump()
    )

    await db.services.insert_one(service.model_dump())

    return SingleResponse(data=ServiceResponse(**service.model_dump()))


@router.get(
    "/{service_id}",
    response_model=SingleResponse[ServiceResponse],
    summary="Get service by ID"
)
async def get_service(
    service_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get service by ID"""
    doc = await db.services.find_one(ctx.filter_query({
        "service_id": service_id,
        "deleted_at": None
    }))

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "SERVICE_NOT_FOUND", "message": "Service not found"}
        )

    return SingleResponse(data=ServiceResponse(**doc))


@router.put(
    "/{service_id}",
    response_model=SingleResponse[ServiceResponse],
    summary="Update service"
)
async def update_service(
    service_id: str,
    data: ServiceUpdate,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Update service by ID"""
    update_data = data.model_dump(exclude_unset=True)

    # Check name uniqueness if being updated
    if "name" in update_data:
        existing = await db.services.find_one({
            "business_id": ctx.business_id,
            "name": {"$regex": f"^{update_data['name']}$", "$options": "i"},
            "service_id": {"$ne": service_id},
            "deleted_at": None
        })
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "SERVICE_EXISTS", "message": "A service with this name already exists"}
            )

    update_data["updated_at"] = utc_now()

    result = await db.services.find_one_and_update(
        ctx.filter_query({"service_id": service_id, "deleted_at": None}),
        {"$set": update_data},
        return_document=True
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "SERVICE_NOT_FOUND", "message": "Service not found"}
        )

    return SingleResponse(data=ServiceResponse(**result))


@router.delete(
    "/{service_id}",
    response_model=MessageResponse,
    summary="Delete service"
)
async def delete_service(
    service_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Soft delete service"""
    # Check if service is used in any scheduled appointments
    active_appointments = await db.appointments.count_documents({
        "business_id": ctx.business_id,
        "services.service_id": service_id,
        "status": {"$in": ["scheduled", "confirmed"]},
        "deleted_at": None
    })

    if active_appointments > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "SERVICE_IN_USE",
                "message": f"Cannot delete service - it has {active_appointments} scheduled appointments"
            }
        )

    result = await db.services.update_one(
        ctx.filter_query({"service_id": service_id, "deleted_at": None}),
        {"$set": {"deleted_at": utc_now(), "updated_at": utc_now()}}
    )

    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "SERVICE_NOT_FOUND", "message": "Service not found"}
        )

    return MessageResponse(message="Service deleted successfully")


@router.patch(
    "/{service_id}/toggle-active",
    response_model=SingleResponse[ServiceResponse],
    summary="Toggle service active status"
)
async def toggle_service_active(
    service_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Toggle whether a service is active"""
    doc = await db.services.find_one(ctx.filter_query({
        "service_id": service_id,
        "deleted_at": None
    }))

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "SERVICE_NOT_FOUND", "message": "Service not found"}
        )

    new_status = not doc.get("is_active", True)

    result = await db.services.find_one_and_update(
        {"service_id": service_id},
        {"$set": {"is_active": new_status, "updated_at": utc_now()}},
        return_document=True
    )

    return SingleResponse(data=ServiceResponse(**result))


@router.patch(
    "/{service_id}/toggle-featured",
    response_model=SingleResponse[ServiceResponse],
    summary="Toggle service featured status"
)
async def toggle_service_featured(
    service_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Toggle whether a service is featured"""
    doc = await db.services.find_one(ctx.filter_query({
        "service_id": service_id,
        "deleted_at": None
    }))

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "SERVICE_NOT_FOUND", "message": "Service not found"}
        )

    new_status = not doc.get("is_featured", False)

    result = await db.services.find_one_and_update(
        {"service_id": service_id},
        {"$set": {"is_featured": new_status, "updated_at": utc_now()}},
        return_document=True
    )

    return SingleResponse(data=ServiceResponse(**result))


@router.put(
    "/reorder",
    response_model=MessageResponse,
    summary="Reorder services"
)
async def reorder_services(
    service_orders: list[dict],  # [{"service_id": "svc_xxx", "sort_order": 1}, ...]
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Update sort order for multiple services"""
    for item in service_orders:
        await db.services.update_one(
            ctx.filter_query({"service_id": item["service_id"]}),
            {"$set": {"sort_order": item["sort_order"], "updated_at": utc_now()}}
        )

    return MessageResponse(message="Services reordered successfully")
