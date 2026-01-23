"""
Purchase Orders Router
For managing equipment and parts procurement
"""

import base64
import logging
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from app.database import get_database
from app.models.user import User
from app.models.purchase_order import (
    PurchaseOrder, POLineItem, POStatus,
    POCreate, POUpdate, POReceive, POReceiveItem,
    POResponse, POLineItemResponse, POSummary
)
from app.models.inventory import TransactionType
from app.models.common import generate_id
from app.middleware.auth import BusinessContext, get_business_context, get_current_user
from app.schemas.common import SingleResponse, PaginatedResponse, MessageResponse, create_pagination_meta
from app.services.po_pdf_service import get_po_pdf_service
from app.services.email_service import get_email_service

router = APIRouter()
logger = logging.getLogger(__name__)


class POSendEmailRequest(BaseModel):
    """Request to send PO via email"""
    email: Optional[str] = None  # If not provided, uses distributor email
    cc: Optional[List[str]] = None
    message: Optional[str] = None


class POEmailSentResponse(BaseModel):
    """Response after sending PO email"""
    success: bool
    email_sent_to: str
    message: Optional[str] = None
    error: Optional[str] = None


async def get_next_po_number(db: AsyncIOMotorDatabase, business_id: str) -> str:
    """Generate next PO number for a business"""
    year = datetime.utcnow().year

    # Find highest PO number this year
    pattern = f"PO-{year}-"
    last_po = await db.purchase_orders.find_one(
        {
            "business_id": business_id,
            "po_number": {"$regex": f"^{pattern}"}
        },
        sort=[("po_number", -1)]
    )

    if last_po:
        try:
            last_num = int(last_po["po_number"].split("-")[-1])
            next_num = last_num + 1
        except (ValueError, IndexError):
            next_num = 1
    else:
        next_num = 1

    return f"PO-{year}-{next_num:04d}"


def line_item_to_response(item: dict) -> POLineItemResponse:
    """Convert line item to response"""
    qty_ordered = item.get("quantity_ordered", 0)
    qty_received = item.get("quantity_received", 0)

    return POLineItemResponse(
        line_id=item["line_id"],
        part_number=item["part_number"],
        description=item["description"],
        quantity_ordered=qty_ordered,
        quantity_received=qty_received,
        quantity_remaining=max(qty_ordered - qty_received, 0),
        unit=item.get("unit", "each"),
        unit_cost=item["unit_cost"],
        total=item.get("total", qty_ordered * item["unit_cost"]),
        inventory_item_id=item.get("inventory_item_id"),
        notes=item.get("notes")
    )


def po_to_response(po: dict, distributor_name: Optional[str] = None) -> POResponse:
    """Convert PO to response"""
    return POResponse(
        po_id=po["po_id"],
        business_id=po["business_id"],
        distributor_id=po["distributor_id"],
        distributor_name=distributor_name,
        po_number=po["po_number"],
        status=po["status"],
        job_id=po.get("job_id"),
        job_address=po.get("job_address"),
        items=[line_item_to_response(item) for item in po.get("items", [])],
        subtotal=po.get("subtotal", 0),
        tax_rate=po.get("tax_rate", 0),
        tax=po.get("tax", 0),
        shipping=po.get("shipping", 0),
        total=po.get("total", 0),
        ship_to_address=po.get("ship_to_address"),
        ship_to_name=po.get("ship_to_name"),
        ship_to_phone=po.get("ship_to_phone"),
        delivery_instructions=po.get("delivery_instructions"),
        notes=po.get("notes"),
        expected_delivery=po.get("expected_delivery"),
        sent_at=po.get("sent_at"),
        received_at=po.get("received_at"),
        requires_approval=po.get("requires_approval", False),
        approved_by=po.get("approved_by"),
        approved_at=po.get("approved_at"),
        created_by=po["created_by"],
        created_at=po["created_at"],
        updated_at=po["updated_at"]
    )


def calculate_totals(items: List[dict], tax_rate: float, shipping: float) -> dict:
    """Calculate PO totals"""
    subtotal = sum(
        item.get("quantity_ordered", 0) * item.get("unit_cost", 0)
        for item in items
    )
    tax = subtotal * (tax_rate / 100)
    total = subtotal + tax + shipping

    return {
        "subtotal": round(subtotal, 2),
        "tax": round(tax, 2),
        "total": round(total, 2)
    }


