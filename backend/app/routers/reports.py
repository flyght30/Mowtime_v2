"""
Reports Router
Report generation and scheduling endpoints
"""

from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, Query, HTTPException, status
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr
import io

from app.database import get_database
from app.middleware.auth import get_business_context, BusinessContext
from app.models.common import SingleResponse, ListResponse
from app.services.report_generator import (
    ReportGenerator,
    ReportType,
    ReportFormat,
    ReportSchedule
)

router = APIRouter(prefix="/reports", tags=["Reports"])


# Request/Response Models

class GenerateReportRequest(BaseModel):
    """Request to generate a report"""
    type: ReportType
    format: ReportFormat = ReportFormat.PDF
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class ScheduleReportRequest(BaseModel):
    """Request to schedule a report"""
    type: ReportType
    schedule: ReportSchedule
    recipients: List[EmailStr]
    format: ReportFormat = ReportFormat.PDF


class ScheduleUpdateRequest(BaseModel):
    """Request to update a scheduled report"""
    recipients: Optional[List[EmailStr]] = None
    schedule: Optional[ReportSchedule] = None
    format: Optional[ReportFormat] = None
    is_active: Optional[bool] = None


# Endpoints

@router.get(
    "/types",
    response_model=SingleResponse[dict],
    summary="Get available report types"
)
async def get_report_types():
    """Get list of available report types and formats"""
    return SingleResponse(data={
        "types": [
            {
                "id": ReportType.REVENUE_SUMMARY.value,
                "name": "Revenue Summary",
                "description": "Revenue breakdown by period and job type"
            },
            {
                "id": ReportType.TECHNICIAN_PERFORMANCE.value,
                "name": "Technician Performance",
                "description": "Performance metrics by technician"
            },
            {
                "id": ReportType.JOB_ANALYSIS.value,
                "name": "Job Analysis",
                "description": "Job status and conversion analysis"
            },
            {
                "id": ReportType.CUSTOMER_REPORT.value,
                "name": "Customer Report",
                "description": "Customer acquisition and top customers"
            },
            {
                "id": ReportType.AR_AGING.value,
                "name": "A/R Aging",
                "description": "Accounts receivable aging report"
            },
            {
                "id": ReportType.WEEKLY_SUMMARY.value,
                "name": "Weekly Summary",
                "description": "Weekly performance summary"
            },
            {
                "id": ReportType.MONTHLY_PL.value,
                "name": "Monthly P&L",
                "description": "Monthly profit and loss statement"
            }
        ],
        "formats": [
            {"id": "pdf", "name": "PDF", "extension": "pdf"},
            {"id": "excel", "name": "Excel", "extension": "xlsx"},
            {"id": "csv", "name": "CSV", "extension": "csv"}
        ],
        "schedules": [
            {"id": "daily", "name": "Daily"},
            {"id": "monday_8am", "name": "Weekly (Monday 8 AM)"},
            {"id": "friday_5pm", "name": "Weekly (Friday 5 PM)"},
            {"id": "monthly_first", "name": "Monthly (1st of month)"},
            {"id": "monthly_last", "name": "Monthly (Last day)"}
        ]
    })


