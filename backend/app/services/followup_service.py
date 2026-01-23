"""
Follow-Up Service
Manages post-job follow-up calls and review solicitation
"""

import logging
from datetime import datetime, timedelta
from typing import Optional, List
from dataclasses import dataclass
from enum import Enum

from app.services.ai_service import get_ai_service
from app.services.call_service import get_call_service
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class FollowUpStatus(str, Enum):
    """Status of a follow-up"""
    SCHEDULED = "scheduled"
    CALLING = "calling"
    COMPLETED = "completed"
    NO_ANSWER = "no_answer"
    DECLINED = "declined"
    POSITIVE = "positive"  # Customer satisfied
    NEGATIVE = "negative"  # Customer has concerns
    CANCELLED = "cancelled"


class FollowUpType(str, Enum):
    """Type of follow-up"""
    SATISFACTION = "satisfaction"  # General satisfaction check
    REVIEW_REQUEST = "review_request"  # Request a review
    WARRANTY = "warranty"  # Warranty check-in
    MAINTENANCE = "maintenance"  # Maintenance reminder


@dataclass
class FollowUpResult:
    """Result of a follow-up operation"""
    success: bool
    followup_id: Optional[str] = None
    call_id: Optional[str] = None
    message: Optional[str] = None
    error: Optional[str] = None


@dataclass
class FollowUpScript:
    """Generated follow-up call script"""
    greeting: str
    satisfaction_question: str
    positive_response: str
    negative_response: str
    review_request: str
    closing: str


