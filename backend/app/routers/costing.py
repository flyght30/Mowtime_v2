"""
Job Costing Router
For tracking and analyzing job costs vs estimates
"""

import logging
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from app.database import get_database
from app.models.user import User
from app.middleware.auth import BusinessContext, get_business_context, get_current_user
from app.schemas.common import SingleResponse, MessageResponse
from app.services.costing_service import (
    get_costing_service, JobCostingResult, CostingSummary, PartUsed
)

router = APIRouter()
logger = logging.getLogger(__name__)


class RecordActualCosts(BaseModel):
    """Request to record actual costs"""
    labor_hours: Optional[float] = None
    parts_used: Optional[List[dict]] = None  # [{"item_id": "...", "quantity": 2}]


@router.get(
    "/job/{job_id}",
    response_model=SingleResponse[JobCostingResult],
    summary="Get job costing analysis"
)
async def get_job_costing(
    job_id: str,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Get complete costing analysis for a job.

    Includes:
    - Estimated costs from quote
    - Actual costs from tracking
    - Variance analysis
    - Profit margin calculations
    - Parts used listing
    """
    service = get_costing_service(db)
    result = await service.calculate_job_costing(job_id, ctx.business_id)

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "JOB_NOT_FOUND", "message": "Job not found"}
        )

    return SingleResponse(data=result)


@router.post(
    "/job/{job_id}/actual",
    response_model=SingleResponse[JobCostingResult],
    summary="Record actual costs"
)
async def record_actual_costs(
    job_id: str,
    request: RecordActualCosts,
    ctx: BusinessContext = Depends(get_business_context),
    current_user: User = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Record actual costs for a job.

    Can record:
    - Labor hours worked
    - Parts used from inventory (will deduct from stock)
    """
    service = get_costing_service(db)

    try:
        result = await service.record_actual_costs(
            job_id=job_id,
            business_id=ctx.business_id,
            labor_hours=request.labor_hours,
            parts_used=request.parts_used,
            user_id=current_user.user_id
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "JOB_NOT_FOUND", "message": str(e)}
        )

    return SingleResponse(data=result)


@router.get(
    "/summary",
    response_model=SingleResponse[CostingSummary],
    summary="Get costing summary"
)
async def get_costing_summary(
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Get costing summary statistics.

    Shows:
    - Average variance percentage
    - Total estimated vs actual costs
    - Jobs over/under budget
    - Average profit margins
    """
    service = get_costing_service(db)
    result = await service.get_costing_summary(
        business_id=ctx.business_id,
        start_date=start_date,
        end_date=end_date
    )

    return SingleResponse(data=result)


@router.get(
    "/variance-report",
    summary="Get variance report"
)
async def get_variance_report(
    limit: int = Query(20, ge=1, le=100),
    over_budget_only: bool = False,
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Get jobs with highest variance from estimates.

    Useful for identifying estimation problems.
    """
    service = get_costing_service(db)

    # Get completed jobs
    query = {
        "business_id": ctx.business_id,
        "status": {"$in": ["completed", "invoiced", "paid"]}
    }

    jobs = await db.hvac_quotes.find(query).sort(
        "completed_at", -1
    ).limit(100).to_list(length=100)

    results = []
    for job in jobs:
        costing = await service.calculate_job_costing(job["quote_id"], ctx.business_id)
        if costing:
            if over_budget_only and costing.variance.total <= 0:
                continue

            results.append({
                "job_id": job["quote_id"],
                "quote_number": job.get("quote_number"),
                "customer_name": job.get("customer", {}).get("name"),
                "completed_at": job.get("completed_at"),
                "estimated_total": costing.estimated.total,
                "actual_total": costing.actual.total,
                "variance": costing.variance.total,
                "variance_percentage": costing.variance_percentage,
                "estimated_margin": costing.estimated_margin,
                "actual_margin": costing.actual_margin
            })

    # Sort by variance (descending)
    results.sort(key=lambda x: abs(x["variance"]), reverse=True)

    return {
        "jobs": results[:limit],
        "total_jobs_analyzed": len(results)
    }


@router.get(
    "/profitability-report",
    summary="Get profitability report"
)
async def get_profitability_report(
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    group_by: str = Query("month", regex="^(week|month|quarter)$"),
    ctx: BusinessContext = Depends(get_business_context),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Get profitability report over time.

    Groups jobs by time period and shows:
    - Total revenue
    - Total costs
    - Profit and margin
    """
    query = {
        "business_id": ctx.business_id,
        "status": {"$in": ["completed", "invoiced", "paid"]}
    }

    if start_date:
        query["completed_at"] = {"$gte": start_date}
    if end_date:
        if "completed_at" in query:
            query["completed_at"]["$lte"] = end_date
        else:
            query["completed_at"] = {"$lte": end_date}

    # Group format based on period
    if group_by == "week":
        date_format = "%Y-W%V"
    elif group_by == "quarter":
        date_format = "%Y-Q"  # We'll handle quarter specially
    else:
        date_format = "%Y-%m"

    jobs = await db.hvac_quotes.find(query).to_list(length=500)

    service = get_costing_service(db)
    periods = {}

    for job in jobs:
        costing = await service.calculate_job_costing(job["quote_id"], ctx.business_id)
        if not costing:
            continue

        completed_at = job.get("completed_at", datetime.utcnow())

        if group_by == "quarter":
            quarter = (completed_at.month - 1) // 3 + 1
            period_key = f"{completed_at.year}-Q{quarter}"
        else:
            period_key = completed_at.strftime(date_format)

        if period_key not in periods:
            periods[period_key] = {
                "period": period_key,
                "job_count": 0,
                "revenue": 0,
                "estimated_cost": 0,
                "actual_cost": 0,
                "estimated_profit": 0,
                "actual_profit": 0
            }

        periods[period_key]["job_count"] += 1
        periods[period_key]["revenue"] += costing.customer_price
        periods[period_key]["estimated_cost"] += costing.estimated.total
        periods[period_key]["actual_cost"] += costing.actual.total
        periods[period_key]["estimated_profit"] += costing.estimated_profit
        periods[period_key]["actual_profit"] += costing.actual_profit

    # Calculate margins and round values
    result_periods = []
    for period_data in sorted(periods.values(), key=lambda x: x["period"]):
        revenue = period_data["revenue"]
        period_data["estimated_margin"] = round((period_data["estimated_profit"] / revenue * 100), 2) if revenue > 0 else 0
        period_data["actual_margin"] = round((period_data["actual_profit"] / revenue * 100), 2) if revenue > 0 else 0

        # Round monetary values
        for key in ["revenue", "estimated_cost", "actual_cost", "estimated_profit", "actual_profit"]:
            period_data[key] = round(period_data[key], 2)

        result_periods.append(period_data)

    # Overall totals
    totals = {
        "job_count": sum(p["job_count"] for p in result_periods),
        "revenue": round(sum(p["revenue"] for p in result_periods), 2),
        "actual_cost": round(sum(p["actual_cost"] for p in result_periods), 2),
        "actual_profit": round(sum(p["actual_profit"] for p in result_periods), 2)
    }
    totals["actual_margin"] = round((totals["actual_profit"] / totals["revenue"] * 100), 2) if totals["revenue"] > 0 else 0

    return {
        "periods": result_periods,
        "totals": totals
    }
