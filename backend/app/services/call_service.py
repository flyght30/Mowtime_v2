"""
Call Service
Twilio Programmable Voice integration and call management
"""

import logging
from datetime import datetime
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
import httpx

from app.config import get_settings
from app.models.call import (
    Call, CallCreate, CallResponse, CallDirection, CallStatus, CallIntent,
    CallConversation, ConversationTurn, VoicemailMessage, VoicemailResponse
)
from app.models.common import utc_now
from app.services.voice_service import VoiceService, get_voice_service

logger = logging.getLogger(__name__)
settings = get_settings()


class CallService:
    """
    Call handling service for AI voice receptionist.
    Integrates Twilio for calls and ElevenLabs for voice.
    """

    TWILIO_API_BASE = "https://api.twilio.com/2010-04-01"

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.voice = get_voice_service()
        self.account_sid = settings.TWILIO_ACCOUNT_SID
        self.auth_token = settings.TWILIO_AUTH_TOKEN
        self.phone_number = settings.TWILIO_PHONE_NUMBER
        self._configured = all([
            self.account_sid,
            self.auth_token,
            self.phone_number
        ])

    @property
    def is_configured(self) -> bool:
        """Check if Twilio voice is configured"""
        return self._configured

    async def create_call_record(
        self,
        business_id: str,
        data: CallCreate
    ) -> Call:
        """
        Create a new call record

        Args:
            business_id: Business ID
            data: Call creation data

        Returns:
            Created call record
        """
        call = Call(
            business_id=business_id,
            **data.model_dump()
        )

        # Try to match caller to existing client
        if data.direction == CallDirection.INBOUND:
            client = await self._find_client_by_phone(
                business_id,
                data.from_number
            )
            if client:
                call.client_id = client["client_id"]
                call.caller_name = f"{client.get('first_name', '')} {client.get('last_name', '')}".strip()

        await self.db.calls.insert_one(call.model_dump())

        # Create conversation record
        conversation = CallConversation(
            call_id=call.call_id,
            business_id=business_id
        )
        await self.db.call_conversations.insert_one(conversation.model_dump())

        return call

    async def _find_client_by_phone(
        self,
        business_id: str,
        phone: str
    ) -> Optional[dict]:
        """Find client by phone number"""
        # Normalize phone number for search
        phone_digits = "".join(c for c in phone if c.isdigit())
        phone_patterns = [
            phone,
            f"+1{phone_digits[-10:]}",
            phone_digits[-10:],
            f"+{phone_digits}"
        ]

        return await self.db.clients.find_one({
            "business_id": business_id,
            "phone": {"$in": phone_patterns},
            "deleted_at": None
        })

    async def update_call_status(
        self,
        call_id: str,
        status: CallStatus,
        duration: Optional[int] = None
    ) -> Optional[Call]:
        """Update call status"""
        update_data = {
            "status": status.value,
            "updated_at": utc_now()
        }

        if status in [CallStatus.COMPLETED, CallStatus.FAILED, CallStatus.NO_ANSWER]:
            update_data["ended_at"] = utc_now()

        if duration:
            update_data["duration_seconds"] = duration

        result = await self.db.calls.find_one_and_update(
            {"call_id": call_id},
            {"$set": update_data},
            return_document=True
        )

        return Call(**result) if result else None

    async def add_conversation_turn(
        self,
        call_id: str,
        role: str,
        content: str,
        audio_url: Optional[str] = None,
        intent: Optional[CallIntent] = None
    ) -> None:
        """Add a turn to the call conversation"""
        turn = ConversationTurn(
            role=role,
            content=content,
            audio_url=audio_url,
            intent_detected=intent
        )

        await self.db.call_conversations.update_one(
            {"call_id": call_id},
            {
                "$push": {"turns": turn.model_dump()},
                "$set": {"updated_at": utc_now()}
            }
        )

    async def set_call_intent(
        self,
        call_id: str,
        intent: CallIntent,
        summary: Optional[str] = None
    ) -> None:
        """Set the detected intent for a call"""
        await self.db.calls.update_one(
            {"call_id": call_id},
            {"$set": {
                "intent": intent.value,
                "conversation_summary": summary,
                "updated_at": utc_now()
            }}
        )

    async def get_call(self, call_id: str, business_id: str) -> Optional[Call]:
        """Get call by ID"""
        doc = await self.db.calls.find_one({
            "call_id": call_id,
            "business_id": business_id,
            "deleted_at": None
        })
        return Call(**doc) if doc else None

    async def get_call_by_twilio_sid(self, twilio_sid: str) -> Optional[Call]:
        """Get call by Twilio SID"""
        doc = await self.db.calls.find_one({
            "twilio_call_sid": twilio_sid,
            "deleted_at": None
        })
        return Call(**doc) if doc else None

    async def get_conversation(self, call_id: str) -> Optional[CallConversation]:
        """Get conversation for a call"""
        doc = await self.db.call_conversations.find_one({"call_id": call_id})
        return CallConversation(**doc) if doc else None

    async def create_voicemail(
        self,
        business_id: str,
        call_id: str,
        from_number: str,
        recording_url: str,
        duration: int,
        transcription: Optional[str] = None
    ) -> VoicemailMessage:
        """Create a voicemail record"""
        # Try to match caller
        client = await self._find_client_by_phone(business_id, from_number)

        voicemail = VoicemailMessage(
            business_id=business_id,
            call_id=call_id,
            from_number=from_number,
            client_id=client["client_id"] if client else None,
            caller_name=f"{client.get('first_name', '')} {client.get('last_name', '')}".strip() if client else None,
            recording_url=recording_url,
            duration_seconds=duration,
            transcription=transcription
        )

        await self.db.voicemails.insert_one(voicemail.model_dump())

        # Update call record
        await self.db.calls.update_one(
            {"call_id": call_id},
            {"$set": {
                "voicemail_left": True,
                "status": CallStatus.VOICEMAIL.value,
                "updated_at": utc_now()
            }}
        )

        return voicemail

    async def get_voicemails(
        self,
        business_id: str,
        unread_only: bool = False,
        page: int = 1,
        per_page: int = 20
    ) -> tuple[list[VoicemailResponse], int]:
        """Get voicemails for a business"""
        query = {
            "business_id": business_id,
            "deleted_at": None
        }

        if unread_only:
            query["is_read"] = False

        total = await self.db.voicemails.count_documents(query)
        skip = (page - 1) * per_page

        cursor = self.db.voicemails.find(query).sort(
            "created_at", -1
        ).skip(skip).limit(per_page)

        docs = await cursor.to_list(length=per_page)
        voicemails = [VoicemailResponse(**doc) for doc in docs]

        return voicemails, total

    async def mark_voicemail_read(
        self,
        voicemail_id: str,
        user_id: str
    ) -> Optional[VoicemailMessage]:
        """Mark voicemail as read"""
        result = await self.db.voicemails.find_one_and_update(
            {"voicemail_id": voicemail_id},
            {"$set": {
                "is_read": True,
                "read_at": utc_now(),
                "read_by": user_id,
                "updated_at": utc_now()
            }},
            return_document=True
        )
        return VoicemailMessage(**result) if result else None

    async def get_calls(
        self,
        business_id: str,
        page: int = 1,
        per_page: int = 20,
        direction: Optional[CallDirection] = None,
        status: Optional[CallStatus] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None
    ) -> tuple[list[CallResponse], int]:
        """Get calls for a business"""
        query = {
            "business_id": business_id,
            "deleted_at": None
        }

        if direction:
            query["direction"] = direction.value

        if status:
            query["status"] = status.value

        if date_from or date_to:
            query["created_at"] = {}
            if date_from:
                query["created_at"]["$gte"] = datetime.fromisoformat(date_from)
            if date_to:
                query["created_at"]["$lte"] = datetime.fromisoformat(date_to)

        total = await self.db.calls.count_documents(query)
        skip = (page - 1) * per_page

        cursor = self.db.calls.find(query).sort(
            "created_at", -1
        ).skip(skip).limit(per_page)

        docs = await cursor.to_list(length=per_page)
        calls = [CallResponse(**doc) for doc in docs]

        return calls, total

    async def get_call_stats(self, business_id: str) -> dict:
        """Get call statistics for a business"""
        pipeline = [
            {"$match": {"business_id": business_id, "deleted_at": None}},
            {"$group": {
                "_id": {
                    "direction": "$direction",
                    "status": "$status",
                    "intent": "$intent"
                },
                "count": {"$sum": 1},
                "total_duration": {"$sum": "$duration_seconds"}
            }}
        ]

        cursor = self.db.calls.aggregate(pipeline)
        results = await cursor.to_list(length=100)

        stats = {
            "total_calls": 0,
            "by_direction": {},
            "by_status": {},
            "by_intent": {},
            "total_duration_seconds": 0,
            "ai_handled": 0,
            "transferred_to_human": 0,
            "voicemails": 0
        }

        for r in results:
            count = r["count"]
            duration = r.get("total_duration", 0)

            stats["total_calls"] += count
            stats["total_duration_seconds"] += duration

            direction = r["_id"]["direction"]
            status = r["_id"]["status"]
            intent = r["_id"]["intent"]

            stats["by_direction"][direction] = stats["by_direction"].get(direction, 0) + count
            stats["by_status"][status] = stats["by_status"].get(status, 0) + count
            stats["by_intent"][intent] = stats["by_intent"].get(intent, 0) + count

        # Get additional counts
        ai_handled = await self.db.calls.count_documents({
            "business_id": business_id,
            "ai_handled": True,
            "deleted_at": None
        })
        stats["ai_handled"] = ai_handled

        transferred = await self.db.calls.count_documents({
            "business_id": business_id,
            "transferred_to_human": True,
            "deleted_at": None
        })
        stats["transferred_to_human"] = transferred

        voicemails = await self.db.calls.count_documents({
            "business_id": business_id,
            "voicemail_left": True,
            "deleted_at": None
        })
        stats["voicemails"] = voicemails

        return stats

    def generate_twiml_greeting(
        self,
        business_name: str,
        webhook_url: str,
        voice_id: Optional[str] = None
    ) -> str:
        """
        Generate TwiML for initial greeting with AI voice.
        Uses ElevenLabs for voice synthesis, falls back to Twilio TTS.
        """
        greeting = self.voice.get_greeting_text(business_name)

        # For now, use Twilio's built-in TTS
        # In production, pre-generate and host ElevenLabs audio
        twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">{greeting}</Say>
    <Gather input="speech" action="{webhook_url}/gather" method="POST" speechTimeout="auto" language="en-US">
        <Say voice="Polly.Joanna">Please tell me how I can help you.</Say>
    </Gather>
    <Say voice="Polly.Joanna">I didn't hear anything. Goodbye.</Say>
