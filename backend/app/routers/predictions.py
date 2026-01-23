"""
Predictions API Router
No-show risk prediction and at-risk appointment management
"""

import logging
from datetime import datetime, timedelta, date
from fastapi import APIRouter, Depends, HTTPException, status, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional
from enum import Enum

from app.database import get_database
from app.models.user import User
from app.middleware.auth import BusinessContext, get_business_context, get_current_user
from app.schemas.common import PaginatedResponse, SingleResponse, create_pagination_meta

router = APIRouter()
logger = logging.getLogger(__name__)


class RiskLevel(str, Enum):
    """Risk level classification"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class NoShowPredictor:
    """No-show risk prediction algorithm"""

    # Weight factors for different signals
    WEIGHTS = {
        "previous_no_shows": 0.30,      # Historical no-shows
        "sms_engagement": 0.20,          # SMS reply rate
        "booking_lead_time": 0.15,       # Time since booking
        "customer_tenure": 0.10,         # New vs repeat customer
        "day_of_week": 0.10,             # Day patterns
        "appointment_value": 0.05,       # Higher value = lower risk
        "confirmation_status": 0.10,     # Confirmed vs unconfirmed
    }

    @classmethod
    def calculate_risk(
        cls,
        customer_data: dict,
        appointment_data: dict,
        engagement_data: dict
    ) -> dict:
        """
        Calculate no-show risk score

        Args:
            customer_data: Customer history and profile
            appointment_data: Appointment details
            engagement_data: SMS/communication engagement

        Returns:
            Risk assessment with score, level, and factors
        """
        factors = []
        total_score = 0.0

        # 1. Previous no-shows (highest weight)
        no_show_count = customer_data.get("no_show_count", 0)
        total_appointments = customer_data.get("total_appointments", 1)
        no_show_rate = no_show_count / max(total_appointments, 1)

        if no_show_count > 0:
            no_show_impact = min(0.30, no_show_rate * 0.5 + 0.1 * no_show_count)
            total_score += no_show_impact
            factors.append({
                "factor": "previous_no_shows",
                "impact": round(no_show_impact, 2),
                "description": f"{no_show_count} no-show(s) in history ({no_show_rate:.0%} rate)"
            })

        # 2. SMS engagement
        sms_sent = engagement_data.get("sms_sent", 0)
        sms_replied = engagement_data.get("sms_replied", 0)
        reply_rate = sms_replied / max(sms_sent, 1) if sms_sent > 0 else 0.5

        if sms_sent > 0 and sms_replied == 0:
            sms_impact = 0.15
            total_score += sms_impact
            factors.append({
                "factor": "no_sms_reply",
                "impact": round(sms_impact, 2),
                "description": "No reply to confirmation SMS"
            })
        elif reply_rate < 0.3:
            sms_impact = 0.10
            total_score += sms_impact
            factors.append({
                "factor": "low_sms_engagement",
                "impact": round(sms_impact, 2),
                "description": f"Low SMS engagement ({reply_rate:.0%} reply rate)"
            })

        # 3. Booking lead time (longer = higher risk)
        created_at = appointment_data.get("created_at")
        scheduled_date = appointment_data.get("scheduled_date")

        if created_at and scheduled_date:
            if isinstance(created_at, str):
                created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            if isinstance(scheduled_date, str):
                scheduled_date = datetime.fromisoformat(scheduled_date)

            days_since_booking = (scheduled_date - created_at.replace(tzinfo=None)).days

            if days_since_booking > 14:
                lead_impact = min(0.15, 0.05 + (days_since_booking - 14) * 0.005)
                total_score += lead_impact
                factors.append({
                    "factor": "long_lead_time",
                    "impact": round(lead_impact, 2),
                    "description": f"Booked {days_since_booking} days ago"
                })

        # 4. Customer tenure (first-time = higher risk)
        is_first_time = customer_data.get("total_appointments", 0) <= 1
        if is_first_time:
            tenure_impact = 0.10
            total_score += tenure_impact
            factors.append({
                "factor": "first_time_customer",
                "impact": round(tenure_impact, 2),
                "description": "First-time customer"
            })

        # 5. Day of week patterns
        if scheduled_date:
            if isinstance(scheduled_date, str):
                scheduled_date = datetime.fromisoformat(scheduled_date)
            day_of_week = scheduled_date.weekday()

            # Monday (0) and Friday (4) tend to have higher no-show rates
            if day_of_week == 0:
                day_impact = 0.08
                total_score += day_impact
                factors.append({
                    "factor": "monday_appointment",
                    "impact": round(day_impact, 2),
                    "description": "Monday appointments have higher no-show rates"
                })
            elif day_of_week == 4:
                day_impact = 0.05
                total_score += day_impact
                factors.append({
                    "factor": "friday_appointment",
                    "impact": round(day_impact, 2),
                    "description": "Friday appointments have slightly higher no-show rates"
                })

        # 6. Confirmation status
        is_confirmed = appointment_data.get("confirmed", False)
        if not is_confirmed:
            confirm_impact = 0.10
            total_score += confirm_impact
            factors.append({
                "factor": "not_confirmed",
                "impact": round(confirm_impact, 2),
                "description": "Appointment not confirmed"
            })

        # 7. Time of day (early morning = slightly higher risk)
        scheduled_time = appointment_data.get("scheduled_time", "")
        if scheduled_time:
            try:
                hour = int(scheduled_time.split(":")[0])
                if hour < 9:
                    time_impact = 0.05
                    total_score += time_impact
                    factors.append({
                        "factor": "early_morning",
                        "impact": round(time_impact, 2),
                        "description": "Early morning appointment (before 9 AM)"
                    })
            except (ValueError, IndexError):
                pass

        # Clamp score between 0 and 1
        risk_score = min(1.0, max(0.0, total_score))

        # Determine risk level
        if risk_score >= 0.6:
            risk_level = RiskLevel.CRITICAL
            recommendation = "Strongly recommend a confirmation call before the appointment"
            suggested_action = "call_required"
        elif risk_score >= 0.4:
            risk_level = RiskLevel.HIGH
            recommendation = "Send additional reminder and consider a confirmation call"
            suggested_action = "call_recommended"
        elif risk_score >= 0.25:
            risk_level = RiskLevel.MEDIUM
            recommendation = "Send a reminder SMS 24 hours before"
            suggested_action = "sms_reminder"
        else:
            risk_level = RiskLevel.LOW
            recommendation = "Standard reminder process is sufficient"
            suggested_action = "standard"

        return {
            "risk_score": round(risk_score, 2),
            "risk_level": risk_level.value,
            "factors": sorted(factors, key=lambda x: x["impact"], reverse=True),
            "recommendation": recommendation,
            "suggested_action": suggested_action
        }


async def get_customer_history(db: AsyncIOMotorDatabase, client_id: str, business_id: str) -> dict:
    """Get customer appointment history"""
    # Count total appointments
    total = await db.appointments.count_documents({
        "client_id": client_id,
        "business_id": business_id,
        "deleted_at": None
    })

    # Count no-shows
    no_shows = await db.appointments.count_documents({
        "client_id": client_id,
        "business_id": business_id,
        "status": {"$in": ["no_show", "missed", "no-show"]},
        "deleted_at": None
    })

    # Count cancellations
    cancellations = await db.appointments.count_documents({
        "client_id": client_id,
        "business_id": business_id,
        "status": "cancelled",
        "deleted_at": None
    })

    # Get last appointment date
    last_appointment = await db.appointments.find_one(
        {
            "client_id": client_id,
            "business_id": business_id,
            "status": "completed",
            "deleted_at": None
        },
        sort=[("scheduled_date", -1)]
    )

    return {
        "total_appointments": total,
        "no_show_count": no_shows,
        "cancellation_count": cancellations,
        "last_appointment_date": last_appointment.get("scheduled_date") if last_appointment else None
    }


async def get_engagement_data(db: AsyncIOMotorDatabase, client_id: str, business_id: str, days: int = 30) -> dict:
    """Get SMS engagement data for a client"""
    since = datetime.utcnow() - timedelta(days=days)

    # Count SMS sent to client
    sms_sent = await db.sms_messages.count_documents({
        "client_id": client_id,
        "business_id": business_id,
        "direction": "outbound",
        "created_at": {"$gte": since}
    })

    # Count SMS received from client
    sms_replied = await db.sms_messages.count_documents({
        "client_id": client_id,
        "business_id": business_id,
        "direction": "inbound",
        "created_at": {"$gte": since}
    })

    return {
        "sms_sent": sms_sent,
        "sms_replied": sms_replied
    }


@router.get(
    "/appointments/{appointment_id}/no-show-risk",
    summary="Get no-show risk for an appointment"
)
async def get_appointment_no_show_risk(
    appointment_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Calculate no-show risk for a specific appointment"""
    # Get appointment
    appointment = await db.appointments.find_one(ctx.filter_query({
        "appointment_id": appointment_id,
        "deleted_at": None
    }))

    if not appointment:
        # Try hvac_quotes collection
        appointment = await db.hvac_quotes.find_one(ctx.filter_query({
            "quote_id": appointment_id,
            "deleted_at": None
        }))
        if appointment:
            appointment["appointment_id"] = appointment["quote_id"]

    if not appointment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "APPOINTMENT_NOT_FOUND", "message": "Appointment not found"}
        )

    client_id = appointment.get("client_id")

    # Get customer history
    customer_data = {}
    engagement_data = {"sms_sent": 0, "sms_replied": 0}

    if client_id:
        customer_data = await get_customer_history(db, client_id, ctx.business_id)
        engagement_data = await get_engagement_data(db, client_id, ctx.business_id)

    # Prepare appointment data
    schedule = appointment.get("schedule", {})
    appointment_data = {
        "created_at": appointment.get("created_at"),
        "scheduled_date": schedule.get("scheduled_date") or appointment.get("scheduled_date"),
        "scheduled_time": schedule.get("scheduled_time_start") or appointment.get("start_time"),
        "confirmed": appointment.get("confirmed", False),
        "value": appointment.get("grand_total", 0)
    }

    # Calculate risk
    risk = NoShowPredictor.calculate_risk(customer_data, appointment_data, engagement_data)

    return {
        "success": True,
        "data": {
            "appointment_id": appointment_id,
            **risk
        }
    }


