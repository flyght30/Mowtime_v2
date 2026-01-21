"""
Notifications API Router
SMS, Push, and Email notification management
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional

from app.database import get_database
from app.models.notification import (
    Notification, NotificationCreate, NotificationResponse,
    NotificationType, NotificationStatus, NotificationCategory
)
from app.models.common import utc_now
from app.middleware.auth import BusinessContext, get_business_context, get_current_user
from app.models.user import User
from app.services.notification_service import NotificationService
from app.schemas.common import (
    PaginatedResponse, SingleResponse, MessageResponse,
    create_pagination_meta
)

router = APIRouter()


def get_notification_service(
    db: AsyncIOMotorDatabase = Depends(get_database)
) -> NotificationService:
    """Get notification service instance"""
    return NotificationService(db)


@router.get(
    "",
    response_model=PaginatedResponse[NotificationResponse],
    summary="List notifications"
)
async def list_notifications(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    notification_status: Optional[NotificationStatus] = Query(None, alias="status"),
    notification_type: Optional[NotificationType] = Query(None, alias="type"),
    ctx: BusinessContext = Depends(get_business_context),
    service: NotificationService = Depends(get_notification_service)
):
    """List notifications for the current business"""
    notifications, total = await service.get_notifications(
        ctx.business_id,
        page,
        per_page,
        notification_status,
        notification_type
    )

    meta = create_pagination_meta(total, page, per_page)
    return PaginatedResponse(data=notifications, meta=meta)


@router.get(
    "/stats",
    summary="Get notification statistics"
)
async def get_notification_stats(
    ctx: BusinessContext = Depends(get_business_context),
    service: NotificationService = Depends(get_notification_service)
):
    """Get notification statistics for the business"""
    stats = await service.get_notification_stats(ctx.business_id)

    return {
        "success": True,
        "data": stats
    }


@router.post(
    "",
    response_model=SingleResponse[NotificationResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create notification"
)
async def create_notification(
    data: NotificationCreate,
    background_tasks: BackgroundTasks,
    send_now: bool = Query(False, description="Send immediately instead of queuing"),
    ctx: BusinessContext = Depends(get_business_context),
    service: NotificationService = Depends(get_notification_service)
):
    """Create and optionally send a notification"""
    # Get recipient name if available
    recipient_name = None
    if data.recipient_type == "client":
        db = service.db
        client = await db.clients.find_one({"client_id": data.recipient_id})
        if client:
            recipient_name = f"{client.get('first_name', '')} {client.get('last_name', '')}".strip()

    notification = await service.create_notification(
        ctx.business_id,
        data,
        recipient_name
    )

    if send_now:
        # Send in background to return quickly
        background_tasks.add_task(
            service.send_notification,
            notification.notification_id
        )

    return SingleResponse(data=NotificationResponse(**notification.model_dump()))


@router.post(
    "/{notification_id}/send",
    summary="Send a queued notification"
)
async def send_notification(
    notification_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    service: NotificationService = Depends(get_notification_service),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Send a specific queued notification"""
    # Verify notification belongs to business
    notification = await db.notifications.find_one({
        "notification_id": notification_id,
        "business_id": ctx.business_id,
        "deleted_at": None
    })

    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOTIFICATION_NOT_FOUND", "message": "Notification not found"}
        )

    if notification["status"] in [
        NotificationStatus.SENT.value,
        NotificationStatus.DELIVERED.value
    ]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "ALREADY_SENT", "message": "Notification has already been sent"}
        )

    result = await service.send_notification(notification_id)

    return {
        "success": result.get("success", False),
        "data": {
            "notification_id": notification_id,
            "message_id": result.get("message_id"),
            "error": result.get("error")
        }
    }


@router.post(
    "/process-queue",
    summary="Process pending notifications"
)
async def process_notification_queue(
    limit: int = Query(100, ge=1, le=500),
    ctx: BusinessContext = Depends(get_business_context),
    service: NotificationService = Depends(get_notification_service),
    current_user: User = Depends(get_current_user)
):
    """
    Process pending notifications in the queue.
    This endpoint is meant to be called by a cron job or scheduler.
    """
    # Require admin role for queue processing
    if current_user.role not in ["owner", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "INSUFFICIENT_PERMISSIONS", "message": "Admin access required"}
        )

    results = await service.process_pending_notifications(ctx.business_id, limit)

    return {
        "success": True,
        "data": results
    }


@router.post(
    "/schedule-reminders",
    summary="Schedule appointment reminders"
)
async def schedule_appointment_reminders(
    hours_before: int = Query(24, ge=1, le=168),
    ctx: BusinessContext = Depends(get_business_context),
    service: NotificationService = Depends(get_notification_service),
    current_user: User = Depends(get_current_user)
):
    """
    Create reminder notifications for upcoming appointments.
    This endpoint is meant to be called by a cron job or scheduler.
    """
    if current_user.role not in ["owner", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "INSUFFICIENT_PERMISSIONS", "message": "Admin access required"}
        )

    created = await service.schedule_appointment_reminders(
        ctx.business_id,
        hours_before
    )

    return {
        "success": True,
        "data": {
            "reminders_scheduled": created,
            "hours_before_appointment": hours_before
        }
    }


