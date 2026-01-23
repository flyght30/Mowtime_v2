"""
SMS Service
Twilio integration for SMS notifications with templates and triggers
"""

import logging
import re
from datetime import datetime, timedelta
from typing import Optional
import httpx
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import get_settings
from app.models.sms import (
    SMSMessage, SMSDirection, SMSTriggerType, SMSStatus,
    SMSTemplate, SMSSettings, DEFAULT_TEMPLATES
)
from app.models.common import utc_now

logger = logging.getLogger(__name__)
settings = get_settings()


class SMSError(Exception):
    """SMS sending error"""
    pass


class SMSResult:
    """Result of SMS send operation"""
    def __init__(
        self,
        success: bool,
        message_id: Optional[str] = None,
        error: Optional[str] = None
    ):
        self.success = success
        self.message_id = message_id
        self.error = error


class SMSService:
    """Twilio SMS service with template support"""

    def __init__(self, db: AsyncIOMotorDatabase = None):
        self.db = db
        self.account_sid = settings.TWILIO_ACCOUNT_SID
        self.auth_token = settings.TWILIO_AUTH_TOKEN
        self.from_number = settings.TWILIO_PHONE_NUMBER
        self._configured = all([
            self.account_sid,
            self.auth_token,
            self.from_number
        ])

    @property
    def is_configured(self) -> bool:
        """Check if Twilio is configured"""
        return self._configured

    def _get_api_url(self) -> str:
        """Get Twilio API URL"""
        return f"https://api.twilio.com/2010-04-01/Accounts/{self.account_sid}/Messages.json"

    def _normalize_phone(self, phone: str) -> Optional[str]:
        """Normalize phone number to E.164 format"""
        cleaned = "".join(c for c in phone if c.isdigit() or c == "+")

        if cleaned.startswith("+"):
            if len(cleaned) >= 11:
                return cleaned
        elif len(cleaned) == 10:
            return f"+1{cleaned}"
        elif len(cleaned) == 11 and cleaned.startswith("1"):
            return f"+{cleaned}"

        if len(cleaned) >= 10:
            return f"+{cleaned}" if not cleaned.startswith("+") else cleaned

        return None

    # ============== Settings & Templates ==============

    async def get_settings(self, business_id: str) -> SMSSettings:
        """Get SMS settings for a business"""
        if not self.db:
            return SMSSettings()

        business = await self.db.businesses.find_one({"business_id": business_id})
        if not business:
            return SMSSettings()

        config = business.get("config", {})
        sms_config = config.get("sms", {})
        return SMSSettings(**sms_config)

    async def get_business_phone(self, business_id: str) -> Optional[str]:
        """Get business Twilio phone number"""
        sms_settings = await self.get_settings(business_id)
        return sms_settings.twilio_phone or self.from_number

    async def get_template(
        self,
        business_id: str,
        trigger_type: SMSTriggerType
    ) -> Optional[SMSTemplate]:
        """Get active template for trigger type"""
        if not self.db:
            # Return default
            for default in DEFAULT_TEMPLATES:
                if default["trigger_type"] == trigger_type:
                    return SMSTemplate(business_id=business_id, **default)
            return None

        # Check for custom template
        template = await self.db.sms_templates.find_one({
            "business_id": business_id,
            "trigger_type": trigger_type.value,
            "is_active": True,
            "deleted_at": None
        })

        if template:
            return SMSTemplate(**template)

        # Fall back to default
        for default in DEFAULT_TEMPLATES:
            if default["trigger_type"] == trigger_type:
                return SMSTemplate(business_id=business_id, **default)

        return None

    def render_template(self, template_body: str, variables: dict) -> str:
        """Replace {{variables}} in template with values"""
        result = template_body

        for key, value in variables.items():
            placeholder = f"{{{{{key}}}}}"
            result = result.replace(placeholder, str(value) if value else "")

        # Clean up unreplaced variables
        result = re.sub(r'\{\{[^}]+\}\}', '', result)

        return result.strip()

    async def build_variables(
        self,
        business_id: str,
        customer_id: str,
        job_id: Optional[str] = None,
        tech_id: Optional[str] = None,
        eta_minutes: Optional[int] = None
    ) -> dict:
        """Build template variables from database records"""
        variables = {}

        if not self.db:
            return variables

        # Get business info
        business = await self.db.businesses.find_one({"business_id": business_id})
        if business:
            variables["company_name"] = business.get("name", "")
            variables["company_phone"] = business.get("phone", "")

        # Get customer info
        customer = await self.db.clients.find_one({
            "client_id": customer_id,
            "deleted_at": None
        })
        if customer:
            variables["customer_first_name"] = customer.get("first_name", "")
            variables["customer_last_name"] = customer.get("last_name", "")

        # Get job info
        if job_id:
            job = await self.db.hvac_quotes.find_one({"quote_id": job_id})
            if job:
                variables["job_type"] = job.get("job_type", "service")
                variables["job_total"] = f"${job.get('grand_total', 0):,.2f}"

                schedule = job.get("schedule", {})
                if schedule:
                    date_str = schedule.get("scheduled_date", "")
                    if date_str:
                        try:
                            dt = datetime.fromisoformat(date_str)
                            variables["scheduled_date"] = dt.strftime("%A, %B %d")
                        except:
                            variables["scheduled_date"] = date_str

                    start = schedule.get("scheduled_time_start", "")
                    end = schedule.get("scheduled_time_end", "")
                    if start and end:
                        variables["scheduled_time"] = f"{start} - {end}"
                    elif start:
                        variables["scheduled_time"] = start

                variables["invoice_link"] = f"https://pay.example.com/{job_id}"

        # Get tech info
        if tech_id:
            tech = await self.db.technicians.find_one({"tech_id": tech_id})
            if tech:
                variables["tech_first_name"] = tech.get("first_name", "")
                variables["tech_phone"] = tech.get("phone", "")

        # ETA
        if eta_minutes:
            variables["eta_minutes"] = str(eta_minutes)
            eta_time = datetime.now() + timedelta(minutes=eta_minutes)
            variables["eta_time"] = eta_time.strftime("%I:%M %p")

        return variables

    # ============== Core SMS Sending ==============

    async def send_sms(
        self,
        to_number: str,
        message: str,
        media_url: Optional[str] = None
    ) -> SMSResult:
        """Send SMS via Twilio API"""
        if not self.is_configured:
            logger.warning("Twilio not configured, skipping SMS")
            return SMSResult(success=False, error="SMS service not configured")

        to_number = self._normalize_phone(to_number)
        if not to_number:
            return SMSResult(success=False, error="Invalid phone number format")

        if len(message) > 1600:
            message = message[:1597] + "..."

        payload = {
            "From": self.from_number,
            "To": to_number,
            "Body": message
        }

        if media_url:
            payload["MediaUrl"] = media_url

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self._get_api_url(),
                    auth=(self.account_sid, self.auth_token),
                    data=payload,
                    timeout=30.0
                )

                if response.status_code in (200, 201):
                    data = response.json()
                    logger.info(f"SMS sent successfully: {data.get('sid')}")
                    return SMSResult(success=True, message_id=data.get("sid"))
                else:
                    error_data = response.json()
                    error_msg = error_data.get("message", "Unknown error")
                    logger.error(f"Twilio error: {error_msg}")
                    return SMSResult(success=False, error=f"Twilio error: {error_msg}")

        except httpx.TimeoutException:
            logger.error("Twilio request timeout")
            return SMSResult(success=False, error="Request timeout")
        except Exception as e:
            logger.error(f"SMS send error: {str(e)}")
            return SMSResult(success=False, error=str(e))

    # ============== Database-backed SMS ==============

    async def send_and_log(
        self,
        business_id: str,
        to_phone: str,
        body: str,
        customer_id: str,
        trigger_type: SMSTriggerType = SMSTriggerType.MANUAL,
        job_id: Optional[str] = None,
        tech_id: Optional[str] = None,
        template_id: Optional[str] = None
    ) -> SMSMessage:
        """Send SMS and log to database"""
        from_phone = await self.get_business_phone(business_id)

        # Create message record
        message = SMSMessage(
            business_id=business_id,
            job_id=job_id,
            customer_id=customer_id,
            tech_id=tech_id,
            direction=SMSDirection.OUTBOUND,
            to_phone=to_phone,
            from_phone=from_phone or "",
            body=body,
            trigger_type=trigger_type,
            template_id=template_id,
            status=SMSStatus.QUEUED
        )

        # Send via Twilio
        result = await self.send_sms(to_phone, body)

        if result.success:
            message.twilio_sid = result.message_id
            message.status = SMSStatus.SENT
            message.sent_at = utc_now()
        else:
            message.status = SMSStatus.FAILED
            message.error_message = result.error

        # Save to database
        if self.db:
            await self.db.sms_messages.insert_one(message.model_dump())

        return message

    async def send_triggered_sms(
        self,
        business_id: str,
        trigger_type: SMSTriggerType,
        customer_id: str,
        job_id: Optional[str] = None,
        tech_id: Optional[str] = None,
        eta_minutes: Optional[int] = None
    ) -> Optional[SMSMessage]:
        """Send automated SMS based on trigger type"""
        sms_settings = await self.get_settings(business_id)
        if not sms_settings.enabled:
            return None

        # Check trigger-specific setting
        trigger_enabled = {
            SMSTriggerType.SCHEDULED: sms_settings.auto_scheduled,
            SMSTriggerType.REMINDER: sms_settings.auto_reminder,
            SMSTriggerType.ENROUTE: sms_settings.auto_enroute,
            SMSTriggerType.FIFTEEN_MIN: sms_settings.auto_15_min,
            SMSTriggerType.ARRIVED: sms_settings.auto_arrived,
            SMSTriggerType.COMPLETE: sms_settings.auto_complete,
        }.get(trigger_type, False)

        if not trigger_enabled:
            return None

        template = await self.get_template(business_id, trigger_type)
        if not template:
            logger.warning(f"No template found for trigger: {trigger_type}")
            return None

        if not self.db:
            return None

        customer = await self.db.clients.find_one({
            "client_id": customer_id,
            "deleted_at": None
        })
        if not customer or not customer.get("phone"):
            logger.warning(f"Customer not found or no phone: {customer_id}")
            return None

        if customer.get("sms_opt_out"):
            logger.info(f"Customer opted out of SMS: {customer_id}")
            return None

        variables = await self.build_variables(
            business_id, customer_id, job_id, tech_id, eta_minutes
        )
        body = self.render_template(template.body, variables)

        return await self.send_and_log(
            business_id=business_id,
            to_phone=customer["phone"],
            body=body,
            customer_id=customer_id,
            trigger_type=trigger_type,
            job_id=job_id,
            tech_id=tech_id,
            template_id=getattr(template, 'template_id', None)
        )

    async def process_webhook(
        self,
        business_id: str,
        webhook_data: dict
    ) -> Optional[SMSMessage]:
        """Process incoming Twilio webhook"""
        message_sid = webhook_data.get("MessageSid")
        status = webhook_data.get("MessageStatus")
        from_phone = webhook_data.get("From")
        to_phone = webhook_data.get("To")
        body = webhook_data.get("Body")

        if not self.db:
            return None

        if status:
            # Status callback
            status_map = {
                "queued": SMSStatus.QUEUED,
                "sent": SMSStatus.SENT,
                "delivered": SMSStatus.DELIVERED,
                "failed": SMSStatus.FAILED,
                "undelivered": SMSStatus.FAILED,
            }
            new_status = status_map.get(status.lower())

            if new_status:
                update_data = {"status": new_status.value, "updated_at": utc_now()}
                if new_status == SMSStatus.DELIVERED:
                    update_data["delivered_at"] = utc_now()

                await self.db.sms_messages.update_one(
                    {"twilio_sid": message_sid},
                    {"$set": update_data}
                )
            return None

        elif body:
            # Incoming message
            customer = await self.db.clients.find_one({
                "business_id": business_id,
                "phone": from_phone,
                "deleted_at": None
            })

            if not customer:
                logger.info(f"Unknown sender: {from_phone}")
                return None

            # Handle opt-out
            if body.strip().upper() == "STOP":
                await self.db.clients.update_one(
                    {"client_id": customer["client_id"]},
                    {"$set": {"sms_opt_out": True, "updated_at": utc_now()}}
                )
                sms_settings = await self.get_settings(business_id)
                await self.send_and_log(
                    business_id=business_id,
                    to_phone=from_phone,
                    body=sms_settings.opt_out_message,
                    customer_id=customer["client_id"],
                    trigger_type=SMSTriggerType.MANUAL
                )
                return None

            # Handle opt-in
            if body.strip().upper() == "START":
                await self.db.clients.update_one(
                    {"client_id": customer["client_id"]},
                    {"$set": {"sms_opt_out": False, "updated_at": utc_now()}}
                )
                return None

            # Save incoming message
            message = SMSMessage(
                business_id=business_id,
                customer_id=customer["client_id"],
                direction=SMSDirection.INBOUND,
                to_phone=to_phone,
                from_phone=from_phone,
                body=body,
                trigger_type=SMSTriggerType.REPLY,
                status=SMSStatus.RECEIVED,
                twilio_sid=message_sid
            )

            await self.db.sms_messages.insert_one(message.model_dump())
            return message

        return None

    async def seed_default_templates(self, business_id: str) -> int:
        """Create default templates for a business"""
        if not self.db:
            return 0

        count = 0
        for template_data in DEFAULT_TEMPLATES:
            existing = await self.db.sms_templates.find_one({
                "business_id": business_id,
                "trigger_type": template_data["trigger_type"].value,
                "is_default": True
            })

            if not existing:
                template = SMSTemplate(business_id=business_id, **template_data)
                await self.db.sms_templates.insert_one(template.model_dump())
                count += 1

        return count

    # ============== Legacy convenience methods ==============

    async def send_appointment_reminder(
        self,
        to_number: str,
        client_name: str,
        date: str,
        time: str,
        service_name: str,
        business_name: str
    ) -> SMSResult:
        """Send appointment reminder SMS"""
        message = (
            f"Hi {client_name}! This is a reminder of your "
            f"{service_name} appointment with {business_name} "
            f"on {date} at {time}. "
            f"Reply CONFIRM to confirm or call to reschedule."
        )
        return await self.send_sms(to_number, message)

    async def send_appointment_confirmation(
        self,
        to_number: str,
        client_name: str,
        date: str,
        time: str,
        service_name: str,
        business_name: str
    ) -> SMSResult:
        """Send appointment confirmation SMS"""
        message = (
            f"Your {service_name} appointment with {business_name} "
            f"is confirmed for {date} at {time}. "
            f"We look forward to seeing you, {client_name}!"
        )
        return await self.send_sms(to_number, message)


# Singleton instance
_sms_service: Optional[SMSService] = None


def get_sms_service(db: AsyncIOMotorDatabase = None) -> SMSService:
    """Get SMS service singleton"""
    global _sms_service
    if _sms_service is None or db is not None:
        _sms_service = SMSService(db)
    return _sms_service