@router.post(
    "",
    response_model=SingleResponse[POResponse],
    summary="Create purchase order"
)
async def create_purchase_order(
    request: POCreate,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Create a new purchase order"""
    # Verify distributor exists
    distributor = await db.distributors.find_one({
        "distributor_id": request.distributor_id,
        "business_id": ctx.business_id,
        "deleted_at": None
    })

    if not distributor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "DISTRIBUTOR_NOT_FOUND", "message": "Distributor not found"}
        )

    # Generate PO number
    po_number = await get_next_po_number(db, ctx.business_id)

    # Build line items
    items = []
    for item_req in request.items:
        line_item = POLineItem(
            part_number=item_req.part_number,
            description=item_req.description,
            quantity_ordered=item_req.quantity_ordered,
            unit=item_req.unit,
            unit_cost=item_req.unit_cost,
            total=round(item_req.quantity_ordered * item_req.unit_cost, 2),
            price_list_item_id=item_req.price_list_item_id,
            inventory_item_id=item_req.inventory_item_id,
            notes=item_req.notes
        )
        items.append(line_item.model_dump())

    # Calculate totals
    totals = calculate_totals(items, request.tax_rate, request.shipping)

    # Get job address if job provided
    job_address = None
    if request.job_id:
        job = await db.hvac_quotes.find_one({"quote_id": request.job_id})
        if job and job.get("property"):
            prop = job["property"]
            job_address = f"{prop.get('address', '')}, {prop.get('city', '')} {prop.get('state', '')}"

    po = PurchaseOrder(
        business_id=ctx.business_id,
        distributor_id=request.distributor_id,
        po_number=po_number,
        status=POStatus.DRAFT,
        job_id=request.job_id,
        job_address=job_address,
        items=items,
        subtotal=totals["subtotal"],
        tax_rate=request.tax_rate,
        tax=totals["tax"],
        shipping=request.shipping,
        total=totals["total"],
        ship_to_address=request.ship_to_address,
        ship_to_name=request.ship_to_name,
        ship_to_phone=request.ship_to_phone,
        delivery_instructions=request.delivery_instructions,
        notes=request.notes,
        internal_notes=request.internal_notes,
        expected_delivery=request.expected_delivery,
        requires_approval=request.requires_approval,
        created_by=current_user.user_id
    )

    await db.purchase_orders.insert_one(po.model_dump())

    logger.info(f"Created PO {po_number} for {distributor['name']}")

    return SingleResponse(data=po_to_response(po.model_dump(), distributor["name"]))


@router.get(
    "",
    response_model=PaginatedResponse[POSummary],
    summary="List purchase orders"
)
async def list_purchase_orders(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status_filter: Optional[POStatus] = Query(None, alias="status"),
    distributor_id: Optional[str] = None,
    job_id: Optional[str] = None,
    search: Optional[str] = None,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """List purchase orders"""
    query = {
        "business_id": ctx.business_id,
        "deleted_at": None
    }

    if status_filter:
        query["status"] = status_filter.value
    if distributor_id:
        query["distributor_id"] = distributor_id
    if job_id:
        query["job_id"] = job_id
    if search:
        query["$or"] = [
            {"po_number": {"$regex": search, "$options": "i"}},
            {"notes": {"$regex": search, "$options": "i"}}
        ]

    total = await db.purchase_orders.count_documents(query)

    pos = await db.purchase_orders.find(query).sort(
        "created_at", -1
    ).skip((page - 1) * per_page).limit(per_page).to_list(length=per_page)

    # Get distributor names
    distributor_ids = list(set(po["distributor_id"] for po in pos))
    distributors = await db.distributors.find(
        {"distributor_id": {"$in": distributor_ids}}
    ).to_list(length=100)
    distributor_map = {d["distributor_id"]: d["name"] for d in distributors}

    meta = create_pagination_meta(total, page, per_page)

    return PaginatedResponse(
        data=[
            POSummary(
                po_id=po["po_id"],
                po_number=po["po_number"],
                status=po["status"],
                distributor_name=distributor_map.get(po["distributor_id"], "Unknown"),
                total=po.get("total", 0),
                items_count=len(po.get("items", [])),
                job_id=po.get("job_id"),
                expected_delivery=po.get("expected_delivery"),
                created_at=po["created_at"]
            )
            for po in pos
        ],
        meta=meta
    )


@router.get(
    "/{po_id}",
    response_model=SingleResponse[POResponse],
    summary="Get purchase order"
)
async def get_purchase_order(
    po_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get a specific purchase order"""
    po = await db.purchase_orders.find_one({
        "po_id": po_id,
        "business_id": ctx.business_id,
        "deleted_at": None
    })

    if not po:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "PO_NOT_FOUND", "message": "Purchase order not found"}
        )

    distributor = await db.distributors.find_one({"distributor_id": po["distributor_id"]})
    distributor_name = distributor["name"] if distributor else None

    return SingleResponse(data=po_to_response(po, distributor_name))


