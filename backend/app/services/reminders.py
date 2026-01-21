"""
SMS Appointment Reminders Service
Automated reminders using Twilio SMS
"""

import os
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any
from motor.motor_asyncio import AsyncIOMotorDatabase
from twilio.rest import Client as TwilioClient
from twilio.base.exceptions import TwilioRestException
import uuid

logger = logging.getLogger(__name__)

# Twilio configuration
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER", "")


class RemindersService:
    """Service for automated SMS appointment reminders"""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.twilio_client = None

        if TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN:
            try:
                self.twilio_client = TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
            except Exception as e:
                logger.error(f"Failed to initialize Twilio client: {e}")

    # ============== Reminder Settings ==============

    async def get_reminder_settings(self, business_id: str) -> Dict[str, Any]:
        """Get reminder settings for a business"""
        settings = await self.db.reminder_settings.find_one({"business_id": business_id})

        if not settings:
            # Return default settings
            return {
                "business_id": business_id,
                "enabled": True,
                "reminder_24h_enabled": True,
                "reminder_2h_enabled": True,
                "reminder_24h_template": "Reminder: Your {service} appointment is tomorrow at {time}. Reply CONFIRM or RESCHEDULE.",
                "reminder_2h_template": "Your technician {staff_name} is on the way. ETA: {eta}. Reply if you need to reschedule.",
                "allow_replies": True,
            }

        return settings

    async def update_reminder_settings(
        self,
        business_id: str,
        settings: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Update reminder settings for a business"""
        settings["business_id"] = business_id
        settings["updated_at"] = datetime.utcnow()

        await self.db.reminder_settings.update_one(
            {"business_id": business_id},
            {"$set": settings},
            upsert=True
        )

        return await self.get_reminder_settings(business_id)

    # ============== Send SMS ==============

    async def send_sms(
        self,
        to_phone: str,
        message: str,
        business_id: str,
        appointment_id: Optional[str] = None,
        reminder_type: str = "manual"
    ) -> Dict[str, Any]:
        """Send an SMS message and log it"""
        if not self.twilio_client:
            logger.error("Twilio client not initialized")
            return {"success": False, "error": "SMS service not configured"}

        # Clean phone number
        clean_phone = self._clean_phone_number(to_phone)
        if not clean_phone:
            return {"success": False, "error": "Invalid phone number"}

        try:
            # Send via Twilio
            twilio_message = self.twilio_client.messages.create(
                body=message,
                from_=TWILIO_PHONE_NUMBER,
                to=clean_phone
            )

            # Log the reminder
            log_entry = {
                "log_id": str(uuid.uuid4()),
                "business_id": business_id,
                "appointment_id": appointment_id,
                "to_phone": clean_phone,
                "message": message,
                "reminder_type": reminder_type,
                "twilio_sid": twilio_message.sid,
                "status": twilio_message.status,
                "sent_at": datetime.utcnow(),
                "delivered_at": None,
                "error": None,
            }

            await self.db.reminder_logs.insert_one(log_entry)

            return {
                "success": True,
                "message_sid": twilio_message.sid,
                "status": twilio_message.status
            }

        except TwilioRestException as e:
            logger.error(f"Twilio error: {e}")

            # Log failed attempt
            log_entry = {
                "log_id": str(uuid.uuid4()),
                "business_id": business_id,
                "appointment_id": appointment_id,
                "to_phone": clean_phone,
                "message": message,
                "reminder_type": reminder_type,
                "twilio_sid": None,
                "status": "failed",
                "sent_at": datetime.utcnow(),
                "error": str(e),
            }
            await self.db.reminder_logs.insert_one(log_entry)

            return {"success": False, "error": str(e)}

    def _clean_phone_number(self, phone: str) -> Optional[str]:
        """Clean and format phone number for Twilio"""
        if not phone:
            return None

        # Remove non-digit characters
        digits = ''.join(filter(str.isdigit, phone))

        # Add US country code if not present
        if len(digits) == 10:
            digits = '1' + digits

        if len(digits) == 11 and digits.startswith('1'):
            return '+' + digits

        # Return as-is if already formatted
        if phone.startswith('+'):
            return phone

        return None

    # ============== Reminder Templates ==============

    def format_24h_reminder(
        self,
        template: str,
        appointment: Dict,
        client: Dict,
        business: Dict
    ) -> str:
        """Format 24-hour reminder message"""
        service_names = ", ".join(
            s.get("service_name", "service") for s in appointment.get("services", [])
        ) or "service"

        return template.format(
            service=service_names,
            time=appointment.get("scheduled_time", ""),
            date=appointment.get("scheduled_date", ""),
            client_name=f"{client.get('first_name', '')} {client.get('last_name', '')}".strip(),
            business_name=business.get("name", ""),
            address=self._format_address(appointment.get("address") or client.get("address", {})),
        )

    def format_2h_reminder(
        self,
        template: str,
        appointment: Dict,
        client: Dict,
        staff: Optional[Dict],
        eta: str
    ) -> str:
        """Format 2-hour/on-the-way reminder message"""
        staff_name = "Your technician"
        if staff:
            staff_name = f"{staff.get('first_name', '')} {staff.get('last_name', '')}".strip()

        return template.format(
            staff_name=staff_name,
            eta=eta,
            time=appointment.get("scheduled_time", ""),
            service=", ".join(s.get("service_name", "") for s in appointment.get("services", [])),
        )

    def _format_address(self, address: Dict) -> str:
        """Format address dict to string"""
        if not address:
            return ""

        parts = []
        if address.get("street"):
            parts.append(address["street"])
        if address.get("city"):
            parts.append(address["city"])
        if address.get("state"):
            parts[-1] = f"{parts[-1]}, {address['state']}" if parts else address["state"]

        return ", ".join(parts)

    # ============== Automated Reminders ==============

    async def send_24h_reminders(self, business_id: Optional[str] = None) -> Dict[str, int]:
        """Send reminders for appointments 24 hours out"""
        # Calculate time window (23-25 hours from now)
        now = datetime.utcnow()
        tomorrow = now + timedelta(hours=24)
        tomorrow_date = tomorrow.strftime("%Y-%m-%d")

        # Build query
        query = {
            "scheduled_date": tomorrow_date,
            "status": {"$in": ["scheduled", "confirmed"]},
            "deleted_at": None,
        }

        if business_id:
            query["business_id"] = business_id

        appointments = await self.db.appointments.find(query).to_list(length=500)

        stats = {"sent": 0, "failed": 0, "skipped": 0}

        for apt in appointments:
            apt_business_id = apt.get("business_id")

            # Check if reminders are enabled for this business
            settings = await self.get_reminder_settings(apt_business_id)
            if not settings.get("enabled") or not settings.get("reminder_24h_enabled"):
                stats["skipped"] += 1
                continue

            # Check if reminder already sent
            existing = await self.db.reminder_logs.find_one({
                "appointment_id": apt.get("appointment_id"),
                "reminder_type": "24h",
                "status": {"$ne": "failed"}
            })

            if existing:
                stats["skipped"] += 1
                continue

            # Get client
            client = await self.db.clients.find_one({"client_id": apt.get("client_id")})
            if not client or not client.get("phone"):
                stats["skipped"] += 1
                continue

            # Get business
            business = await self.db.businesses.find_one({"business_id": apt_business_id})
            if not business:
                stats["skipped"] += 1
                continue

            # Format and send message
            template = settings.get("reminder_24h_template", "Reminder: Your appointment is tomorrow at {time}.")
            message = self.format_24h_reminder(template, apt, client, business)

            result = await self.send_sms(
                to_phone=client["phone"],
                message=message,
                business_id=apt_business_id,
                appointment_id=apt.get("appointment_id"),
                reminder_type="24h"
            )

            if result.get("success"):
                stats["sent"] += 1
            else:
                stats["failed"] += 1

        return stats

    async def send_2h_reminders(self, business_id: Optional[str] = None) -> Dict[str, int]:
        """Send reminders for appointments 2 hours out"""
        now = datetime.utcnow()
        target_time = now + timedelta(hours=2)
        target_date = target_time.strftime("%Y-%m-%d")
        target_hour = target_time.strftime("%H")

        # Query appointments in the 2-hour window
        query = {
            "scheduled_date": target_date,
            "status": {"$in": ["scheduled", "confirmed"]},
            "deleted_at": None,
        }

        if business_id:
            query["business_id"] = business_id

        appointments = await self.db.appointments.find(query).to_list(length=500)

        stats = {"sent": 0, "failed": 0, "skipped": 0}

        for apt in appointments:
            # Check if scheduled time is within window
            scheduled_time = apt.get("scheduled_time", "")
            if not scheduled_time:
                continue

            try:
                apt_hour = int(scheduled_time.split(":")[0])
                if abs(apt_hour - int(target_hour)) > 1:
                    continue  # Not within 2-hour window
            except:
                continue

            apt_business_id = apt.get("business_id")

            # Check if reminders are enabled
            settings = await self.get_reminder_settings(apt_business_id)
            if not settings.get("enabled") or not settings.get("reminder_2h_enabled"):
                stats["skipped"] += 1
                continue

            # Check if reminder already sent
            existing = await self.db.reminder_logs.find_one({
                "appointment_id": apt.get("appointment_id"),
                "reminder_type": "2h",
                "status": {"$ne": "failed"}
            })

            if existing:
                stats["skipped"] += 1
                continue

            # Get client
            client = await self.db.clients.find_one({"client_id": apt.get("client_id")})
            if not client or not client.get("phone"):
                stats["skipped"] += 1
                continue

            # Get staff
            staff = None
            staff_ids = apt.get("staff_ids", [])
            if staff_ids:
                staff = await self.db.staff.find_one({"staff_id": staff_ids[0]})

            # Format and send message
            template = settings.get("reminder_2h_template", "Your technician {staff_name} is on the way. ETA: {eta}")
            message = self.format_2h_reminder(
                template, apt, client, staff,
                eta=scheduled_time
            )

            result = await self.send_sms(
                to_phone=client["phone"],
                message=message,
                business_id=apt_business_id,
                appointment_id=apt.get("appointment_id"),
                reminder_type="2h"
            )

            if result.get("success"):
                stats["sent"] += 1
            else:
                stats["failed"] += 1

        return stats

    # ============== Handle Replies ==============

    async def handle_incoming_sms(
        self,
        from_phone: str,
        body: str,
        twilio_sid: str
    ) -> Dict[str, Any]:
        """Handle incoming SMS reply"""
        body_upper = body.strip().upper()

        # Find recent reminder sent to this phone
        recent_log = await self.db.reminder_logs.find_one(
            {"to_phone": from_phone},
            sort=[("sent_at", -1)]
        )

        if not recent_log:
            return {"action": "unknown", "message": "No recent reminder found"}

        appointment_id = recent_log.get("appointment_id")
        if not appointment_id:
            return {"action": "unknown", "message": "No appointment linked"}

        # Log the reply
        await self.db.reminder_replies.insert_one({
            "reply_id": str(uuid.uuid4()),
            "from_phone": from_phone,
            "body": body,
            "twilio_sid": twilio_sid,
            "appointment_id": appointment_id,
            "original_reminder_id": recent_log.get("log_id"),
            "received_at": datetime.utcnow(),
            "action_taken": None,
        })

        # Process CONFIRM
        if body_upper in ["CONFIRM", "YES", "Y", "CONFIRMED"]:
            await self.db.appointments.update_one(
                {"appointment_id": appointment_id},
                {
                    "$set": {
                        "status": "confirmed",
                        "confirmed_at": datetime.utcnow(),
                        "confirmed_via": "sms"
                    }
                }
            )

            await self.db.reminder_replies.update_one(
                {"appointment_id": appointment_id, "body": body},
                {"$set": {"action_taken": "confirmed"}}
            )

            return {
                "action": "confirmed",
                "appointment_id": appointment_id,
                "response_message": "Thank you! Your appointment is confirmed."
            }

        # Process RESCHEDULE
        if body_upper in ["RESCHEDULE", "CANCEL", "CHANGE"]:
            await self.db.appointments.update_one(
                {"appointment_id": appointment_id},
                {
                    "$set": {
                        "reschedule_requested": True,
                        "reschedule_requested_at": datetime.utcnow(),
                        "reschedule_requested_via": "sms"
                    }
                }
            )

            await self.db.reminder_replies.update_one(
                {"appointment_id": appointment_id, "body": body},
                {"$set": {"action_taken": "reschedule_requested"}}
            )

            return {
                "action": "reschedule_requested",
                "appointment_id": appointment_id,
                "response_message": "We'll contact you shortly to reschedule your appointment."
            }

        return {
            "action": "unknown",
            "appointment_id": appointment_id,
            "response_message": "Reply CONFIRM to confirm or RESCHEDULE to request a new time."
        }

    # ============== Reminder Logs ==============

    async def get_reminder_logs(
        self,
        business_id: str,
        limit: int = 50,
        offset: int = 0,
        appointment_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get reminder log history"""
        query = {"business_id": business_id}
        if appointment_id:
            query["appointment_id"] = appointment_id

        logs = await self.db.reminder_logs.find(query).sort(
            "sent_at", -1
        ).skip(offset).limit(limit).to_list(length=limit)

        return logs

    async def update_delivery_status(
        self,
        twilio_sid: str,
        status: str,
        error_code: Optional[str] = None
    ) -> bool:
        """Update delivery status from Twilio webhook"""
        update = {
            "status": status,
            "updated_at": datetime.utcnow()
        }

        if status == "delivered":
            update["delivered_at"] = datetime.utcnow()

        if error_code:
            update["error_code"] = error_code

        result = await self.db.reminder_logs.update_one(
            {"twilio_sid": twilio_sid},
            {"$set": update}
        )

        return result.modified_count > 0
