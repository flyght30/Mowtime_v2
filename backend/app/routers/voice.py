"""
Voice API Router
Twilio webhooks and AI voice receptionist endpoints with ElevenLabs integration
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request, Form
from fastapi.responses import Response, StreamingResponse
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional
from urllib.parse import quote, unquote
import base64

from app.database import get_database
from app.models.call import (
    Call, CallCreate, CallResponse, CallDirection, CallStatus, CallIntent,
    VoicemailResponse
)
from app.models.user import User
from app.middleware.auth import BusinessContext, get_business_context, get_current_user
from app.services.call_service import CallService
from app.services.voice_service import get_voice_service
from app.schemas.common import (
    PaginatedResponse, SingleResponse, MessageResponse,
    create_pagination_meta
)
from app.config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter()
settings = get_settings()

# In-memory cache for pre-generated audio (simple cache for demo)
_audio_cache: dict = {}


def get_call_service(
    db: AsyncIOMotorDatabase = Depends(get_database)
) -> CallService:
    """Get call service instance"""
    return CallService(db)


# ====================
# Twilio Webhook Endpoints (Public - no auth)
# ====================

@router.post(
    "/webhook/incoming",
    summary="Handle incoming call webhook"
)
async def handle_incoming_call(
    request: Request,
    CallSid: str = Form(...),
    From: str = Form(...),
    To: str = Form(...),
    CallStatus: str = Form(...),
    Direction: str = Form(default="inbound"),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Twilio webhook for incoming calls.
    Returns TwiML to handle the call with AI receptionist.
    """
    # Find business by phone number
    business = await db.businesses.find_one({
        "config.phone_number": To,
        "deleted_at": None
    })

    if not business:
        # Fallback if no exact match
        business = await db.businesses.find_one({"deleted_at": None})

    if not business:
        # No business found, return basic response
        twiml = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say>Sorry, this number is not in service. Goodbye.</Say>
    <Hangup/>
</Response>"""
        return Response(content=twiml, media_type="application/xml")

    business_id = business["business_id"]
    business_name = business.get("name", "our company")

    # Create call record
    call_service = CallService(db)
    call_data = CallCreate(
        direction=CallDirection.INBOUND,
        from_number=From,
        to_number=To,
        twilio_call_sid=CallSid
    )
    call = await call_service.create_call_record(business_id, call_data)

    # Get webhook base URL from request
    base_url = str(request.base_url).rstrip("/")
    webhook_url = f"{base_url}/api/v1/voice/webhook"

    # Get business voice settings (if configured)
    voice_config = business.get("config", {}).get("voice", {})
    voice_id = voice_config.get("elevenlabs_voice_id")

    # Generate greeting TwiML with ElevenLabs if configured
    twiml = call_service.generate_twiml_greeting(
        business_name=business_name,
        webhook_url=webhook_url,
        voice_id=voice_id,
        base_url=base_url  # Enable ElevenLabs
    )

    return Response(content=twiml, media_type="application/xml")


@router.post(
    "/webhook/gather",
    summary="Handle speech gathering webhook"
)
async def handle_gather(
    request: Request,
    CallSid: str = Form(...),
    SpeechResult: str = Form(default=""),
    Confidence: float = Form(default=0.0),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Twilio webhook for speech input.
    Processes caller's speech using Claude AI for natural conversation.
    """
    from app.services.ai_service import get_ai_service
    import json

    call_service = CallService(db)
    ai_service = get_ai_service()

    # Find the call
    call = await call_service.get_call_by_twilio_sid(CallSid)
    if not call:
        twiml = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say>Sorry, there was an error. Goodbye.</Say>
    <Hangup/>