@router.put(
    "/{po_id}",
    response_model=SingleResponse[POResponse],
    summary="Update purchase order"
)
async def update_purchase_order(
    po_id: str,
    request: POUpdate,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Update a purchase order (only draft status)"""
    po = await db.purchase_orders.find_one({
        "po_id": po_id,
        "business_id": ctx.business_id,
        "deleted_at": None
    })

    if not po:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "PO_NOT_FOUND", "message": "Purchase order not found"}
        )

    if po["status"] not in [POStatus.DRAFT.value, POStatus.PENDING_APPROVAL.value]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "CANNOT_EDIT", "message": "Can only edit draft or pending approval POs"}
        )

    update_data = {"updated_at": datetime.utcnow(), "updated_by": current_user.user_id}

    # Handle items update
    if request.items is not None:
        items = []
        for item_req in request.items:
            line_item = POLineItem(
                part_number=item_req.part_number,
                description=item_req.description,
                quantity_ordered=item_req.quantity_ordered,
                unit=item_req.unit,
                unit_cost=item_req.unit_cost,
                total=round(item_req.quantity_ordered * item_req.unit_cost, 2),
                price_list_item_id=item_req.price_list_item_id,
                inventory_item_id=item_req.inventory_item_id,
                notes=item_req.notes
            )
            items.append(line_item.model_dump())
        update_data["items"] = items

    # Recalculate totals
    items_for_calc = update_data.get("items", po.get("items", []))
    tax_rate = request.tax_rate if request.tax_rate is not None else po.get("tax_rate", 0)
    shipping = request.shipping if request.shipping is not None else po.get("shipping", 0)
    totals = calculate_totals(items_for_calc, tax_rate, shipping)

    update_data.update(totals)
    update_data["tax_rate"] = tax_rate
    update_data["shipping"] = shipping

    # Other fields
    for field in ["distributor_id", "job_id", "ship_to_address", "ship_to_name",
                  "ship_to_phone", "delivery_instructions", "notes", "internal_notes",
                  "expected_delivery"]:
        value = getattr(request, field, None)
        if value is not None:
            update_data[field] = value

    await db.purchase_orders.update_one(
        {"po_id": po_id},
        {"$set": update_data}
    )

    updated = await db.purchase_orders.find_one({"po_id": po_id})
    distributor = await db.distributors.find_one({"distributor_id": updated["distributor_id"]})

    return SingleResponse(data=po_to_response(updated, distributor["name"] if distributor else None))


@router.post(
    "/{po_id}/submit",
    response_model=SingleResponse[POResponse],
    summary="Submit PO for approval"
)
async def submit_for_approval(
    po_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Submit a draft PO for approval"""
    po = await db.purchase_orders.find_one({
        "po_id": po_id,
        "business_id": ctx.business_id,
        "status": POStatus.DRAFT.value,
        "deleted_at": None
    })

    if not po:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "PO_NOT_FOUND", "message": "Draft PO not found"}
        )

    new_status = POStatus.PENDING_APPROVAL if po.get("requires_approval") else POStatus.APPROVED

    await db.purchase_orders.update_one(
        {"po_id": po_id},
        {"$set": {
            "status": new_status.value,
            "updated_at": datetime.utcnow(),
            "updated_by": current_user.user_id
        }}
    )

    updated = await db.purchase_orders.find_one({"po_id": po_id})
    distributor = await db.distributors.find_one({"distributor_id": updated["distributor_id"]})

    return SingleResponse(data=po_to_response(updated, distributor["name"] if distributor else None))


