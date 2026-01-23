"""
SMS Router
Endpoints for SMS messaging, templates, and settings
"""

from datetime import date, datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_database
from app.middleware.auth import get_current_user, get_current_business_id
from app.models.sms import (
    SMSMessage, SMSTemplate, SMSSettings, SMSTriggerType,
    SMSDirection, SMSStatus, DEFAULT_TEMPLATES
)
from app.models.common import utc_now, generate_id
from app.services.sms_service import SMSService, get_sms_service

router = APIRouter()


# ============== Request/Response Models ==============

class SendSMSRequest(BaseModel):
    """Request to send a manual SMS"""
    customer_id: str
    message: str = Field(min_length=1, max_length=1600)
    job_id: Optional[str] = None


class SendSMSResponse(BaseModel):
    """Response after sending SMS"""
    success: bool
    message_id: Optional[str] = None
    error: Optional[str] = None


class SMSMessageResponse(BaseModel):
    """SMS message response"""
    message_id: str
    business_id: str
    customer_id: str
    job_id: Optional[str] = None
    tech_id: Optional[str] = None
    direction: SMSDirection
    to_phone: str
    from_phone: str
    body: str
    trigger_type: SMSTriggerType
    status: SMSStatus
    twilio_sid: Optional[str] = None
    sent_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    error_message: Optional[str] = None
    created_at: datetime


class SMSConversation(BaseModel):
    """SMS conversation with a customer"""
    customer_id: str
    customer_name: str
    customer_phone: str
    last_message: str
    last_message_at: datetime
    unread_count: int = 0
    messages: list[SMSMessageResponse] = Field(default_factory=list)


class SMSTemplateResponse(BaseModel):
    """SMS template response"""
    template_id: str
    business_id: str
    name: str
    trigger_type: SMSTriggerType
    body: str
    is_active: bool
    is_default: bool
    variables: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class SMSTemplateUpdate(BaseModel):
    """Request to update a template"""
    name: Optional[str] = None
    body: Optional[str] = Field(None, min_length=1, max_length=1600)
    is_active: Optional[bool] = None


class SMSTemplateCreate(BaseModel):
    """Request to create a custom template"""
    name: str
    trigger_type: SMSTriggerType
    body: str = Field(min_length=1, max_length=1600)


class PreviewTemplateRequest(BaseModel):
    """Request to preview a template with sample data"""
    body: str
    sample_data: Optional[dict] = None


class PreviewTemplateResponse(BaseModel):
    """Rendered template preview"""
    original: str
    rendered: str
    variables_used: list[str]


class SMSSettingsUpdate(BaseModel):
    """Request to update SMS settings"""
    enabled: Optional[bool] = None
    twilio_phone: Optional[str] = None
    auto_scheduled: Optional[bool] = None
    auto_reminder: Optional[bool] = None
    auto_enroute: Optional[bool] = None
    auto_15_min: Optional[bool] = None
    auto_arrived: Optional[bool] = None
    auto_complete: Optional[bool] = None
    reminder_hours: Optional[int] = Field(None, ge=1, le=72)
    opt_out_message: Optional[str] = Field(None, max_length=160)


class SMSStatsResponse(BaseModel):
    """SMS statistics"""
    total_sent: int = 0
    total_received: int = 0
    delivered: int = 0
    failed: int = 0
    delivery_rate: float = 0.0
    today_sent: int = 0
    this_month_sent: int = 0


# ============== Message Endpoints ==============

@router.get("", response_model=list[SMSMessageResponse])
async def list_messages(
    customer_id: Optional[str] = None,
    job_id: Optional[str] = None,
    direction: Optional[SMSDirection] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    limit: int = 50,
    skip: int = 0,
    db: AsyncIOMotorDatabase = Depends(get_database),
    business_id: str = Depends(get_current_business_id)
):
    """List SMS messages with optional filters"""
    query = {"business_id": business_id, "deleted_at": None}

    if customer_id:
        query["customer_id"] = customer_id
    if job_id:
        query["job_id"] = job_id
    if direction:
        query["direction"] = direction.value

    if start_date or end_date:
        query["created_at"] = {}
        if start_date:
            query["created_at"]["$gte"] = datetime.combine(start_date, datetime.min.time())
        if end_date:
            query["created_at"]["$lte"] = datetime.combine(end_date, datetime.max.time())

    cursor = db.sms_messages.find(query).sort("created_at", -1).skip(skip).limit(limit)
    messages = await cursor.to_list(length=limit)

    return [SMSMessageResponse(**msg) for msg in messages]


