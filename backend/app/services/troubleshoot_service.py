"""
Troubleshooting Service
AI-powered HVAC troubleshooting assistance
"""

import json
import logging
import os
from typing import Optional
from dataclasses import dataclass

from app.services.ai_service import get_ai_service
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Load error codes database
ERROR_CODES_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "error_codes.json")


@dataclass
class ErrorCodeInfo:
    """Information about an error code"""
    code: str
    meaning: str
    category: str
    severity: str
    description: str
    possible_causes: list
    solutions: list
    parts_needed: list
    brand: str


@dataclass
class TroubleshootResult:
    """Result of troubleshooting query"""
    success: bool
    error_info: Optional[ErrorCodeInfo] = None
    ai_guidance: Optional[str] = None
    follow_up_questions: list = None
    tokens_used: int = 0
    error: Optional[str] = None

    def __post_init__(self):
        if self.follow_up_questions is None:
            self.follow_up_questions = []


@dataclass
class SymptomInfo:
    """Information about a common symptom"""
    symptom: str
    category: str
    initial_checks: list
    common_causes: list
    diagnostic_steps: list


class TroubleshootService:
    """HVAC Troubleshooting assistance service"""

    def __init__(self):
        self._error_codes_db = None
        self._load_error_codes()

    def _load_error_codes(self):
        """Load error codes database from JSON"""
        try:
            with open(ERROR_CODES_PATH, "r") as f:
                self._error_codes_db = json.load(f)
            logger.info(f"Loaded error codes database with {len(self._error_codes_db)} brands")
        except FileNotFoundError:
            logger.warning(f"Error codes file not found: {ERROR_CODES_PATH}")
            self._error_codes_db = {}
        except json.JSONDecodeError as e:
            logger.error(f"Error parsing error codes JSON: {e}")
            self._error_codes_db = {}

    def get_supported_brands(self) -> list:
        """Get list of supported brands"""
        return [
            {
                "id": brand_id,
                "name": data.get("brand_name", brand_id)
            }
            for brand_id, data in self._error_codes_db.items()
            if brand_id not in ["common_symptoms"]
        ]

    def lookup_error_code(self, brand: str, code: str) -> Optional[ErrorCodeInfo]:
        """Look up an error code in the database"""
        brand_lower = brand.lower()

        # Try exact match first
        if brand_lower in self._error_codes_db:
            brand_data = self._error_codes_db[brand_lower]
            error_codes = brand_data.get("error_codes", {})

            # Try exact code match
            code_upper = code.upper()
            code_str = str(code)

            if code_str in error_codes:
                ec = error_codes[code_str]
                return ErrorCodeInfo(
                    code=ec["code"],
                    meaning=ec["meaning"],
                    category=ec["category"],
                    severity=ec["severity"],
                    description=ec["description"],
                    possible_causes=ec["possible_causes"],
                    solutions=ec["solutions"],
                    parts_needed=ec.get("parts_needed", []),
                    brand=brand_data.get("brand_name", brand)
                )

            if code_upper in error_codes:
                ec = error_codes[code_upper]
                return ErrorCodeInfo(
                    code=ec["code"],
                    meaning=ec["meaning"],
                    category=ec["category"],
                    severity=ec["severity"],
                    description=ec["description"],
                    possible_causes=ec["possible_causes"],
                    solutions=ec["solutions"],
                    parts_needed=ec.get("parts_needed", []),
                    brand=brand_data.get("brand_name", brand)
                )

        # Try finding brand by name
        for brand_id, brand_data in self._error_codes_db.items():
            brand_name = brand_data.get("brand_name", "").lower()
            if brand_lower in brand_name or brand_name in brand_lower:
                error_codes = brand_data.get("error_codes", {})
                code_str = str(code)
                code_upper = code.upper()

                if code_str in error_codes:
                    ec = error_codes[code_str]
                    return ErrorCodeInfo(
                        code=ec["code"],
                        meaning=ec["meaning"],
                        category=ec["category"],
                        severity=ec["severity"],
                        description=ec["description"],
                        possible_causes=ec["possible_causes"],
                        solutions=ec["solutions"],
                        parts_needed=ec.get("parts_needed", []),
                        brand=brand_data.get("brand_name", brand)
                    )

                if code_upper in error_codes:
                    ec = error_codes[code_upper]
                    return ErrorCodeInfo(
                        code=ec["code"],
                        meaning=ec["meaning"],
                        category=ec["category"],
                        severity=ec["severity"],
                        description=ec["description"],
                        possible_causes=ec["possible_causes"],
                        solutions=ec["solutions"],
                        parts_needed=ec.get("parts_needed", []),
                        brand=brand_data.get("brand_name", brand)
                    )

        return None

    def get_common_symptoms(self) -> list:
        """Get list of common symptoms"""
        symptoms = self._error_codes_db.get("common_symptoms", {})
        return [
            {
                "id": symptom_id,
                "symptom": data.get("symptom", symptom_id),
                "category": data.get("category", "general")
            }
            for symptom_id, data in symptoms.items()
        ]

    def lookup_symptom(self, symptom_id: str) -> Optional[SymptomInfo]:
        """Look up a common symptom"""
        symptoms = self._error_codes_db.get("common_symptoms", {})

        if symptom_id in symptoms:
            s = symptoms[symptom_id]
            return SymptomInfo(
                symptom=s.get("symptom", symptom_id),
                category=s.get("category", "general"),
                initial_checks=s.get("initial_checks", []),
                common_causes=s.get("common_causes", []),
                diagnostic_steps=s.get("diagnostic_steps", [])
            )

        return None

    async def troubleshoot(
        self,
        brand: Optional[str] = None,
        error_code: Optional[str] = None,
        symptom: Optional[str] = None,
        equipment_type: Optional[str] = None,
        description: Optional[str] = None,
        context: Optional[str] = None
    ) -> TroubleshootResult:
        """
        AI-powered troubleshooting based on error code, symptom, or description.

        Args:
            brand: Equipment brand (e.g., "Carrier", "Trane")
            error_code: Error/fault code displayed
            symptom: Symptom description or symptom ID
            equipment_type: Type of equipment (furnace, AC, heat pump, etc.)
            description: Free-form problem description
            context: Additional context (e.g., recent work, weather)

        Returns:
            TroubleshootResult with guidance
        """
        # First, try to look up error code in database
        error_info = None
        if brand and error_code:
            error_info = self.lookup_error_code(brand, error_code)

        # Check for symptom match
        symptom_info = None
        if symptom:
            # Try symptom ID lookup
            symptom_info = self.lookup_symptom(symptom.lower().replace(" ", "_"))

        # Build context for AI
        ai_service = get_ai_service()

        if not ai_service.is_configured:
            # Return database info without AI enhancement
            if error_info:
                return TroubleshootResult(
                    success=True,
                    error_info=error_info,
                    ai_guidance=None,
                    follow_up_questions=[
                        "Have you checked the air filter recently?",
                        "When did this problem start?",
                        "Has any recent work been done on the system?"
                    ]
                )
            elif symptom_info:
                return TroubleshootResult(
                    success=True,
                    ai_guidance=f"For {symptom_info.symptom}, check: {', '.join(symptom_info.initial_checks[:3])}",
                    follow_up_questions=symptom_info.diagnostic_steps[:3]
                )
            else:
                return TroubleshootResult(
                    success=False,
                    error="No matching error code found and AI service not configured"
                )

        # Build comprehensive prompt for AI
        prompt_parts = ["You are an expert HVAC technician helping diagnose a problem.\n"]

        if error_info:
            prompt_parts.append(f"""
Error Code Information:
- Brand: {error_info.brand}
- Code: {error_info.code}
- Meaning: {error_info.meaning}
- Category: {error_info.category}
- Severity: {error_info.severity}
- Description: {error_info.description}
- Possible Causes: {', '.join(error_info.possible_causes[:5])}
- Solutions: {', '.join(error_info.solutions[:5])}
""")

        if brand and not error_info:
            prompt_parts.append(f"Equipment Brand: {brand}")

        if error_code and not error_info:
            prompt_parts.append(f"Error Code: {error_code} (not found in database)")

        if equipment_type:
            prompt_parts.append(f"Equipment Type: {equipment_type}")

        if symptom:
            prompt_parts.append(f"Reported Symptom: {symptom}")
            if symptom_info:
                prompt_parts.append(f"Common causes for this symptom: {', '.join(symptom_info.common_causes[:5])}")

        if description:
            prompt_parts.append(f"Problem Description: {description}")

        if context:
            prompt_parts.append(f"Additional Context: {context}")

        prompt_parts.append("""
Based on this information, provide:
1. A clear diagnosis assessment
2. Step-by-step troubleshooting instructions (numbered list)
3. Safety warnings if applicable
4. Parts that may be needed
5. When to recommend calling for professional help

Keep the response concise but thorough. Focus on practical, actionable guidance.
""")

        full_prompt = "\n".join(prompt_parts)

        # Get AI guidance
        result = await ai_service.generate_text(full_prompt, max_tokens=1500)

        if not result.success:
            return TroubleshootResult(
                success=True if error_info else False,
                error_info=error_info,
                ai_guidance=None,
                error=result.error,
                follow_up_questions=[
                    "Have you checked the air filter?",
                    "Is the thermostat set correctly?",
                    "Are all circuit breakers on?"
                ]
            )

        # Generate follow-up questions
        follow_up_questions = [
            "Did this resolve the issue?",
            "Are there any other symptoms you're noticing?",
            "Would you like more details on any specific step?"
        ]

        return TroubleshootResult(
            success=True,
            error_info=error_info,
            ai_guidance=result.content,
            follow_up_questions=follow_up_questions,
            tokens_used=result.tokens_used
        )

    async def ask_followup(
        self,
        original_problem: str,
        original_guidance: str,
        followup_question: str
    ) -> TroubleshootResult:
        """
        Handle a follow-up question about troubleshooting guidance.

        Args:
            original_problem: The original problem description
            original_guidance: The AI guidance that was provided
            followup_question: The user's follow-up question

        Returns:
            TroubleshootResult with additional guidance
        """
        ai_service = get_ai_service()

        if not ai_service.is_configured:
            return TroubleshootResult(
                success=False,
                error="AI service not configured"
            )

        prompt = f"""You are an expert HVAC technician providing follow-up assistance.

Original Problem:
{original_problem}

Previous Guidance Provided:
{original_guidance}

Follow-up Question:
{followup_question}

Provide a clear, helpful response to the follow-up question. If the question indicates the issue wasn't resolved, provide alternative troubleshooting steps.
"""

        result = await ai_service.generate_text(prompt, max_tokens=1000)

        if not result.success:
            return TroubleshootResult(
                success=False,
                error=result.error
            )

        return TroubleshootResult(
            success=True,
            ai_guidance=result.content,
            tokens_used=result.tokens_used,
            follow_up_questions=[
                "Did this help resolve the issue?",
                "Do you need more specific instructions?",
                "Would you like me to explain anything in more detail?"
            ]
        )


# Singleton instance
_troubleshoot_service: Optional[TroubleshootService] = None


def get_troubleshoot_service() -> TroubleshootService:
    """Get troubleshoot service singleton"""
    global _troubleshoot_service
    if _troubleshoot_service is None:
        _troubleshoot_service = TroubleshootService()
    return _troubleshoot_service