@router.post(
    "/{po_id}/approve",
    response_model=SingleResponse[POResponse],
    summary="Approve purchase order"
)
async def approve_purchase_order(
    po_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Approve a pending purchase order"""
    po = await db.purchase_orders.find_one({
        "po_id": po_id,
        "business_id": ctx.business_id,
        "status": POStatus.PENDING_APPROVAL.value,
        "deleted_at": None
    })

    if not po:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "PO_NOT_FOUND", "message": "Pending PO not found"}
        )

    await db.purchase_orders.update_one(
        {"po_id": po_id},
        {"$set": {
            "status": POStatus.APPROVED.value,
            "approved_by": current_user.user_id,
            "approved_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }}
    )

    updated = await db.purchase_orders.find_one({"po_id": po_id})
    distributor = await db.distributors.find_one({"distributor_id": updated["distributor_id"]})

    return SingleResponse(data=po_to_response(updated, distributor["name"] if distributor else None))


@router.post(
    "/{po_id}/send",
    response_model=SingleResponse[POResponse],
    summary="Mark PO as sent"
)
async def send_purchase_order(
    po_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Mark a PO as sent to distributor"""
    po = await db.purchase_orders.find_one({
        "po_id": po_id,
        "business_id": ctx.business_id,
        "status": {"$in": [POStatus.APPROVED.value, POStatus.DRAFT.value]},
        "deleted_at": None
    })

    if not po:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "PO_NOT_FOUND", "message": "Approved PO not found"}
        )

    await db.purchase_orders.update_one(
        {"po_id": po_id},
        {"$set": {
            "status": POStatus.SENT.value,
            "sent_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "updated_by": current_user.user_id
        }}
    )

    updated = await db.purchase_orders.find_one({"po_id": po_id})
    distributor = await db.distributors.find_one({"distributor_id": updated["distributor_id"]})

    logger.info(f"PO {po['po_number']} marked as sent")

    return SingleResponse(data=po_to_response(updated, distributor["name"] if distributor else None))