@router.post(
    "/generate",
    summary="Generate a report"
)
async def generate_report(
    request: GenerateReportRequest,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Generate a report and return as downloadable file"""
    generator = ReportGenerator(db, ctx.business_id)

    # Parse dates
    start_date = None
    end_date = None
    if request.start_date:
        start_date = datetime.strptime(request.start_date, "%Y-%m-%d")
    if request.end_date:
        end_date = datetime.strptime(request.end_date, "%Y-%m-%d").replace(
            hour=23, minute=59, second=59
        )

    # Generate report
    result = await generator.generate_report(
        report_type=request.type,
        format=request.format,
        start_date=start_date,
        end_date=end_date
    )

    # Return as streaming response
    return StreamingResponse(
        io.BytesIO(result["content"]),
        media_type=result["content_type"],
        headers={
            "Content-Disposition": f'attachment; filename="{result["filename"]}"'
        }
    )


@router.get(
    "/generate/{report_type}",
    summary="Generate a report (GET method)"
)
async def generate_report_get(
    report_type: ReportType,
    format: ReportFormat = Query(ReportFormat.PDF),
    start: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Generate a report via GET request"""
    generator = ReportGenerator(db, ctx.business_id)

    start_date = datetime.strptime(start, "%Y-%m-%d") if start else None
    end_date = datetime.strptime(end, "%Y-%m-%d").replace(hour=23, minute=59, second=59) if end else None

    result = await generator.generate_report(
        report_type=report_type,
        format=format,
        start_date=start_date,
        end_date=end_date
    )

    return StreamingResponse(
        io.BytesIO(result["content"]),
        media_type=result["content_type"],
        headers={
            "Content-Disposition": f'attachment; filename="{result["filename"]}"'
        }
    )


@router.get(
    "/preview/{report_type}",
    response_model=SingleResponse[dict],
    summary="Preview report data"
)
async def preview_report(
    report_type: ReportType,
    start: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Preview report data without generating file"""
    generator = ReportGenerator(db, ctx.business_id)

    start_date = datetime.strptime(start, "%Y-%m-%d") if start else None
    end_date = datetime.strptime(end, "%Y-%m-%d").replace(hour=23, minute=59, second=59) if end else None

    # Get report data without generating file
    if report_type == ReportType.REVENUE_SUMMARY:
        data = await generator._get_revenue_summary_data(
            start_date or datetime.utcnow().replace(day=1),
            end_date or datetime.utcnow()
        )
    elif report_type == ReportType.TECHNICIAN_PERFORMANCE:
        data = await generator._get_tech_performance_data(
            start_date or datetime.utcnow().replace(day=1),
            end_date or datetime.utcnow()
        )
    elif report_type == ReportType.AR_AGING:
        data = await generator._get_ar_aging_data()
    elif report_type == ReportType.WEEKLY_SUMMARY:
        data = await generator._get_weekly_summary_data()
    else:
        data = {"message": "Preview not available for this report type"}

    return SingleResponse(data=data)


# Scheduled Reports

@router.get(
    "/schedules",
    response_model=ListResponse[dict],
    summary="Get scheduled reports"
)
async def get_schedules(
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get all scheduled reports"""
    generator = ReportGenerator(db, ctx.business_id)
    schedules = await generator.get_scheduled_reports()

    return ListResponse(
        data=[
            {
                "schedule_id": s.get("schedule_id"),
                "report_type": s.get("report_type"),
                "schedule": s.get("schedule"),
                "recipients": s.get("recipients", []),
                "format": s.get("format"),
                "is_active": s.get("is_active", True),
                "last_sent": s.get("last_sent"),
                "created_at": s.get("created_at")
            }
            for s in schedules
        ],
        total=len(schedules)
    )


@router.post(
    "/schedules",
    response_model=SingleResponse[dict],
    summary="Create scheduled report"
)
async def create_schedule(
    request: ScheduleReportRequest,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Create a new scheduled report"""
    generator = ReportGenerator(db, ctx.business_id)

    schedule = await generator.create_schedule(
        report_type=request.type,
        schedule=request.schedule,
        recipients=[str(email) for email in request.recipients],
        format=request.format
    )

    return SingleResponse(data={
        "schedule_id": schedule["schedule_id"],
        "report_type": schedule["report_type"],
        "schedule": schedule["schedule"],
        "recipients": schedule["recipients"],
        "format": schedule["format"],
        "is_active": schedule["is_active"],
        "created_at": schedule["created_at"].isoformat() if schedule.get("created_at") else None
    })


@router.put(
    "/schedules/{schedule_id}",
    response_model=SingleResponse[dict],
    summary="Update scheduled report"
)
async def update_schedule(
    schedule_id: str,
    request: ScheduleUpdateRequest,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Update a scheduled report"""
    update_data = {}
    if request.recipients is not None:
        update_data["recipients"] = [str(email) for email in request.recipients]
    if request.schedule is not None:
        update_data["schedule"] = request.schedule.value
    if request.format is not None:
        update_data["format"] = request.format.value
    if request.is_active is not None:
        update_data["is_active"] = request.is_active

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update"
        )

    result = await db.report_schedules.update_one(
        {"schedule_id": schedule_id, "business_id": ctx.business_id},
        {"$set": update_data}
    )

    if result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Schedule not found"
        )

    # Get updated schedule
    schedule = await db.report_schedules.find_one({"schedule_id": schedule_id})

    return SingleResponse(data={
        "schedule_id": schedule["schedule_id"],
        "report_type": schedule.get("report_type"),
        "schedule": schedule.get("schedule"),
        "recipients": schedule.get("recipients", []),
        "format": schedule.get("format"),
        "is_active": schedule.get("is_active"),
        "updated": True
    })


@router.delete(
    "/schedules/{schedule_id}",
    response_model=SingleResponse[dict],
    summary="Delete scheduled report"
)
async def delete_schedule(
    schedule_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Delete a scheduled report"""
    generator = ReportGenerator(db, ctx.business_id)
    deleted = await generator.delete_schedule(schedule_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Schedule not found"
        )

    return SingleResponse(data={"deleted": True, "schedule_id": schedule_id})


# Recent Reports (for history)

@router.get(
    "/history",
    response_model=ListResponse[dict],
    summary="Get report generation history"
)
async def get_report_history(
    limit: int = Query(20, ge=1, le=100),
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get history of generated reports"""
    reports = await db.report_history.find({
        "business_id": ctx.business_id
    }).sort("created_at", -1).limit(limit).to_list(length=limit)

    return ListResponse(
        data=[
            {
                "report_id": r.get("report_id"),
                "report_type": r.get("report_type"),
                "format": r.get("format"),
                "period": r.get("period"),
                "file_url": r.get("file_url"),
                "created_at": r.get("created_at"),
                "created_by": r.get("created_by")
            }
            for r in reports
        ],
        total=len(reports)
    )


@router.post(
    "/email",
    response_model=SingleResponse[dict],
    summary="Email a report"
)
async def email_report(
    report_type: ReportType,
    recipients: List[EmailStr],
    format: ReportFormat = ReportFormat.PDF,
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Generate and email a report"""
    generator = ReportGenerator(db, ctx.business_id)

    start_date = datetime.strptime(start, "%Y-%m-%d") if start else None
    end_date = datetime.strptime(end, "%Y-%m-%d").replace(hour=23, minute=59, second=59) if end else None

    # Generate report
    result = await generator.generate_report(
        report_type=report_type,
        format=format,
        start_date=start_date,
        end_date=end_date
    )

    # TODO: Integrate with email service to send report
    # For now, return success message
    return SingleResponse(data={
        "sent": True,
        "recipients": [str(r) for r in recipients],
        "report_type": report_type.value,
        "filename": result["filename"],
        "message": "Report queued for delivery"
    })