class FollowUpService:
    """Service for managing post-job follow-ups"""

    # Default delay after job completion (in hours)
    DEFAULT_DELAY_HOURS = 24

    def __init__(self):
        self.ai_service = get_ai_service()
        self.call_service = get_call_service()

    async def generate_followup_script(
        self,
        customer_name: str,
        service_type: str,
        tech_name: str,
        business_name: str,
        followup_type: FollowUpType = FollowUpType.SATISFACTION
    ) -> FollowUpScript:
        """
        Generate a personalized follow-up call script.

        Args:
            customer_name: Customer's name
            service_type: Type of service performed
            tech_name: Technician who performed the service
            business_name: Business name
            followup_type: Type of follow-up

        Returns:
            FollowUpScript with script components
        """
        if not self.ai_service.is_configured:
            # Return default script
            return FollowUpScript(
                greeting=f"Hi {customer_name}, this is {business_name} calling to follow up on your recent {service_type} service.",
                satisfaction_question="We wanted to make sure everything is working well. Are you satisfied with the service?",
                positive_response="That's wonderful to hear! We're glad we could help.",
                negative_response="I'm sorry to hear that. Let me connect you with our team to address your concerns.",
                review_request=f"If you have a moment, we'd really appreciate if you could leave us a review. It helps other homeowners find quality service.",
                closing="Thank you for choosing us. Have a great day!"
            )

        prompt = f"""Generate a natural, friendly follow-up call script for an HVAC company.

Details:
- Customer Name: {customer_name}
- Service Performed: {service_type}
- Technician: {tech_name}
- Business: {business_name}
- Follow-up Type: {followup_type.value}

Create a script with these components (keep each part brief and conversational):
1. Greeting - Introduce yourself and the purpose
2. Satisfaction Question - Ask about their experience
3. Positive Response - What to say if they're happy
4. Negative Response - What to say if they have concerns (offer to help)
5. Review Request - Politely ask for a review (only for positive experiences)
6. Closing - Thank them and say goodbye

Format your response as JSON:
{{
    "greeting": "...",
    "satisfaction_question": "...",
    "positive_response": "...",
    "negative_response": "...",
    "review_request": "...",
    "closing": "..."
}}
"""

        result = await self.ai_service.generate_text(prompt, max_tokens=800)

        if not result.success:
            # Return default script on failure
            return FollowUpScript(
                greeting=f"Hi {customer_name}, this is {business_name} calling to follow up on your recent {service_type} service.",
                satisfaction_question="We wanted to make sure everything is working well. Are you satisfied with the service?",
                positive_response="That's wonderful to hear! We're glad we could help.",
                negative_response="I'm sorry to hear that. Let me connect you with our team to address your concerns.",
                review_request=f"If you have a moment, we'd really appreciate if you could leave us a review. It helps other homeowners find quality service.",
                closing="Thank you for choosing us. Have a great day!"
            )

        try:
            import json
            raw = result.content
            json_start = raw.find("{")
            json_end = raw.rfind("}") + 1
            if json_start >= 0 and json_end > json_start:
                parsed = json.loads(raw[json_start:json_end])
                return FollowUpScript(
                    greeting=parsed.get("greeting", f"Hi {customer_name}..."),
                    satisfaction_question=parsed.get("satisfaction_question", "Are you satisfied?"),
                    positive_response=parsed.get("positive_response", "Great to hear!"),
                    negative_response=parsed.get("negative_response", "I'm sorry..."),
                    review_request=parsed.get("review_request", "Please leave a review."),
                    closing=parsed.get("closing", "Thank you!")
                )
        except Exception as e:
            logger.error(f"Failed to parse script: {e}")

        # Fallback
        return FollowUpScript(
            greeting=f"Hi {customer_name}, this is {business_name} calling to follow up on your recent {service_type} service.",
            satisfaction_question="We wanted to make sure everything is working well. Are you satisfied with the service?",
            positive_response="That's wonderful to hear! We're glad we could help.",
            negative_response="I'm sorry to hear that. Let me connect you with our team to address your concerns.",
            review_request=f"If you have a moment, we'd really appreciate if you could leave us a review.",
            closing="Thank you for choosing us. Have a great day!"
        )

    def calculate_followup_time(
        self,
        completed_at: datetime,
        delay_hours: int = None,
        followup_type: FollowUpType = FollowUpType.SATISFACTION
    ) -> datetime:
        """
        Calculate the optimal time for a follow-up call.

        Args:
            completed_at: When the job was completed
            delay_hours: Hours to wait after completion
            followup_type: Type of follow-up

        Returns:
            Scheduled datetime for follow-up
        """
        if delay_hours is None:
            # Default delays by type
            delays = {
                FollowUpType.SATISFACTION: 24,  # 1 day
                FollowUpType.REVIEW_REQUEST: 48,  # 2 days
                FollowUpType.WARRANTY: 24 * 30,  # 30 days
                FollowUpType.MAINTENANCE: 24 * 90,  # 90 days
            }
            delay_hours = delays.get(followup_type, self.DEFAULT_DELAY_HOURS)

        scheduled = completed_at + timedelta(hours=delay_hours)

        # Adjust to business hours (9 AM - 6 PM)
        if scheduled.hour < 9:
            scheduled = scheduled.replace(hour=10, minute=0)
        elif scheduled.hour >= 18:
            # Move to next day
            scheduled = scheduled + timedelta(days=1)
            scheduled = scheduled.replace(hour=10, minute=0)

        # Skip weekends
        while scheduled.weekday() >= 5:  # Saturday=5, Sunday=6
            scheduled = scheduled + timedelta(days=1)

        return scheduled

    async def generate_review_request_message(
        self,
        customer_name: str,
        service_type: str,
        business_name: str,
        review_url: Optional[str] = None
    ) -> str:
        """
        Generate a personalized review request message.

        Args:
            customer_name: Customer's name
            service_type: Type of service performed
            business_name: Business name
            review_url: URL where customer can leave review

        Returns:
            Review request message
        """
        if not self.ai_service.is_configured:
            msg = f"Hi {customer_name}! Thank you for choosing {business_name} for your {service_type}. We hope everything is working great! If you have a moment, we'd really appreciate a review - it helps other homeowners find quality service."
            if review_url:
                msg += f" You can leave a review here: {review_url}"
            return msg

        prompt = f"""Write a brief, friendly SMS message asking a customer to leave a review.

Details:
- Customer: {customer_name}
- Service: {service_type}
- Business: {business_name}
{f'- Review URL: {review_url}' if review_url else ''}

Requirements:
- Keep it under 160 characters if possible
- Be warm and appreciative
- Don't be pushy
- Include the review URL if provided

Write ONLY the message, no explanation."""

        result = await self.ai_service.generate_text(prompt, max_tokens=200)

        if result.success:
            return result.content.strip()

        # Fallback message
        msg = f"Hi {customer_name}! Thank you for choosing {business_name}. If you're happy with our service, we'd love a review!"
        if review_url:
            msg += f" {review_url}"
        return msg

    async def analyze_call_sentiment(
        self,
        transcript: str
    ) -> dict:
        """
        Analyze the sentiment of a follow-up call transcript.

        Args:
            transcript: Call transcript text

        Returns:
            Dict with sentiment analysis
        """
        if not self.ai_service.is_configured:
            return {
                "sentiment": "unknown",
                "satisfied": None,
                "concerns": [],
                "follow_up_needed": False
            }

        prompt = f"""Analyze this customer follow-up call transcript and determine:
1. Overall sentiment (positive, negative, neutral)
2. Is the customer satisfied? (yes/no/unclear)
3. Any specific concerns mentioned (list them)
4. Does this need human follow-up? (yes/no)

Transcript:
{transcript}

Respond as JSON:
{{
    "sentiment": "positive|negative|neutral",
    "satisfied": true|false|null,
    "concerns": ["concern 1", "concern 2"],
    "follow_up_needed": true|false,
    "summary": "brief summary"
}}
"""

        result = await self.ai_service.generate_text(prompt, max_tokens=500)

        if not result.success:
            return {
                "sentiment": "unknown",
                "satisfied": None,
                "concerns": [],
                "follow_up_needed": True  # Err on side of caution
            }

        try:
            import json
            raw = result.content
            json_start = raw.find("{")
            json_end = raw.rfind("}") + 1
            if json_start >= 0 and json_end > json_start:
                return json.loads(raw[json_start:json_end])
        except Exception as e:
            logger.error(f"Failed to parse sentiment: {e}")

        return {
            "sentiment": "unknown",
            "satisfied": None,
            "concerns": [],
            "follow_up_needed": True
        }


# Singleton instance
_followup_service: Optional[FollowUpService] = None


def get_followup_service() -> FollowUpService:
    """Get follow-up service singleton"""
    global _followup_service
    if _followup_service is None:
        _followup_service = FollowUpService()
    return _followup_service