@router.post(
    "/{po_id}/receive",
    response_model=SingleResponse[POResponse],
    summary="Receive items on PO"
)
async def receive_items(
    po_id: str,
    receive: POReceive,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Receive items on a purchase order"""
    po = await db.purchase_orders.find_one({
        "po_id": po_id,
        "business_id": ctx.business_id,
        "status": {"$in": [POStatus.SENT.value, POStatus.PARTIAL.value]},
        "deleted_at": None
    })

    if not po:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "PO_NOT_FOUND", "message": "Sent or partial PO not found"}
        )

    # Update line items
    items = po.get("items", [])
    line_map = {item["line_id"]: item for item in items}

    for recv_item in receive.items:
        if recv_item.line_id not in line_map:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "LINE_NOT_FOUND", "message": f"Line item {recv_item.line_id} not found"}
            )

        line = line_map[recv_item.line_id]
        new_qty = line.get("quantity_received", 0) + recv_item.quantity
        max_qty = line.get("quantity_ordered", 0)

        if new_qty > max_qty:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "OVER_RECEIVE", "message": f"Cannot receive more than ordered for {line['part_number']}"}
            )

        line["quantity_received"] = new_qty

        # Update inventory if enabled
        if receive.update_inventory and line.get("inventory_item_id"):
            inv_item = await db.inventory.find_one({
                "item_id": line["inventory_item_id"],
                "business_id": ctx.business_id
            })

            if inv_item:
                qty_before = inv_item.get("quantity_on_hand", 0)
                qty_after = qty_before + recv_item.quantity
                unit_cost = line.get("unit_cost", 0)

                # Update with weighted average cost
                old_value = qty_before * inv_item.get("cost_per_unit", 0)
                new_value = recv_item.quantity * unit_cost
                new_avg_cost = (old_value + new_value) / qty_after if qty_after > 0 else unit_cost

                await db.inventory.update_one(
                    {"item_id": line["inventory_item_id"]},
                    {"$set": {
                        "quantity_on_hand": qty_after,
                        "quantity_available": qty_after - inv_item.get("quantity_reserved", 0),
                        "cost_per_unit": round(new_avg_cost, 2),
                        "last_cost": unit_cost,
                        "updated_at": datetime.utcnow()
                    }}
                )

                # Record transaction
                from app.routers.inventory import record_transaction
                await record_transaction(
                    db=db,
                    business_id=ctx.business_id,
                    item_id=line["inventory_item_id"],
                    transaction_type=TransactionType.RECEIVED,
                    quantity=recv_item.quantity,
                    user_id=current_user.user_id,
                    quantity_before=qty_before,
                    quantity_after=qty_after,
                    unit_cost=unit_cost,
                    po_id=po_id,
                    notes=f"Received on {po['po_number']}"
                )

    # Determine new status
    all_received = all(
        item.get("quantity_received", 0) >= item.get("quantity_ordered", 0)
        for item in items
    )

    new_status = POStatus.RECEIVED if all_received else POStatus.PARTIAL

    await db.purchase_orders.update_one(
        {"po_id": po_id},
        {"$set": {
            "items": items,
            "status": new_status.value,
            "received_at": datetime.utcnow() if all_received else None,
            "updated_at": datetime.utcnow(),
            "updated_by": current_user.user_id
        }}
    )

    updated = await db.purchase_orders.find_one({"po_id": po_id})
    distributor = await db.distributors.find_one({"distributor_id": updated["distributor_id"]})

    logger.info(f"Items received on PO {po['po_number']}")

    return SingleResponse(data=po_to_response(updated, distributor["name"] if distributor else None))


@router.post(
    "/{po_id}/cancel",
    response_model=MessageResponse,
    summary="Cancel purchase order"
)
async def cancel_purchase_order(
    po_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Cancel a purchase order"""
    result = await db.purchase_orders.update_one(
        {
            "po_id": po_id,
            "business_id": ctx.business_id,
            "status": {"$in": [POStatus.DRAFT.value, POStatus.PENDING_APPROVAL.value, POStatus.APPROVED.value]},
            "deleted_at": None
        },
        {
            "$set": {
                "status": POStatus.CANCELLED.value,
                "updated_at": datetime.utcnow(),
                "updated_by": current_user.user_id
            }
        }
    )

    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "PO_NOT_FOUND", "message": "PO not found or cannot be cancelled"}
        )

    return MessageResponse(message="Purchase order cancelled")


@router.delete(
    "/{po_id}",
    response_model=MessageResponse,
    summary="Delete purchase order"
)
async def delete_purchase_order(
    po_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Soft delete a draft purchase order"""
    result = await db.purchase_orders.update_one(
        {
            "po_id": po_id,
            "business_id": ctx.business_id,
            "status": POStatus.DRAFT.value,
            "deleted_at": None
        },
        {
            "$set": {
                "deleted_at": datetime.utcnow(),
                "updated_by": current_user.user_id
            }
        }
    )

    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "PO_NOT_FOUND", "message": "Draft PO not found"}
        )

    return MessageResponse(message="Purchase order deleted")


@router.get(
    "/{po_id}/pdf",
    summary="Download PO as PDF"
)
async def download_po_pdf(
    po_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Generate and download a PDF of the purchase order.

    Returns the PDF as a downloadable file.
    """
    # Get PO
    po = await db.purchase_orders.find_one({
        "po_id": po_id,
        "business_id": ctx.business_id,
        "deleted_at": None
    })

    if not po:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "PO_NOT_FOUND", "message": "Purchase order not found"}
        )

    # Get distributor
    distributor = await db.distributors.find_one({"distributor_id": po["distributor_id"]})
    if not distributor:
        distributor = {"name": "Unknown Distributor"}

    # Get business
    business = await db.businesses.find_one({"business_id": ctx.business_id})
    if not business:
        business = {"name": "Company"}

    # Generate PDF
    pdf_service = get_po_pdf_service()
    try:
        pdf_bytes = pdf_service.generate_po_pdf(po, distributor, business)
    except Exception as e:
        logger.error(f"PDF generation failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "PDF_ERROR", "message": "Failed to generate PDF"}
        )

    filename = f"{po['po_number']}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )


