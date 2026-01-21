"""
Voice Service
ElevenLabs text-to-speech integration for AI voice receptionist
"""

import logging
import base64
from typing import Optional
import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class VoiceError(Exception):
    """Voice synthesis error"""
    pass


class VoiceResult:
    """Result of voice synthesis operation"""
    def __init__(
        self,
        success: bool,
        audio_data: Optional[bytes] = None,
        audio_base64: Optional[str] = None,
        characters_used: int = 0,
        error: Optional[str] = None
    ):
        self.success = success
        self.audio_data = audio_data
        self.audio_base64 = audio_base64
        self.characters_used = characters_used
        self.error = error


class VoiceService:
    """ElevenLabs text-to-speech service"""

    BASE_URL = "https://api.elevenlabs.io/v1"

    # Default voice IDs (professional female and male voices)
    DEFAULT_VOICES = {
        "professional_female": "21m00Tcm4TlvDq8ikWAM",  # Rachel
        "professional_male": "VR6AewLTigWG4xSOukaG",    # Arnold
        "friendly_female": "EXAVITQu4vr4xnSDxMaL",     # Bella
        "friendly_male": "ErXwobaYiN019PkySvjV",       # Antoni
    }

    def __init__(self):
        self.api_key = settings.ELEVENLABS_API_KEY
        self._configured = bool(self.api_key)

    @property
    def is_configured(self) -> bool:
        """Check if ElevenLabs is configured"""
        return self._configured

    async def synthesize_speech(
        self,
        text: str,
        voice_id: Optional[str] = None,
        model_id: str = "eleven_turbo_v2",
        stability: float = 0.5,
        similarity_boost: float = 0.75,
        style: float = 0.0,
        output_format: str = "mp3_44100_128"
    ) -> VoiceResult:
        """
        Convert text to speech using ElevenLabs

        Args:
            text: Text to synthesize
            voice_id: ElevenLabs voice ID (default: professional_female)
            model_id: Model to use (eleven_turbo_v2 for low latency)
            stability: Voice stability (0-1)
            similarity_boost: Voice similarity (0-1)
            style: Speaking style intensity (0-1)
            output_format: Audio format

        Returns:
            VoiceResult with audio data
        """
        if not self.is_configured:
            logger.warning("ElevenLabs not configured, skipping voice synthesis")
            return VoiceResult(
                success=False,
                error="Voice service not configured"
            )

        # Use default voice if not specified
        if not voice_id:
            voice_id = self.DEFAULT_VOICES["professional_female"]

        url = f"{self.BASE_URL}/text-to-speech/{voice_id}"

        payload = {
            "text": text,
            "model_id": model_id,
            "voice_settings": {
                "stability": stability,
                "similarity_boost": similarity_boost,
                "style": style,
                "use_speaker_boost": True
            }
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    json=payload,
                    headers={
                        "xi-api-key": self.api_key,
                        "Content-Type": "application/json",
                        "Accept": f"audio/{output_format.split('_')[0]}"
                    },
                    timeout=30.0
                )

                if response.status_code == 200:
                    audio_data = response.content
                    audio_base64 = base64.b64encode(audio_data).decode("utf-8")

                    logger.info(f"Voice synthesis successful: {len(text)} characters")

                    return VoiceResult(
                        success=True,
                        audio_data=audio_data,
                        audio_base64=audio_base64,
                        characters_used=len(text)
                    )
                else:
                    try:
                        error_data = response.json()
                        error_msg = error_data.get("detail", {}).get("message", "Unknown error")
                    except Exception:
                        error_msg = f"HTTP {response.status_code}"

                    logger.error(f"ElevenLabs error: {error_msg}")
                    return VoiceResult(success=False, error=error_msg)

        except httpx.TimeoutException:
            logger.error("ElevenLabs request timeout")
            return VoiceResult(success=False, error="Request timeout")
        except Exception as e:
            logger.error(f"Voice synthesis error: {str(e)}")
            return VoiceResult(success=False, error=str(e))

    async def synthesize_for_twilio(
        self,
        text: str,
        voice_id: Optional[str] = None
    ) -> VoiceResult:
        """
        Synthesize speech optimized for Twilio playback

        Args:
            text: Text to synthesize
            voice_id: ElevenLabs voice ID

        Returns:
            VoiceResult with audio suitable for Twilio
        """
        return await self.synthesize_speech(
            text=text,
            voice_id=voice_id,
            model_id="eleven_turbo_v2",  # Low latency model
            output_format="mp3_44100_128",  # Twilio compatible
            stability=0.5,
            similarity_boost=0.75
        )

    async def get_voices(self) -> list[dict]:
        """Get available voices from ElevenLabs"""
        if not self.is_configured:
            return []

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.BASE_URL}/voices",
                    headers={"xi-api-key": self.api_key},
                    timeout=15.0
                )

                if response.status_code == 200:
                    data = response.json()
                    return data.get("voices", [])
                else:
                    return []

        except Exception as e:
            logger.error(f"Failed to get voices: {str(e)}")
            return []

    async def get_user_subscription(self) -> Optional[dict]:
        """Get ElevenLabs subscription info"""
        if not self.is_configured:
            return None

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.BASE_URL}/user/subscription",
                    headers={"xi-api-key": self.api_key},
                    timeout=15.0
                )

                if response.status_code == 200:
                    return response.json()
                else:
                    return None

        except Exception as e:
            logger.error(f"Failed to get subscription: {str(e)}")
            return None

    def get_greeting_text(
        self,
        business_name: str,
        custom_greeting: Optional[str] = None
    ) -> str:
        """Get standard greeting text"""
        if custom_greeting:
            return custom_greeting

        return (
            f"Thank you for calling {business_name}. "
            f"I'm your virtual assistant and I'm here to help you. "
            f"How can I assist you today?"
        )

    def get_booking_confirmation_text(
        self,
        service_name: str,
        date: str,
        time: str,
        business_name: str
    ) -> str:
        """Get booking confirmation text"""
        return (
            f"I've scheduled your {service_name} appointment for {date} at {time}. "
            f"You'll receive a confirmation shortly. "
            f"Is there anything else I can help you with?"
        )

    def get_transfer_text(self) -> str:
        """Get transfer to human text"""
        return (
            "I'll connect you with a team member who can better assist you. "
            "Please hold for a moment."
        )

    def get_voicemail_prompt(self, business_name: str) -> str:
        """Get voicemail prompt text"""
        return (
            f"Thank you for calling {business_name}. "
            f"We're sorry we missed your call. "
            f"Please leave your name, phone number, and a brief message, "
            f"and we'll get back to you as soon as possible. "
            f"Please speak after the tone."
        )

    def get_goodbye_text(self) -> str:
        """Get goodbye text"""
        return (
            "Thank you for calling. Have a great day!"
        )


# Singleton instance
_voice_service: Optional[VoiceService] = None


def get_voice_service() -> VoiceService:
    """Get voice service singleton"""
    global _voice_service
    if _voice_service is None:
        _voice_service = VoiceService()
    return _voice_service