</Response>"""
        return twiml

    def generate_twiml_response(
        self,
        message: str,
        gather_url: Optional[str] = None,
        end_call: bool = False
    ) -> str:
        """Generate TwiML response with message"""
        twiml = '<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n'

        if gather_url and not end_call:
            twiml += f'    <Gather input="speech" action="{gather_url}" method="POST" speechTimeout="auto">\n'
            twiml += f'        <Say voice="Polly.Joanna">{message}</Say>\n'
            twiml += '    </Gather>\n'
        else:
            twiml += f'    <Say voice="Polly.Joanna">{message}</Say>\n'

        if end_call:
            twiml += '    <Hangup/>\n'

        twiml += '</Response>'
        return twiml

    def generate_twiml_voicemail(
        self,
        business_name: str,
        recording_callback_url: str
    ) -> str:
        """Generate TwiML for voicemail prompt"""
        prompt = self.voice.get_voicemail_prompt(business_name)

        twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">{prompt}</Say>
    <Record maxLength="120" playBeep="true" action="{recording_callback_url}" transcribe="true" transcribeCallback="{recording_callback_url}/transcription"/>
    <Say voice="Polly.Joanna">Thank you for your message. Goodbye.</Say>
</Response>"""
        return twiml

    def generate_twiml_transfer(
        self,
        transfer_number: str
    ) -> str:
        """Generate TwiML for call transfer"""
        message = self.voice.get_transfer_text()

        twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">{message}</Say>
    <Dial>{transfer_number}</Dial>