</Response>"""
        return Response(content=twiml, media_type="application/xml")

    # Get business info
    business = await db.businesses.find_one({"business_id": call.business_id})
    business_name = business.get("name", "our company") if business else "our company"

    speech_text = SpeechResult.strip()

    # Log the conversation turn
    await call_service.add_conversation_turn(
        call.call_id,
        role="caller",
        content=SpeechResult
    )

    base_url = str(request.base_url).rstrip("/")
    webhook_url = f"{base_url}/api/v1/voice/webhook"

    # Get conversation history
    conversation = await call_service.get_conversation(call.call_id)
    history = []
    if conversation and conversation.turns:
        history = [{"role": t.role, "content": t.content} for t in conversation.turns[-10:]]

    # Get available services for context
    services = await db.services.find({
        "business_id": call.business_id,
        "is_active": True,
        "deleted_at": None
    }).to_list(length=20)
    service_names = [s.get("name") for s in services if s.get("name")]

    # Get available appointment slots (next 7 days)
    from datetime import datetime, timedelta
    available_slots = []
    for i in range(1, 8):
        future_date = datetime.now() + timedelta(days=i)
        if future_date.weekday() < 5:  # Weekdays only
            available_slots.append({
                "date": future_date.strftime("%A, %B %d"),
                "time": "9:00 AM - 5:00 PM"
            })

    # Use Claude AI for natural conversation (if configured)
    intent = CallIntent.UNKNOWN
    response_message = ""
    action = "continue"
    collected_data = {}

    if ai_service.is_configured:
        try:
            ai_result = await ai_service.generate_conversation_response(
                business_name=business_name,
                conversation_history=history,
                current_speech=speech_text,
                available_services=service_names[:5],
                available_slots=available_slots[:5]
            )

            if ai_result.success and ai_result.content:
                try:
                    response_data = json.loads(ai_result.content)
                    response_message = response_data.get("response", "")
                    action = response_data.get("action", "continue")
                    collected_data = response_data.get("collected_data", {})

                    # Map action to intent
                    if action == "book":
                        intent = CallIntent.BOOKING
                    elif action == "transfer":
                        intent = CallIntent.SUPPORT
                    elif action == "end":
                        intent = CallIntent.OTHER

                    # Store collected data in conversation
                    if collected_data:
                        await db.call_conversations.update_one(
                            {"call_id": call.call_id},
                            {"$set": {"entities_extracted": collected_data}}
                        )

                except json.JSONDecodeError:
                    # If not valid JSON, use the raw response
                    response_message = ai_result.content

        except Exception as e:
            logger.error(f"AI conversation error: {str(e)}")
            # Fall back to keyword-based response
            response_message = None

    # Fallback to keyword-based intent detection if AI failed
    if not response_message:
        speech_lower = speech_text.lower()

        if any(word in speech_lower for word in ["book", "schedule", "appointment", "reserve"]):
            intent = CallIntent.BOOKING
            response_message = (
                "I'd be happy to help you schedule an appointment. "
                "What service are you interested in?"
            )

        elif any(word in speech_lower for word in ["reschedule", "change", "move"]):
            intent = CallIntent.RESCHEDULE
            response_message = (
                "I can help you reschedule your appointment. "
                "Can you tell me your name and the date of your current appointment?"
            )

        elif any(word in speech_lower for word in ["cancel"]):
            intent = CallIntent.CANCEL
            response_message = (
                "I understand you'd like to cancel an appointment. "
                "Can you please provide your name and appointment date?"
            )

        elif any(word in speech_lower for word in ["price", "cost", "how much", "quote"]):
            intent = CallIntent.INQUIRY
            response_message = (
                "I'd be happy to help with pricing information. "
                "Which service would you like to know about?"
            )

        elif any(word in speech_lower for word in ["where", "status", "coming", "eta", "tech"]):
            intent = CallIntent.INQUIRY
            response_message = (
                "Let me check on that for you. "
                "Can you tell me your name or phone number so I can look up your appointment?"
            )

        elif any(word in speech_lower for word in ["speak", "talk", "human", "person", "representative", "transfer"]):
            intent = CallIntent.SUPPORT
            action = "transfer"

        elif any(word in speech_lower for word in ["leave message", "voicemail"]):
            voice_cfg = business.get("config", {}).get("voice", {}) if business else {}
            twiml = call_service.generate_twiml_voicemail(
                business_name,
                f"{webhook_url}/recording",
                base_url=base_url,
                voice_id=voice_cfg.get("elevenlabs_voice_id")
            )
            return Response(content=twiml, media_type="application/xml")

        elif any(word in speech_lower for word in ["goodbye", "bye", "thank you", "thanks", "that's all"]):
            response_message = "Thank you for calling. Have a great day!"
            action = "end"

        else:
            response_message = (
                "I can help you with scheduling appointments, checking on your technician, "
                "or connecting you with our team. What would you like to do?"
            )

    # Update call intent if detected
    if intent != CallIntent.UNKNOWN:
        await call_service.set_call_intent(call.call_id, intent)

    # Get voice configuration for ElevenLabs
    voice_config = business.get("config", {}).get("voice", {}) if business else {}
    voice_id = voice_config.get("elevenlabs_voice_id")

    # Handle special actions
    if action == "transfer":
        await call_service.set_call_intent(call.call_id, CallIntent.SUPPORT, "Requested human transfer")
        await db.calls.update_one(
            {"call_id": call.call_id},
            {"$set": {"transferred_to_human": True}}
        )

        transfer_number = business.get("config", {}).get("main_phone") if business else None
        if transfer_number:
            twiml = call_service.generate_twiml_transfer(
                transfer_number,
                base_url=base_url,
                voice_id=voice_id
            )
        else:
            twiml = call_service.generate_twiml_voicemail(
                business_name,
                f"{webhook_url}/recording",
                base_url=base_url,
                voice_id=voice_id
            )
        return Response(content=twiml, media_type="application/xml")

    elif action == "end":
        await call_service.update_call_status(call.call_id, CallStatus.COMPLETED)
        twiml = call_service.generate_twiml_response(
            response_message,
            end_call=True,
            base_url=base_url,
            voice_id=voice_id
        )
        return Response(content=twiml, media_type="application/xml")

    elif action == "book" and collected_data:
        # Attempt to create appointment if we have enough data
        has_required = all(k in collected_data for k in ["name", "service_type"])
        has_scheduling = "preferred_date" in collected_data or "preferred_time" in collected_data

        if has_required and has_scheduling:
            # Try to create customer and appointment
            try:
                booking_result = await create_booking_from_call(
                    db, call.business_id, call.call_id, collected_data, call.from_number
                )
                if booking_result.get("success"):
                    response_message = (
                        f"I've scheduled your {collected_data.get('service_type', 'appointment')} for "
                        f"{collected_data.get('preferred_date', 'the requested date')}. "
                        f"You'll receive a text confirmation shortly. Is there anything else I can help with?"
                    )
                    await db.calls.update_one(
                        {"call_id": call.call_id},
                        {"$set": {"appointment_id": booking_result.get("appointment_id")}}
                    )
            except Exception as e:
                logger.error(f"Booking creation error: {str(e)}")

    # Log AI response
    await call_service.add_conversation_turn(
        call.call_id,
        role="ai",
        content=response_message,
        intent=intent
    )

    twiml = call_service.generate_twiml_response(
        response_message,
        gather_url=f"{webhook_url}/gather",
        base_url=base_url,
        voice_id=voice_id
    )

    return Response(content=twiml, media_type="application/xml")


async def create_booking_from_call(
    db: AsyncIOMotorDatabase,
    business_id: str,
    call_id: str,
    collected_data: dict,
    caller_phone: str
) -> dict:
    """Create a customer and appointment from voice call data"""
    from app.models.common import generate_id, utc_now
    from datetime import datetime

    try:
        # Parse customer name
        name_parts = collected_data.get("name", "").split(" ", 1)
        first_name = name_parts[0] if name_parts else "Unknown"
        last_name = name_parts[1] if len(name_parts) > 1 else ""

        # Check if customer exists by phone
        existing_client = await db.clients.find_one({
            "business_id": business_id,
            "phone": caller_phone,
            "deleted_at": None
        })

        if existing_client:
            client_id = existing_client["client_id"]
        else:
            # Create new client
            client_id = generate_id("client")
            client = {
                "client_id": client_id,
                "business_id": business_id,
                "first_name": first_name,
                "last_name": last_name,
                "phone": collected_data.get("phone") or caller_phone,
                "email": collected_data.get("email"),
                "address": collected_data.get("address"),
                "source": "voice_ai",
                "created_at": utc_now(),
                "updated_at": utc_now()
            }
            await db.clients.insert_one(client)

        # Find matching service
        service_type = collected_data.get("service_type", "Service")
        service = await db.services.find_one({
            "business_id": business_id,
            "name": {"$regex": service_type, "$options": "i"},
            "is_active": True,
            "deleted_at": None
        })

        # Parse preferred date
        preferred_date = collected_data.get("preferred_date", "")
        scheduled_date = None
        try:
            # Try to parse various date formats
            for fmt in ["%A, %B %d", "%B %d", "%m/%d", "%m-%d"]:
                try:
                    parsed = datetime.strptime(preferred_date, fmt)
                    scheduled_date = parsed.replace(year=datetime.now().year)
                    if scheduled_date < datetime.now():
                        scheduled_date = scheduled_date.replace(year=datetime.now().year + 1)
                    break
                except ValueError:
                    continue
        except Exception:
            pass

        if not scheduled_date:
            # Default to next available weekday
            scheduled_date = datetime.now()
            while scheduled_date.weekday() >= 5:
                scheduled_date += timedelta(days=1)
            scheduled_date += timedelta(days=1)

        # Create appointment
        appointment_id = generate_id("apt")
        appointment = {
            "appointment_id": appointment_id,
            "business_id": business_id,
            "client_id": client_id,
            "service_id": service["service_id"] if service else None,
            "service_name": service["name"] if service else service_type,
            "scheduled_date": scheduled_date.strftime("%Y-%m-%d"),
            "start_time": collected_data.get("preferred_time", "09:00"),
            "duration_minutes": service.get("duration_minutes", 60) if service else 60,
            "status": "scheduled",
            "source": "voice_ai",
            "call_id": call_id,
            "notes": collected_data.get("issue_description", ""),
            "created_at": utc_now(),
            "updated_at": utc_now()
        }
        await db.appointments.insert_one(appointment)

        return {
            "success": True,
            "client_id": client_id,
            "appointment_id": appointment_id
        }

    except Exception as e:
        logger.error(f"Failed to create booking from call: {str(e)}")
        return {"success": False, "error": str(e)}


@router.post(
    "/webhook/recording",
    summary="Handle recording complete webhook"
)
async def handle_recording(
    CallSid: str = Form(...),
    RecordingUrl: str = Form(...),
    RecordingDuration: int = Form(default=0),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Twilio webhook for recording completion"""
    call_service = CallService(db)

    call = await call_service.get_call_by_twilio_sid(CallSid)
    if not call:
        return {"status": "error", "message": "Call not found"}

    # Create voicemail record
    await call_service.create_voicemail(
        business_id=call.business_id,
        call_id=call.call_id,
        from_number=call.from_number,
        recording_url=RecordingUrl,
        duration=RecordingDuration
    )

    twiml = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna">Thank you for your message. We'll get back to you soon. Goodbye.</Say>
    <Hangup/>