@router.post(
    "/{po_id}/email",
    response_model=SingleResponse[POEmailSentResponse],
    summary="Send PO via email"
)
async def email_purchase_order(
    po_id: str,
    request: POSendEmailRequest = POSendEmailRequest(),
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Send the purchase order as a PDF attachment via email.

    If no email is provided, sends to the distributor's email address.
    Also marks the PO as sent if it was in draft/approved status.
    """
    # Get PO
    po = await db.purchase_orders.find_one({
        "po_id": po_id,
        "business_id": ctx.business_id,
        "deleted_at": None
    })

    if not po:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "PO_NOT_FOUND", "message": "Purchase order not found"}
        )

    # Get distributor
    distributor = await db.distributors.find_one({"distributor_id": po["distributor_id"]})
    if not distributor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "DISTRIBUTOR_NOT_FOUND", "message": "Distributor not found"}
        )

    # Determine email recipient
    to_email = request.email or distributor.get("email")
    if not to_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "NO_EMAIL", "message": "No email address provided and distributor has no email on file"}
        )

    # Get business
    business = await db.businesses.find_one({"business_id": ctx.business_id})
    if not business:
        business = {"name": "Company", "email": "", "phone": ""}

    # Generate PDF
    pdf_service = get_po_pdf_service()
    try:
        pdf_bytes = pdf_service.generate_po_pdf(po, distributor, business)
    except Exception as e:
        logger.error(f"PDF generation failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "PDF_ERROR", "message": "Failed to generate PDF"}
        )

    # Prepare email content
    po_number = po.get("po_number", "")
    business_name = business.get("name", "")

    custom_message = ""
    if request.message:
        custom_message = f"<p>{request.message}</p>"

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Purchase Order {po_number}</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0;">Purchase Order</h1>
        </div>
        <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
            <p>Dear {distributor.get('contact_name', distributor.get('name', 'Supplier'))},</p>
            <p>Please find attached Purchase Order <strong>{po_number}</strong> from {business_name}.</p>
            {custom_message}
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p><strong>PO Number:</strong> {po_number}</p>
                <p><strong>Total:</strong> ${po.get('total', 0):,.2f}</p>
                <p><strong>Items:</strong> {len(po.get('items', []))} line items</p>
            </div>
            <p>Please confirm receipt of this order and provide expected delivery dates.</p>
            <p>If you have any questions, please contact us.</p>
            <p>Best regards,<br>{business_name}</p>
        </div>
        <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
            <p>Please reference PO # {po_number} on all correspondence and invoices.</p>
        </div>
    </body>
    </html>
    """

    text_content = f"""
Purchase Order {po_number}

Dear {distributor.get('contact_name', distributor.get('name', 'Supplier'))},

Please find attached Purchase Order {po_number} from {business_name}.

{request.message or ''}

PO Number: {po_number}
Total: ${po.get('total', 0):,.2f}
Items: {len(po.get('items', []))} line items

Please confirm receipt of this order and provide expected delivery dates.

Best regards,
{business_name}
    """

    # Prepare attachment
    pdf_base64 = base64.b64encode(pdf_bytes).decode('utf-8')
    attachments = [{
        "content": pdf_base64,
        "filename": f"{po_number}.pdf",
        "type": "application/pdf",
        "disposition": "attachment"
    }]

    # Send email
    email_service = get_email_service()
    result = await email_service.send_email(
        to_email=to_email,
        subject=f"Purchase Order {po_number} from {business_name}",
        html_content=html_content,
        text_content=text_content,
        to_name=distributor.get("contact_name"),
        attachments=attachments
    )

    if result.success:
        # Update PO status to sent if not already sent/received
        if po["status"] in [POStatus.DRAFT.value, POStatus.APPROVED.value]:
            await db.purchase_orders.update_one(
                {"po_id": po_id},
                {"$set": {
                    "status": POStatus.SENT.value,
                    "sent_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                    "updated_by": current_user.user_id
                }}
            )

        logger.info(f"PO {po_number} emailed to {to_email}")

        return SingleResponse(data=POEmailSentResponse(
            success=True,
            email_sent_to=to_email,
            message=f"Purchase order {po_number} sent successfully"
        ))
    else:
        logger.error(f"Failed to email PO {po_number}: {result.error}")

        return SingleResponse(data=POEmailSentResponse(
            success=False,
            email_sent_to=to_email,
            error=result.error or "Failed to send email"
        ))
