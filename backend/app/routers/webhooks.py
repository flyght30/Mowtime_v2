"""
Webhooks Router
For managing webhook subscriptions and viewing delivery logs
"""

import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_database
from app.models.user import User
from app.models.webhook import (
    WebhookEvent, WebhookCreate, WebhookUpdate,
    WebhookResponse, WebhookLogResponse, WebhookTestResult, WebhookStats
)
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
