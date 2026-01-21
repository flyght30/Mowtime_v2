"""
Payments API Router
Stripe payments and invoicing
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, Request, Header
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional

from app.database import get_database
from app.models.payment import (
    Invoice, InvoiceCreate, InvoiceResponse, InvoiceStatus,
    Payment, PaymentCreate, PaymentResponse, PaymentStatus,
    LineItemCreate
)
from app.models.user import User
from app.middleware.auth import BusinessContext, get_business_context, get_current_user
from app.services.payment_service import PaymentService, PaymentError
from app.schemas.common import (
    PaginatedResponse, SingleResponse, MessageResponse,
    create_pagination_meta
)

router = APIRouter()


def get_payment_service(
    db: AsyncIOMotorDatabase = Depends(get_database)
) -> PaymentService:
    """Get payment service instance"""
    return PaymentService(db)


# ==================== Invoice Endpoints ====================

@router.get(
    "/invoices",
    response_model=PaginatedResponse[InvoiceResponse],
    summary="List invoices"
)
async def list_invoices(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    invoice_status: Optional[InvoiceStatus] = Query(None, alias="status"),
    client_id: Optional[str] = None,
    ctx: BusinessContext = Depends(get_business_context),
    service: PaymentService = Depends(get_payment_service)
):
    """List invoices for the current business"""
    invoices, total = await service.get_invoices(
        ctx.business_id,
        page,
        per_page,
        invoice_status,
        client_id
    )

    meta = create_pagination_meta(total, page, per_page)
    return PaginatedResponse(data=invoices, meta=meta)


@router.post(
    "/invoices",
    response_model=SingleResponse[InvoiceResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create invoice"
)
async def create_invoice(
    data: InvoiceCreate,
    ctx: BusinessContext = Depends(get_business_context),
    service: PaymentService = Depends(get_payment_service),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Create a new invoice"""
    # Verify client exists
    client = await db.clients.find_one({
        "client_id": data.client_id,
        "business_id": ctx.business_id,
        "deleted_at": None
    })

    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CLIENT_NOT_FOUND", "message": "Client not found"}
        )

    invoice = await service.create_invoice(ctx.business_id, data)

    return SingleResponse(data=InvoiceResponse(**invoice.model_dump()))


@router.get(
    "/invoices/{invoice_id}",
    response_model=SingleResponse[InvoiceResponse],
    summary="Get invoice by ID"
)
async def get_invoice(
    invoice_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    service: PaymentService = Depends(get_payment_service)
):
    """Get invoice details by ID"""
    invoice = await service.get_invoice(invoice_id, ctx.business_id)

    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "INVOICE_NOT_FOUND", "message": "Invoice not found"}
        )

    return SingleResponse(data=InvoiceResponse(**invoice.model_dump()))


@router.post(
    "/invoices/{invoice_id}/line-items",
    response_model=SingleResponse[InvoiceResponse],
    summary="Add line item to invoice"
)
async def add_invoice_line_item(
    invoice_id: str,
    data: LineItemCreate,
    ctx: BusinessContext = Depends(get_business_context),
    service: PaymentService = Depends(get_payment_service)
):
    """Add a line item to an invoice"""
    try:
        invoice = await service.add_line_item(invoice_id, ctx.business_id, data)
        return SingleResponse(data=InvoiceResponse(**invoice.model_dump()))
    except PaymentError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "ADD_LINE_ITEM_ERROR", "message": str(e)}
        )


@router.post(
    "/invoices/{invoice_id}/finalize",
    response_model=SingleResponse[InvoiceResponse],
    summary="Finalize invoice"
)
async def finalize_invoice(
    invoice_id: str,
    send_to_stripe: bool = Query(True, description="Create invoice in Stripe"),
    ctx: BusinessContext = Depends(get_business_context),
    service: PaymentService = Depends(get_payment_service)
):
    """Finalize an invoice and optionally send to Stripe"""
    try:
        invoice = await service.finalize_invoice(
            invoice_id, ctx.business_id, send_to_stripe
        )
        return SingleResponse(data=InvoiceResponse(**invoice.model_dump()))
    except PaymentError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "FINALIZE_ERROR", "message": str(e)}
        )


@router.post(
    "/invoices/{invoice_id}/void",
    response_model=SingleResponse[InvoiceResponse],
    summary="Void invoice"
)
async def void_invoice(
    invoice_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    service: PaymentService = Depends(get_payment_service)
):
    """Void an invoice"""
    try:
        invoice = await service.void_invoice(invoice_id, ctx.business_id)
        return SingleResponse(data=InvoiceResponse(**invoice.model_dump()))
    except PaymentError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "VOID_ERROR", "message": str(e)}
        )


# ==================== Payment Endpoints ====================

@router.get(
    "/payments",
    response_model=PaginatedResponse[PaymentResponse],
    summary="List payments"
)
async def list_payments(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    payment_status: Optional[PaymentStatus] = Query(None, alias="status"),
    client_id: Optional[str] = None,
    ctx: BusinessContext = Depends(get_business_context),
    service: PaymentService = Depends(get_payment_service)
):
    """List payments for the current business"""
    payments, total = await service.get_payments(
        ctx.business_id,
        page,
        per_page,
        payment_status,
        client_id
    )

    meta = create_pagination_meta(total, page, per_page)
    return PaginatedResponse(data=payments, meta=meta)


@router.get(
    "/payments/stats",
    summary="Get payment statistics"
)
async def get_payment_stats(
    ctx: BusinessContext = Depends(get_business_context),
    service: PaymentService = Depends(get_payment_service)
):
    """Get payment statistics for the business"""
    stats = await service.get_payment_stats(ctx.business_id)

    return {
        "success": True,
        "data": stats
    }


