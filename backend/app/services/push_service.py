"""
Push Notification Service
Firebase Cloud Messaging (FCM) integration
"""

import json
import logging
from typing import Optional
import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class PushError(Exception):
    """Push notification error"""
    pass


class PushResult:
    """Result of push notification operation"""
    def __init__(
        self,
        success: bool,
        message_id: Optional[str] = None,
        error: Optional[str] = None
    ):
        self.success = success
        self.message_id = message_id
        self.error = error


class PushService:
    """Firebase Cloud Messaging service"""

    FCM_URL = "https://fcm.googleapis.com/v1/projects/{project_id}/messages:send"

    def __init__(self):
        self.project_id = settings.FIREBASE_PROJECT_ID
        self.credentials_path = settings.FIREBASE_CREDENTIALS_PATH
        self._access_token: Optional[str] = None
        self._token_expires_at: float = 0
        self._configured = bool(self.project_id and self.credentials_path)

    @property
    def is_configured(self) -> bool:
        """Check if Firebase is configured"""
        return self._configured

    async def _get_access_token(self) -> Optional[str]:
        """
        Get OAuth2 access token for FCM API.
        In production, use google-auth library with service account.
        This is a simplified version using direct HTTP.
        """
        import time

        # Return cached token if still valid
        if self._access_token and time.time() < self._token_expires_at:
            return self._access_token

        if not self.credentials_path:
            return None

        try:
            # Load service account credentials
            with open(self.credentials_path) as f:
                creds = json.load(f)

            # In production, use google-auth library:
            # from google.oauth2 import service_account
            # from google.auth.transport.requests import Request
            # credentials = service_account.Credentials.from_service_account_file(
            #     self.credentials_path,
            #     scopes=['https://www.googleapis.com/auth/firebase.messaging']
            # )
            # credentials.refresh(Request())
            # return credentials.token

            # Simplified: Using JWT-based auth
            # This requires implementing JWT creation with the private key
            # For now, we'll return None and log that full implementation is needed

            logger.warning("FCM OAuth implementation requires google-auth library")
            return None

        except Exception as e:
            logger.error(f"Failed to get FCM access token: {e}")
            return None

    async def send_push(
        self,
        device_token: str,
        title: str,
        body: str,
        data: Optional[dict] = None,
        badge: Optional[int] = None,
        sound: str = "default"
    ) -> PushResult:
        """
        Send push notification via FCM

        Args:
            device_token: FCM device registration token
            title: Notification title
            body: Notification body
            data: Optional custom data payload
            badge: Optional badge count (iOS)
            sound: Notification sound

        Returns:
            PushResult with success status
        """
        if not self.is_configured:
            logger.warning("Firebase not configured, skipping push")
            return PushResult(
                success=False,
                error="Push service not configured"
            )

        access_token = await self._get_access_token()
        if not access_token:
            return PushResult(
                success=False,
                error="Failed to get access token"
            )

        # Build FCM message
        message = {
            "message": {
                "token": device_token,
                "notification": {
                    "title": title,
                    "body": body
                },
                "android": {
                    "notification": {
                        "sound": sound,
                        "channel_id": "servicepro_notifications"
                    }
                },
                "apns": {
                    "payload": {
                        "aps": {
                            "sound": sound
                        }
                    }
                }
            }
        }

        if badge is not None:
            message["message"]["apns"]["payload"]["aps"]["badge"] = badge

        if data:
            message["message"]["data"] = {k: str(v) for k, v in data.items()}

        try:
            url = self.FCM_URL.format(project_id=self.project_id)
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    json=message,
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Content-Type": "application/json"
                    },
                    timeout=30.0
                )

                if response.status_code == 200:
                    resp_data = response.json()
                    message_id = resp_data.get("name", "").split("/")[-1]
                    logger.info(f"Push sent successfully: {message_id}")
                    return PushResult(success=True, message_id=message_id)
                else:
                    error_data = response.json()
                    error_msg = error_data.get("error", {}).get("message", "Unknown error")
                    logger.error(f"FCM error: {error_msg}")
                    return PushResult(success=False, error=error_msg)

        except httpx.TimeoutException:
            logger.error("FCM request timeout")
            return PushResult(success=False, error="Request timeout")
        except Exception as e:
            logger.error(f"Push send error: {str(e)}")
            return PushResult(success=False, error=str(e))

    async def send_to_topic(
        self,
        topic: str,
        title: str,
        body: str,
        data: Optional[dict] = None
    ) -> PushResult:
        """
        Send push notification to a topic

        Args:
            topic: Topic name (e.g., 'business_123_announcements')
            title: Notification title
            body: Notification body
            data: Optional custom data payload

        Returns:
            PushResult with success status
        """
        if not self.is_configured:
            return PushResult(success=False, error="Push service not configured")

        access_token = await self._get_access_token()
        if not access_token:
            return PushResult(success=False, error="Failed to get access token")

        message = {
            "message": {
                "topic": topic,
                "notification": {
                    "title": title,
                    "body": body
                }
            }
        }

        if data:
            message["message"]["data"] = {k: str(v) for k, v in data.items()}

        try:
            url = self.FCM_URL.format(project_id=self.project_id)
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    json=message,
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Content-Type": "application/json"
                    },
                    timeout=30.0
                )

                if response.status_code == 200:
                    return PushResult(success=True)
                else:
                    error_data = response.json()
                    error_msg = error_data.get("error", {}).get("message", "Unknown error")
                    return PushResult(success=False, error=error_msg)

        except Exception as e:
            logger.error(f"Topic push error: {str(e)}")
            return PushResult(success=False, error=str(e))

    async def send_appointment_reminder(
        self,
        device_token: str,
        client_name: str,
        date: str,
        time: str,
        service_name: str,
        appointment_id: str
    ) -> PushResult:
        """Send appointment reminder push notification"""
        return await self.send_push(
            device_token=device_token,
            title="Appointment Reminder",
            body=f"Your {service_name} appointment is coming up on {date} at {time}",
            data={
                "type": "appointment_reminder",
                "appointment_id": appointment_id,
                "action": "view_appointment"
            }
        )

    async def send_appointment_update(
        self,
        device_token: str,
        title: str,
        message: str,
        appointment_id: str
    ) -> PushResult:
        """Send appointment update push notification"""
        return await self.send_push(
            device_token=device_token,
            title=title,
            body=message,
            data={
                "type": "appointment_update",
                "appointment_id": appointment_id,
                "action": "view_appointment"
            }
        )


# Singleton instance
_push_service: Optional[PushService] = None


def get_push_service() -> PushService:
    """Get push service singleton"""
    global _push_service
    if _push_service is None:
        _push_service = PushService()
    return _push_service
