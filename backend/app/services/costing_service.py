"""
Job Costing Service
Calculate and track job costs vs estimates
"""

import logging
from datetime import datetime
from typing import Optional, List, Dict, Any
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class CostBreakdown(BaseModel):
    """Cost breakdown for a category"""
    equipment: float = 0
    materials: float = 0
    labor_hours: float = 0
    labor_cost: float = 0
    total: float = 0


class PartUsed(BaseModel):
    """Part used on a job"""
    item_id: str
    name: str
    part_number: Optional[str] = None
    quantity: float
    unit_cost: float
    total_cost: float
    from_inventory: bool = True


class JobCostingResult(BaseModel):
    """Complete job costing analysis"""
    job_id: str
    estimated: CostBreakdown
    actual: CostBreakdown
    variance: CostBreakdown
    variance_percentage: float
    parts_used: List[PartUsed]
    customer_price: float
    estimated_profit: float
    actual_profit: float
    estimated_margin: float
    actual_margin: float


class CostingSummary(BaseModel):
    """Summary statistics for job costing"""
    total_jobs: int
    avg_variance_percentage: float
    total_estimated_cost: float
    total_actual_cost: float
    total_variance: float
    jobs_over_budget: int
    jobs_under_budget: int
    avg_estimated_margin: float
    avg_actual_margin: float


