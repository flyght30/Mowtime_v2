"""
Analytics API Router
Business metrics and reporting endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional
from datetime import date, datetime, timedelta
from pydantic import BaseModel

from app.database import get_database
from app.middleware.auth import get_current_user
from app.models.user import User

router = APIRouter()


# ============== Helper Functions ==============

def get_date_range(period: str, custom_start: Optional[str] = None, custom_end: Optional[str] = None):
    """Get start and end dates for a given period"""
    today = date.today()

    if period == "today":
        return today.isoformat(), today.isoformat()
    elif period == "7d":
        return (today - timedelta(days=7)).isoformat(), today.isoformat()
    elif period == "30d":
        return (today - timedelta(days=30)).isoformat(), today.isoformat()
    elif period == "90d":
        return (today - timedelta(days=90)).isoformat(), today.isoformat()
    elif period == "this_week":
        start = today - timedelta(days=today.weekday())
        return start.isoformat(), today.isoformat()
    elif period == "this_month":
        start = today.replace(day=1)
        return start.isoformat(), today.isoformat()
    elif period == "last_month":
        first_of_month = today.replace(day=1)
        last_month_end = first_of_month - timedelta(days=1)
        last_month_start = last_month_end.replace(day=1)
        return last_month_start.isoformat(), last_month_end.isoformat()
    elif period == "custom" and custom_start and custom_end:
        return custom_start, custom_end
    else:
        # Default to 30 days
        return (today - timedelta(days=30)).isoformat(), today.isoformat()


def get_previous_period(start_date: str, end_date: str):
    """Get the previous period of equal length for comparison"""
    start = datetime.strptime(start_date, "%Y-%m-%d").date()
    end = datetime.strptime(end_date, "%Y-%m-%d").date()
    period_length = (end - start).days + 1

    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=period_length - 1)

    return prev_start.isoformat(), prev_end.isoformat()


# ============== Endpoints ==============

@router.get(
    "/summary",
    response_model=dict,
    summary="Get dashboard summary metrics"
)
async def get_analytics_summary(
    period: str = Query("30d", description="Time period: today, 7d, 30d, 90d, this_week, this_month"),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get key metrics for dashboard cards"""
    business_id = current_user.business_id
    start_date, end_date = get_date_range(period)
    prev_start, prev_end = get_previous_period(start_date, end_date)

    # Current period appointments
    current_appointments = await db.appointments.find({
        "business_id": business_id,
        "scheduled_date": {"$gte": start_date, "$lte": end_date},
        "deleted_at": None
    }).to_list(length=10000)

    # Previous period appointments
    prev_appointments = await db.appointments.find({
        "business_id": business_id,
        "scheduled_date": {"$gte": prev_start, "$lte": prev_end},
        "deleted_at": None
    }).to_list(length=10000)

    # Current period invoices
    current_invoices = await db.invoices.find({
        "business_id": business_id,
        "issued_date": {"$gte": start_date, "$lte": end_date},
        "deleted_at": None
    }).to_list(length=10000)

    # Previous period invoices
    prev_invoices = await db.invoices.find({
        "business_id": business_id,
        "issued_date": {"$gte": prev_start, "$lte": prev_end},
        "deleted_at": None
    }).to_list(length=10000)

    # Calculate appointment metrics
    completed = len([a for a in current_appointments if a.get("status") == "completed"])
    canceled = len([a for a in current_appointments if a.get("status") == "canceled"])
    no_shows = len([a for a in current_appointments if a.get("status") == "no_show"])
    scheduled = len([a for a in current_appointments if a.get("status") in ["scheduled", "confirmed"]])

    prev_completed = len([a for a in prev_appointments if a.get("status") == "completed"])
    prev_canceled = len([a for a in prev_appointments if a.get("status") == "canceled"])

    # Calculate revenue
    current_revenue = sum(inv.get("amount_paid", 0) for inv in current_invoices if inv.get("status") == "paid")
    prev_revenue = sum(inv.get("amount_paid", 0) for inv in prev_invoices if inv.get("status") == "paid")

    # Outstanding invoices
    outstanding_invoices = await db.invoices.find({
        "business_id": business_id,
        "status": {"$in": ["sent", "overdue"]},
        "deleted_at": None
    }).to_list(length=1000)

    outstanding_count = len(outstanding_invoices)
    outstanding_total = sum(inv.get("amount_due", 0) for inv in outstanding_invoices)

    # Calculate percentage changes
    def calc_change(current, previous):
        if previous == 0:
            return 100.0 if current > 0 else 0.0
        return round(((current - previous) / previous) * 100, 1)

    revenue_change = calc_change(current_revenue, prev_revenue)
    completed_change = calc_change(completed, prev_completed)
    canceled_change = calc_change(canceled, prev_canceled)

    # Today's stats
    today = date.today().isoformat()
    today_appointments = await db.appointments.find({
        "business_id": business_id,
        "scheduled_date": today,
        "deleted_at": None
    }).to_list(length=100)

    today_completed = len([a for a in today_appointments if a.get("status") == "completed"])
    today_remaining = len([a for a in today_appointments if a.get("status") in ["scheduled", "confirmed"]])
    today_revenue = sum(a.get("total_price", 0) for a in today_appointments if a.get("status") == "completed")

    # Weather rescheduled (last 30 days)
    weather_start = (date.today() - timedelta(days=30)).isoformat()
    weather_rescheduled = await db.appointments.count_documents({
        "business_id": business_id,
        "scheduled_date": {"$gte": weather_start},
        "reschedule_reason": {"$regex": "weather", "$options": "i"},
        "deleted_at": None
    })

    # New clients this period
    new_clients = await db.clients.count_documents({
        "business_id": business_id,
        "created_at": {"$gte": datetime.strptime(start_date, "%Y-%m-%d")},
        "deleted_at": None
    })

    return {
        "success": True,
        "data": {
            "period": {
                "start": start_date,
                "end": end_date,
                "label": period
            },
            "today": {
                "completed": today_completed,
                "remaining": today_remaining,
                "revenue": round(today_revenue, 2)
            },
            "revenue": {
                "total": round(current_revenue, 2),
                "previous": round(prev_revenue, 2),
                "change_percent": revenue_change
            },
            "appointments": {
                "total": len(current_appointments),
                "completed": completed,
                "canceled": canceled,
                "no_shows": no_shows,
                "scheduled": scheduled,
                "completed_change": completed_change,
                "canceled_change": canceled_change
            },
            "outstanding": {
                "count": outstanding_count,
                "total": round(outstanding_total, 2)
            },
            "weather_rescheduled": weather_rescheduled,
            "new_clients": new_clients
        }
    }