@router.post(
    "/appointment/{appointment_id}/confirm",
    summary="Send appointment confirmation"
)
async def send_appointment_confirmation(
    appointment_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    service: NotificationService = Depends(get_notification_service)
):
    """Send confirmation notifications for an appointment"""
    results = await service.send_appointment_confirmation(
        ctx.business_id,
        appointment_id
    )

    if "error" in results:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": results["error"]}
        )

    return {
        "success": True,
        "data": {
            "appointment_id": appointment_id,
            "channels": results
        }
    }


@router.get(
    "/{notification_id}",
    response_model=SingleResponse[NotificationResponse],
    summary="Get notification by ID"
)
async def get_notification(
    notification_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get notification details by ID"""
    doc = await db.notifications.find_one({
        "notification_id": notification_id,
        "business_id": ctx.business_id,
        "deleted_at": None
    })

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOTIFICATION_NOT_FOUND", "message": "Notification not found"}
        )

    return SingleResponse(data=NotificationResponse(**doc))


@router.delete(
    "/{notification_id}",
    response_model=MessageResponse,
    summary="Cancel notification"
)
async def cancel_notification(
    notification_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Cancel a pending notification"""
    # Check if notification exists and is pending
    notification = await db.notifications.find_one({
        "notification_id": notification_id,
        "business_id": ctx.business_id,
        "deleted_at": None
    })

    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOTIFICATION_NOT_FOUND", "message": "Notification not found"}
        )

    if notification["status"] not in [
        NotificationStatus.PENDING.value,
        NotificationStatus.SCHEDULED.value
    ]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "CANNOT_CANCEL",
                "message": f"Cannot cancel notification with status: {notification['status']}"
            }
        )

    await db.notifications.update_one(
        {"notification_id": notification_id},
        {"$set": {
            "status": NotificationStatus.CANCELED.value,
            "updated_at": utc_now()
        }}
    )

    return MessageResponse(message="Notification canceled successfully")


@router.post(
    "/bulk",
    summary="Create bulk notifications"
)
async def create_bulk_notifications(
    notifications: list[NotificationCreate],
    background_tasks: BackgroundTasks,
    send_now: bool = Query(False, description="Send immediately"),
    ctx: BusinessContext = Depends(get_business_context),
    service: NotificationService = Depends(get_notification_service)
):
    """Create multiple notifications at once"""
    if len(notifications) > 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "TOO_MANY", "message": "Maximum 100 notifications per request"}
        )

    created_ids = []

    for data in notifications:
        notification = await service.create_notification(ctx.business_id, data)
        created_ids.append(notification.notification_id)

        if send_now:
            background_tasks.add_task(
                service.send_notification,
                notification.notification_id
            )

    return {
        "success": True,
        "data": {
            "created": len(created_ids),
            "notification_ids": created_ids,
            "sending": send_now
        }
    }


@router.post(
    "/test/sms",
    summary="Test SMS configuration"
)
async def test_sms_configuration(
    phone: str = Query(..., description="Phone number to test"),
    current_user: User = Depends(get_current_user),
    service: NotificationService = Depends(get_notification_service)
):
    """Send a test SMS to verify configuration"""
    if current_user.role not in ["owner", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "INSUFFICIENT_PERMISSIONS", "message": "Admin access required"}
        )

    if not service.sms.is_configured:
        return {
            "success": False,
            "error": "SMS service not configured. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER."
        }

    result = await service.sms.send_sms(
        to_number=phone,
        message="This is a test message from ServicePro. Your SMS configuration is working correctly!"
    )

    return {
        "success": result.success,
        "message_id": result.message_id,
        "error": result.error
    }


@router.post(
    "/test/email",
    summary="Test email configuration"
)
async def test_email_configuration(
    email: str = Query(..., description="Email address to test"),
    current_user: User = Depends(get_current_user),
    service: NotificationService = Depends(get_notification_service)
):
    """Send a test email to verify configuration"""
    if current_user.role not in ["owner", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "INSUFFICIENT_PERMISSIONS", "message": "Admin access required"}
        )

    if not service.email.is_configured:
        return {
            "success": False,
            "error": "Email service not configured. Please set SENDGRID_API_KEY."
        }

    result = await service.email.send_email(
        to_email=email,
        subject="Test Email from ServicePro",
        html_content="<h1>Test Email</h1><p>Your email configuration is working correctly!</p>",
        text_content="Test Email: Your email configuration is working correctly!"
    )

    return {
        "success": result.success,
        "message_id": result.message_id,
        "error": result.error
    }


@router.get(
    "/recipient/{recipient_id}/history",
    summary="Get notification history for a recipient"
)
async def get_recipient_notification_history(
    recipient_id: str,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get notification history for a specific recipient (client/staff)"""
    query = {
        "business_id": ctx.business_id,
        "recipient_id": recipient_id,
        "deleted_at": None
    }

    total = await db.notifications.count_documents(query)
    skip = (page - 1) * per_page

    cursor = db.notifications.find(query).sort(
        "created_at", -1
    ).skip(skip).limit(per_page)

    docs = await cursor.to_list(length=per_page)
    notifications = [NotificationResponse(**doc) for doc in docs]

    meta = create_pagination_meta(total, page, per_page)

    return PaginatedResponse(data=notifications, meta=meta)
