"""
Webhook Service
For managing webhook subscriptions and event delivery
"""

import hmac
import hashlib
import json
import logging
import asyncio
from datetime import datetime
from typing import Optional, List, Dict, Any
from motor.motor_asyncio import AsyncIOMotorDatabase
import httpx

from app.models.webhook import (
    WebhookSubscription, WebhookLog, WebhookEvent, WebhookPayload,
    DeliveryStatus, generate_webhook_secret
)
from app.models.common import generate_id

logger = logging.getLogger(__name__)


class WebhookService:
    """Service for managing webhooks and event delivery"""

    MAX_RETRIES = 3
    RETRY_DELAYS = [60, 300, 900]  # 1min, 5min, 15min
    MAX_CONSECUTIVE_FAILURES = 10

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    # Subscription Management

    async def create_subscription(
        self,
        business_id: str,
        url: str,
        events: List[WebhookEvent],
        name: Optional[str] = None,
        headers: Optional[Dict[str, str]] = None
    ) -> dict:
        """Create a new webhook subscription"""
        subscription = WebhookSubscription(
            business_id=business_id,
            name=name,
            url=url,
            events=events,
            headers=headers or {}
        )

        await self.db.webhook_subscriptions.insert_one(subscription.model_dump())
        return subscription.model_dump()

    async def get_subscription(
        self,
        subscription_id: str,
        business_id: str
    ) -> Optional[dict]:
        """Get a webhook subscription"""
        return await self.db.webhook_subscriptions.find_one({
            "subscription_id": subscription_id,
            "business_id": business_id
        })

    async def list_subscriptions(
        self,
        business_id: str,
        is_active: Optional[bool] = None
    ) -> List[dict]:
        """List webhook subscriptions for a business"""
        query = {"business_id": business_id}
        if is_active is not None:
            query["is_active"] = is_active

        return await self.db.webhook_subscriptions.find(query).to_list(length=100)

    async def update_subscription(
        self,
        subscription_id: str,
        business_id: str,
        updates: dict
    ) -> Optional[dict]:
        """Update a webhook subscription"""
        allowed_fields = ["name", "url", "events", "is_active", "headers"]
        update_data = {
            k: v for k, v in updates.items()
            if k in allowed_fields and v is not None
        }
        update_data["updated_at"] = datetime.utcnow()

        result = await self.db.webhook_subscriptions.find_one_and_update(
            {"subscription_id": subscription_id, "business_id": business_id},
            {"$set": update_data},
            return_document=True
        )

        return result

    async def delete_subscription(
        self,
        subscription_id: str,
        business_id: str
    ) -> bool:
        """Delete a webhook subscription"""
        result = await self.db.webhook_subscriptions.delete_one({
            "subscription_id": subscription_id,
            "business_id": business_id
        })

        if result.deleted_count > 0:
            # Also delete logs
            await self.db.webhook_logs.delete_many({
                "subscription_id": subscription_id
            })
            return True

        return False

    async def regenerate_secret(
        self,
        subscription_id: str,
        business_id: str
    ) -> Optional[str]:
        """Regenerate webhook signing secret"""
        new_secret = generate_webhook_secret()

        result = await self.db.webhook_subscriptions.update_one(
            {"subscription_id": subscription_id, "business_id": business_id},
            {"$set": {"secret": new_secret, "updated_at": datetime.utcnow()}}
        )

        if result.modified_count > 0:
            return new_secret

        return None

    # Event Dispatch

    async def dispatch_event(
        self,
        business_id: str,
        event: WebhookEvent,
        data: Dict[str, Any]
    ) -> int:
        """
        Dispatch an event to all matching webhook subscriptions.

        Returns the number of webhooks triggered.
        """
        # Find active subscriptions for this event
        subscriptions = await self.db.webhook_subscriptions.find({
            "business_id": business_id,
            "is_active": True,
            "auto_disabled": False,
            "events": event.value
        }).to_list(length=50)

        if not subscriptions:
            return 0

        # Create payload
        payload = WebhookPayload(
            id=generate_id("evt"),
            event=event,
            created_at=datetime.utcnow(),
            business_id=business_id,
            data=data,
            idempotency_key=generate_id("idk")
        )

        # Dispatch to each subscription (non-blocking)
        for subscription in subscriptions:
            asyncio.create_task(
                self._deliver_webhook(subscription, payload)
            )

        return len(subscriptions)

    async def _deliver_webhook(
        self,
        subscription: dict,
        payload: WebhookPayload
    ) -> None:
        """Deliver webhook to a subscription (with retries)"""
        log = WebhookLog(
            subscription_id=subscription["subscription_id"],
            business_id=subscription["business_id"],
            event=payload.event,
            payload=payload.model_dump(mode="json")
        )

        await self.db.webhook_logs.insert_one(log.model_dump())

        success = await self._attempt_delivery(subscription, payload, log.log_id)

        if not success:
            # Schedule retries
            for i, delay in enumerate(self.RETRY_DELAYS):
                await asyncio.sleep(delay)

                # Update attempt count
                await self.db.webhook_logs.update_one(
                    {"log_id": log.log_id},
                    {"$inc": {"attempt_count": 1}, "$set": {"status": DeliveryStatus.RETRYING.value}}
                )

                if await self._attempt_delivery(subscription, payload, log.log_id):
                    break

    async def _attempt_delivery(
        self,
        subscription: dict,
        payload: WebhookPayload,
        log_id: str
    ) -> bool:
        """Attempt to deliver webhook"""
        url = subscription["url"]
        secret = subscription["secret"]
        custom_headers = subscription.get("headers", {})

        # Prepare payload
        payload_json = json.dumps(payload.model_dump(mode="json"), default=str)

        # Create signature
        signature = self._create_signature(payload_json, secret)

        headers = {
            "Content-Type": "application/json",
            "User-Agent": "TheWorx-Webhook/1.0",
            "X-Webhook-ID": payload.id,
            "X-Webhook-Event": payload.event.value,
            "X-Webhook-Signature": signature,
            "X-Webhook-Timestamp": str(int(payload.created_at.timestamp())),
            **custom_headers
        }

        start_time = datetime.utcnow()

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    url,
                    content=payload_json,
                    headers=headers
                )

            response_time_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)

            # Success if 2xx status
            success = 200 <= response.status_code < 300

            # Update log
            await self.db.webhook_logs.update_one(
                {"log_id": log_id},
                {"$set": {
                    "status": DeliveryStatus.SUCCESS.value if success else DeliveryStatus.FAILED.value,
                    "response_status": response.status_code,
                    "response_body": response.text[:1000],
                    "response_time_ms": response_time_ms,
                    "delivered_at": datetime.utcnow() if success else None
                }}
            )

            # Update subscription stats
            if success:
                await self.db.webhook_subscriptions.update_one(
                    {"subscription_id": subscription["subscription_id"]},
                    {"$set": {
                        "last_triggered": datetime.utcnow(),
                        "consecutive_failures": 0
                    }}
                )
            else:
                await self._handle_failure(subscription)

            return success

        except Exception as e:
            response_time_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)

            await self.db.webhook_logs.update_one(
                {"log_id": log_id},
                {"$set": {
                    "status": DeliveryStatus.FAILED.value,
                    "error": str(e)[:500],
                    "response_time_ms": response_time_ms
                }}
            )

            await self._handle_failure(subscription)
            return False

    async def _handle_failure(self, subscription: dict) -> None:
        """Handle webhook delivery failure"""
        consecutive = subscription.get("consecutive_failures", 0) + 1

        update = {
            "$inc": {"failure_count": 1, "consecutive_failures": 1}
        }

        # Auto-disable after too many failures
        if consecutive >= self.MAX_CONSECUTIVE_FAILURES:
            update["$set"] = {
                "auto_disabled": True,
                "auto_disabled_at": datetime.utcnow(),
                "is_active": False
            }
            logger.warning(
                f"Webhook {subscription['subscription_id']} auto-disabled after "
                f"{consecutive} consecutive failures"
            )

        await self.db.webhook_subscriptions.update_one(
            {"subscription_id": subscription["subscription_id"]},
            update
        )

    def _create_signature(self, payload: str, secret: str) -> str:
        """Create HMAC signature for webhook payload"""
        return hmac.new(
            secret.encode(),
            payload.encode(),
            hashlib.sha256
        ).hexdigest()

    def verify_signature(
        self,
        payload: str,
        signature: str,
        secret: str
    ) -> bool:
        """Verify webhook signature"""
        expected = self._create_signature(payload, secret)
        return hmac.compare_digest(expected, signature)

    # Testing

    async def test_webhook(
        self,
        subscription_id: str,
        business_id: str
    ) -> Dict[str, Any]:
        """Send a test event to a webhook"""
        subscription = await self.get_subscription(subscription_id, business_id)

        if not subscription:
            return {"delivered": False, "error": "Subscription not found"}

        # Create test payload
        payload = WebhookPayload(
            id=generate_id("test"),
            event=WebhookEvent.JOB_CREATED,
            created_at=datetime.utcnow(),
            business_id=business_id,
            data={
                "test": True,
                "message": "This is a test webhook event"
            }
        )

        url = subscription["url"]
        secret = subscription["secret"]
        custom_headers = subscription.get("headers", {})

        payload_json = json.dumps(payload.model_dump(mode="json"), default=str)
        signature = self._create_signature(payload_json, secret)

        headers = {
            "Content-Type": "application/json",
            "User-Agent": "TheWorx-Webhook/1.0",
            "X-Webhook-ID": payload.id,
            "X-Webhook-Event": payload.event.value,
            "X-Webhook-Signature": signature,
            "X-Webhook-Test": "true",
            **custom_headers
        }

        start_time = datetime.utcnow()

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    url,
                    content=payload_json,
                    headers=headers
                )

            response_time_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)

            return {
                "delivered": 200 <= response.status_code < 300,
                "response_status": response.status_code,
                "response_body": response.text[:500],
                "response_time_ms": response_time_ms
            }

        except Exception as e:
            return {
                "delivered": False,
                "error": str(e)
            }

    # Logs

    async def get_logs(
        self,
        subscription_id: str,
        business_id: str,
        limit: int = 50
    ) -> List[dict]:
        """Get webhook delivery logs"""
        return await self.db.webhook_logs.find({
            "subscription_id": subscription_id,
            "business_id": business_id
        }).sort("created_at", -1).limit(limit).to_list(length=limit)

    async def get_stats(
        self,
        subscription_id: str,
        business_id: str
    ) -> Dict[str, Any]:
        """Get webhook delivery statistics"""
        pipeline = [
            {
                "$match": {
                    "subscription_id": subscription_id,
                    "business_id": business_id
                }
            },
            {
                "$group": {
                    "_id": "$status",
                    "count": {"$sum": 1},
                    "avg_response_time": {"$avg": "$response_time_ms"}
                }
            }
        ]

        results = await self.db.webhook_logs.aggregate(pipeline).to_list(length=10)

        stats = {
            "total_deliveries": 0,
            "successful": 0,
            "failed": 0,
            "success_rate": 0.0,
            "avg_response_time_ms": None
        }

        total_time = 0
        count_with_time = 0

        for item in results:
            count = item["count"]
            stats["total_deliveries"] += count

            if item["_id"] == DeliveryStatus.SUCCESS.value:
                stats["successful"] = count
                if item["avg_response_time"]:
                    total_time += item["avg_response_time"] * count
                    count_with_time += count
            else:
                stats["failed"] += count

        if stats["total_deliveries"] > 0:
            stats["success_rate"] = round(
                stats["successful"] / stats["total_deliveries"] * 100,
                2
            )

        if count_with_time > 0:
            stats["avg_response_time_ms"] = round(total_time / count_with_time)

        return stats

    # Re-enable disabled webhooks

    async def re_enable(
        self,
        subscription_id: str,
        business_id: str
    ) -> bool:
        """Re-enable an auto-disabled webhook"""
        result = await self.db.webhook_subscriptions.update_one(
            {
                "subscription_id": subscription_id,
                "business_id": business_id,
                "auto_disabled": True
            },
            {"$set": {
                "is_active": True,
                "auto_disabled": False,
                "auto_disabled_at": None,
                "consecutive_failures": 0,
                "updated_at": datetime.utcnow()
            }}
        )

        return result.modified_count > 0