@router.get("/conversations", response_model=list[SMSConversation])
async def list_conversations(
    limit: int = 20,
    db: AsyncIOMotorDatabase = Depends(get_database),
    business_id: str = Depends(get_current_business_id)
):
    """List SMS conversations grouped by customer"""
    pipeline = [
        {"$match": {"business_id": business_id, "deleted_at": None}},
        {"$sort": {"created_at": -1}},
        {"$group": {
            "_id": "$customer_id",
            "last_message": {"$first": "$body"},
            "last_message_at": {"$first": "$created_at"},
            "last_direction": {"$first": "$direction"},
            "message_count": {"$sum": 1}
        }},
        {"$sort": {"last_message_at": -1}},
        {"$limit": limit}
    ]

    results = await db.sms_messages.aggregate(pipeline).to_list(length=limit)

    conversations = []
    for r in results:
        # Get customer info
        customer = await db.clients.find_one({
            "client_id": r["_id"],
            "deleted_at": None
        })

        if customer:
            # Count unread (inbound messages not viewed)
            unread = await db.sms_messages.count_documents({
                "business_id": business_id,
                "customer_id": r["_id"],
                "direction": SMSDirection.INBOUND.value,
                "read_at": None,
                "deleted_at": None
            })

            conversations.append(SMSConversation(
                customer_id=r["_id"],
                customer_name=f"{customer.get('first_name', '')} {customer.get('last_name', '')}".strip(),
                customer_phone=customer.get("phone", ""),
                last_message=r["last_message"],
                last_message_at=r["last_message_at"],
                unread_count=unread
            ))

    return conversations


@router.get("/conversation/{customer_id}", response_model=SMSConversation)
async def get_conversation(
    customer_id: str,
    limit: int = 100,
    db: AsyncIOMotorDatabase = Depends(get_database),
    business_id: str = Depends(get_current_business_id)
):
    """Get full conversation with a customer"""
    customer = await db.clients.find_one({
        "client_id": customer_id,
        "business_id": business_id,
        "deleted_at": None
    })

    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    # Get messages
    cursor = db.sms_messages.find({
        "business_id": business_id,
        "customer_id": customer_id,
        "deleted_at": None
    }).sort("created_at", -1).limit(limit)

    messages = await cursor.to_list(length=limit)

    # Mark inbound as read
    await db.sms_messages.update_many(
        {
            "business_id": business_id,
            "customer_id": customer_id,
            "direction": SMSDirection.INBOUND.value,
            "read_at": None
        },
        {"$set": {"read_at": utc_now()}}
    )

    return SMSConversation(
        customer_id=customer_id,
        customer_name=f"{customer.get('first_name', '')} {customer.get('last_name', '')}".strip(),
        customer_phone=customer.get("phone", ""),
        last_message=messages[0]["body"] if messages else "",
        last_message_at=messages[0]["created_at"] if messages else utc_now(),
        unread_count=0,
        messages=[SMSMessageResponse(**msg) for msg in reversed(messages)]
    )


@router.post("/send", response_model=SendSMSResponse)
async def send_sms(
    request: SendSMSRequest,
    db: AsyncIOMotorDatabase = Depends(get_database),
    business_id: str = Depends(get_current_business_id)
):
    """Send a manual SMS to a customer"""
    customer = await db.clients.find_one({
        "client_id": request.customer_id,
        "business_id": business_id,
        "deleted_at": None
    })

    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    if not customer.get("phone"):
        raise HTTPException(status_code=400, detail="Customer has no phone number")

    if customer.get("sms_opt_out"):
        raise HTTPException(status_code=400, detail="Customer has opted out of SMS")

    sms_service = get_sms_service(db)
    message = await sms_service.send_and_log(
        business_id=business_id,
        to_phone=customer["phone"],
        body=request.message,
        customer_id=request.customer_id,
        trigger_type=SMSTriggerType.MANUAL,
        job_id=request.job_id
    )

    return SendSMSResponse(
        success=message.status == SMSStatus.SENT,
        message_id=message.message_id,
        error=message.error_message
    )


