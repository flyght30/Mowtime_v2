"""
Equipment API Router
Tools and machinery tracking
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional
from datetime import date

from app.database import get_database
from app.models.equipment import (
    Equipment, EquipmentCreate, EquipmentUpdate, EquipmentResponse,
    EquipmentStatus, EquipmentCategory, MaintenanceRecord
)
from app.models.user import User
from app.models.common import utc_now
from app.middleware.auth import BusinessContext, get_business_context
from app.schemas.common import (
    PaginatedResponse, SingleResponse, ListResponse, MessageResponse,
    create_pagination_meta
)

router = APIRouter()


@router.get(
    "",
    response_model=PaginatedResponse[EquipmentResponse],
    summary="List equipment"
)
async def list_equipment(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    category: Optional[EquipmentCategory] = None,
    equipment_status: Optional[EquipmentStatus] = Query(None, alias="status"),
    search: Optional[str] = None,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """List equipment for the current business"""
    query = ctx.filter_query({"deleted_at": None})

    if category:
        query["category"] = category.value

    if equipment_status:
        query["status"] = equipment_status.value

    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"make": {"$regex": search, "$options": "i"}},
            {"model": {"$regex": search, "$options": "i"}},
            {"serial_number": {"$regex": search, "$options": "i"}}
        ]

    total = await db.equipment.count_documents(query)
    skip = (page - 1) * per_page

    cursor = db.equipment.find(query).sort("name", 1).skip(skip).limit(per_page)
    docs = await cursor.to_list(length=per_page)

    equipment_list = [EquipmentResponse(**doc) for doc in docs]
    meta = create_pagination_meta(total, page, per_page)

    return PaginatedResponse(data=equipment_list, meta=meta)


@router.get(
    "/available",
    response_model=ListResponse[EquipmentResponse],
    summary="List available equipment"
)
async def list_available_equipment(
    category: Optional[EquipmentCategory] = None,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get equipment that is currently available"""
    query = ctx.filter_query({
        "deleted_at": None,
        "status": EquipmentStatus.AVAILABLE.value
    })

    if category:
        query["category"] = category.value

    cursor = db.equipment.find(query).sort("name", 1)
    docs = await cursor.to_list(length=100)

    equipment_list = [EquipmentResponse(**doc) for doc in docs]

    return ListResponse(data=equipment_list, count=len(equipment_list))


@router.get(
    "/maintenance-due",
    response_model=ListResponse[EquipmentResponse],
    summary="List equipment due for maintenance"
)
async def list_maintenance_due(
    days_ahead: int = Query(7, ge=0, le=90),
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get equipment due for maintenance within specified days"""
    from datetime import timedelta

    due_date = (date.today() + timedelta(days=days_ahead)).isoformat()

    query = ctx.filter_query({
        "deleted_at": None,
        "next_maintenance_date": {"$lte": due_date}
    })

    cursor = db.equipment.find(query).sort("next_maintenance_date", 1)
    docs = await cursor.to_list(length=50)

    equipment_list = [EquipmentResponse(**doc) for doc in docs]

    return ListResponse(data=equipment_list, count=len(equipment_list))


@router.post(
    "",
    response_model=SingleResponse[EquipmentResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create equipment"
)
async def create_equipment(
    data: EquipmentCreate,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Add new equipment"""
    equipment = Equipment(
        business_id=ctx.business_id,
        **data.model_dump()
    )

    await db.equipment.insert_one(equipment.model_dump())

    return SingleResponse(data=EquipmentResponse(**equipment.model_dump()))


@router.get(
    "/{equipment_id}",
    response_model=SingleResponse[EquipmentResponse],
    summary="Get equipment by ID"
)
async def get_equipment(
    equipment_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get equipment by ID"""
    doc = await db.equipment.find_one(ctx.filter_query({
        "equipment_id": equipment_id,
        "deleted_at": None
    }))

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "EQUIPMENT_NOT_FOUND", "message": "Equipment not found"}
        )

    return SingleResponse(data=EquipmentResponse(**doc))


@router.put(
    "/{equipment_id}",
    response_model=SingleResponse[EquipmentResponse],
    summary="Update equipment"
)
async def update_equipment(
    equipment_id: str,
    data: EquipmentUpdate,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Update equipment by ID"""
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_at"] = utc_now()

    result = await db.equipment.find_one_and_update(
        ctx.filter_query({"equipment_id": equipment_id, "deleted_at": None}),
        {"$set": update_data},
        return_document=True
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "EQUIPMENT_NOT_FOUND", "message": "Equipment not found"}
        )

    return SingleResponse(data=EquipmentResponse(**result))


@router.delete(
    "/{equipment_id}",
    response_model=MessageResponse,
    summary="Delete equipment"
)
async def delete_equipment(
    equipment_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Soft delete equipment"""
    result = await db.equipment.update_one(
        ctx.filter_query({"equipment_id": equipment_id, "deleted_at": None}),
        {"$set": {"deleted_at": utc_now(), "updated_at": utc_now()}}
    )

    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "EQUIPMENT_NOT_FOUND", "message": "Equipment not found"}
        )

    return MessageResponse(message="Equipment deleted successfully")


@router.post(
    "/{equipment_id}/check-out",
    response_model=SingleResponse[EquipmentResponse],
    summary="Check out equipment"
)
async def check_out_equipment(
    equipment_id: str,
    staff_id: str,
    appointment_id: Optional[str] = None,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Check out equipment to a staff member"""
    # Verify equipment exists and is available
    doc = await db.equipment.find_one(ctx.filter_query({
        "equipment_id": equipment_id,
        "deleted_at": None
    }))

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "EQUIPMENT_NOT_FOUND", "message": "Equipment not found"}
        )

    if doc["status"] != EquipmentStatus.AVAILABLE.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "EQUIPMENT_NOT_AVAILABLE", "message": "Equipment is not available"}
        )

    # Verify staff exists
    staff = await db.staff.find_one(ctx.filter_query({
        "staff_id": staff_id,
        "deleted_at": None
    }))

    if not staff:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "STAFF_NOT_FOUND", "message": "Staff member not found"}
        )

    # Check certification if required
    if doc.get("requires_certification"):
        if staff_id not in doc.get("certified_staff_ids", []):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "NOT_CERTIFIED",
                    "message": "Staff member is not certified for this equipment"
                }
            )

    result = await db.equipment.find_one_and_update(
        {"equipment_id": equipment_id},
        {"$set": {
            "status": EquipmentStatus.IN_USE.value,
            "current_staff_id": staff_id,
            "current_appointment_id": appointment_id,
            "updated_at": utc_now()
        }},
        return_document=True
    )

    return SingleResponse(data=EquipmentResponse(**result))


