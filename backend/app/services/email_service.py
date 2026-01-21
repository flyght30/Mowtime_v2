"""
Email Service
SendGrid integration for email notifications
"""

import logging
from typing import Optional
import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class EmailError(Exception):
    """Email sending error"""
    pass


class EmailResult:
    """Result of email send operation"""
    def __init__(
        self,
        success: bool,
        message_id: Optional[str] = None,
        error: Optional[str] = None
    ):
        self.success = success
        self.message_id = message_id
        self.error = error


class EmailService:
    """SendGrid email service"""

    SENDGRID_URL = "https://api.sendgrid.com/v3/mail/send"

    def __init__(self):
        self.api_key = settings.SENDGRID_API_KEY
        self.from_email = settings.SENDGRID_FROM_EMAIL
        self.from_name = settings.SENDGRID_FROM_NAME
        self._configured = bool(self.api_key)

    @property
    def is_configured(self) -> bool:
        """Check if SendGrid is configured"""
        return self._configured

    async def send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None,
        to_name: Optional[str] = None,
        reply_to: Optional[str] = None,
        attachments: Optional[list[dict]] = None
    ) -> EmailResult:
        """
        Send email via SendGrid

        Args:
            to_email: Recipient email address
            subject: Email subject
            html_content: HTML body content
            text_content: Optional plain text content
            to_name: Optional recipient name
            reply_to: Optional reply-to address
            attachments: Optional list of attachments

        Returns:
            EmailResult with success status
        """
        if not self.is_configured:
            logger.warning("SendGrid not configured, skipping email")
            return EmailResult(
                success=False,
                error="Email service not configured"
            )

        # Build email payload
        payload = {
            "personalizations": [{
                "to": [{"email": to_email}]
            }],
            "from": {
                "email": self.from_email,
                "name": self.from_name
            },
            "subject": subject,
            "content": []
        }

        if to_name:
            payload["personalizations"][0]["to"][0]["name"] = to_name

        if text_content:
            payload["content"].append({
                "type": "text/plain",
                "value": text_content
            })

        payload["content"].append({
            "type": "text/html",
            "value": html_content
        })

        if reply_to:
            payload["reply_to"] = {"email": reply_to}

        if attachments:
            payload["attachments"] = attachments

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.SENDGRID_URL,
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json"
                    },
                    timeout=30.0
                )

                if response.status_code in (200, 201, 202):
                    message_id = response.headers.get("X-Message-Id")
                    logger.info(f"Email sent successfully: {message_id}")
                    return EmailResult(success=True, message_id=message_id)
                else:
                    try:
                        error_data = response.json()
                        errors = error_data.get("errors", [])
                        error_msg = errors[0].get("message") if errors else "Unknown error"
                    except Exception:
                        error_msg = f"HTTP {response.status_code}"
                    logger.error(f"SendGrid error: {error_msg}")
                    return EmailResult(success=False, error=error_msg)

        except httpx.TimeoutException:
            logger.error("SendGrid request timeout")
            return EmailResult(success=False, error="Request timeout")
        except Exception as e:
            logger.error(f"Email send error: {str(e)}")
            return EmailResult(success=False, error=str(e))

    async def send_templated_email(
        self,
        to_email: str,
        template_id: str,
        template_data: dict,
        to_name: Optional[str] = None
    ) -> EmailResult:
        """
        Send email using SendGrid dynamic template

        Args:
            to_email: Recipient email
            template_id: SendGrid template ID
            template_data: Template variable data
            to_name: Optional recipient name

        Returns:
            EmailResult with success status
        """
        if not self.is_configured:
            return EmailResult(success=False, error="Email service not configured")

        payload = {
            "personalizations": [{
                "to": [{"email": to_email}],
                "dynamic_template_data": template_data
            }],
            "from": {
                "email": self.from_email,
                "name": self.from_name
            },
            "template_id": template_id
        }

        if to_name:
            payload["personalizations"][0]["to"][0]["name"] = to_name

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.SENDGRID_URL,
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json"
                    },
                    timeout=30.0
                )

                if response.status_code in (200, 201, 202):
                    message_id = response.headers.get("X-Message-Id")
                    return EmailResult(success=True, message_id=message_id)
                else:
                    error_msg = f"HTTP {response.status_code}"
                    return EmailResult(success=False, error=error_msg)

        except Exception as e:
            logger.error(f"Templated email error: {str(e)}")
            return EmailResult(success=False, error=str(e))

    def _render_appointment_reminder_html(
        self,
        client_name: str,
        date: str,
        time: str,
        service_name: str,
        business_name: str,
        address: Optional[str] = None
    ) -> str:
        """Render appointment reminder HTML email"""
        address_section = f"<p><strong>Location:</strong> {address}</p>" if address else ""
        return f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Appointment Reminder</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0;">Appointment Reminder</h1>
    </div>
    <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
        <p>Hi {client_name},</p>
        <p>This is a friendly reminder about your upcoming appointment:</p>
        <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Service:</strong> {service_name}</p>
            <p><strong>Date:</strong> {date}</p>
            <p><strong>Time:</strong> {time}</p>
            {address_section}
            <p><strong>Provider:</strong> {business_name}</p>
        </div>
        <p>If you need to reschedule or cancel, please contact us as soon as possible.</p>
        <p>We look forward to seeing you!</p>
        <p>Best regards,<br>{business_name}</p>
    </div>
    <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
        <p>This email was sent by {business_name} via ServicePro.</p>
    </div>