</Response>"""
        return twiml

    async def initiate_outbound_call(
        self,
        business_id: str,
        to_number: str,
        callback_url: str,
        message: Optional[str] = None
    ) -> dict:
        """
        Initiate an outbound call

        Args:
            business_id: Business ID
            to_number: Number to call
            callback_url: URL for call status updates
            message: Optional message to play

        Returns:
            Result with call SID
        """
        if not self.is_configured:
            return {"success": False, "error": "Voice service not configured"}

        url = f"{self.TWILIO_API_BASE}/Accounts/{self.account_sid}/Calls.json"

        # Generate TwiML for the call
        if message:
            twiml = self.generate_twiml_response(message, end_call=True)
        else:
            twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">Hello, this is a call from your service provider.</Say>
</Response>"""

        payload = {
            "To": to_number,
            "From": self.phone_number,
            "Twiml": twiml,
            "StatusCallback": callback_url,
            "StatusCallbackEvent": ["initiated", "ringing", "answered", "completed"]
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    data=payload,
                    auth=(self.account_sid, self.auth_token),
                    timeout=30.0
                )

                if response.status_code in (200, 201):
                    data = response.json()

                    # Create call record
                    call_data = CallCreate(
                        direction=CallDirection.OUTBOUND,
                        from_number=self.phone_number,
                        to_number=to_number,
                        twilio_call_sid=data.get("sid")
                    )
                    await self.create_call_record(business_id, call_data)

                    return {
                        "success": True,
                        "call_sid": data.get("sid"),
                        "status": data.get("status")
                    }
                else:
                    error_data = response.json()
                    return {
                        "success": False,
                        "error": error_data.get("message", "Unknown error")
                    }

        except Exception as e:
            logger.error(f"Outbound call error: {str(e)}")
            return {"success": False, "error": str(e)}