@router.post(
    "/payments/intent",
    summary="Create payment intent"
)
async def create_payment_intent(
    data: PaymentCreate,
    ctx: BusinessContext = Depends(get_business_context),
    service: PaymentService = Depends(get_payment_service)
):
    """
    Create a Stripe PaymentIntent for client-side payment processing.
    Returns a client_secret for use with Stripe.js.
    """
    if not service.is_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "STRIPE_NOT_CONFIGURED", "message": "Payment service not configured"}
        )

    try:
        result = await service.create_payment_intent(ctx.business_id, data)
        return {
            "success": True,
            "data": result
        }
    except PaymentError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "PAYMENT_ERROR", "message": str(e)}
        )


@router.post(
    "/payments/{payment_id}/refund",
    response_model=SingleResponse[PaymentResponse],
    summary="Refund payment"
)
async def refund_payment(
    payment_id: str,
    amount: Optional[int] = Query(None, description="Partial refund amount in cents"),
    reason: Optional[str] = Query(None, description="Refund reason"),
    ctx: BusinessContext = Depends(get_business_context),
    service: PaymentService = Depends(get_payment_service),
    current_user: User = Depends(get_current_user)
):
    """Refund a payment (full or partial)"""
    if current_user.role not in ["owner", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "INSUFFICIENT_PERMISSIONS", "message": "Admin access required"}
        )

    try:
        payment = await service.refund_payment(
            payment_id, ctx.business_id, amount, reason
        )
        return SingleResponse(data=PaymentResponse(**payment.model_dump()))
    except PaymentError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "REFUND_ERROR", "message": str(e)}
        )


# ==================== Webhook Endpoints ====================

@router.post(
    "/webhook/stripe",
    summary="Stripe webhook handler"
)
async def handle_stripe_webhook(
    request: Request,
    stripe_signature: str = Header(..., alias="Stripe-Signature"),
    service: PaymentService = Depends(get_payment_service)
):
    """
    Handle Stripe webhook events.
    This endpoint should be registered in your Stripe dashboard.
    """
    try:
        payload = await request.body()
        result = await service.process_webhook(payload, stripe_signature)
        return result
    except PaymentError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "WEBHOOK_ERROR", "message": str(e)}
        )


# ==================== Configuration Endpoints ====================

@router.get(
    "/config/status",
    summary="Check payment configuration"
)
async def get_payment_config_status(
    current_user: User = Depends(get_current_user),
    service: PaymentService = Depends(get_payment_service)
):
    """Check if Stripe is properly configured"""
    return {
        "success": True,
        "data": {
            "stripe_configured": service.is_configured,
            "webhook_configured": bool(service.webhook_secret)
        }
    }


@router.post(
    "/invoices/from-appointment/{appointment_id}",
    response_model=SingleResponse[InvoiceResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create invoice from appointment"
)
async def create_invoice_from_appointment(
    appointment_id: str,
    due_days: int = Query(30, ge=1, le=90, description="Days until due"),
    ctx: BusinessContext = Depends(get_business_context),
    service: PaymentService = Depends(get_payment_service),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Create an invoice from a completed appointment"""
    from datetime import date, timedelta

    # Get appointment
    appointment = await db.appointments.find_one({
        "appointment_id": appointment_id,
        "business_id": ctx.business_id,
        "deleted_at": None
    })

    if not appointment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "APPOINTMENT_NOT_FOUND", "message": "Appointment not found"}
        )

    # Get service details
    service_doc = await db.services.find_one({
        "service_id": appointment.get("service_id"),
        "business_id": ctx.business_id
    })

    today = date.today()
    due_date = today + timedelta(days=due_days)

    # Create invoice
    invoice_data = InvoiceCreate(
        client_id=appointment["client_id"],
        issue_date=today.isoformat(),
        due_date=due_date.isoformat(),
        appointment_ids=[appointment_id]
    )

    invoice = await service.create_invoice(ctx.business_id, invoice_data)

    # Add line item from service
    if service_doc:
        line_item = LineItemCreate(
            description=service_doc.get("name", "Service"),
            unit_price=service_doc.get("base_price", 0),
            quantity=1,
            service_id=service_doc["service_id"],
            appointment_id=appointment_id
        )
        invoice = await service.add_line_item(
            invoice.invoice_id, ctx.business_id, line_item
        )

    return SingleResponse(data=InvoiceResponse(**invoice.model_dump()))


@router.get(
    "/clients/{client_id}/balance",
    summary="Get client balance"
)
async def get_client_balance(
    client_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get outstanding balance for a client"""
    # Get unpaid invoices
    pipeline = [
        {
            "$match": {
                "business_id": ctx.business_id,
                "client_id": client_id,
                "status": {"$in": [
                    InvoiceStatus.OPEN.value,
                    InvoiceStatus.OVERDUE.value
                ]},
                "deleted_at": None
            }
        },
        {
            "$group": {
                "_id": None,
                "total_due": {"$sum": "$amount_due"},
                "invoice_count": {"$sum": 1}
            }
        }
    ]

    cursor = db.invoices.aggregate(pipeline)
    results = await cursor.to_list(length=1)

    if results:
        balance = results[0]
    else:
        balance = {"total_due": 0, "invoice_count": 0}

    return {
        "success": True,
        "data": {
            "client_id": client_id,
            "outstanding_balance": balance.get("total_due", 0),
            "unpaid_invoices": balance.get("invoice_count", 0)
        }
    }