@router.post(
    "/{equipment_id}/check-in",
    response_model=SingleResponse[EquipmentResponse],
    summary="Check in equipment"
)
async def check_in_equipment(
    equipment_id: str,
    hours_used: float = 0,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Check in equipment after use"""
    doc = await db.equipment.find_one(ctx.filter_query({
        "equipment_id": equipment_id,
        "deleted_at": None
    }))

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "EQUIPMENT_NOT_FOUND", "message": "Equipment not found"}
        )

    result = await db.equipment.find_one_and_update(
        {"equipment_id": equipment_id},
        {
            "$set": {
                "status": EquipmentStatus.AVAILABLE.value,
                "current_staff_id": None,
                "current_appointment_id": None,
                "updated_at": utc_now()
            },
            "$inc": {
                "total_hours_used": hours_used,
                "total_appointments": 1
            }
        },
        return_document=True
    )

    return SingleResponse(data=EquipmentResponse(**result))


@router.post(
    "/{equipment_id}/maintenance",
    response_model=SingleResponse[EquipmentResponse],
    summary="Record maintenance"
)
async def record_maintenance(
    equipment_id: str,
    record: MaintenanceRecord,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Record maintenance performed on equipment"""
    doc = await db.equipment.find_one(ctx.filter_query({
        "equipment_id": equipment_id,
        "deleted_at": None
    }))

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "EQUIPMENT_NOT_FOUND", "message": "Equipment not found"}
        )

    update_dict = {
        "last_maintenance_date": record.date.isoformat(),
        "updated_at": utc_now(),
        "status": EquipmentStatus.AVAILABLE.value  # Return to available after maintenance
    }

    if record.next_due:
        update_dict["next_maintenance_date"] = record.next_due.isoformat()

    result = await db.equipment.find_one_and_update(
        {"equipment_id": equipment_id},
        {
            "$set": update_dict,
            "$push": {"maintenance_history": record.model_dump(mode="json")},
            "$inc": {"total_maintenance_cost": record.cost}
        },
        return_document=True
    )

    return SingleResponse(data=EquipmentResponse(**result))


@router.patch(
    "/{equipment_id}/status",
    response_model=SingleResponse[EquipmentResponse],
    summary="Update equipment status"
)
async def update_equipment_status(
    equipment_id: str,
    new_status: EquipmentStatus,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Update equipment status"""
    result = await db.equipment.find_one_and_update(
        ctx.filter_query({"equipment_id": equipment_id, "deleted_at": None}),
        {"$set": {"status": new_status.value, "updated_at": utc_now()}},
        return_document=True
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "EQUIPMENT_NOT_FOUND", "message": "Equipment not found"}
        )

    return SingleResponse(data=EquipmentResponse(**result))
