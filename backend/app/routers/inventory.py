"""
Inventory Router
For tracking parts, materials, and equipment inventory
"""

import logging
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_database
from app.models.user import User
from app.models.inventory import (
    InventoryItem, InventoryTransaction, InventoryCategory, TransactionType,
    InventoryItemCreate, InventoryItemUpdate, StockAdjustment, StockTransfer,
    InventoryItemResponse, InventoryAlert, InventoryTransactionResponse
)
from app.models.common import generate_id
from app.middleware.auth import BusinessContext, get_business_context, get_current_user
from app.schemas.common import SingleResponse, PaginatedResponse, MessageResponse, create_pagination_meta

router = APIRouter()
logger = logging.getLogger(__name__)


def item_to_response(item: dict) -> InventoryItemResponse:
    """Convert database document to response"""
    quantity_available = item.get("quantity_on_hand", 0) - item.get("quantity_reserved", 0)
    is_low_stock = item.get("quantity_on_hand", 0) <= item.get("reorder_point", 0)

    return InventoryItemResponse(
        item_id=item["item_id"],
        business_id=item["business_id"],
        name=item["name"],
        description=item.get("description"),
        part_number=item.get("part_number"),
        category=item.get("category", "other"),
        unit=item.get("unit", "each"),
        quantity_on_hand=item.get("quantity_on_hand", 0),
        quantity_reserved=item.get("quantity_reserved", 0),
        quantity_available=quantity_available,
        reorder_point=item.get("reorder_point", 0),
        reorder_quantity=item.get("reorder_quantity", 0),
        max_quantity=item.get("max_quantity"),
        cost_per_unit=item.get("cost_per_unit", 0),
        last_cost=item.get("last_cost", 0),
        total_value=item.get("quantity_on_hand", 0) * item.get("cost_per_unit", 0),
        location=item.get("location", "Warehouse"),
        bin_location=item.get("bin_location"),
        preferred_distributor_id=item.get("preferred_distributor_id"),
        brand=item.get("brand"),
        is_active=item.get("is_active", True),
        track_inventory=item.get("track_inventory", True),
        is_low_stock=is_low_stock,
        created_at=item["created_at"],
        updated_at=item["updated_at"]
    )


async def record_transaction(
    db: AsyncIOMotorDatabase,
    business_id: str,
    item_id: str,
    transaction_type: TransactionType,
    quantity: float,
    user_id: str,
    quantity_before: float,
    quantity_after: float,
    unit_cost: Optional[float] = None,
    job_id: Optional[str] = None,
    po_id: Optional[str] = None,
    from_location: Optional[str] = None,
    to_location: Optional[str] = None,
    notes: Optional[str] = None
):
    """Record an inventory transaction"""
    transaction = InventoryTransaction(
        business_id=business_id,
        item_id=item_id,
        transaction_type=transaction_type,
        quantity=quantity,
        unit_cost=unit_cost,
        job_id=job_id,
        po_id=po_id,
        from_location=from_location,
        to_location=to_location,
        quantity_before=quantity_before,
        quantity_after=quantity_after,
        notes=notes,
        user_id=user_id
    )

    await db.inventory_transactions.insert_one(transaction.model_dump())


