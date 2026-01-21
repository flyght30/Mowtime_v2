"""
SMS Service
Twilio integration for SMS notifications
"""

import logging
from typing import Optional
import httpx

from app.config import get_settings

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
    """Twilio SMS service"""

    def __init__(self):
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

    async def send_sms(
        self,
        to_number: str,
        message: str,
        media_url: Optional[str] = None
    ) -> SMSResult:
        """
        Send SMS via Twilio

        Args:
            to_number: Recipient phone number (E.164 format)
            message: Message body (max 1600 chars)
            media_url: Optional MMS media URL

        Returns:
            SMSResult with success status and message ID
        """
        if not self.is_configured:
            logger.warning("Twilio not configured, skipping SMS")
            return SMSResult(
                success=False,
                error="SMS service not configured"
            )

        # Validate phone number format
        to_number = self._normalize_phone(to_number)
        if not to_number:
            return SMSResult(
                success=False,
                error="Invalid phone number format"
            )

        # Truncate message if too long
        if len(message) > 1600:
            message = message[:1597] + "..."

        # Prepare payload
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
                    return SMSResult(
                        success=True,
                        message_id=data.get("sid")
                    )
                else:
                    error_data = response.json()
                    error_msg = error_data.get("message", "Unknown error")
                    logger.error(f"Twilio error: {error_msg}")
                    return SMSResult(
                        success=False,
                        error=f"Twilio error: {error_msg}"
                    )

        except httpx.TimeoutException:
            logger.error("Twilio request timeout")
            return SMSResult(success=False, error="Request timeout")
        except Exception as e:
            logger.error(f"SMS send error: {str(e)}")
            return SMSResult(success=False, error=str(e))

    def _normalize_phone(self, phone: str) -> Optional[str]:
        """
        Normalize phone number to E.164 format

        Args:
            phone: Phone number in various formats

        Returns:
            E.164 formatted number or None if invalid
        """
        # Remove all non-digit characters except +
        cleaned = "".join(c for c in phone if c.isdigit() or c == "+")

        # Handle various formats
        if cleaned.startswith("+"):
            # Already has country code
            if len(cleaned) >= 11:
                return cleaned
        elif len(cleaned) == 10:
            # US number without country code
            return f"+1{cleaned}"
        elif len(cleaned) == 11 and cleaned.startswith("1"):
            # US number with 1 prefix
            return f"+{cleaned}"

        # Return as-is if we can't determine format
        if len(cleaned) >= 10:
            return f"+{cleaned}" if not cleaned.startswith("+") else cleaned

        return None

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

    async def send_weather_alert(
        self,
        to_number: str,
        client_name: str,
        original_date: str,
        reason: str,
        business_name: str
    ) -> SMSResult:
        """Send weather-related rescheduling alert"""
        message = (
            f"Hi {client_name}, due to {reason}, your appointment "
            f"on {original_date} with {business_name} needs to be rescheduled. "
            f"We'll contact you soon with a new time."
        )
        return await self.send_sms(to_number, message)


# Singleton instance
_sms_service: Optional[SMSService] = None


def get_sms_service() -> SMSService:
    """Get SMS service singleton"""
    global _sms_service
    if _sms_service is None:
        _sms_service = SMSService()
    return _sms_service