</body>
</html>
"""

    async def send_appointment_reminder(
        self,
        to_email: str,
        client_name: str,
        date: str,
        time: str,
        service_name: str,
        business_name: str,
        address: Optional[str] = None
    ) -> EmailResult:
        """Send appointment reminder email"""
        html_content = self._render_appointment_reminder_html(
            client_name, date, time, service_name, business_name, address
        )
        text_content = (
            f"Hi {client_name},\n\n"
            f"This is a reminder about your upcoming {service_name} appointment "
            f"with {business_name} on {date} at {time}.\n\n"
            f"If you need to reschedule, please contact us.\n\n"
            f"Best regards,\n{business_name}"
        )
        return await self.send_email(
            to_email=to_email,
            subject=f"Reminder: Your {service_name} appointment on {date}",
            html_content=html_content,
            text_content=text_content,
            to_name=client_name
        )

    def _render_confirmation_html(
        self,
        client_name: str,
        date: str,
        time: str,
        service_name: str,
        business_name: str,
        appointment_id: str
    ) -> str:
        """Render appointment confirmation HTML email"""
        return f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Appointment Confirmed</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #2196F3; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0;">Appointment Confirmed!</h1>
    </div>
    <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
        <p>Hi {client_name},</p>
        <p>Your appointment has been confirmed:</p>
        <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Service:</strong> {service_name}</p>
            <p><strong>Date:</strong> {date}</p>
            <p><strong>Time:</strong> {time}</p>
            <p><strong>Confirmation #:</strong> {appointment_id[:8].upper()}</p>
        </div>
        <p>We've added this to your calendar. You'll receive a reminder before your appointment.</p>
        <p>Thank you for choosing {business_name}!</p>
        <p>Best regards,<br>{business_name}</p>
    </div>
</body>
</html>
"""

    async def send_appointment_confirmation(
        self,
        to_email: str,
        client_name: str,
        date: str,
        time: str,
        service_name: str,
        business_name: str,
        appointment_id: str
    ) -> EmailResult:
        """Send appointment confirmation email"""
        html_content = self._render_confirmation_html(
            client_name, date, time, service_name, business_name, appointment_id
        )
        return await self.send_email(
            to_email=to_email,
            subject=f"Confirmed: {service_name} on {date} at {time}",
            html_content=html_content,
            to_name=client_name
        )

    async def send_weather_alert(
        self,
        to_email: str,
        client_name: str,
        original_date: str,
        reason: str,
        business_name: str
    ) -> EmailResult:
        """Send weather-related rescheduling email"""
        html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Appointment Rescheduling Notice</title>
</head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #FF9800; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0;">Weather Alert</h1>
    </div>
    <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
        <p>Hi {client_name},</p>
        <p>Due to {reason}, we need to reschedule your appointment originally scheduled for <strong>{original_date}</strong>.</p>
        <p>We'll contact you soon to arrange a new time that works for you.</p>
        <p>We apologize for any inconvenience and thank you for your understanding.</p>
        <p>Best regards,<br>{business_name}</p>
    </div>
</body>
</html>
"""
        return await self.send_email(
            to_email=to_email,
            subject=f"Your appointment on {original_date} needs to be rescheduled",
            html_content=html_content,
            to_name=client_name
        )


# Singleton instance
_email_service: Optional[EmailService] = None


def get_email_service() -> EmailService:
    """Get email service singleton"""
    global _email_service
    if _email_service is None:
        _email_service = EmailService()
    return _email_service