</Response>"""

    return Response(content=twiml, media_type="application/xml")


@router.post(
    "/webhook/recording/transcription",
    summary="Handle transcription complete webhook"
)
async def handle_transcription(
    CallSid: str = Form(...),
    TranscriptionText: str = Form(default=""),
    RecordingUrl: str = Form(...),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Twilio webhook for transcription completion"""
    # Update voicemail with transcription
    await db.voicemails.update_one(
        {"recording_url": RecordingUrl},
        {"$set": {"transcription": TranscriptionText}}
    )

    return {"status": "ok"}


@router.post(
    "/webhook/status",
    summary="Handle call status webhook"
)
async def handle_call_status(
    CallSid: str = Form(...),
    CallStatus_: str = Form(..., alias="CallStatus"),
    CallDuration: int = Form(default=0),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Twilio webhook for call status updates"""
    call_service = CallService(db)

    status_map = {
        "initiated": CallStatus.RINGING,
        "ringing": CallStatus.RINGING,
        "in-progress": CallStatus.IN_PROGRESS,
        "completed": CallStatus.COMPLETED,
        "busy": CallStatus.BUSY,
        "failed": CallStatus.FAILED,
        "no-answer": CallStatus.NO_ANSWER,
        "canceled": CallStatus.CANCELED
    }

    new_status = status_map.get(CallStatus_, CallStatus.COMPLETED)

    await call_service.update_call_status(
        twilio_sid=CallSid,
        status=new_status,
        duration=CallDuration
    )

    return {"status": "ok"}


# ====================
# Authenticated API Endpoints
# ====================

@router.get(
    "/calls",
    response_model=PaginatedResponse[CallResponse],
    summary="List calls"
)
async def list_calls(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    direction: Optional[CallDirection] = None,
    call_status: Optional[CallStatus] = Query(None, alias="status"),
    date_from: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    ctx: BusinessContext = Depends(get_business_context),
    service: CallService = Depends(get_call_service)
):
    """List calls for the current business"""
    calls, total = await service.get_calls(
        ctx.business_id,
        page,
        per_page,
        direction,
        call_status,
        date_from,
        date_to
    )

    meta = create_pagination_meta(total, page, per_page)
    return PaginatedResponse(data=calls, meta=meta)


@router.get(
    "/calls/stats",
    summary="Get call statistics"
)
async def get_call_stats(
    ctx: BusinessContext = Depends(get_business_context),
    service: CallService = Depends(get_call_service)
):
    """Get call statistics for the business"""
    stats = await service.get_call_stats(ctx.business_id)

    return {
        "success": True,
        "data": stats
    }


@router.get(
    "/calls/{call_id}",
    response_model=SingleResponse[CallResponse],
    summary="Get call by ID"
)
async def get_call(
    call_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    service: CallService = Depends(get_call_service)
):
    """Get call details by ID"""
    call = await service.get_call(call_id, ctx.business_id)

    if not call:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CALL_NOT_FOUND", "message": "Call not found"}
        )

    return SingleResponse(data=CallResponse(**call.model_dump()))


@router.get(
    "/calls/{call_id}/conversation",
    summary="Get call conversation"
)
async def get_call_conversation(
    call_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    service: CallService = Depends(get_call_service)
):
    """Get the full conversation transcript for a call"""
    call = await service.get_call(call_id, ctx.business_id)

    if not call:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CALL_NOT_FOUND", "message": "Call not found"}
        )

    conversation = await service.get_conversation(call_id)

    return {
        "success": True,
        "data": {
            "call_id": call_id,
            "turns": [t.model_dump() for t in conversation.turns] if conversation else []
        }
    }


@router.get(
    "/voicemails",
    response_model=PaginatedResponse[VoicemailResponse],
    summary="List voicemails"
)
async def list_voicemails(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    unread_only: bool = Query(False),
    ctx: BusinessContext = Depends(get_business_context),
    service: CallService = Depends(get_call_service)
):
    """List voicemails for the current business"""
    voicemails, total = await service.get_voicemails(
        ctx.business_id,
        unread_only,
        page,
        per_page
    )

    meta = create_pagination_meta(total, page, per_page)
    return PaginatedResponse(data=voicemails, meta=meta)


@router.post(
    "/voicemails/{voicemail_id}/read",
    summary="Mark voicemail as read"
)
async def mark_voicemail_read(
    voicemail_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    service: CallService = Depends(get_call_service),
    current_user: User = Depends(get_current_user)
):
    """Mark a voicemail as read"""
    voicemail = await service.mark_voicemail_read(voicemail_id, current_user.user_id)

    if not voicemail:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "VOICEMAIL_NOT_FOUND", "message": "Voicemail not found"}
        )

    return MessageResponse(message="Voicemail marked as read")


@router.post(
    "/calls/outbound",
    summary="Initiate outbound call"
)
async def initiate_outbound_call(
    to_number: str = Query(..., description="Phone number to call"),
    message: Optional[str] = Query(None, description="Message to play"),
    ctx: BusinessContext = Depends(get_business_context),
    service: CallService = Depends(get_call_service),
    current_user: User = Depends(get_current_user),
    request: Request = None
):
    """Initiate an outbound call"""
    if current_user.role not in ["owner", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "INSUFFICIENT_PERMISSIONS", "message": "Admin access required"}
        )

    if not service.is_configured:
        return {
            "success": False,
            "error": "Voice service not configured"
        }

    base_url = str(request.base_url).rstrip("/")
    callback_url = f"{base_url}/api/v1/voice/webhook/status"

    result = await service.initiate_outbound_call(
        ctx.business_id,
        to_number,
        callback_url,
        message
    )

    return {
        "success": result.get("success", False),
        "data": result
    }


@router.get(
    "/voices",
    summary="Get available voices"
)
async def get_available_voices(
    current_user: User = Depends(get_current_user)
):
    """Get available ElevenLabs voices"""
    voice_service = get_voice_service()

    if not voice_service.is_configured:
        return {
            "success": False,
            "error": "Voice service not configured",
            "default_voices": voice_service.DEFAULT_VOICES
        }

    voices = await voice_service.get_voices()

    return {
        "success": True,
        "data": {
            "voices": voices,
            "default_voices": voice_service.DEFAULT_VOICES
        }
    }


@router.get(
    "/subscription",
    summary="Get voice subscription info"
)
async def get_voice_subscription(
    current_user: User = Depends(get_current_user)
):
    """Get ElevenLabs subscription information"""
    voice_service = get_voice_service()

    if not voice_service.is_configured:
        return {
            "success": False,
            "error": "Voice service not configured"
        }

    subscription = await voice_service.get_user_subscription()

    return {
        "success": True,
        "data": subscription
    }


@router.post(
    "/test/tts",
    summary="Test text-to-speech"
)
async def test_text_to_speech(
    text: str = Query(..., max_length=500),
    voice_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Test ElevenLabs text-to-speech"""
    if current_user.role not in ["owner", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "INSUFFICIENT_PERMISSIONS", "message": "Admin access required"}
        )

    voice_service = get_voice_service()

    if not voice_service.is_configured:
        return {
            "success": False,
            "error": "Voice service not configured. Please set ELEVENLABS_API_KEY."
        }

    result = await voice_service.synthesize_speech(text, voice_id)

    if result.success:
        return {
            "success": True,
            "data": {
                "audio_base64": result.audio_base64,
                "characters_used": result.characters_used
            }
        }
    else:
        return {
            "success": False,
            "error": result.error
        }


