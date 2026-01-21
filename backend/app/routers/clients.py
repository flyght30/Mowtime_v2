"""
Clients API Router
Customer/client management for service businesses
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional

from app.database import get_database
from app.models.client import (
    Client, ClientCreate, ClientUpdate, ClientResponse, ClientStatus
)
from app.models.user import User, UserRole
from app.models.common import generate_id, utc_now
from app.middleware.auth import get_current_user, require_business_access, BusinessContext, get_business_context
from app.schemas.common import (
    PaginatedResponse, SingleResponse, MessageResponse,
    create_pagination_meta
)

router = APIRouter()


@router.get(
    "",
    response_model=PaginatedResponse[ClientResponse],
    summary="List clients"
)
async def list_clients(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status_filter: Optional[ClientStatus] = Query(None, alias="status"),
    search: Optional[str] = None,
    tag: Optional[str] = None,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """List clients for the current business"""
    query = ctx.filter_query({"deleted_at": None})

    if status_filter:
        query["status"] = status_filter.value

    if search:
        query["$or"] = [
            {"first_name": {"$regex": search, "$options": "i"}},
            {"last_name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}}
        ]

    if tag:
        query["tags"] = tag

    total = await db.clients.count_documents(query)
    skip = (page - 1) * per_page

    cursor = db.clients.find(query).sort("created_at", -1).skip(skip).limit(per_page)
    docs = await cursor.to_list(length=per_page)

    clients = [ClientResponse(**doc) for doc in docs]
    meta = create_pagination_meta(total, page, per_page)

    return PaginatedResponse(data=clients, meta=meta)


@router.post(
    "",
    response_model=SingleResponse[ClientResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create client"
)
async def create_client(
    data: ClientCreate,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Create a new client"""
    # Check for duplicate email in same business
    if data.email:
        existing = await db.clients.find_one({
            "business_id": ctx.business_id,
            "email": data.email.lower(),
            "deleted_at": None
        })
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "EMAIL_EXISTS", "message": "A client with this email already exists"}
            )

    client = Client(
        business_id=ctx.business_id,
        **data.model_dump()
    )

    if client.email:
        client.email = client.email.lower()

    # Set default preferences if not provided
    if data.preferences:
        client.preferences = data.preferences

    await db.clients.insert_one(client.model_dump())

    # Update business stats
    await db.businesses.update_one(
        {"business_id": ctx.business_id},
        {"$inc": {"total_clients": 1}}
    )

    return SingleResponse(data=ClientResponse(**client.model_dump()))


@router.get(
    "/{client_id}",
    response_model=SingleResponse[ClientResponse],
    summary="Get client by ID"
)
async def get_client(
    client_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get client by ID"""
    doc = await db.clients.find_one(ctx.filter_query({
        "client_id": client_id,
        "deleted_at": None
    }))

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CLIENT_NOT_FOUND", "message": "Client not found"}
        )

    return SingleResponse(data=ClientResponse(**doc))


@router.put(
    "/{client_id}",
    response_model=SingleResponse[ClientResponse],
    summary="Update client"
)
async def update_client(
    client_id: str,
    data: ClientUpdate,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Update client by ID"""
    update_data = data.model_dump(exclude_unset=True)

    # Check email uniqueness if being updated
    if "email" in update_data and update_data["email"]:
        existing = await db.clients.find_one({
            "business_id": ctx.business_id,
            "email": update_data["email"].lower(),
            "client_id": {"$ne": client_id},
            "deleted_at": None
        })
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "EMAIL_EXISTS", "message": "A client with this email already exists"}
            )
        update_data["email"] = update_data["email"].lower()

    update_data["updated_at"] = utc_now()

    result = await db.clients.find_one_and_update(
        ctx.filter_query({"client_id": client_id, "deleted_at": None}),
        {"$set": update_data},
        return_document=True
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CLIENT_NOT_FOUND", "message": "Client not found"}
        )

    return SingleResponse(data=ClientResponse(**result))


@router.delete(
    "/{client_id}",
    response_model=MessageResponse,
    summary="Delete client"
)
async def delete_client(
    client_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Soft delete client"""
    result = await db.clients.update_one(
        ctx.filter_query({"client_id": client_id, "deleted_at": None}),
        {"$set": {"deleted_at": utc_now(), "updated_at": utc_now()}}
    )

    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CLIENT_NOT_FOUND", "message": "Client not found"}
        )

    # Update business stats
    await db.businesses.update_one(
        {"business_id": ctx.business_id},
        {"$inc": {"total_clients": -1}}
    )

    return MessageResponse(message="Client deleted successfully")


@router.get(
    "/{client_id}/appointments",
    summary="Get client's appointments"
)
async def get_client_appointments(
    client_id: str,
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=50),
    status_filter: Optional[str] = Query(None, alias="status"),
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get appointments for a specific client"""
    # Verify client exists
    client = await db.clients.find_one(ctx.filter_query({
        "client_id": client_id,
        "deleted_at": None
    }))

    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CLIENT_NOT_FOUND", "message": "Client not found"}
        )

    query = ctx.filter_query({"client_id": client_id, "deleted_at": None})

    if status_filter:
        query["status"] = status_filter

    total = await db.appointments.count_documents(query)
    skip = (page - 1) * per_page

    cursor = db.appointments.find(query).sort("scheduled_date", -1).skip(skip).limit(per_page)
    docs = await cursor.to_list(length=per_page)

    meta = create_pagination_meta(total, page, per_page)

    return {
        "success": True,
        "data": docs,
        "meta": meta.model_dump()
    }


@router.post(
    "/{client_id}/tags",
    response_model=SingleResponse[ClientResponse],
    summary="Add tags to client"
)
async def add_client_tags(
    client_id: str,
    tags: list[str],
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Add tags to a client"""
    result = await db.clients.find_one_and_update(
        ctx.filter_query({"client_id": client_id, "deleted_at": None}),
        {
            "$addToSet": {"tags": {"$each": tags}},
            "$set": {"updated_at": utc_now()}
        },
        return_document=True
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CLIENT_NOT_FOUND", "message": "Client not found"}
        )

    return SingleResponse(data=ClientResponse(**result))


@router.delete(
    "/{client_id}/tags/{tag}",
    response_model=SingleResponse[ClientResponse],
    summary="Remove tag from client"
)
async def remove_client_tag(
    client_id: str,
    tag: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Remove a tag from a client"""
    result = await db.clients.find_one_and_update(
        ctx.filter_query({"client_id": client_id, "deleted_at": None}),
        {
            "$pull": {"tags": tag},
            "$set": {"updated_at": utc_now()}
        },
        return_document=True
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CLIENT_NOT_FOUND", "message": "Client not found"}
        )

    return SingleResponse(data=ClientResponse(**result))
