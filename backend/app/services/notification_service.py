"""
Notification Service
Orchestrates all notification channels (SMS, Push, Email)
"""

import logging
from datetime import datetime, timedelta
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.notification import (
    Notification, NotificationCreate, NotificationResponse,
    NotificationType, NotificationStatus, NotificationCategory
)
from app.models.common import utc_now
from app.services.sms_service import SMSService, get_sms_service
from app.services.push_service import PushService, get_push_service
from app.services.email_service import EmailService, get_email_service

logger = logging.getLogger(__name__)


class NotificationService:
    """
    Notification orchestration service.
    Handles queueing, sending, and tracking of all notifications.
    """

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.sms = get_sms_service()
        self.push = get_push_service()
        self.email = get_email_service()

    async def create_notification(
        self,
        business_id: str,
        data: NotificationCreate,
        recipient_name: Optional[str] = None
    ) -> Notification:
        """
        Create and queue a notification

        Args:
            business_id: Business ID
            data: Notification creation data
            recipient_name: Optional recipient name for personalization

        Returns:
            Created notification
        """
        notification = Notification(
            business_id=business_id,
            recipient_name=recipient_name,
            **data.model_dump()
        )

        # Set provider based on type
        if notification.type == NotificationType.SMS:
            notification.provider = "twilio"
        elif notification.type == NotificationType.PUSH:
            notification.provider = "firebase"
        elif notification.type == NotificationType.EMAIL:
            notification.provider = "sendgrid"

        await self.db.notifications.insert_one(notification.model_dump())

        return notification

    async def send_notification(self, notification_id: str) -> dict:
        """
        Send a single notification immediately

        Args:
            notification_id: Notification ID to send

        Returns:
            Result dict with success status
        """
        notification = await self.db.notifications.find_one({
            "notification_id": notification_id,
            "deleted_at": None
        })

        if not notification:
            return {"success": False, "error": "Notification not found"}

        notification_obj = Notification(**notification)

        # Mark as sending
        notification_obj.mark_sending()
        await self._update_notification(notification_obj)

        # Send based on type
        result = await self._dispatch_notification(notification_obj)

        # Update status based on result
        if result["success"]:
            notification_obj.mark_sent(result.get("message_id"))
        else:
            notification_obj.mark_failed(result.get("error", "Unknown error"))

            # Schedule retry if allowed
            if notification_obj.can_retry():
                notification_obj.schedule_retry()

        await self._update_notification(notification_obj)

        return result

    async def _dispatch_notification(self, notification: Notification) -> dict:
        """Dispatch notification to appropriate channel"""

        if notification.type == NotificationType.SMS:
            result = await self.sms.send_sms(
                to_number=notification.recipient_contact,
                message=notification.message
            )
            return {
                "success": result.success,
                "message_id": result.message_id,
                "error": result.error
            }

        elif notification.type == NotificationType.PUSH:
            result = await self.push.send_push(
                device_token=notification.recipient_contact,
                title=notification.subject or "ServicePro",
                body=notification.message,
                data={
                    "notification_id": notification.notification_id,
                    "category": notification.category.value,
                    "appointment_id": notification.appointment_id
                } if notification.appointment_id else None
            )
            return {
                "success": result.success,
                "message_id": result.message_id,
                "error": result.error
            }

        elif notification.type == NotificationType.EMAIL:
            result = await self.email.send_email(
                to_email=notification.recipient_contact,
                subject=notification.subject or "Notification from ServicePro",
                html_content=self._format_email_html(notification),
                text_content=notification.message,
                to_name=notification.recipient_name
            )
            return {
                "success": result.success,
                "message_id": result.message_id,
                "error": result.error
            }

        else:
            return {"success": False, "error": f"Unsupported type: {notification.type}"}

    def _format_email_html(self, notification: Notification) -> str:
        """Format notification message as HTML email"""
        return f"""
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #4CAF50; color: white; padding: 20px; text-align: center;">
        <h2>{notification.subject or "ServicePro Notification"}</h2>
    </div>
    <div style="padding: 20px; background-color: #f9f9f9;">
        <p>{notification.message}</p>
    </div>
</body>
</html>
"""

    async def _update_notification(self, notification: Notification) -> None:
        """Update notification in database"""
        await self.db.notifications.update_one(
            {"notification_id": notification.notification_id},
            {"$set": notification.model_dump(exclude={"_id"})}
        )

    async def process_pending_notifications(
        self,
        business_id: Optional[str] = None,
        limit: int = 100
    ) -> dict:
        """
        Process pending notifications (background job)

        Args:
            business_id: Optional business filter
            limit: Max notifications to process

        Returns:
            Processing results
        """
        query = {
            "status": {"$in": [
                NotificationStatus.PENDING.value,
                NotificationStatus.SCHEDULED.value
            ]},
            "deleted_at": None,
            "$or": [
                {"scheduled_at": None},
                {"scheduled_at": {"$lte": utc_now()}}
            ]
        }

        if business_id:
            query["business_id"] = business_id

        # Get pending notifications, prioritized
        cursor = self.db.notifications.find(query).sort([
            ("priority", 1),
            ("created_at", 1)
        ]).limit(limit)

        notifications = await cursor.to_list(length=limit)

        sent = 0
        failed = 0
        retried = 0

        for doc in notifications:
            result = await self.send_notification(doc["notification_id"])

            if result["success"]:
                sent += 1
            elif doc.get("retry_count", 0) < doc.get("max_retries", 3):
                retried += 1
            else:
                failed += 1

        return {
            "processed": len(notifications),
            "sent": sent,
            "failed": failed,
            "retried": retried
        }

    async def schedule_appointment_reminders(
        self,
        business_id: str,
        hours_before: int = 24
    ) -> int:
        """
        Create reminder notifications for upcoming appointments

        Args:
            business_id: Business ID
            hours_before: Hours before appointment to send reminder

        Returns:
            Number of reminders scheduled
        """
        # Find appointments that need reminders
        reminder_window_start = utc_now() + timedelta(hours=hours_before - 1)
        reminder_window_end = utc_now() + timedelta(hours=hours_before + 1)

        appointments = await self.db.appointments.find({
            "business_id": business_id,
            "status": {"$in": ["scheduled", "confirmed"]},
            "deleted_at": None,
            "scheduled_date": {
                "$gte": reminder_window_start.date().isoformat(),
                "$lte": reminder_window_end.date().isoformat()
            }
        }).to_list(length=100)

        created = 0

        for appt in appointments:
            # Check if reminder already exists
            existing = await self.db.notifications.find_one({
                "appointment_id": appt["appointment_id"],
                "category": NotificationCategory.APPOINTMENT_REMINDER.value,
                "deleted_at": None
            })

            if existing:
                continue

            # Get client info
            client = await self.db.clients.find_one({
                "client_id": appt["client_id"]
            })

            if not client:
                continue

            # Get service name
            service = await self.db.services.find_one({
                "service_id": appt.get("service_id")
            })
            service_name = service.get("name", "your appointment") if service else "your appointment"

            # Create SMS reminder if phone available
            if client.get("phone"):
                sms_notification = Notification(
                    business_id=business_id,
                    recipient_type="client",
                    recipient_id=client["client_id"],
                    recipient_name=f"{client.get('first_name', '')} {client.get('last_name', '')}".strip(),
                    recipient_contact=client["phone"],
                    type=NotificationType.SMS,
                    category=NotificationCategory.APPOINTMENT_REMINDER,
                    message=f"Reminder: Your {service_name} appointment is tomorrow at {appt.get('start_time', 'scheduled time')}.",
                    appointment_id=appt["appointment_id"],
                    provider="twilio"
                )
                await self.db.notifications.insert_one(sms_notification.model_dump())
                created += 1

            # Create email reminder if email available
            if client.get("email"):
                email_notification = Notification(
                    business_id=business_id,
                    recipient_type="client",
                    recipient_id=client["client_id"],
                    recipient_name=f"{client.get('first_name', '')} {client.get('last_name', '')}".strip(),
                    recipient_contact=client["email"],
                    type=NotificationType.EMAIL,
                    category=NotificationCategory.APPOINTMENT_REMINDER,
                    subject=f"Reminder: Your {service_name} appointment",
                    message=f"Your appointment is scheduled for {appt['scheduled_date']} at {appt.get('start_time', 'scheduled time')}.",
                    appointment_id=appt["appointment_id"],
                    provider="sendgrid"
                )
                await self.db.notifications.insert_one(email_notification.model_dump())
                created += 1

        return created

    async def send_appointment_confirmation(
        self,
        business_id: str,
        appointment_id: str
    ) -> dict:
        """
        Send confirmation notifications for a new appointment

        Args:
            business_id: Business ID
            appointment_id: Appointment ID

        Returns:
            Results for each channel
        """
        # Get appointment
        appointment = await self.db.appointments.find_one({
            "appointment_id": appointment_id,
            "business_id": business_id
        })

        if not appointment:
            return {"error": "Appointment not found"}

        # Get client
        client = await self.db.clients.find_one({
            "client_id": appointment["client_id"]
        })

        if not client:
            return {"error": "Client not found"}

        # Get business
        business = await self.db.businesses.find_one({
            "business_id": business_id
        })
        business_name = business.get("name", "ServicePro") if business else "ServicePro"

        # Get service
        service = await self.db.services.find_one({
            "service_id": appointment.get("service_id")
        })
        service_name = service.get("name", "Service") if service else "Service"

        client_name = f"{client.get('first_name', '')} {client.get('last_name', '')}".strip() or "Valued Customer"
        date_str = appointment.get("scheduled_date", "")
        time_str = appointment.get("start_time", "")

        results = {}

        # Send SMS confirmation
        if client.get("phone"):
            sms_result = await self.sms.send_appointment_confirmation(
                to_number=client["phone"],
                client_name=client_name,
                date=date_str,
                time=time_str,
                service_name=service_name,
                business_name=business_name
            )
            results["sms"] = {
                "success": sms_result.success,
                "error": sms_result.error
            }

            # Track notification
            notification = Notification(
                business_id=business_id,
                recipient_type="client",
                recipient_id=client["client_id"],
                recipient_name=client_name,
                recipient_contact=client["phone"],
                type=NotificationType.SMS,
                category=NotificationCategory.APPOINTMENT_CONFIRMATION,
                message=f"Appointment confirmed for {date_str} at {time_str}",
                appointment_id=appointment_id,
                status=NotificationStatus.SENT if sms_result.success else NotificationStatus.FAILED,
                sent_at=utc_now() if sms_result.success else None,
                provider="twilio",
                provider_message_id=sms_result.message_id,
                error_message=sms_result.error
            )
            await self.db.notifications.insert_one(notification.model_dump())

        # Send email confirmation
        if client.get("email"):
            email_result = await self.email.send_appointment_confirmation(
                to_email=client["email"],
                client_name=client_name,
                date=date_str,
                time=time_str,
                service_name=service_name,
                business_name=business_name,
                appointment_id=appointment_id
            )
            results["email"] = {
                "success": email_result.success,
                "error": email_result.error
            }

            # Track notification
            notification = Notification(
                business_id=business_id,
                recipient_type="client",
                recipient_id=client["client_id"],
                recipient_name=client_name,
                recipient_contact=client["email"],
                type=NotificationType.EMAIL,
                category=NotificationCategory.APPOINTMENT_CONFIRMATION,
                subject=f"Appointment Confirmed - {service_name}",
                message=f"Appointment confirmed for {date_str} at {time_str}",
                appointment_id=appointment_id,
                status=NotificationStatus.SENT if email_result.success else NotificationStatus.FAILED,
                sent_at=utc_now() if email_result.success else None,
                provider="sendgrid",
                provider_message_id=email_result.message_id,
                error_message=email_result.error
            )
            await self.db.notifications.insert_one(notification.model_dump())

        return results

    async def get_notifications(
        self,
        business_id: str,
        page: int = 1,
        per_page: int = 20,
        status_filter: Optional[NotificationStatus] = None,
        type_filter: Optional[NotificationType] = None
    ) -> tuple[list[NotificationResponse], int]:
        """Get paginated notifications for a business"""
        query = {
            "business_id": business_id,
            "deleted_at": None
        }

        if status_filter:
            query["status"] = status_filter.value

        if type_filter:
            query["type"] = type_filter.value

        total = await self.db.notifications.count_documents(query)
        skip = (page - 1) * per_page

        cursor = self.db.notifications.find(query).sort(
            "created_at", -1
        ).skip(skip).limit(per_page)

        docs = await cursor.to_list(length=per_page)
        notifications = [NotificationResponse(**doc) for doc in docs]

        return notifications, total

    async def get_notification_stats(self, business_id: str) -> dict:
        """Get notification statistics for a business"""
        pipeline = [
            {"$match": {"business_id": business_id, "deleted_at": None}},
            {"$group": {
                "_id": {
                    "status": "$status",
                    "type": "$type"
                },
                "count": {"$sum": 1}
            }}
        ]

        cursor = self.db.notifications.aggregate(pipeline)
        results = await cursor.to_list(length=100)

        stats = {
            "total": 0,
            "by_status": {},
            "by_type": {}
        }

        for r in results:
            count = r["count"]
            status = r["_id"]["status"]
            n_type = r["_id"]["type"]

            stats["total"] += count
            stats["by_status"][status] = stats["by_status"].get(status, 0) + count
            stats["by_type"][n_type] = stats["by_type"].get(n_type, 0) + count

        return stats