# ====================
# ElevenLabs Audio Streaming Endpoints (For Twilio)
# ====================

@router.get(
    "/audio/stream",
    summary="Stream ElevenLabs audio for Twilio playback"
)
async def stream_elevenlabs_audio(
    text: str = Query(..., description="Text to synthesize"),
    voice_id: Optional[str] = Query(None, description="ElevenLabs voice ID"),
    cache_key: Optional[str] = Query(None, description="Optional cache key")
):
    """
    Stream ElevenLabs-generated audio for Twilio <Play> element.
    This endpoint generates audio on-the-fly for low-latency playback.
    """
    global _audio_cache

    voice_service = get_voice_service()

    # Check cache first
    if cache_key and cache_key in _audio_cache:
        audio_data = _audio_cache[cache_key]
        return Response(
            content=audio_data,
            media_type="audio/mpeg",
            headers={
                "Content-Type": "audio/mpeg",
                "Cache-Control": "public, max-age=3600"
            }
        )

    # Use ElevenLabs if configured
    if voice_service.is_configured:
        async def generate_audio():
            async for chunk in voice_service.stream_speech(
                text=text,
                voice_id=voice_id,
                model_id="eleven_turbo_v2_5"
            ):
                yield chunk

        return StreamingResponse(
            generate_audio(),
            media_type="audio/mpeg",
            headers={
                "Content-Type": "audio/mpeg",
                "Transfer-Encoding": "chunked"
            }
        )
    else:
        # Return error - caller should fall back to Twilio TTS
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "VOICE_NOT_CONFIGURED", "message": "ElevenLabs not configured"}
        )


