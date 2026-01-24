"""
Webhooks Router
For managing webhook subscriptions and viewing delivery logs
"""

import hmac
import hashlib
import json
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request, Header
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_database
from app.models.user import User
from app.models.webhook import (
    WebhookEvent, WebhookCreate, WebhookUpdate,
    WebhookResponse, WebhookLogResponse, WebhookTestResult, WebhookStats,
    InboundWebhookConfig, generate_webhook_secret
)
from app.models.common import generate_id
from app.middleware.auth import BusinessContext, get_business_context, get_current_user
from app.schemas.common import SingleResponse, ListResponse, MessageResponse
from app.services.webhook_service import WebhookService

router = APIRouter()
logger = logging.getLogger(__name__)


def subscription_to_response(subscription: dict) -> WebhookResponse:
    """Convert subscription to API response"""
    return WebhookResponse(
        subscription_id=subscription["subscription_id"],
        business_id=subscription["business_id"],
        name=subscription.get("name"),
        url=subscription["url"],
        events=subscription["events"],
        secret=subscription["secret"],
        is_active=subscription.get("is_active", True),
        last_triggered=subscription.get("last_triggered"),
        failure_count=subscription.get("failure_count", 0),
        consecutive_failures=subscription.get("consecutive_failures", 0),
        auto_disabled=subscription.get("auto_disabled", False),
        created_at=subscription["created_at"],
        updated_at=subscription["updated_at"]
    )


@router.get(
    "",
    response_model=ListResponse[WebhookResponse],
    summary="List webhooks"
)
async def list_webhooks(
    is_active: Optional[bool] = None,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """List all webhook subscriptions for the business"""
    service = WebhookService(db)
    subscriptions = await service.list_subscriptions(ctx.business_id, is_active)

    return ListResponse(
        data=[subscription_to_response(s) for s in subscriptions],
        meta={"available_events": [e.value for e in WebhookEvent]}
    )


@router.post(
    "",
    response_model=SingleResponse[WebhookResponse],
    summary="Create webhook"
)
async def create_webhook(
    request: WebhookCreate,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Create a new webhook subscription"""
    service = WebhookService(db)

    subscription = await service.create_subscription(
        business_id=ctx.business_id,
        url=request.url,
        events=request.events,
        name=request.name,
        headers=request.headers
    )

    logger.info(f"Webhook created for business {ctx.business_id}: {subscription['subscription_id']}")

    return SingleResponse(data=subscription_to_response(subscription))


@router.get(
    "/{subscription_id}",
    response_model=SingleResponse[WebhookResponse],
    summary="Get webhook"
)
async def get_webhook(
    subscription_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get a specific webhook subscription"""
    service = WebhookService(db)
    subscription = await service.get_subscription(subscription_id, ctx.business_id)

    if not subscription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "WEBHOOK_NOT_FOUND", "message": "Webhook not found"}
        )

    return SingleResponse(data=subscription_to_response(subscription))


@router.put(
    "/{subscription_id}",
    response_model=SingleResponse[WebhookResponse],
    summary="Update webhook"
)
async def update_webhook(
    subscription_id: str,
    request: WebhookUpdate,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Update a webhook subscription"""
    service = WebhookService(db)

    updated = await service.update_subscription(
        subscription_id,
        ctx.business_id,
        request.model_dump(exclude_none=True)
    )

    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "WEBHOOK_NOT_FOUND", "message": "Webhook not found"}
        )

    return SingleResponse(data=subscription_to_response(updated))


@router.delete(
    "/{subscription_id}",
    response_model=MessageResponse,
    summary="Delete webhook"
)
async def delete_webhook(
    subscription_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Delete a webhook subscription"""
    service = WebhookService(db)
    deleted = await service.delete_subscription(subscription_id, ctx.business_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "WEBHOOK_NOT_FOUND", "message": "Webhook not found"}
        )

    return MessageResponse(message="Webhook deleted successfully")


