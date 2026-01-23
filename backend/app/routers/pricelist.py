"""
Price List Router
For managing distributor price lists and equipment/parts catalog
"""

import logging
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from fastapi.responses import PlainTextResponse
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_database
from app.models.user import User
from app.models.pricelist import (
    PriceListItem, PriceListItemResponse, PriceListUploadResult,
    PriceListSearchResult, PriceListCategory
)
from app.models.common import generate_id
from app.middleware.auth import BusinessContext, get_business_context, get_current_user
from app.schemas.common import SingleResponse, PaginatedResponse, MessageResponse, create_pagination_meta
from app.services.pricelist_parser import PriceListParser, get_csv_template

router = APIRouter()
logger = logging.getLogger(__name__)


def item_to_response(item: dict, distributor_name: Optional[str] = None) -> PriceListItemResponse:
    """Convert database document to response"""
    return PriceListItemResponse(
        item_id=item["item_id"],
        distributor_id=item["distributor_id"],
        distributor_name=distributor_name,
        part_number=item["part_number"],
        description=item["description"],
        category=item["category"],
        cost=item["cost"],
        msrp=item.get("msrp"),
        unit=item.get("unit", "each"),
        brand=item.get("brand"),
        model=item.get("model"),
        manufacturer=item.get("manufacturer"),
        in_stock=item.get("in_stock", True),
        lead_time_days=item.get("lead_time_days"),
        effective_date=item.get("effective_date")
    )


@router.get(
    "",
    response_model=PaginatedResponse[PriceListItemResponse],
    summary="List price list items"
)
async def list_pricelist_items(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    distributor_id: Optional[str] = None,
    category: Optional[PriceListCategory] = None,
    search: Optional[str] = None,
    brand: Optional[str] = None,
    in_stock: Optional[bool] = None,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """List price list items with filtering"""
    query = {"business_id": ctx.business_id}

    if distributor_id:
        query["distributor_id"] = distributor_id
    if category:
        query["category"] = category.value
    if brand:
        query["brand"] = {"$regex": brand, "$options": "i"}
    if in_stock is not None:
        query["in_stock"] = in_stock
    if search:
        query["$or"] = [
            {"part_number": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
            {"model": {"$regex": search, "$options": "i"}}
        ]

    total = await db.pricelist_items.count_documents(query)

    items = await db.pricelist_items.find(query).sort([
        ("brand", 1),
        ("part_number", 1)
    ]).skip((page - 1) * per_page).limit(per_page).to_list(length=per_page)

    # Get distributor names
    distributor_ids = list(set(item["distributor_id"] for item in items))
    distributors = await db.distributors.find(
        {"distributor_id": {"$in": distributor_ids}}
    ).to_list(length=100)
    distributor_map = {d["distributor_id"]: d["name"] for d in distributors}

    meta = create_pagination_meta(total, page, per_page)

    return PaginatedResponse(
        data=[
            item_to_response(item, distributor_map.get(item["distributor_id"]))
            for item in items
        ],
        meta=meta
    )


@router.get(
    "/search",
    response_model=List[PriceListSearchResult],
    summary="Search price list across distributors"
)
async def search_pricelist(
    q: str = Query(..., min_length=2),
    brand: Optional[str] = None,
    category: Optional[PriceListCategory] = None,
    limit: int = Query(20, ge=1, le=50),
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Search for items across all distributors"""
    query = {
        "business_id": ctx.business_id,
        "$or": [
            {"part_number": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
            {"model": {"$regex": q, "$options": "i"}}
        ]
    }

    if brand:
        query["brand"] = {"$regex": brand, "$options": "i"}
    if category:
        query["category"] = category.value

    items = await db.pricelist_items.find(query).sort(
        "cost", 1
    ).limit(limit).to_list(length=limit)

    # Get distributor names
    distributor_ids = list(set(item["distributor_id"] for item in items))
    distributors = await db.distributors.find(
        {"distributor_id": {"$in": distributor_ids}}
    ).to_list(length=100)
    distributor_map = {d["distributor_id"]: d["name"] for d in distributors}

    return [
        PriceListSearchResult(
            item_id=item["item_id"],
            distributor_id=item["distributor_id"],
            distributor_name=distributor_map.get(item["distributor_id"], "Unknown"),
            part_number=item["part_number"],
            description=item["description"],
            category=item["category"],
            cost=item["cost"],
            msrp=item.get("msrp"),
            unit=item.get("unit", "each"),
            brand=item.get("brand"),
            model=item.get("model"),
            in_stock=item.get("in_stock", True),
            lead_time_days=item.get("lead_time_days")
        )
        for item in items
    ]


@router.get(
    "/template",
    response_class=PlainTextResponse,
    summary="Download CSV template"
)
async def download_template():
    """Download a CSV template for price list uploads"""
    return PlainTextResponse(
        content=get_csv_template(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=pricelist_template.csv"}
    )


@router.post(
    "/upload/{distributor_id}",
    response_model=SingleResponse[PriceListUploadResult],
    summary="Upload price list CSV"
)
async def upload_pricelist(
    distributor_id: str,
    file: UploadFile = File(...),
    replace_existing: bool = Query(False, description="Replace all existing items"),
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Upload a price list CSV for a distributor.

    The CSV should have columns:
    - part_number (required)
    - description (required)
    - cost (recommended)
    - msrp, brand, model, category, unit, in_stock, lead_time_days (optional)
    """
    # Verify distributor exists
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

    # Validate file type
    if not file.filename.endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_FILE", "message": "File must be a CSV"}
        )

    # Read file
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:  # 10MB limit
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "FILE_TOO_LARGE", "message": "File must be under 10MB"}
        )

    # Parse CSV
    parser = PriceListParser(ctx.business_id, distributor_id)
    items = parser.parse_csv(content)

    if parser.errors:
        return SingleResponse(data=PriceListUploadResult(
            items_imported=0,
            items_updated=0,
            items_skipped=0,
            errors=parser.errors,
            warnings=parser.warnings
        ))

    if not items:
        return SingleResponse(data=PriceListUploadResult(
            items_imported=0,
            items_updated=0,
            items_skipped=0,
            errors=["No valid items found in CSV"],
            warnings=parser.warnings
        ))

    # Delete existing items if replacing
    if replace_existing:
        await db.pricelist_items.delete_many({
            "business_id": ctx.business_id,
            "distributor_id": distributor_id
        })
        items_imported = len(items)
        items_updated = 0
    else:
        items_imported = 0
        items_updated = 0

    # Upsert items
    for item in items:
        item["item_id"] = generate_id("pli")

        if not replace_existing:
            existing = await db.pricelist_items.find_one({
                "business_id": ctx.business_id,
                "distributor_id": distributor_id,
                "part_number": item["part_number"]
            })

            if existing:
                # Update existing
                item.pop("item_id")
                item.pop("created_at")
                await db.pricelist_items.update_one(
                    {"item_id": existing["item_id"]},
                    {"$set": item}
                )
                items_updated += 1
            else:
                # Insert new
                await db.pricelist_items.insert_one(item)
                items_imported += 1
        else:
            await db.pricelist_items.insert_one(item)

    # Update distributor metadata
    item_count = await db.pricelist_items.count_documents({
        "business_id": ctx.business_id,
        "distributor_id": distributor_id
    })

    await db.distributors.update_one(
        {"distributor_id": distributor_id},
        {"$set": {
            "price_list_updated": datetime.utcnow(),
            "price_list_items_count": item_count,
            "updated_at": datetime.utcnow()
        }}
    )

    logger.info(
        f"Price list upload for {distributor['name']}: "
        f"{items_imported} imported, {items_updated} updated"
    )

    return SingleResponse(data=PriceListUploadResult(
        items_imported=items_imported,
        items_updated=items_updated,
        items_skipped=len(items) - items_imported - items_updated,
        errors=parser.errors,
        warnings=parser.warnings
    ))


