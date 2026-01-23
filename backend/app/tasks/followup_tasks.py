"""
Follow-Up Background Tasks
Automated follow-up call scheduling and execution
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional

from app.database import Database
from app.services.followup_service import get_followup_service, FollowUpStatus, FollowUpType
from app.services.call_service import get_call_service
from app.services.sms_service import get_sms_service
from app.services.ai_service import get_ai_service
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class FollowUpTaskRunner:
    """Background task runner for follow-up calls"""

    def __init__(self):
        self.followup_service = get_followup_service()
        self.call_service = get_call_service()
        self.sms_service = get_sms_service()
        self.ai_service = get_ai_service()
        self.running = False
        self.check_interval = 60  # Check every minute

    async def start(self):
        """Start the background task runner"""
        self.running = True
        logger.info("Follow-up task runner started")

        while self.running:
            try:
                await self.process_pending_followups()
            except Exception as e:
                logger.error(f"Error in follow-up task runner: {e}")

            await asyncio.sleep(self.check_interval)

    def stop(self):
        """Stop the background task runner"""
        self.running = False
        logger.info("Follow-up task runner stopped")

    async def process_pending_followups(self):
        """Process all pending follow-ups that are due"""
        db = Database.get_database()

        # Find follow-ups that are due
        now = datetime.utcnow()
        pending = await db.followups.find({
            "status": FollowUpStatus.SCHEDULED.value,
            "scheduled_for": {"$lte": now}
        }).limit(10).to_list(length=10)

        if not pending:
            return

        logger.info(f"Processing {len(pending)} pending follow-ups")

        for followup in pending:
            try:
                await self.execute_followup(followup)
            except Exception as e:
                logger.error(f"Error processing follow-up {followup['followup_id']}: {e}")
                # Mark as failed after multiple attempts
                retry_count = followup.get("retry_count", 0)
                if retry_count >= 3:
                    await db.followups.update_one(
                        {"followup_id": followup["followup_id"]},
                        {"$set": {
                            "status": FollowUpStatus.NO_ANSWER.value,
                            "error_message": str(e),
                            "updated_at": datetime.utcnow()
                        }}
                    )
                else:
                    # Reschedule for later
                    await db.followups.update_one(
                        {"followup_id": followup["followup_id"]},
                        {
                            "$set": {
                                "scheduled_for": now + timedelta(hours=2),
                                "updated_at": datetime.utcnow()
                            },
                            "$inc": {"retry_count": 1}
                        }
                    )

    async def execute_followup(self, followup: dict):
        """Execute a single follow-up call"""
        db = Database.get_database()
        followup_id = followup["followup_id"]
        business_id = followup["business_id"]

        # Update status to calling
        await db.followups.update_one(
            {"followup_id": followup_id},
            {"$set": {
                "status": "calling",
                "updated_at": datetime.utcnow()
            }}
        )

        # Get business info
        business = await db.businesses.find_one({"business_id": business_id})
        if not business:
            raise ValueError(f"Business not found: {business_id}")

        # Get client info
        client = await db.clients.find_one({"client_id": followup["client_id"]})
        if not client or not client.get("phone"):
            raise ValueError(f"Client phone not found: {followup['client_id']}")

        # Get job info
        job = await db.hvac_quotes.find_one({"quote_id": followup["job_id"]})
        service_type = job.get("service_type", "service") if job else "service"

        # Get tech info
        tech_name = "our technician"
        if job and job.get("assigned_tech_id"):
            tech = await db.users.find_one({"user_id": job["assigned_tech_id"]})
            if tech:
                tech_name = f"{tech.get('first_name', '')} {tech.get('last_name', '')}".strip() or "our technician"

        # Generate call script
        script = await self.followup_service.generate_followup_script(
            customer_name=followup.get("client_name", "valued customer"),
            service_type=service_type,
            tech_name=tech_name,
            business_name=business.get("name", "our company"),
            followup_type=FollowUpType(followup["followup_type"])
        )

        # Check if call service is configured
        if not self.call_service.is_configured:
            logger.warning("Call service not configured, simulating follow-up")
            # Simulate successful call for demo
            await db.followups.update_one(
                {"followup_id": followup_id},
                {"$set": {
                    "status": FollowUpStatus.POSITIVE.value,
                    "completed_at": datetime.utcnow(),
                    "satisfied": True,
                    "sentiment": "positive",
                    "notes": "Simulated follow-up (call service not configured)",
                    "updated_at": datetime.utcnow()
                }}
            )
            return

        # Initiate the AI call
        try:
            # Build TwiML for AI follow-up conversation
            result = await self.call_service.initiate_followup_call(
                to_number=client["phone"],
                business_name=business.get("name", "our company"),
                customer_name=followup.get("client_name", "valued customer"),
                script=script,
                followup_id=followup_id,
                callback_url=f"{settings.API_BASE_URL}/api/v1/followups/webhook/{followup_id}"
            )

            if result.success:
                await db.followups.update_one(
                    {"followup_id": followup_id},
                    {"$set": {
                        "call_id": result.call_id,
                        "call_sid": result.call_sid,
                        "updated_at": datetime.utcnow()
                    }}
                )
                logger.info(f"Follow-up call initiated: {followup_id}")
            else:
                raise Exception(result.error or "Call initiation failed")

        except Exception as e:
            logger.error(f"Failed to initiate follow-up call: {e}")
            raise

    async def send_review_request_sms(
        self,
        followup_id: str,
        client_phone: str,
        message: str
    ) -> bool:
        """Send review request SMS after positive follow-up"""
        try:
            if not self.sms_service.is_configured:
                logger.warning("SMS service not configured")
                return False

            result = await self.sms_service.send_sms(
                to_number=client_phone,
                message=message
            )

            if result.success:
                db = Database.get_database()
                await db.followups.update_one(
                    {"followup_id": followup_id},
                    {"$set": {
                        "review_request_sent": True,
                        "review_request_sent_at": datetime.utcnow(),
                        "updated_at": datetime.utcnow()
                    }}
                )
                return True

            return False

        except Exception as e:
            logger.error(f"Failed to send review SMS: {e}")
            return False


async def auto_schedule_followup_for_job(
    db,
    job_id: str,
    business_id: str,
    client_id: str,
    completed_at: datetime,
    created_by: str
):
    """
    Automatically schedule a follow-up when a job is completed.
    Called from job completion endpoint.
    """
    from app.models.common import generate_id

    # Check if follow-up already exists
    existing = await db.followups.find_one({
        "job_id": job_id,
        "followup_type": FollowUpType.SATISFACTION.value,
        "status": {"$ne": FollowUpStatus.CANCELLED.value}
    })

    if existing:
        logger.info(f"Follow-up already exists for job {job_id}")
        return None

    # Get client info
    client = await db.clients.find_one({"client_id": client_id})
    if not client:
        logger.warning(f"Client not found for job {job_id}")
        return None

    # Calculate schedule time (24 hours after completion, during business hours)
    followup_service = get_followup_service()
    scheduled_for = followup_service.calculate_followup_time(
        completed_at=completed_at,
        followup_type=FollowUpType.SATISFACTION
    )

    # Create follow-up
    followup = {
        "followup_id": generate_id("fup"),
        "business_id": business_id,
        "job_id": job_id,
        "client_id": client_id,
        "client_name": f"{client.get('first_name', '')} {client.get('last_name', '')}".strip(),
        "client_phone": client.get("phone"),
        "followup_type": FollowUpType.SATISFACTION.value,
        "status": FollowUpStatus.SCHEDULED.value,
        "scheduled_for": scheduled_for,
        "concerns": [],
        "auto_scheduled": True,
        "created_by": created_by,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }

    await db.followups.insert_one(followup)
    logger.info(f"Auto-scheduled follow-up {followup['followup_id']} for job {job_id}")

    return followup


async def handle_followup_call_complete(
    db,
    followup_id: str,
    outcome: str,  # positive, negative, no_answer
    transcript: Optional[str] = None,
    rating: Optional[int] = None,
    concerns: Optional[list] = None
):
    """
    Handle completion of a follow-up call.
    Called from webhook when call ends.
    """
    # Map outcome to status
    status_map = {
        "positive": FollowUpStatus.POSITIVE,
        "negative": FollowUpStatus.NEGATIVE,
        "no_answer": FollowUpStatus.NO_ANSWER
    }

    update_data = {
        "status": status_map.get(outcome, FollowUpStatus.COMPLETED).value,
        "completed_at": datetime.utcnow(),
        "sentiment": outcome,
        "satisfied": outcome == "positive",
        "updated_at": datetime.utcnow()
    }

    if transcript:
        update_data["transcript"] = transcript
    if rating:
        update_data["rating"] = rating
    if concerns:
        update_data["concerns"] = concerns

    await db.followups.update_one(
        {"followup_id": followup_id},
        {"$set": update_data}
    )

    # Get the follow-up for further processing
    followup = await db.followups.find_one({"followup_id": followup_id})
    if not followup:
        return

    # If positive, send review request
    if outcome == "positive" and followup.get("client_phone"):
        task_runner = FollowUpTaskRunner()
        followup_service = get_followup_service()

        # Get business for review URL
        business = await db.businesses.find_one({"business_id": followup["business_id"]})
        review_url = business.get("google_review_url") if business else None

        # Generate review message
        message = await followup_service.generate_review_request_message(
            customer_name=followup.get("client_name", "valued customer"),
            service_type="service",
            business_name=business.get("name", "our company") if business else "our company",
            review_url=review_url
        )

        await task_runner.send_review_request_sms(
            followup_id=followup_id,
            client_phone=followup["client_phone"],
            message=message
        )

    # If negative, create callback appointment
    if outcome == "negative":
        await create_callback_for_negative_feedback(db, followup)


async def create_callback_for_negative_feedback(db, followup: dict):
    """
    Create a callback appointment when a customer reports issues.
    """
    from app.models.common import generate_id

    # Check if callback already exists
    existing = await db.appointments.find_one({
        "source_followup_id": followup["followup_id"]
    })

    if existing:
        logger.info(f"Callback already exists for follow-up {followup['followup_id']}")
        return

    # Create callback appointment for next business day
    now = datetime.utcnow()
    callback_date = now + timedelta(days=1)

    # Skip weekends
    while callback_date.weekday() >= 5:
        callback_date += timedelta(days=1)

    callback_date = callback_date.replace(hour=9, minute=0, second=0, microsecond=0)

    appointment = {
        "appointment_id": generate_id("apt"),
        "business_id": followup["business_id"],
        "client_id": followup["client_id"],
        "appointment_type": "callback",
        "title": f"Callback - Follow-up Issue",
        "description": f"Customer reported concerns during follow-up call.\nConcerns: {', '.join(followup.get('concerns', ['Unspecified issue']))}",
        "scheduled_date": callback_date.strftime("%Y-%m-%d"),
        "start_time": "09:00",
        "end_time": "09:30",
        "duration_minutes": 30,
        "status": "scheduled",
        "priority": "high",
        "source_followup_id": followup["followup_id"],
        "source_job_id": followup.get("job_id"),
        "notes": f"Auto-created from negative follow-up feedback",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }

    await db.appointments.insert_one(appointment)
    logger.info(f"Created callback appointment {appointment['appointment_id']} for follow-up {followup['followup_id']}")

    # Notify via WebSocket
    try:
        from app.services.websocket_manager import get_websocket_manager
        ws_manager = get_websocket_manager()
        await ws_manager.broadcast_to_business(
            followup["business_id"],
            {
                "type": "callback_created",
                "data": {
                    "appointment_id": appointment["appointment_id"],
                    "client_name": followup.get("client_name"),
                    "reason": "Follow-up feedback issue",
                    "concerns": followup.get("concerns", []),
                    "scheduled_for": callback_date.isoformat()
                }
            }
        )
    except Exception as e:
        logger.error(f"Failed to send WebSocket notification: {e}")

    return appointment


# Global task runner instance
_task_runner: Optional[FollowUpTaskRunner] = None


def get_task_runner() -> FollowUpTaskRunner:
    """Get the global task runner instance"""
    global _task_runner
    if _task_runner is None:
        _task_runner = FollowUpTaskRunner()
    return _task_runner