@router.post(
    "/{subscription_id}/test",
    response_model=SingleResponse[WebhookTestResult],
    summary="Test webhook"
)
async def test_webhook(
    subscription_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Send a test event to a webhook"""
    service = WebhookService(db)
    result = await service.test_webhook(subscription_id, ctx.business_id)

    return SingleResponse(data=WebhookTestResult(**result))


@router.post(
    "/{subscription_id}/regenerate-secret",
    response_model=SingleResponse[dict],
    summary="Regenerate webhook secret"
)
async def regenerate_secret(
    subscription_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Regenerate the signing secret for a webhook"""
    service = WebhookService(db)
    new_secret = await service.regenerate_secret(subscription_id, ctx.business_id)

    if not new_secret:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "WEBHOOK_NOT_FOUND", "message": "Webhook not found"}
        )

    return SingleResponse(data={"secret": new_secret})


@router.post(
    "/{subscription_id}/re-enable",
    response_model=MessageResponse,
    summary="Re-enable auto-disabled webhook"
)
async def re_enable_webhook(
    subscription_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Re-enable a webhook that was auto-disabled due to failures"""
    service = WebhookService(db)
    success = await service.re_enable(subscription_id, ctx.business_id)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "NOT_DISABLED", "message": "Webhook is not auto-disabled or not found"}
        )

    return MessageResponse(message="Webhook re-enabled successfully")


@router.get(
    "/{subscription_id}/logs",
    response_model=ListResponse[WebhookLogResponse],
    summary="Get webhook logs"
)
async def get_webhook_logs(
    subscription_id: str,
    limit: int = Query(50, ge=1, le=200),
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get delivery logs for a webhook"""
    service = WebhookService(db)

    # Verify subscription exists
    subscription = await service.get_subscription(subscription_id, ctx.business_id)
    if not subscription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "WEBHOOK_NOT_FOUND", "message": "Webhook not found"}
        )

    logs = await service.get_logs(subscription_id, ctx.business_id, limit)

    return ListResponse(
        data=[
            WebhookLogResponse(
                log_id=log["log_id"],
                event=log["event"],
                status=log["status"],
                attempt_count=log.get("attempt_count", 1),
                response_status=log.get("response_status"),
                response_time_ms=log.get("response_time_ms"),
                error=log.get("error"),
                created_at=log["created_at"],
                delivered_at=log.get("delivered_at")
            )
            for log in logs
        ]
    )