@router.get(
    "/at-risk",
    summary="Get at-risk appointments"
)
async def get_at_risk_appointments(
    date_str: Optional[str] = Query(None, alias="date", description="Date YYYY-MM-DD (default: today)"),
    date_range: int = Query(7, ge=1, le=30, description="Number of days to look ahead"),
    threshold: float = Query(0.25, ge=0.0, le=1.0, description="Minimum risk score"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get appointments with high no-show risk"""
    # Calculate date range
    if date_str:
        start_date = datetime.fromisoformat(date_str)
    else:
        start_date = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

    end_date = start_date + timedelta(days=date_range)

    # Get appointments in date range
    appointments = await db.appointments.find(ctx.filter_query({
        "scheduled_date": {
            "$gte": start_date.isoformat()[:10],
            "$lte": end_date.isoformat()[:10]
        },
        "status": {"$nin": ["completed", "cancelled", "no_show"]},
        "deleted_at": None
    })).to_list(length=200)

    # Also check hvac_quotes
    hvac_jobs = await db.hvac_quotes.find(ctx.filter_query({
        "schedule.scheduled_date": {
            "$gte": start_date.isoformat()[:10],
            "$lte": end_date.isoformat()[:10]
        },
        "status": {"$in": ["scheduled", "approved"]},
        "deleted_at": None
    })).to_list(length=200)

    # Convert hvac_quotes to appointment-like format
    for job in hvac_jobs:
        schedule = job.get("schedule", {})
        appointments.append({
            "appointment_id": job["quote_id"],
            "client_id": job.get("client", {}).get("client_id"),
            "client": job.get("client", {}),
            "scheduled_date": schedule.get("scheduled_date"),
            "start_time": schedule.get("scheduled_time_start"),
            "service_type": job.get("job_type", "service"),
            "created_at": job.get("created_at"),
            "confirmed": job.get("confirmed", False),
            "grand_total": job.get("grand_total", 0),
            "address": job.get("client", {}).get("address"),
            "source": "hvac_quote"
        })

    # Calculate risk for each appointment
    at_risk = []
    for apt in appointments:
        client_id = apt.get("client_id")

        customer_data = {}
        engagement_data = {"sms_sent": 0, "sms_replied": 0}

        if client_id:
            customer_data = await get_customer_history(db, client_id, ctx.business_id)
            engagement_data = await get_engagement_data(db, client_id, ctx.business_id)

        appointment_data = {
            "created_at": apt.get("created_at"),
            "scheduled_date": apt.get("scheduled_date"),
            "scheduled_time": apt.get("start_time"),
            "confirmed": apt.get("confirmed", False),
            "value": apt.get("grand_total", 0)
        }

        risk = NoShowPredictor.calculate_risk(customer_data, appointment_data, engagement_data)

        if risk["risk_score"] >= threshold:
            # Get client name
            client = apt.get("client", {})
            if not client and client_id:
                client_doc = await db.clients.find_one({"client_id": client_id})
                if client_doc:
                    client = client_doc

            at_risk.append({
                "appointment_id": apt.get("appointment_id"),
                "customer_name": f"{client.get('first_name', '')} {client.get('last_name', '')}".strip() or "Unknown",
                "phone": client.get("phone"),
                "address": apt.get("address") or client.get("address"),
                "scheduled_date": apt.get("scheduled_date"),
                "scheduled_time": apt.get("start_time"),
                "service_type": apt.get("service_type", "Service"),
                "risk_score": risk["risk_score"],
                "risk_level": risk["risk_level"],
                "factors": risk["factors"][:3],  # Top 3 factors
                "recommendation": risk["recommendation"],
                "suggested_action": risk["suggested_action"]
            })

    # Sort by risk score descending
    at_risk.sort(key=lambda x: x["risk_score"], reverse=True)

    # Paginate
    total = len(at_risk)
    start_idx = (page - 1) * per_page
    end_idx = start_idx + per_page
    paginated = at_risk[start_idx:end_idx]

    meta = create_pagination_meta(total, page, per_page)

    return {
        "success": True,
        "data": {
            "date_range": {
                "start": start_date.isoformat()[:10],
                "end": end_date.isoformat()[:10]
            },
            "threshold": threshold,
            "total_at_risk": total,
            "appointments": paginated
        },
        "meta": meta
    }


@router.get(
    "/stats",
    summary="Get prediction statistics"
)
async def get_prediction_stats(
    date_str: Optional[str] = Query(None, alias="date"),
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get overall prediction statistics"""
    if date_str:
        target_date = date_str
    else:
        target_date = date.today().isoformat()

    # Get appointments for today
    appointments_today = await db.appointments.count_documents(ctx.filter_query({
        "scheduled_date": target_date,
        "deleted_at": None
    }))

    hvac_today = await db.hvac_quotes.count_documents(ctx.filter_query({
        "schedule.scheduled_date": target_date,
        "deleted_at": None
    }))

    total_today = appointments_today + hvac_today

    # Get historical no-show rate (last 90 days)
    ninety_days_ago = (datetime.now() - timedelta(days=90)).isoformat()[:10]

    total_past = await db.appointments.count_documents(ctx.filter_query({
        "scheduled_date": {"$gte": ninety_days_ago, "$lt": target_date},
        "status": {"$in": ["completed", "no_show", "missed"]},
        "deleted_at": None
    }))

    no_shows_past = await db.appointments.count_documents(ctx.filter_query({
        "scheduled_date": {"$gte": ninety_days_ago, "$lt": target_date},
        "status": {"$in": ["no_show", "missed"]},
        "deleted_at": None
    }))

    no_show_rate = no_shows_past / max(total_past, 1)

    return {
        "success": True,
        "data": {
            "date": target_date,
            "appointments_today": total_today,
            "historical_no_show_rate": round(no_show_rate, 3),
            "historical_sample_size": total_past,
            "predicted_no_shows_today": round(total_today * no_show_rate)
        }
    }


@router.post(
    "/appointments/{appointment_id}/mark-confirmed",
    summary="Mark appointment as confirmed"
)
async def mark_appointment_confirmed(
    appointment_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Mark an appointment as confirmed (reduces no-show risk)"""
    # Try appointments collection first
    result = await db.appointments.update_one(
        ctx.filter_query({"appointment_id": appointment_id, "deleted_at": None}),
        {"$set": {
            "confirmed": True,
            "confirmed_at": datetime.utcnow(),
            "confirmed_by": current_user.user_id,
            "updated_at": datetime.utcnow()
        }}
    )

    if result.modified_count == 0:
        # Try hvac_quotes
        result = await db.hvac_quotes.update_one(
            ctx.filter_query({"quote_id": appointment_id, "deleted_at": None}),
            {"$set": {
                "confirmed": True,
                "confirmed_at": datetime.utcnow(),
                "confirmed_by": current_user.user_id,
                "updated_at": datetime.utcnow()
            }}
        )

    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "APPOINTMENT_NOT_FOUND", "message": "Appointment not found"}
        )

    return {
        "success": True,
        "message": "Appointment marked as confirmed"
    }