@router.get(
    "/audio/pregenerate",
    summary="Pre-generate and cache audio for Twilio"
)
async def pregenerate_audio(
    text: str = Query(..., max_length=1000),
    voice_id: Optional[str] = Query(None),
    cache_key: str = Query(..., description="Unique cache key")
):
    """
    Pre-generate audio and cache it for fast retrieval.
    Returns a URL that Twilio can use with <Play>.
    """
    global _audio_cache

    voice_service = get_voice_service()

    if not voice_service.is_configured:
        return {
            "success": False,
            "error": "ElevenLabs not configured",
            "fallback": "twilio_tts"
        }

    try:
        audio_data = await voice_service.synthesize_and_cache(
            text=text,
            cache_key=cache_key,
            voice_id=voice_id
        )

        if audio_data:
            # Store in cache (limit to 100 items)
            if len(_audio_cache) > 100:
                # Remove oldest item
                oldest_key = next(iter(_audio_cache))
                del _audio_cache[oldest_key]

            _audio_cache[cache_key] = audio_data

            return {
                "success": True,
                "cache_key": cache_key,
                "characters": len(text)
            }
        else:
            return {"success": False, "error": "Audio generation failed"}

    except Exception as e:
        logger.error(f"Audio pre-generation error: {str(e)}")
        return {"success": False, "error": str(e)}


