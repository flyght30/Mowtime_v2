"""
Voice API Router
Twilio webhooks and AI voice receptionist endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, Request, Form
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional

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

router = APIRouter()
settings = get_settings()


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

    # Generate greeting TwiML
    twiml = call_service.generate_twiml_greeting(
        business_name=business_name,
        webhook_url=webhook_url
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
    Processes caller's speech and responds appropriately.
    """
    call_service = CallService(db)

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

    speech_text = SpeechResult.lower().strip()

    # Log the conversation turn
    await call_service.add_conversation_turn(
        call.call_id,
        role="caller",
        content=SpeechResult
    )

    base_url = str(request.base_url).rstrip("/")
    webhook_url = f"{base_url}/api/v1/voice/webhook"

    # Simple intent detection
    intent = CallIntent.UNKNOWN
    response_message = ""

    if any(word in speech_text for word in ["book", "schedule", "appointment", "reserve"]):
        intent = CallIntent.BOOKING
        response_message = (
            "I'd be happy to help you schedule an appointment. "
            "What service are you interested in?"
        )
        await call_service.set_call_intent(call.call_id, intent)

    elif any(word in speech_text for word in ["reschedule", "change", "move"]):
        intent = CallIntent.RESCHEDULE
        response_message = (
            "I can help you reschedule your appointment. "
            "Can you tell me your name and the date of your current appointment?"
        )
        await call_service.set_call_intent(call.call_id, intent)

    elif any(word in speech_text for word in ["cancel"]):
        intent = CallIntent.CANCEL
        response_message = (
            "I understand you'd like to cancel an appointment. "
            "Can you please provide your name and appointment date?"
        )
        await call_service.set_call_intent(call.call_id, intent)

    elif any(word in speech_text for word in ["price", "cost", "how much", "quote"]):
        intent = CallIntent.INQUIRY
        response_message = (
            "I'd be happy to help with pricing information. "
            "Which service would you like to know about?"
        )
        await call_service.set_call_intent(call.call_id, intent)

    elif any(word in speech_text for word in ["speak", "talk", "human", "person", "representative", "transfer"]):
        intent = CallIntent.SUPPORT
        await call_service.set_call_intent(call.call_id, intent, "Requested human transfer")

        # Update call as transferred
        await db.calls.update_one(
            {"call_id": call.call_id},
            {"$set": {"transferred_to_human": True}}
        )

        # Get transfer number from business config
        transfer_number = business.get("config", {}).get("main_phone") if business else None

        if transfer_number:
            twiml = call_service.generate_twiml_transfer(transfer_number)
        else:
            # No transfer number, go to voicemail
            twiml = call_service.generate_twiml_voicemail(
                business_name,
                f"{webhook_url}/recording"
            )
        return Response(content=twiml, media_type="application/xml")

    elif any(word in speech_text for word in ["leave message", "voicemail"]):
        twiml = call_service.generate_twiml_voicemail(
            business_name,
            f"{webhook_url}/recording"
        )
        return Response(content=twiml, media_type="application/xml")

    elif any(word in speech_text for word in ["goodbye", "bye", "thank you", "thanks", "that's all"]):
        response_message = "Thank you for calling. Have a great day!"
        twiml = call_service.generate_twiml_response(response_message, end_call=True)

        # End the call
        await call_service.update_call_status(call.call_id, CallStatus.COMPLETED)

        return Response(content=twiml, media_type="application/xml")

    else:
        # Default response
        response_message = (
            "I can help you with scheduling appointments, checking prices, "
            "or connecting you with our team. What would you like to do?"
        )

    # Log AI response
    await call_service.add_conversation_turn(
        call.call_id,
        role="ai",
        content=response_message,
        intent=intent
    )

    twiml = call_service.generate_twiml_response(
        response_message,
        gather_url=f"{webhook_url}/gather"
    )

    return Response(content=twiml, media_type="application/xml")


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
