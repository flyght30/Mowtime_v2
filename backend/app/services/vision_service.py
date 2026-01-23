"""
Vision Service
Claude Vision API integration for image analysis
"""

import base64
import logging
from typing import Optional
from dataclasses import dataclass
import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class PropertyAnalysis:
    """Result of property photo analysis"""
    sqft_estimate: Optional[int] = None
    sqft_confidence: float = 0.0
    sun_exposure: str = "partial"  # shady, partial, full
    sun_confidence: float = 0.0
    window_percentage: int = 10
    window_confidence: float = 0.0
    roof_type: str = "unknown"
    home_age: str = "unknown"
    visible_equipment: Optional[str] = None
    notes: str = ""
    raw_response: Optional[str] = None


@dataclass
class EquipmentAnalysis:
    """Result of equipment photo analysis"""
    brand: Optional[str] = None
    model: Optional[str] = None
    equipment_type: str = "unknown"  # condensing_unit, air_handler, furnace, etc.
    estimated_age: Optional[str] = None
    tonnage: Optional[str] = None
    condition: str = "unknown"  # excellent, good, fair, poor
    visible_issues: list = None
    common_issues: list = None
    replacement_recommended: bool = False
    replacement_reason: Optional[str] = None
    raw_response: Optional[str] = None

    def __post_init__(self):
        if self.visible_issues is None:
            self.visible_issues = []
        if self.common_issues is None:
            self.common_issues = []


@dataclass
class VisionResult:
    """Result of vision operation"""
    success: bool
    data: Optional[dict] = None
    tokens_used: int = 0
    error: Optional[str] = None