def generate_elevenlabs_twiml(
    text: str,
    base_url: str,
    voice_id: Optional[str] = None,
    gather_url: Optional[str] = None,
    end_call: bool = False
) -> str:
    """
    Generate TwiML that uses ElevenLabs audio via <Play>.

    Args:
        text: Text to speak
        base_url: Base URL for audio endpoint
        voice_id: ElevenLabs voice ID
        gather_url: URL for speech gathering (if interactive)
        end_call: Whether to end call after message

    Returns:
        TwiML XML string
    """
    voice_service = get_voice_service()

    # URL-encode the text for query parameter
    encoded_text = quote(text)
    audio_url = f"{base_url}/api/v1/voice/audio/stream?text={encoded_text}"
    if voice_id:
        audio_url += f"&voice_id={voice_id}"

    twiml = '<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n'

    if voice_service.is_configured:
        # Use ElevenLabs via <Play>
        if gather_url and not end_call:
            twiml += f'    <Gather input="speech" action="{gather_url}" method="POST" speechTimeout="auto">\n'
            twiml += f'        <Play>{audio_url}</Play>\n'
            twiml += '    </Gather>\n'
        else:
            twiml += f'    <Play>{audio_url}</Play>\n'
    else:
        # Fall back to Twilio TTS
        if gather_url and not end_call:
            twiml += f'    <Gather input="speech" action="{gather_url}" method="POST" speechTimeout="auto">\n'
            twiml += f'        <Say voice="Polly.Joanna">{text}</Say>\n'
            twiml += '    </Gather>\n'
        else:
            twiml += f'    <Say voice="Polly.Joanna">{text}</Say>\n'

    if end_call:
        twiml += '    <Hangup/>\n'

    twiml += '</Response>'
    return twiml
