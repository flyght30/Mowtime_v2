"""
AI Service
Claude API integration for intelligent text processing
"""

import logging
from typing import Optional
import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class AIError(Exception):
    """AI service error"""
    pass


class AIResult:
    """Result of AI operation"""
    def __init__(
        self,
        success: bool,
        content: Optional[str] = None,
        tokens_used: int = 0,
        error: Optional[str] = None
    ):
        self.success = success
        self.content = content
        self.tokens_used = tokens_used
        self.error = error


class AIService:
    """Claude API service for intelligent processing"""

    BASE_URL = "https://api.anthropic.com/v1"
    MODEL = "claude-3-haiku-20240307"  # Fast, cost-effective for summaries
    MODEL_SMART = "claude-3-5-sonnet-20241022"  # For complex reasoning

    def __init__(self):
        self.api_key = settings.ANTHROPIC_API_KEY
        self._configured = bool(self.api_key)

    @property
    def is_configured(self) -> bool:
        """Check if Anthropic is configured"""
        return self._configured

    async def _call_claude(
        self,
        system_prompt: str,
        user_message: str,
        model: Optional[str] = None,
        max_tokens: int = 1024
    ) -> AIResult:
        """Make a Claude API call"""
        if not self.is_configured:
            logger.warning("Anthropic not configured, skipping AI call")
            return AIResult(success=False, error="AI service not configured")

        url = f"{self.BASE_URL}/messages"
        model = model or self.MODEL

        payload = {
            "model": model,
            "max_tokens": max_tokens,
            "system": system_prompt,
            "messages": [
                {"role": "user", "content": user_message}
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
                    timeout=60.0
                )

                if response.status_code == 200:
                    data = response.json()
                    content = data["content"][0]["text"]
                    tokens = data.get("usage", {}).get("output_tokens", 0)

                    logger.info(f"Claude API success: {tokens} tokens used")

                    return AIResult(
                        success=True,
                        content=content,
                        tokens_used=tokens
                    )
                else:
                    try:
                        error_data = response.json()
                        error_msg = error_data.get("error", {}).get("message", "Unknown error")
                    except Exception:
                        error_msg = f"HTTP {response.status_code}"

                    logger.error(f"Claude API error: {error_msg}")
                    return AIResult(success=False, error=error_msg)

        except httpx.TimeoutException:
            logger.error("Claude API timeout")
            return AIResult(success=False, error="Request timeout")
        except Exception as e:
            logger.error(f"Claude API error: {str(e)}")
            return AIResult(success=False, error=str(e))

    async def summarize_voice_note(self, transcription: str) -> AIResult:
        """
        Summarize a technician's voice note into professional completion notes

        Args:
            transcription: Raw transcription from Whisper

        Returns:
            AIResult with professional summary
        """
        system_prompt = """You are an expert at converting technician voice notes into professional job completion summaries.

Your task is to transform informal, spoken descriptions into clear, professional documentation suitable for customer records and business records.

Guidelines:
- Write in third person, past tense
- Be concise but complete (2-4 sentences typically)
- Include: work performed, any issues found, parts/materials used, and final status
- Use professional terminology appropriate for the trade
- Remove filler words, repetition, and informal language
- If the tech mentions the customer's reaction, include it briefly
- Do not add information that wasn't in the original"""

        user_message = f"""Convert this technician's voice note into a professional job completion summary:

---
{transcription}
---

Professional Summary:"""

        return await self._call_claude(system_prompt, user_message, max_tokens=500)

    async def classify_call_intent(
        self,
        speech_text: str,
        conversation_history: Optional[list[dict]] = None
    ) -> AIResult:
        """
        Classify caller intent from speech

        Args:
            speech_text: Current speech from caller
            conversation_history: Previous turns in conversation

        Returns:
            AIResult with intent classification and suggested response
        """
        system_prompt = """You are an AI assistant helping classify customer call intents for a service business (HVAC, lawn care, etc).

Classify the caller's intent into one of these categories:
- BOOKING: Wants to schedule a new appointment
- RESCHEDULE: Wants to change an existing appointment
- CANCEL: Wants to cancel an appointment
- STATUS: Asking about technician arrival or job status
- INQUIRY: Asking about prices, services, or general questions
- SUPPORT: Needs help with a problem or complaint
- TRANSFER: Explicitly asking to speak to a human
- OTHER: Doesn't fit other categories

Also provide a natural, helpful response the AI receptionist should give.

Respond in this JSON format:
{
  "intent": "BOOKING",
  "confidence": 0.95,
  "response": "I'd be happy to help you schedule an appointment. What service do you need?",
  "entities": {"service_type": "AC repair", "urgency": "normal"}
}"""

        history_text = ""
        if conversation_history:
            history_text = "\n\nConversation so far:\n"
            for turn in conversation_history[-5:]:  # Last 5 turns
                role = "Caller" if turn.get("role") == "caller" else "AI"
                history_text += f"{role}: {turn.get('content', '')}\n"

        user_message = f"""Classify this caller's intent and provide a response:
{history_text}
Current speech: "{speech_text}"

JSON response:"""

        return await self._call_claude(
            system_prompt,
            user_message,
            model=self.MODEL_SMART,
            max_tokens=300
        )

    async def generate_conversation_response(
        self,
        business_name: str,
        conversation_history: list[dict],
        current_speech: str,
        available_services: Optional[list[str]] = None,
        available_slots: Optional[list[dict]] = None
    ) -> AIResult:
        """
        Generate a natural conversational response for the AI receptionist

        Args:
            business_name: Name of the business
            conversation_history: Previous conversation turns
            current_speech: What the caller just said
            available_services: List of services offered
            available_slots: Available appointment slots

        Returns:
            AIResult with response text and extracted data
        """
        services_text = ""
        if available_services:
            services_text = f"\nAvailable services: {', '.join(available_services)}"

        slots_text = ""
        if available_slots:
            slots_text = "\nAvailable appointment slots:\n"
            for slot in available_slots[:5]:
                slots_text += f"- {slot.get('date')} at {slot.get('time')}\n"

        system_prompt = f"""You are Clara, the AI receptionist for {business_name}. You help callers with:
- Scheduling new appointments
- Checking appointment status
- Answering questions about services
- Taking messages when needed

Personality:
- Friendly but professional
- Concise - keep responses under 2-3 sentences
- Ask one question at a time
- Confirm information back to the caller
{services_text}{slots_text}

When collecting information, extract these fields when mentioned:
- name: Customer's full name
- phone: Phone number
- address: Service address
- service_type: What service they need
- preferred_date: When they want the appointment
- preferred_time: Time preference
- issue_description: Description of the problem

Respond with JSON:
{{
  "response": "Your spoken response to the caller",
  "action": "continue|book|transfer|end",
  "collected_data": {{"name": "John Smith", "phone": "555-1234"}},
  "needs_info": ["address", "preferred_date"]
}}"""

        history_text = "Conversation:\n"
        for turn in conversation_history:
            role = "Caller" if turn.get("role") == "caller" else "Clara"
            history_text += f"{role}: {turn.get('content', '')}\n"
        history_text += f"Caller: {current_speech}\n"

        user_message = f"""{history_text}

Generate Clara's response (JSON):"""

        return await self._call_claude(
            system_prompt,
            user_message,
            model=self.MODEL_SMART,
            max_tokens=400
        )

    async def calculate_no_show_risk(
        self,
        customer_history: dict,
        appointment_details: dict
    ) -> AIResult:
        """
        Calculate no-show risk for an appointment

        Args:
            customer_history: Customer's appointment history and engagement
            appointment_details: Details of the upcoming appointment

        Returns:
            AIResult with risk assessment
        """
        system_prompt = """You are an expert at predicting appointment no-shows for service businesses.

Analyze the customer history and appointment details to assess no-show risk.

Risk factors to consider:
- Previous no-shows or late cancellations
- SMS/communication engagement (replies vs ignores)
- Time since booking (longer = higher risk)
- Day of week patterns
- First-time vs repeat customer
- Appointment type and value

Respond with JSON:
{
  "risk_score": 0.35,
  "risk_level": "medium",
  "factors": [
    {"factor": "previous_no_show", "impact": 0.25, "description": "1 no-show in past year"},
    {"factor": "no_sms_reply", "impact": 0.10, "description": "No reply to confirmation SMS"}
  ],
  "recommendation": "Send a reminder call 24 hours before",
  "suggested_action": "call_reminder"
}"""

        user_message = f"""Assess no-show risk for this appointment:

Customer History:
{customer_history}

Appointment Details:
{appointment_details}

Risk Assessment (JSON):"""

        return await self._call_claude(system_prompt, user_message, max_tokens=400)


# Singleton instance
_ai_service: Optional[AIService] = None


def get_ai_service() -> AIService:
    """Get AI service singleton"""
    global _ai_service
    if _ai_service is None:
        _ai_service = AIService()
    return _ai_service