@router.post(
    "",
    response_model=SingleResponse[InventoryItemResponse],
    summary="Create inventory item"
)
async def create_inventory_item(
    request: InventoryItemCreate,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Create a new inventory item"""
    item = InventoryItem(
        business_id=ctx.business_id,
        **request.model_dump()
    )

    # Calculate available
    item.quantity_available = item.quantity_on_hand - item.quantity_reserved
    item.total_value = item.quantity_on_hand * item.cost_per_unit
    item.last_cost = item.cost_per_unit

    await db.inventory.insert_one(item.model_dump())

    # Record initial stock if any
    if item.quantity_on_hand > 0:
        await record_transaction(
            db=db,
            business_id=ctx.business_id,
            item_id=item.item_id,
            transaction_type=TransactionType.INITIAL,
            quantity=item.quantity_on_hand,
            user_id=current_user.user_id,
            quantity_before=0,
            quantity_after=item.quantity_on_hand,
            unit_cost=item.cost_per_unit,
            notes="Initial stock"
        )

    logger.info(f"Created inventory item {item.item_id}: {item.name}")

    return SingleResponse(data=item_to_response(item.model_dump()))


@router.get(
    "",
    response_model=PaginatedResponse[InventoryItemResponse],
    summary="List inventory items"
)
async def list_inventory_items(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    category: Optional[InventoryCategory] = None,
    location: Optional[str] = None,
    low_stock: Optional[bool] = None,
    search: Optional[str] = None,
    is_active: bool = True,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """List inventory items with filtering"""
    query = {
        "business_id": ctx.business_id,
        "deleted_at": None,
        "is_active": is_active
    }

    if category:
        query["category"] = category.value
    if location:
        query["location"] = location
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"part_number": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}}
        ]
    if low_stock:
        query["$expr"] = {"$lte": ["$quantity_on_hand", "$reorder_point"]}

    total = await db.inventory.count_documents(query)

    items = await db.inventory.find(query).sort([
        ("category", 1),
        ("name", 1)
    ]).skip((page - 1) * per_page).limit(per_page).to_list(length=per_page)

    meta = create_pagination_meta(total, page, per_page)

    return PaginatedResponse(
        data=[item_to_response(item) for item in items],
        meta=meta
    )


@router.get(
    "/alerts",
    summary="Get inventory alerts"
)
async def get_inventory_alerts(
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get low stock and out of stock alerts"""
    # Find items at or below reorder point
    low_stock_items = await db.inventory.find({
        "business_id": ctx.business_id,
        "deleted_at": None,
        "is_active": True,
        "track_inventory": True,
        "$expr": {"$lte": ["$quantity_on_hand", "$reorder_point"]}
    }).sort("quantity_on_hand", 1).to_list(length=100)

    alerts = []
    low_stock = []
    out_of_stock = []

    for item in low_stock_items:
        qty = item.get("quantity_on_hand", 0)
        reorder_qty = item.get("reorder_quantity", 0)
        reorder_point = item.get("reorder_point", 0)

        alert = InventoryAlert(
            item_id=item["item_id"],
            name=item["name"],
            part_number=item.get("part_number"),
            category=item.get("category", "other"),
            location=item.get("location", "Warehouse"),
            quantity_on_hand=qty,
            reorder_point=reorder_point,
            reorder_quantity=reorder_qty,
            is_out_of_stock=qty <= 0,
            quantity_to_order=max(reorder_qty - qty, 0)
        )

        if qty <= 0:
            out_of_stock.append(alert)
        else:
            low_stock.append(alert)

    return {
        "low_stock": [a.model_dump() for a in low_stock],
        "out_of_stock": [a.model_dump() for a in out_of_stock],
        "low_stock_count": len(low_stock),
        "out_of_stock_count": len(out_of_stock)
    }


@router.get(
    "/locations",
    summary="Get inventory locations"
)
async def get_inventory_locations(
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get list of inventory locations with item counts"""
    pipeline = [
        {
            "$match": {
                "business_id": ctx.business_id,
                "deleted_at": None,
                "is_active": True
            }
        },
        {
            "$group": {
                "_id": "$location",
                "item_count": {"$sum": 1},
                "total_value": {"$sum": {"$multiply": ["$quantity_on_hand", "$cost_per_unit"]}}
            }
        },
        {"$sort": {"_id": 1}}
    ]

    results = await db.inventory.aggregate(pipeline).to_list(length=50)

    return {
        "locations": [
            {
                "name": r["_id"] or "Unassigned",
                "item_count": r["item_count"],
                "total_value": round(r["total_value"], 2)
            }
            for r in results
        ]
    }


@router.get(
    "/summary",
    summary="Get inventory summary"
)
async def get_inventory_summary(
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get inventory value and statistics summary"""
    pipeline = [
        {
            "$match": {
                "business_id": ctx.business_id,
                "deleted_at": None,
                "is_active": True
            }
        },
        {
            "$group": {
                "_id": "$category",
                "count": {"$sum": 1},
                "total_value": {"$sum": {"$multiply": ["$quantity_on_hand", "$cost_per_unit"]}},
                "total_quantity": {"$sum": "$quantity_on_hand"}
            }
        }
    ]

    results = await db.inventory.aggregate(pipeline).to_list(length=20)

    total_items = sum(r["count"] for r in results)
    total_value = sum(r["total_value"] for r in results)

    # Count low stock
    low_stock_count = await db.inventory.count_documents({
        "business_id": ctx.business_id,
        "deleted_at": None,
        "is_active": True,
        "track_inventory": True,
        "$expr": {"$lte": ["$quantity_on_hand", "$reorder_point"]}
    })

    return {
        "total_items": total_items,
        "total_value": round(total_value, 2),
        "low_stock_count": low_stock_count,
        "by_category": [
            {
                "category": r["_id"],
                "count": r["count"],
                "total_value": round(r["total_value"], 2)
            }
            for r in results
        ]
    }


@router.get(
    "/{item_id}",
    response_model=SingleResponse[InventoryItemResponse],
    summary="Get inventory item"
)
async def get_inventory_item(
    item_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get a specific inventory item"""
    item = await db.inventory.find_one({
        "item_id": item_id,
        "business_id": ctx.business_id,
        "deleted_at": None
    })

    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "ITEM_NOT_FOUND", "message": "Inventory item not found"}
        )

    return SingleResponse(data=item_to_response(item))


@router.put(
    "/{item_id}",
    response_model=SingleResponse[InventoryItemResponse],
    summary="Update inventory item"
)
async def update_inventory_item(
    item_id: str,
    request: InventoryItemUpdate,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Update an inventory item"""
    item = await db.inventory.find_one({
        "item_id": item_id,
        "business_id": ctx.business_id,
        "deleted_at": None
    })

    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "ITEM_NOT_FOUND", "message": "Inventory item not found"}
        )

    update_data = {
        k: v for k, v in request.model_dump().items()
        if v is not None
    }
    update_data["updated_at"] = datetime.utcnow()

    await db.inventory.update_one(
        {"item_id": item_id},
        {"$set": update_data}
    )

    updated = await db.inventory.find_one({"item_id": item_id})

    return SingleResponse(data=item_to_response(updated))


@router.post(
    "/{item_id}/adjust",
    response_model=SingleResponse[InventoryItemResponse],
    summary="Adjust stock level"
)
async def adjust_stock(
    item_id: str,
    adjustment: StockAdjustment,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Adjust inventory stock level.

    Use positive quantity to add stock, negative to remove.
    """
    item = await db.inventory.find_one({
        "item_id": item_id,
        "business_id": ctx.business_id,
        "deleted_at": None
    })

    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "ITEM_NOT_FOUND", "message": "Inventory item not found"}
        )

    quantity_before = item.get("quantity_on_hand", 0)
    quantity_after = quantity_before + adjustment.quantity

    if quantity_after < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INSUFFICIENT_STOCK", "message": f"Cannot remove {abs(adjustment.quantity)}, only {quantity_before} on hand"}
        )

    # Determine transaction type
    if adjustment.job_id:
        trans_type = TransactionType.USAGE
    elif adjustment.quantity > 0:
        trans_type = TransactionType.RECEIVED
    else:
        trans_type = TransactionType.ADJUSTMENT

    # Update item
    await db.inventory.update_one(
        {"item_id": item_id},
        {
            "$set": {
                "quantity_on_hand": quantity_after,
                "quantity_available": quantity_after - item.get("quantity_reserved", 0),
                "updated_at": datetime.utcnow()
            }
        }
    )

    # Record transaction
    await record_transaction(
        db=db,
        business_id=ctx.business_id,
        item_id=item_id,
        transaction_type=trans_type,
        quantity=adjustment.quantity,
        user_id=current_user.user_id,
        quantity_before=quantity_before,
        quantity_after=quantity_after,
        unit_cost=item.get("cost_per_unit"),
        job_id=adjustment.job_id,
        notes=f"{adjustment.reason}: {adjustment.notes}" if adjustment.notes else adjustment.reason
    )

    updated = await db.inventory.find_one({"item_id": item_id})

    logger.info(f"Stock adjusted for {item['name']}: {quantity_before} -> {quantity_after}")

    return SingleResponse(data=item_to_response(updated))


@router.post(
    "/{item_id}/transfer",
    response_model=SingleResponse[InventoryItemResponse],
    summary="Transfer stock between locations"
)
async def transfer_stock(
    item_id: str,
    transfer: StockTransfer,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Transfer stock from one location to another"""
    item = await db.inventory.find_one({
        "item_id": item_id,
        "business_id": ctx.business_id,
        "deleted_at": None
    })

    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "ITEM_NOT_FOUND", "message": "Inventory item not found"}
        )

    if item.get("location") != transfer.from_location:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "WRONG_LOCATION", "message": f"Item is not at {transfer.from_location}"}
        )

    if transfer.quantity > item.get("quantity_on_hand", 0):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INSUFFICIENT_STOCK", "message": "Not enough stock to transfer"}
        )

    quantity_before = item.get("quantity_on_hand", 0)

    # Update location
    await db.inventory.update_one(
        {"item_id": item_id},
        {
            "$set": {
                "location": transfer.to_location,
                "updated_at": datetime.utcnow()
            }
        }
    )

    # Record transaction
    await record_transaction(
        db=db,
        business_id=ctx.business_id,
        item_id=item_id,
        transaction_type=TransactionType.TRANSFER,
        quantity=transfer.quantity,
        user_id=current_user.user_id,
        quantity_before=quantity_before,
        quantity_after=quantity_before,  # Quantity doesn't change
        from_location=transfer.from_location,
        to_location=transfer.to_location,
        notes=transfer.notes
    )

    updated = await db.inventory.find_one({"item_id": item_id})

    return SingleResponse(data=item_to_response(updated))