# Event dispatch helpers for use throughout the application

async def emit_job_created(db: AsyncIOMotorDatabase, job: dict) -> None:
    """Emit job.created event"""
    service = WebhookService(db)
    await service.dispatch_event(
        job["business_id"],
        WebhookEvent.JOB_CREATED,
        {"job_id": job.get("quote_id"), "job": _sanitize_for_webhook(job)}
    )


async def emit_job_status_changed(
    db: AsyncIOMotorDatabase,
    job: dict,
    old_status: str,
    new_status: str
) -> None:
    """Emit job.status_changed event"""
    service = WebhookService(db)
    await service.dispatch_event(
        job["business_id"],
        WebhookEvent.JOB_STATUS_CHANGED,
        {
            "job_id": job.get("quote_id"),
            "old_status": old_status,
            "new_status": new_status,
            "job": _sanitize_for_webhook(job)
        }
    )

    # Also emit completed if applicable
    if new_status == "completed":
        await service.dispatch_event(
            job["business_id"],
            WebhookEvent.JOB_COMPLETED,
            {"job_id": job.get("quote_id"), "job": _sanitize_for_webhook(job)}
        )


async def emit_customer_created(db: AsyncIOMotorDatabase, customer: dict) -> None:
    """Emit customer.created event"""
    service = WebhookService(db)
    await service.dispatch_event(
        customer["business_id"],
        WebhookEvent.CUSTOMER_CREATED,
        {"customer_id": customer.get("client_id"), "customer": _sanitize_for_webhook(customer)}
    )


