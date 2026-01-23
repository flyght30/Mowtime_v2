"""
Transcription Service
OpenAI Whisper API integration for speech-to-text
"""

import logging
import os
import tempfile
from typing import Optional
import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class TranscriptionError(Exception):
    """Transcription service error"""
    pass


class TranscriptionResult:
    """Result of transcription operation"""
    def __init__(
        self,
        success: bool,
        text: Optional[str] = None,
        duration_seconds: float = 0.0,
        language: Optional[str] = None,
        confidence: float = 0.0,
        error: Optional[str] = None
    ):
        self.success = success
        self.text = text
        self.duration_seconds = duration_seconds
        self.language = language
        self.confidence = confidence
        self.error = error


class TranscriptionService:
    """OpenAI Whisper transcription service"""

    BASE_URL = "https://api.openai.com/v1"
    MODEL = "whisper-1"

    def __init__(self):
        self.api_key = settings.OPENAI_API_KEY
        self._configured = bool(self.api_key)

    @property
    def is_configured(self) -> bool:
        """Check if OpenAI is configured"""
        return self._configured

    async def transcribe_file(
        self,
        file_path: str,
        language: str = "en",
        prompt: Optional[str] = None
    ) -> TranscriptionResult:
        """
        Transcribe an audio file using Whisper

        Args:
            file_path: Path to audio file
            language: Language code (default: en)
            prompt: Optional prompt to guide transcription

        Returns:
            TranscriptionResult with text
        """
        if not self.is_configured:
            logger.warning("OpenAI not configured, skipping transcription")
            return TranscriptionResult(
                success=False,
                error="Transcription service not configured"
            )

        if not os.path.exists(file_path):
            return TranscriptionResult(
                success=False,
                error=f"File not found: {file_path}"
            )

        url = f"{self.BASE_URL}/audio/transcriptions"

        # Default prompt for service technician notes
        if not prompt:
            prompt = (
                "This is a technician describing work performed on a service call. "
                "Technical terms may include HVAC, electrical, plumbing, or lawn care terminology."
            )

        try:
            async with httpx.AsyncClient() as client:
                with open(file_path, "rb") as audio_file:
                    files = {
                        "file": (os.path.basename(file_path), audio_file, "audio/m4a"),
                        "model": (None, self.MODEL),
                        "language": (None, language),
                        "response_format": (None, "verbose_json"),
                    }
                    if prompt:
                        files["prompt"] = (None, prompt)

                    response = await client.post(
                        url,
                        files=files,
                        headers={"Authorization": f"Bearer {self.api_key}"},
                        timeout=120.0  # Transcription can take time
                    )

                if response.status_code == 200:
                    data = response.json()
                    text = data.get("text", "")
                    duration = data.get("duration", 0.0)
                    language = data.get("language", "en")

                    # Calculate confidence from segments if available
                    segments = data.get("segments", [])
                    if segments:
                        avg_confidence = sum(
                            s.get("avg_logprob", -1) for s in segments
                        ) / len(segments)
                        # Convert log probability to 0-1 scale (approximate)
                        confidence = min(1.0, max(0.0, 1 + avg_confidence / 2))
                    else:
                        confidence = 0.9  # Default high confidence

                    logger.info(f"Transcription success: {len(text)} chars, {duration:.1f}s")

                    return TranscriptionResult(
                        success=True,
                        text=text,
                        duration_seconds=duration,
                        language=language,
                        confidence=confidence
                    )
                else:
                    try:
                        error_data = response.json()
                        error_msg = error_data.get("error", {}).get("message", "Unknown error")
                    except Exception:
                        error_msg = f"HTTP {response.status_code}"

                    logger.error(f"Whisper API error: {error_msg}")
                    return TranscriptionResult(success=False, error=error_msg)

        except httpx.TimeoutException:
            logger.error("Whisper API timeout")
            return TranscriptionResult(success=False, error="Transcription timeout")
        except Exception as e:
            logger.error(f"Transcription error: {str(e)}")
            return TranscriptionResult(success=False, error=str(e))

    async def transcribe_url(
        self,
        audio_url: str,
        language: str = "en",
        prompt: Optional[str] = None
    ) -> TranscriptionResult:
        """
        Transcribe audio from a URL

        Args:
            audio_url: URL to audio file
            language: Language code
            prompt: Optional prompt

        Returns:
            TranscriptionResult with text
        """
        if not self.is_configured:
            return TranscriptionResult(
                success=False,
                error="Transcription service not configured"
            )

        # Download file to temp location
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(audio_url, timeout=60.0)
                if response.status_code != 200:
                    return TranscriptionResult(
                        success=False,
                        error=f"Failed to download audio: HTTP {response.status_code}"
                    )

                # Determine file extension from content type or URL
                content_type = response.headers.get("content-type", "")
                if "m4a" in content_type or audio_url.endswith(".m4a"):
                    ext = ".m4a"
                elif "wav" in content_type or audio_url.endswith(".wav"):
                    ext = ".wav"
                elif "mp3" in content_type or audio_url.endswith(".mp3"):
                    ext = ".mp3"
                else:
                    ext = ".m4a"  # Default

                # Save to temp file
                with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
                    tmp.write(response.content)
                    tmp_path = tmp.name

                try:
                    # Transcribe the temp file
                    result = await self.transcribe_file(tmp_path, language, prompt)
                    return result
                finally:
                    # Clean up temp file
                    try:
                        os.unlink(tmp_path)
                    except Exception:
                        pass

        except Exception as e:
            logger.error(f"Failed to transcribe from URL: {str(e)}")
            return TranscriptionResult(success=False, error=str(e))


# Singleton instance
_transcription_service: Optional[TranscriptionService] = None


def get_transcription_service() -> TranscriptionService:
    """Get transcription service singleton"""
    global _transcription_service
    if _transcription_service is None:
        _transcription_service = TranscriptionService()
    return _transcription_service