class VisionService:
    """Claude Vision service for image analysis"""

    BASE_URL = "https://api.anthropic.com/v1"
    MODEL = "claude-3-5-sonnet-20241022"  # Vision-capable model

    def __init__(self):
        self.api_key = settings.ANTHROPIC_API_KEY
        self._configured = bool(self.api_key)

    @property
    def is_configured(self) -> bool:
        """Check if vision service is configured"""
        return self._configured

    def _encode_image(self, image_data: bytes, media_type: str = "image/jpeg") -> dict:
        """Encode image for Claude API"""
        base64_image = base64.standard_b64encode(image_data).decode("utf-8")
        return {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": media_type,
                "data": base64_image
            }
        }

    async def _call_vision(
        self,
        system_prompt: str,
        user_text: str,
        image_data: bytes,
        media_type: str = "image/jpeg",
        max_tokens: int = 2048
    ) -> VisionResult:
        """Make a Claude Vision API call"""
        if not self.is_configured:
            logger.warning("Anthropic not configured, skipping vision call")
            return VisionResult(success=False, error="Vision service not configured")

        url = f"{self.BASE_URL}/messages"

        # Build message with image
        image_content = self._encode_image(image_data, media_type)
        text_content = {"type": "text", "text": user_text}

        payload = {
            "model": self.MODEL,
            "max_tokens": max_tokens,
            "system": system_prompt,
            "messages": [
                {
                    "role": "user",
                    "content": [image_content, text_content]
                }
            ]
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    json=payload,
                    headers={
                        "x-api-key": self.api_key,
                        "anthropic-version": "2023-06-01",
                        "Content-Type": "application/json"
                    },
                    timeout=90.0  # Longer timeout for vision
                )

                if response.status_code == 200:
                    data = response.json()
                    content = data["content"][0]["text"]
                    tokens = data.get("usage", {}).get("output_tokens", 0)

                    logger.info(f"Vision API success: {tokens} tokens used")

                    return VisionResult(
                        success=True,
                        data={"raw_response": content},
                        tokens_used=tokens
                    )
                else:
                    try:
                        error_data = response.json()
                        error_msg = error_data.get("error", {}).get("message", "Unknown error")
                    except Exception:
                        error_msg = f"HTTP {response.status_code}"

                    logger.error(f"Vision API error: {error_msg}")
                    return VisionResult(success=False, error=error_msg)

        except httpx.TimeoutException:
            logger.error("Vision API timeout")
            return VisionResult(success=False, error="Request timeout - image may be too large")
        except Exception as e:
            logger.error(f"Vision API error: {str(e)}")
            return VisionResult(success=False, error=str(e))

    async def analyze_property(
        self,
        image_data: bytes,
        media_type: str = "image/jpeg"
    ) -> VisionResult:
        """
        Analyze an exterior property photo for HVAC sizing estimation.

        Args:
            image_data: Raw image bytes
            media_type: MIME type of image

        Returns:
            VisionResult with PropertyAnalysis data
        """
        system_prompt = """You are an expert at analyzing exterior home photos to estimate HVAC sizing parameters.

Your task is to analyze the provided image and extract information useful for HVAC load calculations.

For each estimate, provide a confidence score from 0.0 to 1.0 based on image quality and visibility.

Respond ONLY with valid JSON in this exact format:
{
    "sqft_estimate": 2400,
    "sqft_confidence": 0.75,
    "sun_exposure": "partial",
    "sun_confidence": 0.85,
    "window_percentage": 15,
    "window_confidence": 0.70,
    "roof_type": "shingle",
    "home_age": "1990s",
    "visible_equipment": "Condensing unit visible on north side",
    "notes": "Two-story home with mature trees providing afternoon shade on south side"
}

Guidelines:
- sqft_estimate: Estimate based on visible structure size, stories, typical room layouts
- sun_exposure: "shady" (heavy tree cover), "partial" (some shade), or "full" (full sun exposure)
- window_percentage: Estimate of window-to-wall ratio (typical homes 10-20%)
- roof_type: "shingle", "tile", "metal", "flat", "unknown"
- home_age: Decade estimate based on architectural style ("1960s", "1980s", "2000s", etc.)
- visible_equipment: Note any HVAC equipment visible (condenser, vents, etc.)
- notes: Any other relevant observations for HVAC sizing"""

        user_text = """Analyze this exterior home photo for HVAC sizing estimation.

Provide your analysis as JSON with confidence scores for each estimate."""

        result = await self._call_vision(
            system_prompt,
            user_text,
            image_data,
            media_type
        )

        if result.success:
            try:
                import json
                # Extract JSON from response
                raw = result.data.get("raw_response", "{}")
                # Find JSON in response (may have text before/after)
                json_start = raw.find("{")
                json_end = raw.rfind("}") + 1
                if json_start >= 0 and json_end > json_start:
                    json_str = raw[json_start:json_end]
                    parsed = json.loads(json_str)

                    result.data = {
                        "analysis": PropertyAnalysis(
                            sqft_estimate=parsed.get("sqft_estimate"),
                            sqft_confidence=parsed.get("sqft_confidence", 0.0),
                            sun_exposure=parsed.get("sun_exposure", "partial"),
                            sun_confidence=parsed.get("sun_confidence", 0.0),
                            window_percentage=parsed.get("window_percentage", 10),
                            window_confidence=parsed.get("window_confidence", 0.0),
                            roof_type=parsed.get("roof_type", "unknown"),
                            home_age=parsed.get("home_age", "unknown"),
                            visible_equipment=parsed.get("visible_equipment"),
                            notes=parsed.get("notes", ""),
                            raw_response=raw
                        ),
                        "suggested_inputs": {
                            "sqft": parsed.get("sqft_estimate"),
                            "sun_exposure": parsed.get("sun_exposure", "partial"),
                            "window_percentage": parsed.get("window_percentage", 10),
                            "insulation": "average"  # Default, can't determine from photo
                        }
                    }
            except (json.JSONDecodeError, KeyError) as e:
                logger.error(f"Failed to parse property analysis: {e}")
                result.success = False
                result.error = "Failed to parse AI response"

        return result

    async def analyze_equipment(
        self,
        image_data: bytes,
        media_type: str = "image/jpeg"
    ) -> VisionResult:
        """
        Analyze HVAC equipment photo to identify brand, model, and condition.

        Args:
            image_data: Raw image bytes
            media_type: MIME type of image

        Returns:
            VisionResult with EquipmentAnalysis data
        """
        system_prompt = """You are an expert HVAC technician who can identify equipment from photos.

Analyze the provided image of HVAC equipment and extract as much information as possible.

Respond ONLY with valid JSON in this exact format:
{
    "brand": "Carrier",
    "model": "24ACC636A003",
    "equipment_type": "condensing_unit",
    "estimated_age": "12-15 years",
    "tonnage": "3 ton",
    "condition": "fair",
    "visible_issues": [
        "Surface rust on cabinet",
        "Debris accumulated around unit"
    ],
    "common_issues": [
        "Capacitor failure common at this age",
        "Contactor may show wear",
        "Check refrigerant levels"
    ],
    "replacement_recommended": true,
    "replacement_reason": "Unit approaching end of typical 15-20 year lifespan"
}

Guidelines:
- brand: Identify from nameplate, logo, or cabinet style (Carrier, Trane, Lennox, Rheem, etc.)
- model: Read from nameplate if visible, otherwise null
- equipment_type: "condensing_unit", "air_handler", "furnace", "heat_pump", "mini_split", "package_unit"
- estimated_age: Based on model year, wear patterns, style ("2-5 years", "5-10 years", etc.)
- tonnage: Estimate from physical size or model number
- condition: "excellent", "good", "fair", "poor"
- visible_issues: List any visible problems (rust, damage, debris, leaks, corrosion)
- common_issues: Based on equipment age and type, what problems are common
- replacement_recommended: true if unit is old or in poor condition
- replacement_reason: Explain why replacement is or isn't recommended"""

        user_text = """Analyze this HVAC equipment photo.

Identify the brand, model, age, condition, and any visible issues.
Also provide common issues for this equipment type and age.

Respond as JSON."""

        result = await self._call_vision(
            system_prompt,
            user_text,
            image_data,
            media_type
        )

        if result.success:
            try:
                import json
                raw = result.data.get("raw_response", "{}")
                json_start = raw.find("{")
                json_end = raw.rfind("}") + 1
                if json_start >= 0 and json_end > json_start:
                    json_str = raw[json_start:json_end]
                    parsed = json.loads(json_str)

                    result.data = {
                        "equipment": EquipmentAnalysis(
                            brand=parsed.get("brand"),
                            model=parsed.get("model"),
                            equipment_type=parsed.get("equipment_type", "unknown"),
                            estimated_age=parsed.get("estimated_age"),
                            tonnage=parsed.get("tonnage"),
                            condition=parsed.get("condition", "unknown"),
                            visible_issues=parsed.get("visible_issues", []),
                            common_issues=parsed.get("common_issues", []),
                            replacement_recommended=parsed.get("replacement_recommended", False),
                            replacement_reason=parsed.get("replacement_reason"),
                            raw_response=raw
                        ),
                        "replacement_suggestion": {
                            "recommended": parsed.get("replacement_recommended", False),
                            "reason": parsed.get("replacement_reason")
                        }
                    }
            except (json.JSONDecodeError, KeyError) as e:
                logger.error(f"Failed to parse equipment analysis: {e}")
                result.success = False
                result.error = "Failed to parse AI response"

        return result


# Singleton instance
_vision_service: Optional[VisionService] = None


def get_vision_service() -> VisionService:
    """Get vision service singleton"""
    global _vision_service
    if _vision_service is None:
        _vision_service = VisionService()
    return _vision_service