@router.get(
    "/{item_id}/transactions",
    response_model=PaginatedResponse[InventoryTransactionResponse],
    summary="Get item transactions"
)
async def get_item_transactions(
    item_id: str,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get transaction history for an inventory item"""
    # Verify item exists
    item = await db.inventory.find_one({
        "item_id": item_id,
        "business_id": ctx.business_id
    })

    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "ITEM_NOT_FOUND", "message": "Inventory item not found"}
        )

    query = {
        "business_id": ctx.business_id,
        "item_id": item_id
    }

    total = await db.inventory_transactions.count_documents(query)

    transactions = await db.inventory_transactions.find(query).sort(
        "created_at", -1
    ).skip((page - 1) * per_page).limit(per_page).to_list(length=per_page)

    # Get user names
    user_ids = list(set(t["user_id"] for t in transactions))
    users = await db.users.find(
        {"user_id": {"$in": user_ids}}
    ).to_list(length=100)
    user_map = {
        u["user_id"]: f"{u.get('first_name', '')} {u.get('last_name', '')}".strip()
        for u in users
    }

    meta = create_pagination_meta(total, page, per_page)

    return PaginatedResponse(
        data=[
            InventoryTransactionResponse(
                transaction_id=t["transaction_id"],
                item_id=t["item_id"],
                item_name=item["name"],
                transaction_type=t["transaction_type"],
                quantity=t["quantity"],
                unit_cost=t.get("unit_cost"),
                job_id=t.get("job_id"),
                po_id=t.get("po_id"),
                quantity_before=t["quantity_before"],
                quantity_after=t["quantity_after"],
                notes=t.get("notes"),
                user_id=t["user_id"],
                user_name=user_map.get(t["user_id"]),
                created_at=t["created_at"]
            )
            for t in transactions
        ],
        meta=meta
    )


@router.delete(
    "/{item_id}",
    response_model=MessageResponse,
    summary="Delete inventory item"
)
async def delete_inventory_item(
    item_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Soft delete an inventory item"""
    result = await db.inventory.update_one(
        {
            "item_id": item_id,
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
            detail={"code": "ITEM_NOT_FOUND", "message": "Inventory item not found"}
        )

    return MessageResponse(message="Inventory item deleted")