class CostingService:
    """Service for job costing calculations"""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def calculate_job_costing(self, job_id: str, business_id: str) -> Optional[JobCostingResult]:
        """Calculate complete job costing"""
        job = await self.db.hvac_quotes.find_one({
            "quote_id": job_id,
            "business_id": business_id
        })

        if not job:
            return None

        # Get estimated costs from quote
        estimated = await self._get_estimated_costs(job)

        # Get actual costs from job tracking
        actual = await self._get_actual_costs(job_id, business_id, job)

        # Calculate variance
        variance = CostBreakdown(
            equipment=actual.equipment - estimated.equipment,
            materials=actual.materials - estimated.materials,
            labor_hours=actual.labor_hours - estimated.labor_hours,
            labor_cost=actual.labor_cost - estimated.labor_cost,
            total=actual.total - estimated.total
        )

        variance_pct = 0
        if estimated.total > 0:
            variance_pct = round((variance.total / estimated.total) * 100, 2)

        # Get parts used
        parts_used = await self._get_parts_used(job_id, business_id)

        # Customer price from quote
        customer_price = job.get("grand_total", 0)

        # Profit calculations
        estimated_profit = customer_price - estimated.total
        actual_profit = customer_price - actual.total

        estimated_margin = 0
        actual_margin = 0
        if customer_price > 0:
            estimated_margin = round((estimated_profit / customer_price) * 100, 2)
            actual_margin = round((actual_profit / customer_price) * 100, 2)

        return JobCostingResult(
            job_id=job_id,
            estimated=estimated,
            actual=actual,
            variance=variance,
            variance_percentage=variance_pct,
            parts_used=parts_used,
            customer_price=customer_price,
            estimated_profit=round(estimated_profit, 2),
            actual_profit=round(actual_profit, 2),
            estimated_margin=estimated_margin,
            actual_margin=actual_margin
        )

    async def _get_estimated_costs(self, job: dict) -> CostBreakdown:
        """Extract estimated costs from quote"""
        equipment_cost = 0
        materials_cost = 0

        # Equipment from quote
        equipment = job.get("equipment", [])
        for eq in equipment:
            equipment_cost += eq.get("cost", 0)

        # Materials from quote
        materials = job.get("materials", [])
        for mat in materials:
            materials_cost += mat.get("cost", 0)

        # Labor from quote
        labor = job.get("labor", {})
        labor_hours = labor.get("hours", 0)
        labor_rate = labor.get("rate", 65)  # Default $65/hr
        labor_cost = labor_hours * labor_rate

        total = equipment_cost + materials_cost + labor_cost

        return CostBreakdown(
            equipment=round(equipment_cost, 2),
            materials=round(materials_cost, 2),
            labor_hours=labor_hours,
            labor_cost=round(labor_cost, 2),
            total=round(total, 2)
        )

    async def _get_actual_costs(self, job_id: str, business_id: str, job: dict) -> CostBreakdown:
        """Calculate actual costs from job tracking"""
        # Get actual labor from time entries
        time_entries = await self.db.time_entries.find({
            "job_id": job_id,
            "business_id": business_id
        }).to_list(length=100)

        labor_hours = sum(
            (entry.get("duration_minutes", 0) / 60)
            for entry in time_entries
        )

        # Get labor rate from job or default
        labor_rate = job.get("labor", {}).get("rate", 65)
        labor_cost = labor_hours * labor_rate

        # Get parts used from inventory transactions
        parts_transactions = await self.db.inventory_transactions.find({
            "job_id": job_id,
            "business_id": business_id,
            "transaction_type": "usage"
        }).to_list(length=100)

        materials_cost = 0
        for trans in parts_transactions:
            qty = abs(trans.get("quantity", 0))
            unit_cost = trans.get("unit_cost", 0)
            materials_cost += qty * unit_cost

        # Equipment cost from POs linked to job
        equipment_cost = 0
        pos = await self.db.purchase_orders.find({
            "job_id": job_id,
            "business_id": business_id,
            "status": {"$in": ["sent", "partial", "received"]}
        }).to_list(length=10)

        for po in pos:
            for item in po.get("items", []):
                # Check if equipment category
                if "equipment" in item.get("description", "").lower():
                    qty = item.get("quantity_received", 0) or item.get("quantity_ordered", 0)
                    equipment_cost += qty * item.get("unit_cost", 0)

        # If no actual tracking, use estimated
        if labor_hours == 0 and materials_cost == 0 and equipment_cost == 0:
            return await self._get_estimated_costs(job)

        # Use estimated equipment if no PO equipment
        if equipment_cost == 0:
            estimated = await self._get_estimated_costs(job)
            equipment_cost = estimated.equipment

        total = equipment_cost + materials_cost + labor_cost

        return CostBreakdown(
            equipment=round(equipment_cost, 2),
            materials=round(materials_cost, 2),
            labor_hours=round(labor_hours, 2),
            labor_cost=round(labor_cost, 2),
            total=round(total, 2)
        )

    async def _get_parts_used(self, job_id: str, business_id: str) -> List[PartUsed]:
        """Get list of parts used on a job"""
        transactions = await self.db.inventory_transactions.find({
            "job_id": job_id,
            "business_id": business_id,
            "transaction_type": "usage"
        }).to_list(length=100)

        parts = []
        for trans in transactions:
            item = await self.db.inventory.find_one({"item_id": trans["item_id"]})
            if item:
                qty = abs(trans.get("quantity", 0))
                unit_cost = trans.get("unit_cost", 0) or item.get("cost_per_unit", 0)

                parts.append(PartUsed(
                    item_id=trans["item_id"],
                    name=item.get("name", "Unknown"),
                    part_number=item.get("part_number"),
                    quantity=qty,
                    unit_cost=unit_cost,
                    total_cost=round(qty * unit_cost, 2),
                    from_inventory=True
                ))

        return parts

    async def record_actual_costs(
        self,
        job_id: str,
        business_id: str,
        labor_hours: Optional[float] = None,
        parts_used: Optional[List[Dict[str, Any]]] = None,
        user_id: str = None
    ) -> JobCostingResult:
        """Record actual costs for a job"""
        from app.routers.inventory import record_transaction
        from app.models.inventory import TransactionType

        job = await self.db.hvac_quotes.find_one({
            "quote_id": job_id,
            "business_id": business_id
        })

        if not job:
            raise ValueError(f"Job not found: {job_id}")

        # Record labor if provided
        if labor_hours is not None and labor_hours > 0:
            await self.db.time_entries.insert_one({
                "time_entry_id": f"te_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
                "business_id": business_id,
                "job_id": job_id,
                "user_id": user_id,
                "duration_minutes": labor_hours * 60,
                "entry_type": "job_costing",
                "created_at": datetime.utcnow()
            })

        # Record parts usage
        if parts_used:
            for part in parts_used:
                item_id = part.get("item_id")
                quantity = part.get("quantity", 0)

                if not item_id or quantity <= 0:
                    continue

                item = await self.db.inventory.find_one({
                    "item_id": item_id,
                    "business_id": business_id
                })

                if not item:
                    continue

                qty_before = item.get("quantity_on_hand", 0)
                qty_after = qty_before - quantity

                if qty_after < 0:
                    logger.warning(f"Insufficient stock for {item['name']}, recording anyway")
                    qty_after = 0

                # Update inventory
                await self.db.inventory.update_one(
                    {"item_id": item_id},
                    {"$set": {
                        "quantity_on_hand": qty_after,
                        "quantity_available": qty_after - item.get("quantity_reserved", 0),
                        "updated_at": datetime.utcnow()
                    }}
                )

                # Record transaction
                await record_transaction(
                    db=self.db,
                    business_id=business_id,
                    item_id=item_id,
                    transaction_type=TransactionType.USAGE,
                    quantity=-quantity,
                    user_id=user_id,
                    quantity_before=qty_before,
                    quantity_after=qty_after,
                    unit_cost=item.get("cost_per_unit", 0),
                    job_id=job_id,
                    notes=f"Used on job {job.get('quote_number', job_id)}"
                )

        # Return updated costing
        return await self.calculate_job_costing(job_id, business_id)

    async def get_costing_summary(
        self,
        business_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> CostingSummary:
        """Get costing summary statistics"""
        query = {
            "business_id": business_id,
            "status": {"$in": ["completed", "invoiced", "paid"]}
        }

        if start_date:
            query["completed_at"] = {"$gte": start_date}
        if end_date:
            if "completed_at" in query:
                query["completed_at"]["$lte"] = end_date
            else:
                query["completed_at"] = {"$lte": end_date}

        jobs = await self.db.hvac_quotes.find(query).to_list(length=500)

        if not jobs:
            return CostingSummary(
                total_jobs=0,
                avg_variance_percentage=0,
                total_estimated_cost=0,
                total_actual_cost=0,
                total_variance=0,
                jobs_over_budget=0,
                jobs_under_budget=0,
                avg_estimated_margin=0,
                avg_actual_margin=0
            )

        total_estimated = 0
        total_actual = 0
        variances = []
        margins_estimated = []
        margins_actual = []
        over_budget = 0
        under_budget = 0

        for job in jobs:
            costing = await self.calculate_job_costing(job["quote_id"], business_id)
            if costing:
                total_estimated += costing.estimated.total
                total_actual += costing.actual.total
                variances.append(costing.variance_percentage)
                margins_estimated.append(costing.estimated_margin)
                margins_actual.append(costing.actual_margin)

                if costing.variance.total > 0:
                    over_budget += 1
                elif costing.variance.total < 0:
                    under_budget += 1

        return CostingSummary(
            total_jobs=len(jobs),
            avg_variance_percentage=round(sum(variances) / len(variances), 2) if variances else 0,
            total_estimated_cost=round(total_estimated, 2),
            total_actual_cost=round(total_actual, 2),
            total_variance=round(total_actual - total_estimated, 2),
            jobs_over_budget=over_budget,
            jobs_under_budget=under_budget,
            avg_estimated_margin=round(sum(margins_estimated) / len(margins_estimated), 2) if margins_estimated else 0,
            avg_actual_margin=round(sum(margins_actual) / len(margins_actual), 2) if margins_actual else 0
        )


# Singleton
_costing_service: Optional[CostingService] = None


def get_costing_service(db: AsyncIOMotorDatabase = None) -> CostingService:
    """Get costing service singleton"""
    global _costing_service
    if _costing_service is None or db is not None:
        from app.database import Database
        _costing_service = CostingService(db or Database.get_database())
    return _costing_service