async def emit_appointment_scheduled(db: AsyncIOMotorDatabase, appointment: dict) -> None:
    """Emit appointment.scheduled event"""
    service = WebhookService(db)
    await service.dispatch_event(
        appointment["business_id"],
        WebhookEvent.APPOINTMENT_SCHEDULED,
        {"appointment_id": appointment.get("appointment_id"), "appointment": _sanitize_for_webhook(appointment)}
    )


async def emit_invoice_created(db: AsyncIOMotorDatabase, invoice: dict) -> None:
    """Emit invoice.created event"""
    service = WebhookService(db)
    await service.dispatch_event(
        invoice["business_id"],
        WebhookEvent.INVOICE_CREATED,
        {"invoice_id": invoice.get("invoice_id"), "invoice": _sanitize_for_webhook(invoice)}
    )


async def emit_payment_received(db: AsyncIOMotorDatabase, payment: dict) -> None:
    """Emit payment.received event"""
    service = WebhookService(db)
    await service.dispatch_event(
        payment["business_id"],
        WebhookEvent.PAYMENT_RECEIVED,
        {"payment_id": payment.get("payment_id"), "payment": _sanitize_for_webhook(payment)}
    )


def _sanitize_for_webhook(data: dict) -> dict:
    """Remove sensitive fields before sending in webhook"""
    sensitive_fields = ["password", "token", "secret", "api_key", "credentials"]
    sanitized = {}

    for key, value in data.items():
        if key.startswith("_"):
            continue
        if key.lower() in sensitive_fields:
            continue
        if isinstance(value, dict):
            sanitized[key] = _sanitize_for_webhook(value)
        elif isinstance(value, datetime):
            sanitized[key] = value.isoformat()
        else:
            sanitized[key] = value

    return sanitized