@router.get(
    "/{subscription_id}/stats",
    response_model=SingleResponse[WebhookStats],
    summary="Get webhook statistics"
)
async def get_webhook_stats(
    subscription_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get delivery statistics for a webhook"""
    service = WebhookService(db)

    # Verify subscription exists
    subscription = await service.get_subscription(subscription_id, ctx.business_id)
    if not subscription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "WEBHOOK_NOT_FOUND", "message": "Webhook not found"}
        )

    stats = await service.get_stats(subscription_id, ctx.business_id)

    return SingleResponse(data=WebhookStats(**stats))


# Available events endpoint
@router.get(
    "/events/available",
    response_model=SingleResponse[dict],
    summary="Get available webhook events"
)
async def get_available_events():
    """Get list of available webhook events"""
    events = {}

    # Group events by category
    for event in WebhookEvent:
        category = event.value.split(".")[0]
        if category not in events:
            events[category] = []
        events[category].append({
            "event": event.value,
            "description": event.name.replace("_", " ").title()
        })

    return SingleResponse(data={"events": events})


# ========== Inbound Webhook Endpoints ==========
# For receiving webhooks from external services

class InboundWebhookCreate(BaseModel):
    """Create inbound webhook configuration"""
    provider: str  # e.g., "zapier", "typeform", "custom"
    name: Optional[str] = None


class InboundWebhookResponse(BaseModel):
    """Inbound webhook configuration response"""
    config_id: str
    provider: str
    endpoint_url: str
    secret: str
    is_active: bool
    created_at: datetime


class CreateJobFromWebhook(BaseModel):
    """Create job from webhook payload"""
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    job_type: Optional[str] = "service"
    notes: Optional[str] = None
    source: Optional[str] = None


class CreateCustomerFromWebhook(BaseModel):
    """Create customer from webhook payload"""
    first_name: str
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    source: Optional[str] = None


@router.get(
    "/inbound",
    response_model=ListResponse[InboundWebhookResponse],
    summary="List inbound webhook configs"
)
async def list_inbound_webhooks(
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """List all inbound webhook configurations for the business"""
    configs = await db.inbound_webhook_configs.find({
        "business_id": ctx.business_id
    }).to_list(length=50)

    return ListResponse(
        data=[
            InboundWebhookResponse(
                config_id=c["config_id"],
                provider=c["provider"],
                endpoint_url=f"/api/v1/webhooks/inbound/{c['endpoint_path']}",
                secret=c["secret"],
                is_active=c.get("is_active", True),
                created_at=c["created_at"]
            )
            for c in configs
        ]
    )


@router.post(
    "/inbound",
    response_model=SingleResponse[InboundWebhookResponse],
    summary="Create inbound webhook config"
)
async def create_inbound_webhook(
    request: InboundWebhookCreate,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Create a new inbound webhook configuration"""
    import secrets as sec

    endpoint_path = f"{ctx.business_id[:8]}_{sec.token_urlsafe(8)}"

    config = InboundWebhookConfig(
        business_id=ctx.business_id,
        provider=request.provider,
        endpoint_path=endpoint_path
    )

    await db.inbound_webhook_configs.insert_one(config.model_dump())

    logger.info(f"Inbound webhook created for business {ctx.business_id}: {config.config_id}")

    return SingleResponse(data=InboundWebhookResponse(
        config_id=config.config_id,
        provider=config.provider,
        endpoint_url=f"/api/v1/webhooks/inbound/{endpoint_path}",
        secret=config.secret,
        is_active=config.is_active,
        created_at=config.created_at
    ))


@router.delete(
    "/inbound/{config_id}",
    response_model=MessageResponse,
    summary="Delete inbound webhook config"
)
async def delete_inbound_webhook(
    config_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Delete an inbound webhook configuration"""
    result = await db.inbound_webhook_configs.delete_one({
        "config_id": config_id,
        "business_id": ctx.business_id
    })

    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CONFIG_NOT_FOUND", "message": "Inbound webhook config not found"}
        )

    return MessageResponse(message="Inbound webhook config deleted")


@router.post(
    "/inbound/{endpoint_path}",
    summary="Receive inbound webhook"
)
async def receive_inbound_webhook(
    endpoint_path: str,
    request: Request,
    x_webhook_signature: Optional[str] = Header(None),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Receive and process an inbound webhook.

    This endpoint is called by external services (Zapier, forms, CRM, etc.)
    to create jobs or customers in the system.
    """
    # Find the config
    config = await db.inbound_webhook_configs.find_one({
        "endpoint_path": endpoint_path,
        "is_active": True
    })

    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "ENDPOINT_NOT_FOUND", "message": "Webhook endpoint not found"}
        )

    # Get payload
    try:
        body = await request.body()
        payload = json.loads(body) if body else {}
    except json.JSONDecodeError:
        payload = {}

    # Verify signature if provided
    if x_webhook_signature:
        expected = hmac.new(
            config["secret"].encode(),
            body,
            hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(expected, x_webhook_signature):
            logger.warning(f"Invalid webhook signature for {endpoint_path}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "INVALID_SIGNATURE", "message": "Invalid webhook signature"}
            )

    # Log the webhook
    log = {
        "log_id": generate_id("iwl"),
        "config_id": config["config_id"],
        "business_id": config["business_id"],
        "provider": config["provider"],
        "event_type": payload.get("event_type") or payload.get("type"),
        "payload": payload,
        "signature_valid": True,
        "processed": False,
        "created_at": datetime.utcnow()
    }

    await db.inbound_webhook_logs.insert_one(log)

    # Process the webhook based on action type
    action = payload.get("action") or payload.get("type") or "create_job"
    result = {}

    try:
        if action in ["create_job", "new_job", "job"]:
            result = await _create_job_from_webhook(db, config["business_id"], payload)
        elif action in ["create_customer", "new_customer", "customer", "lead"]:
            result = await _create_customer_from_webhook(db, config["business_id"], payload)
        else:
            # Default to creating a job
            result = await _create_job_from_webhook(db, config["business_id"], payload)

        # Mark as processed
        await db.inbound_webhook_logs.update_one(
            {"log_id": log["log_id"]},
            {"$set": {"processed": True}}
        )

    except Exception as e:
        await db.inbound_webhook_logs.update_one(
            {"log_id": log["log_id"]},
            {"$set": {"error": str(e)}}
        )
        logger.error(f"Error processing inbound webhook: {str(e)}")

    return {"received": True, "log_id": log["log_id"], **result}


async def _create_job_from_webhook(
    db: AsyncIOMotorDatabase,
    business_id: str,
    payload: Dict[str, Any]
) -> Dict[str, Any]:
    """Create a job from webhook payload"""
    # Extract customer info
    customer_name = payload.get("customer_name") or payload.get("name") or ""
    customer_email = payload.get("customer_email") or payload.get("email")
    customer_phone = payload.get("customer_phone") or payload.get("phone")

    # Split name if provided as single field
    name_parts = customer_name.split(" ", 1)
    first_name = name_parts[0] if name_parts else ""
    last_name = name_parts[1] if len(name_parts) > 1 else ""

    # Find or create customer
    customer_id = None
    if customer_email or customer_phone:
        # Try to find existing customer
        query = {"business_id": business_id, "deleted_at": None}
        if customer_email:
            query["email"] = customer_email
        elif customer_phone:
            query["phone"] = customer_phone

        existing = await db.clients.find_one(query)

        if existing:
            customer_id = existing["client_id"]
        else:
            # Create new customer
            customer = {
                "client_id": generate_id("cli"),
                "business_id": business_id,
                "first_name": first_name,
                "last_name": last_name,
                "email": customer_email,
                "phone": customer_phone,
                "address": payload.get("address"),
                "city": payload.get("city"),
                "state": payload.get("state"),
                "zip_code": payload.get("zip_code") or payload.get("zip"),
                "source": payload.get("source") or "webhook",
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
            await db.clients.insert_one(customer)
            customer_id = customer["client_id"]

    # Create job
    job = {
        "quote_id": generate_id("job"),
        "business_id": business_id,
        "client_id": customer_id,
        "property": {
            "address": payload.get("address") or "",
            "city": payload.get("city") or "",
            "state": payload.get("state") or "",
            "zip_code": payload.get("zip_code") or payload.get("zip") or ""
        },
        "job_type": payload.get("job_type") or "service",
        "status": "pending",
        "notes": payload.get("notes") or payload.get("description") or payload.get("message"),
        "source": payload.get("source") or "webhook",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }

    await db.hvac_quotes.insert_one(job)

    logger.info(f"Job {job['quote_id']} created from webhook for business {business_id}")

    return {"job_id": job["quote_id"], "customer_id": customer_id}


async def _create_customer_from_webhook(
    db: AsyncIOMotorDatabase,
    business_id: str,
    payload: Dict[str, Any]
) -> Dict[str, Any]:
    """Create a customer from webhook payload"""
    # Handle name
    name = payload.get("name") or ""
    first_name = payload.get("first_name") or (name.split(" ")[0] if name else "")
    last_name = payload.get("last_name") or (" ".join(name.split(" ")[1:]) if " " in name else "")

    email = payload.get("email")
    phone = payload.get("phone")

    # Check for existing customer
    if email or phone:
        query = {"business_id": business_id, "deleted_at": None}
        if email:
            query["email"] = email

        existing = await db.clients.find_one(query)
        if existing:
            return {"customer_id": existing["client_id"], "existing": True}

    # Create customer
    customer = {
        "client_id": generate_id("cli"),
        "business_id": business_id,
        "first_name": first_name,
        "last_name": last_name,
        "email": email,
        "phone": phone,
        "company": payload.get("company"),
        "address": payload.get("address"),
        "city": payload.get("city"),
        "state": payload.get("state"),
        "zip_code": payload.get("zip_code") or payload.get("zip"),
        "source": payload.get("source") or "webhook",
        "notes": payload.get("notes"),
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }

    await db.clients.insert_one(customer)

    logger.info(f"Customer {customer['client_id']} created from webhook for business {business_id}")

    return {"customer_id": customer["client_id"], "existing": False}