@router.post("/webhook")
async def twilio_webhook(
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Handle Twilio webhook callbacks"""
    form_data = await request.form()
    webhook_data = dict(form_data)

    # Get business_id from the To phone number
    to_phone = webhook_data.get("To", "")

    # Find business by Twilio phone
    business = await db.businesses.find_one({
        "config.sms.twilio_phone": to_phone
    })

    if not business:
        # Try default
        business = await db.businesses.find_one({})

    if not business:
        return {"status": "ok", "message": "No business found"}

    sms_service = get_sms_service(db)
    await sms_service.process_webhook(business["business_id"], webhook_data)

    return {"status": "ok"}


@router.get("/stats", response_model=SMSStatsResponse)
async def get_sms_stats(
    db: AsyncIOMotorDatabase = Depends(get_database),
    business_id: str = Depends(get_current_business_id)
):
    """Get SMS statistics for the business"""
    base_query = {"business_id": business_id, "deleted_at": None}

    # Total counts
    total_sent = await db.sms_messages.count_documents({
        **base_query,
        "direction": SMSDirection.OUTBOUND.value
    })

    total_received = await db.sms_messages.count_documents({
        **base_query,
        "direction": SMSDirection.INBOUND.value
    })

    delivered = await db.sms_messages.count_documents({
        **base_query,
        "direction": SMSDirection.OUTBOUND.value,
        "status": SMSStatus.DELIVERED.value
    })

    failed = await db.sms_messages.count_documents({
        **base_query,
        "direction": SMSDirection.OUTBOUND.value,
        "status": SMSStatus.FAILED.value
    })

    # Today's count
    today_start = datetime.combine(date.today(), datetime.min.time())
    today_sent = await db.sms_messages.count_documents({
        **base_query,
        "direction": SMSDirection.OUTBOUND.value,
        "created_at": {"$gte": today_start}
    })

    # This month
    month_start = datetime.combine(date.today().replace(day=1), datetime.min.time())
    this_month_sent = await db.sms_messages.count_documents({
        **base_query,
        "direction": SMSDirection.OUTBOUND.value,
        "created_at": {"$gte": month_start}
    })

    delivery_rate = (delivered / total_sent * 100) if total_sent > 0 else 0.0

    return SMSStatsResponse(
        total_sent=total_sent,
        total_received=total_received,
        delivered=delivered,
        failed=failed,
        delivery_rate=round(delivery_rate, 1),
        today_sent=today_sent,
        this_month_sent=this_month_sent
    )


# ============== Template Endpoints ==============

@router.get("/templates", response_model=list[SMSTemplateResponse])
async def list_templates(
    trigger_type: Optional[SMSTriggerType] = None,
    db: AsyncIOMotorDatabase = Depends(get_database),
    business_id: str = Depends(get_current_business_id)
):
    """List all SMS templates for the business"""
    query = {"business_id": business_id, "deleted_at": None}

    if trigger_type:
        query["trigger_type"] = trigger_type.value

    cursor = db.sms_templates.find(query).sort("trigger_type", 1)
    templates = await cursor.to_list(length=100)

    # If no custom templates, return defaults
    if not templates:
        default_templates = []
        for t in DEFAULT_TEMPLATES:
            template = SMSTemplate(business_id=business_id, **t)
            default_templates.append(SMSTemplateResponse(
                template_id=template.template_id,
                business_id=business_id,
                name=template.name,
                trigger_type=template.trigger_type,
                body=template.body,
                is_active=template.is_active,
                is_default=template.is_default,
                variables=template.variables,
                created_at=template.created_at,
                updated_at=template.updated_at
            ))
        return default_templates

    return [SMSTemplateResponse(**t) for t in templates]


@router.get("/templates/{template_id}", response_model=SMSTemplateResponse)
async def get_template(
    template_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    business_id: str = Depends(get_current_business_id)
):
    """Get a specific template"""
    template = await db.sms_templates.find_one({
        "template_id": template_id,
        "business_id": business_id,
        "deleted_at": None
    })

    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    return SMSTemplateResponse(**template)


@router.post("/templates", response_model=SMSTemplateResponse)
async def create_template(
    request: SMSTemplateCreate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    business_id: str = Depends(get_current_business_id)
):
    """Create a custom SMS template"""
    # Extract variables from body
    import re
    variables = re.findall(r'\{\{(\w+)\}\}', request.body)

    template = SMSTemplate(
        business_id=business_id,
        name=request.name,
        trigger_type=request.trigger_type,
        body=request.body,
        is_default=False,
        variables=variables
    )

    await db.sms_templates.insert_one(template.model_dump())

    return SMSTemplateResponse(**template.model_dump())


@router.put("/templates/{template_id}", response_model=SMSTemplateResponse)
async def update_template(
    template_id: str,
    request: SMSTemplateUpdate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    business_id: str = Depends(get_current_business_id)
):
    """Update an SMS template"""
    template = await db.sms_templates.find_one({
        "template_id": template_id,
        "business_id": business_id,
        "deleted_at": None
    })

    if not template:
        # Check if it's a default template being customized
        for default in DEFAULT_TEMPLATES:
            if default["trigger_type"].value == template_id:
                # Create a custom version
                import re
                body = request.body or default["body"]
                variables = re.findall(r'\{\{(\w+)\}\}', body)

                new_template = SMSTemplate(
                    business_id=business_id,
                    name=request.name or default["name"],
                    trigger_type=default["trigger_type"],
                    body=body,
                    is_active=request.is_active if request.is_active is not None else True,
                    is_default=False,
                    variables=variables
                )
                await db.sms_templates.insert_one(new_template.model_dump())
                return SMSTemplateResponse(**new_template.model_dump())

        raise HTTPException(status_code=404, detail="Template not found")

    update_data = {"updated_at": utc_now()}

    if request.name is not None:
        update_data["name"] = request.name
    if request.body is not None:
        import re
        update_data["body"] = request.body
        update_data["variables"] = re.findall(r'\{\{(\w+)\}\}', request.body)
    if request.is_active is not None:
        update_data["is_active"] = request.is_active

    await db.sms_templates.update_one(
        {"template_id": template_id},
        {"$set": update_data}
    )

    updated = await db.sms_templates.find_one({"template_id": template_id})
    return SMSTemplateResponse(**updated)


@router.delete("/templates/{template_id}")
async def delete_template(
    template_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    business_id: str = Depends(get_current_business_id)
):
    """Delete a custom template (soft delete)"""
    template = await db.sms_templates.find_one({
        "template_id": template_id,
        "business_id": business_id,
        "deleted_at": None
    })

    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    if template.get("is_default"):
        raise HTTPException(status_code=400, detail="Cannot delete default templates")

    await db.sms_templates.update_one(
        {"template_id": template_id},
        {"$set": {"deleted_at": utc_now()}}
    )

    return {"status": "deleted", "template_id": template_id}


@router.post("/templates/preview", response_model=PreviewTemplateResponse)
async def preview_template(
    request: PreviewTemplateRequest,
    db: AsyncIOMotorDatabase = Depends(get_database),
    business_id: str = Depends(get_current_business_id)
):
    """Preview a template with sample data"""
    import re

    # Extract variables
    variables = re.findall(r'\{\{(\w+)\}\}', request.body)

    # Default sample data
    sample = {
        "customer_first_name": "John",
        "customer_last_name": "Smith",
        "company_name": "ServicePro",
        "company_phone": "(555) 123-4567",
        "tech_first_name": "Mike",
        "tech_phone": "(555) 987-6543",
        "scheduled_date": "Monday, January 15",
        "scheduled_time": "9:00 AM - 12:00 PM",
        "job_type": "AC Repair",
        "job_total": "$249.00",
        "eta_minutes": "15",
        "eta_time": "10:30 AM",
        "invoice_link": "https://pay.example.com/inv123"
    }

    # Override with provided sample data
    if request.sample_data:
        sample.update(request.sample_data)

    sms_service = get_sms_service(db)
    rendered = sms_service.render_template(request.body, sample)

    return PreviewTemplateResponse(
        original=request.body,
        rendered=rendered,
        variables_used=variables
    )


@router.post("/templates/seed")
async def seed_templates(
    db: AsyncIOMotorDatabase = Depends(get_database),
    business_id: str = Depends(get_current_business_id)
):
    """Seed default templates for the business"""
    sms_service = get_sms_service(db)
    count = await sms_service.seed_default_templates(business_id)
    return {"status": "ok", "templates_created": count}


# ============== Settings Endpoints ==============

@router.get("/settings", response_model=SMSSettings)
async def get_sms_settings(
    db: AsyncIOMotorDatabase = Depends(get_database),
    business_id: str = Depends(get_current_business_id)
):
    """Get SMS settings for the business"""
    sms_service = get_sms_service(db)
    return await sms_service.get_settings(business_id)


@router.put("/settings", response_model=SMSSettings)
async def update_sms_settings(
    request: SMSSettingsUpdate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    business_id: str = Depends(get_current_business_id)
):
    """Update SMS settings for the business"""
    business = await db.businesses.find_one({"business_id": business_id})

    if not business:
        raise HTTPException(status_code=404, detail="Business not found")

    # Build update
    update_data = {}
    for field, value in request.model_dump(exclude_none=True).items():
        update_data[f"config.sms.{field}"] = value

    if update_data:
        update_data["updated_at"] = utc_now()
        await db.businesses.update_one(
            {"business_id": business_id},
            {"$set": update_data}
        )

    sms_service = get_sms_service(db)
    return await sms_service.get_settings(business_id)


# ============== Trigger SMS (Internal/Admin) ==============

@router.post("/trigger/{trigger_type}")
async def trigger_sms(
    trigger_type: SMSTriggerType,
    customer_id: str,
    job_id: Optional[str] = None,
    tech_id: Optional[str] = None,
    eta_minutes: Optional[int] = None,
    db: AsyncIOMotorDatabase = Depends(get_database),
    business_id: str = Depends(get_current_business_id)
):
    """Manually trigger an automated SMS"""
    sms_service = get_sms_service(db)
    message = await sms_service.send_triggered_sms(
        business_id=business_id,
        trigger_type=trigger_type,
        customer_id=customer_id,
        job_id=job_id,
        tech_id=tech_id,
        eta_minutes=eta_minutes
    )

    if message:
        return {
            "status": "sent",
            "message_id": message.message_id,
            "success": message.status == SMSStatus.SENT
        }

    return {"status": "skipped", "reason": "SMS disabled or customer opted out"}