@router.get(
    "/{item_id}",
    response_model=SingleResponse[PriceListItemResponse],
    summary="Get price list item"
)
async def get_pricelist_item(
    item_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get a specific price list item"""
    item = await db.pricelist_items.find_one({
        "item_id": item_id,
        "business_id": ctx.business_id
    })

    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "ITEM_NOT_FOUND", "message": "Price list item not found"}
        )

    # Get distributor name
    distributor = await db.distributors.find_one({"distributor_id": item["distributor_id"]})
    distributor_name = distributor["name"] if distributor else None

    return SingleResponse(data=item_to_response(item, distributor_name))


@router.delete(
    "/{item_id}",
    response_model=MessageResponse,
    summary="Delete price list item"
)
async def delete_pricelist_item(
    item_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Delete a price list item"""
    result = await db.pricelist_items.delete_one({
        "item_id": item_id,
        "business_id": ctx.business_id
    })

    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "ITEM_NOT_FOUND", "message": "Price list item not found"}
        )

    return MessageResponse(message="Item deleted")


@router.get(
    "/distributor/{distributor_id}/stats",
    summary="Get price list statistics"
)
async def get_pricelist_stats(
    distributor_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get statistics for a distributor's price list"""
    pipeline = [
        {
            "$match": {
                "business_id": ctx.business_id,
                "distributor_id": distributor_id
            }
        },
        {
            "$group": {
                "_id": "$category",
                "count": {"$sum": 1},
                "avg_cost": {"$avg": "$cost"},
                "min_cost": {"$min": "$cost"},
                "max_cost": {"$max": "$cost"}
            }
        }
    ]

    results = await db.pricelist_items.aggregate(pipeline).to_list(length=20)

    total = sum(r["count"] for r in results)

    return {
        "total_items": total,
        "by_category": [
            {
                "category": r["_id"],
                "count": r["count"],
                "avg_cost": round(r["avg_cost"], 2),
                "min_cost": round(r["min_cost"], 2),
                "max_cost": round(r["max_cost"], 2)
            }
            for r in results
        ]
    }