@router.get(
    "/revenue",
    response_model=dict,
    summary="Get revenue analytics over time"
)
async def get_revenue_analytics(
    period: str = Query("30d", description="Time period"),
    granularity: str = Query("daily", description="Grouping: daily, weekly, monthly"),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get revenue breakdown over time for charts"""
    business_id = current_user.business_id
    start_date, end_date = get_date_range(period)

    # Get all paid invoices in period
    invoices = await db.invoices.find({
        "business_id": business_id,
        "status": "paid",
        "paid_date": {"$gte": start_date, "$lte": end_date},
        "deleted_at": None
    }).to_list(length=10000)

    # Group by date
    revenue_by_date = {}
    for inv in invoices:
        paid_date = inv.get("paid_date", "")[:10]  # Get just the date part
        if paid_date:
            revenue_by_date[paid_date] = revenue_by_date.get(paid_date, 0) + inv.get("amount_paid", 0)

    # Generate complete date range
    start = datetime.strptime(start_date, "%Y-%m-%d").date()
    end = datetime.strptime(end_date, "%Y-%m-%d").date()

    data_points = []
    current = start

    if granularity == "daily":
        while current <= end:
            date_str = current.isoformat()
            data_points.append({
                "date": date_str,
                "label": current.strftime("%b %d"),
                "revenue": round(revenue_by_date.get(date_str, 0), 2)
            })
            current += timedelta(days=1)
    elif granularity == "weekly":
        # Group by week
        week_data = {}
        for date_str, amount in revenue_by_date.items():
            d = datetime.strptime(date_str, "%Y-%m-%d").date()
            week_start = d - timedelta(days=d.weekday())
            week_key = week_start.isoformat()
            week_data[week_key] = week_data.get(week_key, 0) + amount

        current = start - timedelta(days=start.weekday())
        while current <= end:
            week_key = current.isoformat()
            data_points.append({
                "date": week_key,
                "label": f"Week of {current.strftime('%b %d')}",
                "revenue": round(week_data.get(week_key, 0), 2)
            })
            current += timedelta(weeks=1)
    elif granularity == "monthly":
        # Group by month
        month_data = {}
        for date_str, amount in revenue_by_date.items():
            month_key = date_str[:7]  # YYYY-MM
            month_data[month_key] = month_data.get(month_key, 0) + amount

        current = start.replace(day=1)
        while current <= end:
            month_key = current.strftime("%Y-%m")
            data_points.append({
                "date": month_key,
                "label": current.strftime("%b %Y"),
                "revenue": round(month_data.get(month_key, 0), 2)
            })
            # Move to next month
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1)
            else:
                current = current.replace(month=current.month + 1)

    total_revenue = sum(inv.get("amount_paid", 0) for inv in invoices)
    avg_revenue = total_revenue / len(data_points) if data_points else 0

    return {
        "success": True,
        "data": {
            "period": {"start": start_date, "end": end_date},
            "granularity": granularity,
            "total": round(total_revenue, 2),
            "average": round(avg_revenue, 2),
            "data_points": data_points
        }
    }


@router.get(
    "/clients",
    response_model=dict,
    summary="Get top clients analytics"
)
async def get_clients_analytics(
    period: str = Query("90d", description="Time period"),
    limit: int = Query(10, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get top clients by revenue"""
    business_id = current_user.business_id
    start_date, end_date = get_date_range(period)

    # Get completed appointments in period
    appointments = await db.appointments.find({
        "business_id": business_id,
        "scheduled_date": {"$gte": start_date, "$lte": end_date},
        "status": "completed",
        "deleted_at": None
    }).to_list(length=10000)

    # Aggregate by client
    client_stats = {}
    for apt in appointments:
        client_id = apt.get("client_id")
        if client_id:
            if client_id not in client_stats:
                client_stats[client_id] = {
                    "client_id": client_id,
                    "appointment_count": 0,
                    "revenue": 0
                }
            client_stats[client_id]["appointment_count"] += 1
            client_stats[client_id]["revenue"] += apt.get("total_price", 0)

    # Sort by revenue and get top N
    top_clients = sorted(
        client_stats.values(),
        key=lambda x: x["revenue"],
        reverse=True
    )[:limit]

    # Get client details
    client_ids = [c["client_id"] for c in top_clients]
    clients = await db.clients.find({
        "client_id": {"$in": client_ids}
    }).to_list(length=limit)

    client_map = {c["client_id"]: c for c in clients}

    result = []
    for i, stats in enumerate(top_clients):
        client = client_map.get(stats["client_id"], {})
        result.append({
            "rank": i + 1,
            "client_id": stats["client_id"],
            "name": f"{client.get('first_name', '')} {client.get('last_name', '')}".strip() or "Unknown",
            "email": client.get("email", ""),
            "appointment_count": stats["appointment_count"],
            "revenue": round(stats["revenue"], 2),
            "lifetime_value": round(client.get("lifetime_value", 0), 2),
            "status": client.get("status", "unknown")
        })

    return {
        "success": True,
        "data": {
            "period": {"start": start_date, "end": end_date},
            "top_clients": result,
            "total_clients": len(client_stats)
        }
    }


@router.get(
    "/services",
    response_model=dict,
    summary="Get service performance analytics"
)
async def get_services_analytics(
    period: str = Query("30d", description="Time period"),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get service performance breakdown"""
    business_id = current_user.business_id
    start_date, end_date = get_date_range(period)

    # Get completed appointments in period
    appointments = await db.appointments.find({
        "business_id": business_id,
        "scheduled_date": {"$gte": start_date, "$lte": end_date},
        "status": "completed",
        "deleted_at": None
    }).to_list(length=10000)

    # Aggregate by service
    service_stats = {}
    for apt in appointments:
        for service in apt.get("services", []):
            service_id = service.get("service_id")
            service_name = service.get("service_name", "Unknown")

            if service_id not in service_stats:
                service_stats[service_id] = {
                    "service_id": service_id,
                    "name": service_name,
                    "bookings": 0,
                    "revenue": 0,
                    "total_duration": 0
                }

            service_stats[service_id]["bookings"] += service.get("quantity", 1)
            service_stats[service_id]["revenue"] += service.get("total_price", 0)
            service_stats[service_id]["total_duration"] += service.get("duration_minutes", 0)

    # Calculate totals
    total_revenue = sum(s["revenue"] for s in service_stats.values())
    total_bookings = sum(s["bookings"] for s in service_stats.values())

    # Sort by revenue
    services = sorted(
        service_stats.values(),
        key=lambda x: x["revenue"],
        reverse=True
    )

    # Add percentages
    result = []
    for s in services:
        result.append({
            "service_id": s["service_id"],
            "name": s["name"],
            "bookings": s["bookings"],
            "revenue": round(s["revenue"], 2),
            "revenue_percent": round((s["revenue"] / total_revenue * 100) if total_revenue > 0 else 0, 1),
            "avg_duration": round(s["total_duration"] / s["bookings"]) if s["bookings"] > 0 else 0,
            "avg_price": round(s["revenue"] / s["bookings"], 2) if s["bookings"] > 0 else 0
        })

    return {
        "success": True,
        "data": {
            "period": {"start": start_date, "end": end_date},
            "total_revenue": round(total_revenue, 2),
            "total_bookings": total_bookings,
            "services": result
        }
    }


@router.get(
    "/staff",
    response_model=dict,
    summary="Get staff utilization analytics"
)
async def get_staff_analytics(
    period: str = Query("30d", description="Time period"),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get staff utilization metrics"""
    business_id = current_user.business_id
    start_date, end_date = get_date_range(period)

    # Get all appointments in period
    appointments = await db.appointments.find({
        "business_id": business_id,
        "scheduled_date": {"$gte": start_date, "$lte": end_date},
        "deleted_at": None
    }).to_list(length=10000)

    # Get all staff
    all_staff = await db.staff.find({
        "business_id": business_id,
        "is_active": True,
        "deleted_at": None
    }).to_list(length=100)

    staff_map = {s["staff_id"]: s for s in all_staff}

    # Aggregate by staff member
    staff_stats = {s["staff_id"]: {
        "staff_id": s["staff_id"],
        "name": f"{s.get('first_name', '')} {s.get('last_name', '')}".strip(),
        "role": s.get("role", "technician"),
        "total": 0,
        "completed": 0,
        "canceled": 0,
        "no_shows": 0,
        "revenue": 0,
        "hours_worked": 0
    } for s in all_staff}

    for apt in appointments:
        for staff_id in apt.get("staff_ids", []):
            if staff_id in staff_stats:
                staff_stats[staff_id]["total"] += 1
                status = apt.get("status")

                if status == "completed":
                    staff_stats[staff_id]["completed"] += 1
                    staff_stats[staff_id]["revenue"] += apt.get("total_price", 0) / max(len(apt.get("staff_ids", [])), 1)
                    staff_stats[staff_id]["hours_worked"] += apt.get("actual_duration_minutes", apt.get("duration_minutes", 60)) / 60
                elif status == "canceled":
                    staff_stats[staff_id]["canceled"] += 1
                elif status == "no_show":
                    staff_stats[staff_id]["no_shows"] += 1

    # Calculate rates and sort
    result = []
    for stats in staff_stats.values():
        completion_rate = (stats["completed"] / stats["total"] * 100) if stats["total"] > 0 else 0
        result.append({
            "staff_id": stats["staff_id"],
            "name": stats["name"],
            "role": stats["role"],
            "total_appointments": stats["total"],
            "completed": stats["completed"],
            "canceled": stats["canceled"],
            "no_shows": stats["no_shows"],
            "completion_rate": round(completion_rate, 1),
            "revenue_generated": round(stats["revenue"], 2),
            "hours_worked": round(stats["hours_worked"], 1)
        })

    # Sort by completed appointments
    result.sort(key=lambda x: x["completed"], reverse=True)

    # Calculate team totals
    team_total = sum(s["total_appointments"] for s in result)
    team_completed = sum(s["completed"] for s in result)
    team_revenue = sum(s["revenue_generated"] for s in result)

    return {
        "success": True,
        "data": {
            "period": {"start": start_date, "end": end_date},
            "team_summary": {
                "total_staff": len(result),
                "total_appointments": team_total,
                "total_completed": team_completed,
                "total_revenue": round(team_revenue, 2),
                "avg_completion_rate": round((team_completed / team_total * 100) if team_total > 0 else 0, 1)
            },
            "staff": result
        }
    }


@router.get(
    "/invoices/aging",
    response_model=dict,
    summary="Get invoice aging report"
)
async def get_invoice_aging(
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get outstanding invoices grouped by age buckets"""
    business_id = current_user.business_id
    today = date.today()

    # Get outstanding invoices
    invoices = await db.invoices.find({
        "business_id": business_id,
        "status": {"$in": ["sent", "overdue"]},
        "deleted_at": None
    }).to_list(length=1000)

    # Age buckets
    buckets = {
        "current": {"count": 0, "total": 0, "invoices": []},  # 0-30 days
        "30_days": {"count": 0, "total": 0, "invoices": []},  # 31-60 days
        "60_days": {"count": 0, "total": 0, "invoices": []},  # 61-90 days
        "90_plus": {"count": 0, "total": 0, "invoices": []}   # 90+ days
    }

    for inv in invoices:
        due_date_str = inv.get("due_date", "")
        if not due_date_str:
            continue

        try:
            due_date = datetime.fromisoformat(due_date_str.replace("Z", "+00:00")).date() if "T" in due_date_str else datetime.strptime(due_date_str[:10], "%Y-%m-%d").date()
        except:
            continue

        days_overdue = (today - due_date).days
        amount_due = inv.get("amount_due", 0)

        invoice_summary = {
            "invoice_id": inv["invoice_id"],
            "invoice_number": inv.get("invoice_number", ""),
            "client_id": inv.get("client_id", ""),
            "amount_due": round(amount_due, 2),
            "due_date": due_date_str,
            "days_overdue": max(0, days_overdue)
        }

        if days_overdue <= 30:
            buckets["current"]["count"] += 1
            buckets["current"]["total"] += amount_due
            buckets["current"]["invoices"].append(invoice_summary)
        elif days_overdue <= 60:
            buckets["30_days"]["count"] += 1
            buckets["30_days"]["total"] += amount_due
            buckets["30_days"]["invoices"].append(invoice_summary)
        elif days_overdue <= 90:
            buckets["60_days"]["count"] += 1
            buckets["60_days"]["total"] += amount_due
            buckets["60_days"]["invoices"].append(invoice_summary)
        else:
            buckets["90_plus"]["count"] += 1
            buckets["90_plus"]["total"] += amount_due
            buckets["90_plus"]["invoices"].append(invoice_summary)

    # Round totals
    for bucket in buckets.values():
        bucket["total"] = round(bucket["total"], 2)
        # Limit invoices returned
        bucket["invoices"] = bucket["invoices"][:10]

    total_outstanding = sum(b["total"] for b in buckets.values())

    return {
        "success": True,
        "data": {
            "total_outstanding": round(total_outstanding, 2),
            "total_invoices": sum(b["count"] for b in buckets.values()),
            "buckets": buckets
        }
    }
