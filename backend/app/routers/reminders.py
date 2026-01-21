"""
SMS Reminders API Router
Automated appointment reminders and Twilio webhooks
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, Request, Form
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional, List
from pydantic import BaseModel

from app.database import get_database
from app.middleware.auth import get_current_user
from app.models.user import User
from app.services.reminders import RemindersService

router = APIRouter()


# ============== Request/Response Models ==============

class ReminderSettingsUpdate(BaseModel):
    enabled: Optional[bool] = None
    reminder_24h_enabled: Optional[bool] = None
    reminder_2h_enabled: Optional[bool] = None
    reminder_24h_template: Optional[str] = None
    reminder_2h_template: Optional[str] = None
    allow_replies: Optional[bool] = None


class SendReminderRequest(BaseModel):
    appointment_id: str
    reminder_type: str = "manual"  # 24h, 2h, manual


class SendBulkRemindersRequest(BaseModel):
    reminder_type: str = "24h"  # 24h or 2h


# ============== Settings Endpoints ==============

@router.get(
    "/settings",
    response_model=dict,
    summary="Get reminder settings"
)
async def get_reminder_settings(
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get reminder settings for the business"""
    reminders_service = RemindersService(db)
    settings = await reminders_service.get_reminder_settings(current_user.business_id)

    return {
        "success": True,
        "data": settings
    }


@router.put(
    "/settings",
    response_model=dict,
    summary="Update reminder settings"
)
async def update_reminder_settings(
    settings: ReminderSettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Update reminder settings for the business"""
    reminders_service = RemindersService(db)

    updated = await reminders_service.update_reminder_settings(
        current_user.business_id,
        settings.model_dump(exclude_none=True)
    )

    return {
        "success": True,
        "data": updated
    }


# ============== Send Reminders ==============

@router.post(
    "/send",
    response_model=dict,
    summary="Send reminder for a specific appointment"
)
async def send_reminder(
    request: SendReminderRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Manually send a reminder for a specific appointment"""
    reminders_service = RemindersService(db)

    # Get appointment
    appointment = await db.appointments.find_one({
        "appointment_id": request.appointment_id,
        "business_id": current_user.business_id,
        "deleted_at": None
    })

    if not appointment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appointment not found"
        )

    # Get client
    client = await db.clients.find_one({"client_id": appointment.get("client_id")})
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found"
        )

    if not client.get("phone"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Client has no phone number"
        )

    # Get business
    business = await db.businesses.find_one({"business_id": current_user.business_id})

    # Get settings and format message
    settings = await reminders_service.get_reminder_settings(current_user.business_id)

    if request.reminder_type == "24h":
        template = settings.get("reminder_24h_template", "Reminder: Your appointment is tomorrow at {time}.")
        message = reminders_service.format_24h_reminder(template, appointment, client, business or {})
    elif request.reminder_type == "2h":
        staff = None
        staff_ids = appointment.get("staff_ids", [])
        if staff_ids:
            staff = await db.staff.find_one({"staff_id": staff_ids[0]})
        template = settings.get("reminder_2h_template", "Your technician {staff_name} is on the way.")
        message = reminders_service.format_2h_reminder(
            template, appointment, client, staff,
            eta=appointment.get("scheduled_time", "")
        )
    else:
        message = f"Reminder: You have an appointment scheduled for {appointment.get('scheduled_date')} at {appointment.get('scheduled_time')}."

    # Send SMS
    result = await reminders_service.send_sms(
        to_phone=client["phone"],
        message=message,
        business_id=current_user.business_id,
        appointment_id=request.appointment_id,
        reminder_type=request.reminder_type
    )

    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "Failed to send SMS")
        )

    return {
        "success": True,
        "data": {
            "message": "Reminder sent successfully",
            "message_sid": result.get("message_sid"),
            "status": result.get("status")
        }
    }


@router.post(
    "/send-bulk",
    response_model=dict,
    summary="Trigger bulk reminder send"
)
async def send_bulk_reminders(
    request: SendBulkRemindersRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Manually trigger sending of 24h or 2h reminders for all eligible appointments"""
    reminders_service = RemindersService(db)

    if request.reminder_type == "24h":
        stats = await reminders_service.send_24h_reminders(current_user.business_id)
    elif request.reminder_type == "2h":
        stats = await reminders_service.send_2h_reminders(current_user.business_id)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid reminder type. Use '24h' or '2h'."
        )

    return {
        "success": True,
        "data": {
            "message": f"{request.reminder_type} reminders processed",
            "sent": stats["sent"],
            "failed": stats["failed"],
            "skipped": stats["skipped"]
        }
    }


# ============== Reminder Logs ==============

@router.get(
    "/log",
    response_model=dict,
    summary="Get reminder history"
)
async def get_reminder_logs(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    appointment_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get history of sent reminders"""
    reminders_service = RemindersService(db)

    logs = await reminders_service.get_reminder_logs(
        current_user.business_id,
        limit=limit,
        offset=offset,
        appointment_id=appointment_id
    )

    return {
        "success": True,
        "data": {
            "logs": logs,
            "count": len(logs),
            "offset": offset,
            "limit": limit
        }
    }


# ============== Twilio Webhooks ==============

@router.post(
    "/webhook/status",
    summary="Twilio delivery status webhook"
)
async def twilio_status_webhook(
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Handle Twilio message status callbacks"""
    form_data = await request.form()

    message_sid = form_data.get("MessageSid", "")
    message_status = form_data.get("MessageStatus", "")
    error_code = form_data.get("ErrorCode")

    if message_sid and message_status:
        reminders_service = RemindersService(db)
        await reminders_service.update_delivery_status(
            twilio_sid=message_sid,
            status=message_status,
            error_code=error_code
        )

    # Return empty TwiML response
    return Response(
        content='<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        media_type="application/xml"
    )


@router.post(
    "/webhook/incoming",
    summary="Twilio incoming SMS webhook"
)
async def twilio_incoming_webhook(
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Handle incoming SMS replies"""
    form_data = await request.form()

    from_phone = form_data.get("From", "")
    body = form_data.get("Body", "")
    message_sid = form_data.get("MessageSid", "")

    if from_phone and body:
        reminders_service = RemindersService(db)
        result = await reminders_service.handle_incoming_sms(
            from_phone=from_phone,
            body=body,
            twilio_sid=message_sid
        )

        # Send auto-reply if configured
        response_message = result.get("response_message", "")
        if response_message:
            twiml = f'''<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Message>{response_message}</Message>
</Response>'''
            return Response(content=twiml, media_type="application/xml")

    # Return empty TwiML response
    return Response(
        content='<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        media_type="application/xml"
    )


# ============== Reply History ==============

@router.get(
    "/replies",
    response_model=dict,
    summary="Get SMS reply history"
)
async def get_reply_history(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get history of SMS replies received"""
    # Get appointment IDs for this business
    appointments = await db.appointments.find(
        {"business_id": current_user.business_id},
        {"appointment_id": 1}
    ).to_list(length=10000)

    apt_ids = [a["appointment_id"] for a in appointments]

    # Get replies for these appointments
    replies = await db.reminder_replies.find(
        {"appointment_id": {"$in": apt_ids}}
    ).sort("received_at", -1).skip(offset).limit(limit).to_list(length=limit)

    return {
        "success": True,
        "data": {
            "replies": replies,
            "count": len(replies),
            "offset": offset,
            "limit": limit
        }
    }
