"""
Analytics Service
Aggregation queries for dashboards and reports
"""

import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId

logger = logging.getLogger(__name__)


class AnalyticsService:
    """Service for analytics and reporting aggregations"""

    def __init__(self, db: AsyncIOMotorDatabase, business_id: str):
        self.db = db
        self.business_id = business_id

    # Dashboard KPIs

    async def get_dashboard_metrics(
        self,
        period: str = "week"
    ) -> Dict[str, Any]:
        """Get dashboard overview metrics"""
        now = datetime.utcnow()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        # Calculate period boundaries
        if period == "day":
            period_start = today_start
        elif period == "week":
            period_start = today_start - timedelta(days=today_start.weekday())
        elif period == "month":
            period_start = today_start.replace(day=1)
        elif period == "quarter":
            quarter_month = ((today_start.month - 1) // 3) * 3 + 1
            period_start = today_start.replace(month=quarter_month, day=1)
        else:
            period_start = today_start - timedelta(days=7)

        # Get job counts and revenue
        jobs = await self._get_job_metrics(today_start, period_start)
        pipeline_metrics = await self._get_pipeline_metrics()
        performance = await self._get_performance_metrics(period_start)

        return {
            "jobs": jobs,
            "revenue": {
                "today": jobs.get("today_revenue", 0),
                "period": jobs.get("period_revenue", 0),
                "month": await self._get_month_revenue()
            },
            "pipeline": pipeline_metrics,
            "performance": performance
        }

    async def _get_job_metrics(
        self,
        today_start: datetime,
        period_start: datetime
    ) -> Dict[str, Any]:
        """Get job counts and revenue for different periods"""
        pipeline = [
            {
                "$match": {
                    "business_id": self.business_id,
                    "status": {"$ne": "cancelled"}
                }
            },
            {
                "$facet": {
                    "today": [
                        {"$match": {"scheduled_date": {"$gte": today_start}}},
                        {
                            "$group": {
                                "_id": None,
                                "count": {"$sum": 1},
                                "revenue": {"$sum": "$total"}
                            }
                        }
                    ],
                    "period": [
                        {"$match": {"scheduled_date": {"$gte": period_start}}},
                        {
                            "$group": {
                                "_id": None,
                                "count": {"$sum": 1},
                                "revenue": {"$sum": "$total"}
                            }
                        }
                    ],
                    "month": [
                        {
                            "$match": {
                                "scheduled_date": {
                                    "$gte": datetime.utcnow().replace(day=1, hour=0, minute=0, second=0)
                                }
                            }
                        },
                        {
                            "$group": {
                                "_id": None,
                                "count": {"$sum": 1},
                                "revenue": {"$sum": "$total"}
                            }
                        }
                    ]
                }
            }
        ]

        result = await self.db.hvac_quotes.aggregate(pipeline).to_list(length=1)

        if not result:
            return {"today": 0, "period": 0, "month": 0}

        data = result[0]
        return {
            "today": data["today"][0]["count"] if data["today"] else 0,
            "today_revenue": data["today"][0]["revenue"] if data["today"] else 0,
            "period": data["period"][0]["count"] if data["period"] else 0,
            "period_revenue": data["period"][0]["revenue"] if data["period"] else 0,
            "month": data["month"][0]["count"] if data["month"] else 0,
            "month_revenue": data["month"][0]["revenue"] if data["month"] else 0
        }

    async def _get_pipeline_metrics(self) -> Dict[str, Any]:
        """Get pipeline value by status"""
        pipeline = [
            {
                "$match": {
                    "business_id": self.business_id,
                    "status": {"$in": ["quoted", "approved", "scheduled"]}
                }
            },
            {
                "$group": {
                    "_id": "$status",
                    "total": {"$sum": "$total"},
                    "count": {"$sum": 1}
                }
            }
        ]

        results = await self.db.hvac_quotes.aggregate(pipeline).to_list(length=10)

        metrics = {"quoted": 0, "approved": 0, "scheduled": 0, "total": 0}
        for item in results:
            status = item["_id"]
            if status in metrics:
                metrics[status] = item["total"]
                metrics["total"] += item["total"]

        return metrics

    async def _get_performance_metrics(
        self,
        since: datetime
    ) -> Dict[str, Any]:
        """Get performance metrics like on-time percentage and ratings"""
        # On-time arrival percentage
        on_time_pipeline = [
            {
                "$match": {
                    "business_id": self.business_id,
                    "scheduled_date": {"$gte": since},
                    "status": "completed",
                    "actual_arrival": {"$exists": True}
                }
            },
            {
                "$project": {
                    "on_time": {
                        "$cond": [
                            {
                                "$lte": [
                                    "$actual_arrival",
                                    {"$add": ["$scheduled_time", 15 * 60 * 1000]}
                                ]
                            },
                            1,
                            0
                        ]
                    }
                }
            },
            {
                "$group": {
                    "_id": None,
                    "total": {"$sum": 1},
                    "on_time": {"$sum": "$on_time"}
                }
            }
        ]

        on_time_result = await self.db.appointments.aggregate(on_time_pipeline).to_list(length=1)

        on_time_pct = 0
        if on_time_result and on_time_result[0]["total"] > 0:
            on_time_pct = round(
                (on_time_result[0]["on_time"] / on_time_result[0]["total"]) * 100, 1
            )

        # Average rating from follow-ups
        rating_pipeline = [
            {
                "$match": {
                    "business_id": self.business_id,
                    "created_at": {"$gte": since},
                    "rating": {"$exists": True, "$ne": None}
                }
            },
            {
                "$group": {
                    "_id": None,
                    "avg_rating": {"$avg": "$rating"},
                    "count": {"$sum": 1}
                }
            }
        ]

        rating_result = await self.db.follow_ups.aggregate(rating_pipeline).to_list(length=1)

        avg_rating = 0
        if rating_result:
            avg_rating = round(rating_result[0].get("avg_rating", 0), 1)

        return {
            "on_time": on_time_pct,
            "avg_rating": avg_rating
        }

    async def _get_month_revenue(self) -> float:
        """Get current month revenue"""
        month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0)

        pipeline = [
            {
                "$match": {
                    "business_id": self.business_id,
                    "status": "completed",
                    "completed_at": {"$gte": month_start}
                }
            },
            {
                "$group": {
                    "_id": None,
                    "total": {"$sum": "$total"}
                }
            }
        ]

        result = await self.db.hvac_quotes.aggregate(pipeline).to_list(length=1)
        return result[0]["total"] if result else 0

    # Revenue Analytics

    async def get_revenue_by_period(
        self,
        start_date: datetime,
        end_date: datetime,
        group_by: str = "day"
    ) -> Dict[str, Any]:
        """Get revenue data grouped by period"""
        # Determine date format based on grouping
        if group_by == "day":
            date_format = "%Y-%m-%d"
            date_group = {
                "year": {"$year": "$completed_at"},
                "month": {"$month": "$completed_at"},
                "day": {"$dayOfMonth": "$completed_at"}
            }
        elif group_by == "week":
            date_format = "%Y-W%V"
            date_group = {
                "year": {"$year": "$completed_at"},
                "week": {"$week": "$completed_at"}
            }
        elif group_by == "month":
            date_format = "%Y-%m"
            date_group = {
                "year": {"$year": "$completed_at"},
                "month": {"$month": "$completed_at"}
            }
        else:
            date_group = {"year": {"$year": "$completed_at"}}

        pipeline = [
            {
                "$match": {
                    "business_id": self.business_id,
                    "status": "completed",
                    "completed_at": {"$gte": start_date, "$lte": end_date}
                }
            },
            {
                "$group": {
                    "_id": date_group,
                    "revenue": {"$sum": "$total"},
                    "jobs": {"$sum": 1},
                    "avg_job_value": {"$avg": "$total"}
                }
            },
            {"$sort": {"_id": 1}}
        ]

        results = await self.db.hvac_quotes.aggregate(pipeline).to_list(length=366)

        # Format results
        data = []
        total_revenue = 0
        total_jobs = 0

        for item in results:
            _id = item["_id"]
            if group_by == "day":
                date_str = f"{_id['year']}-{_id['month']:02d}-{_id['day']:02d}"
            elif group_by == "week":
                date_str = f"{_id['year']}-W{_id['week']:02d}"
            elif group_by == "month":
                date_str = f"{_id['year']}-{_id['month']:02d}"
            else:
                date_str = str(_id.get("year", ""))

            data.append({
                "date": date_str,
                "revenue": round(item["revenue"], 2),
                "jobs": item["jobs"],
                "avg_job_value": round(item.get("avg_job_value", 0), 2)
            })
            total_revenue += item["revenue"]
            total_jobs += item["jobs"]

        return {
            "data": data,
            "total": round(total_revenue, 2),
            "job_count": total_jobs,
            "period": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
                "group_by": group_by
            }
        }

    async def get_revenue_by_job_type(
        self,
        start_date: datetime,
        end_date: datetime
    ) -> Dict[str, Any]:
        """Get revenue breakdown by job type"""
        pipeline = [
            {
                "$match": {
                    "business_id": self.business_id,
                    "status": "completed",
                    "completed_at": {"$gte": start_date, "$lte": end_date}
                }
            },
            {
                "$group": {
                    "_id": "$job_type",
                    "count": {"$sum": 1},
                    "revenue": {"$sum": "$total"},
                    "avg_value": {"$avg": "$total"},
                    "total_cost": {"$sum": "$cost"},
                }
            },
            {"$sort": {"revenue": -1}}
        ]

        results = await self.db.hvac_quotes.aggregate(pipeline).to_list(length=50)

        data = {}
        for item in results:
            job_type = item["_id"] or "other"
            revenue = item["revenue"]
            cost = item.get("total_cost", 0)
            margin = ((revenue - cost) / revenue * 100) if revenue > 0 else 0

            data[job_type] = {
                "count": item["count"],
                "revenue": round(revenue, 2),
                "avg_value": round(item["avg_value"], 2),
                "avg_margin": round(margin, 1)
            }

        return data

    # Technician Analytics

    async def get_technician_performance(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[Dict[str, Any]]:
        """Get performance metrics by technician"""
        if not start_date:
            start_date = datetime.utcnow() - timedelta(days=30)
        if not end_date:
            end_date = datetime.utcnow()

        pipeline = [
            {
                "$match": {
                    "business_id": self.business_id,
                    "status": "completed",
                    "completed_at": {"$gte": start_date, "$lte": end_date},
                    "assigned_tech_id": {"$exists": True, "$ne": None}
                }
            },
            {
                "$group": {
                    "_id": "$assigned_tech_id",
                    "jobs_completed": {"$sum": 1},
                    "revenue": {"$sum": "$total"},
                    "total_estimated_hours": {"$sum": "$estimated_hours"},
                    "total_actual_hours": {"$sum": "$actual_hours"}
                }
            }
        ]

        job_results = await self.db.hvac_quotes.aggregate(pipeline).to_list(length=100)

        # Get tech details
        tech_ids = [item["_id"] for item in job_results]
        techs = await self.db.staff.find({
            "staff_id": {"$in": tech_ids}
        }).to_list(length=100)

        tech_map = {t["staff_id"]: t for t in techs}

        # Get ratings per tech
        rating_pipeline = [
            {
                "$match": {
                    "business_id": self.business_id,
                    "created_at": {"$gte": start_date, "$lte": end_date},
                    "tech_id": {"$in": tech_ids},
                    "rating": {"$exists": True}
                }
            },
            {
                "$group": {
                    "_id": "$tech_id",
                    "avg_rating": {"$avg": "$rating"},
                    "rating_count": {"$sum": 1}
                }
            }
        ]

        rating_results = await self.db.follow_ups.aggregate(rating_pipeline).to_list(length=100)
        rating_map = {r["_id"]: r for r in rating_results}

        # Get on-time metrics
        on_time_pipeline = [
            {
                "$match": {
                    "business_id": self.business_id,
                    "scheduled_date": {"$gte": start_date, "$lte": end_date},
                    "tech_id": {"$in": tech_ids},
                    "status": "completed"
                }
            },
            {
                "$project": {
                    "tech_id": 1,
                    "on_time": {
                        "$cond": [
                            {"$lte": ["$actual_arrival", {"$add": ["$scheduled_time", 15 * 60 * 1000]}]},
                            1,
                            0
                        ]
                    }
                }
            },
            {
                "$group": {
                    "_id": "$tech_id",
                    "total": {"$sum": 1},
                    "on_time": {"$sum": "$on_time"}
                }
            }
        ]

        on_time_results = await self.db.appointments.aggregate(on_time_pipeline).to_list(length=100)
        on_time_map = {r["_id"]: r for r in on_time_results}

        # Combine results
        technicians = []
        for item in job_results:
            tech_id = item["_id"]
            tech = tech_map.get(tech_id, {})
            rating_data = rating_map.get(tech_id, {})
            on_time_data = on_time_map.get(tech_id, {})

            # Calculate efficiency
            estimated = item.get("total_estimated_hours", 0)
            actual = item.get("total_actual_hours", 0)
            efficiency = (estimated / actual) if actual > 0 else 1.0

            # Calculate on-time percentage
            on_time_total = on_time_data.get("total", 0)
            on_time_count = on_time_data.get("on_time", 0)
            on_time_pct = (on_time_count / on_time_total * 100) if on_time_total > 0 else 0

            technicians.append({
                "tech_id": tech_id,
                "name": f"{tech.get('first_name', '')} {tech.get('last_name', '')}".strip() or "Unknown",
                "jobs_completed": item["jobs_completed"],
                "revenue": round(item["revenue"], 2),
                "on_time_pct": round(on_time_pct, 1),
                "avg_rating": round(rating_data.get("avg_rating", 0), 1),
                "efficiency": round(efficiency, 2)
            })

        # Sort by revenue
        technicians.sort(key=lambda x: x["revenue"], reverse=True)

        return technicians

    # Forecasting

    async def get_cash_flow_forecast(
        self,
        days: int = 90
    ) -> Dict[str, Any]:
        """Generate cash flow forecast based on historical data"""
        now = datetime.utcnow()

        # Get historical daily revenue (last 90 days)
        history_start = now - timedelta(days=90)
        historical = await self.get_revenue_by_period(
            history_start, now, group_by="day"
        )

        # Calculate averages
        daily_revenues = [d["revenue"] for d in historical["data"]]
        avg_daily = sum(daily_revenues) / len(daily_revenues) if daily_revenues else 0

        # Calculate day-of-week patterns
        dow_totals = {i: [] for i in range(7)}
        for d in historical["data"]:
            try:
                date = datetime.strptime(d["date"], "%Y-%m-%d")
                dow_totals[date.weekday()].append(d["revenue"])
            except ValueError:
                continue

        dow_avg = {
            dow: (sum(vals) / len(vals) if vals else avg_daily)
            for dow, vals in dow_totals.items()
        }

        # Generate forecast
        forecast = []
        for i in range(days):
            forecast_date = now + timedelta(days=i + 1)
            dow = forecast_date.weekday()

            # Base prediction on day-of-week pattern
            expected = dow_avg.get(dow, avg_daily)

            # Add confidence based on data availability
            confidence = min(0.95, 0.5 + (len(daily_revenues) / 180))

            forecast.append({
                "date": forecast_date.strftime("%Y-%m-%d"),
                "expected": round(expected, 2),
                "confidence": round(confidence, 2)
            })

        # Calculate period summaries
        total_30 = sum(f["expected"] for f in forecast[:30])
        total_60 = sum(f["expected"] for f in forecast[:60])
        total_90 = sum(f["expected"] for f in forecast[:90])

        # Determine trend
        if len(daily_revenues) >= 14:
            recent_avg = sum(daily_revenues[-7:]) / 7
            prior_avg = sum(daily_revenues[-14:-7]) / 7
            if recent_avg > prior_avg * 1.1:
                trend = "increasing"
            elif recent_avg < prior_avg * 0.9:
                trend = "decreasing"
            else:
                trend = "stable"
        else:
            trend = "insufficient_data"

        return {
            "cash_flow": forecast,
            "revenue_forecast": {
                "30_day": round(total_30, 2),
                "60_day": round(total_60, 2),
                "90_day": round(total_90, 2)
            },
            "seasonal_trend": trend,
            "avg_daily_revenue": round(avg_daily, 2)
        }

    # Accounts Receivable

    async def get_ar_aging(self) -> Dict[str, Any]:
        """Get accounts receivable aging report"""
        now = datetime.utcnow()

        pipeline = [
            {
                "$match": {
                    "business_id": self.business_id,
                    "status": "sent",  # Unpaid invoices
                    "invoice_date": {"$exists": True}
                }
            },
            {
                "$addFields": {
                    "days_outstanding": {
                        "$divide": [
                            {"$subtract": [now, "$invoice_date"]},
                            1000 * 60 * 60 * 24
                        ]
                    }
                }
            },
            {
                "$bucket": {
                    "groupBy": "$days_outstanding",
                    "boundaries": [0, 30, 60, 90, 120, 999999],
                    "default": "120+",
                    "output": {
                        "count": {"$sum": 1},
                        "total": {"$sum": "$amount_due"}
                    }
                }
            }
        ]

        results = await self.db.invoices.aggregate(pipeline).to_list(length=10)

        aging = {
            "current": {"count": 0, "amount": 0},
            "30_days": {"count": 0, "amount": 0},
            "60_days": {"count": 0, "amount": 0},
            "90_days": {"count": 0, "amount": 0},
            "120_plus": {"count": 0, "amount": 0}
        }

        bucket_map = {0: "current", 30: "30_days", 60: "60_days", 90: "90_days", 120: "120_plus"}

        for item in results:
            bucket_key = bucket_map.get(item["_id"], "120_plus")
            aging[bucket_key] = {
                "count": item["count"],
                "amount": round(item["total"], 2)
            }

        total = sum(b["amount"] for b in aging.values())
        aging["total"] = round(total, 2)

        return aging

    # Customer Analytics

    async def get_customer_metrics(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """Get customer acquisition and retention metrics"""
        if not start_date:
            start_date = datetime.utcnow() - timedelta(days=365)
        if not end_date:
            end_date = datetime.utcnow()

        # New customers
        new_pipeline = [
            {
                "$match": {
                    "business_id": self.business_id,
                    "created_at": {"$gte": start_date, "$lte": end_date}
                }
            },
            {
                "$group": {
                    "_id": {
                        "year": {"$year": "$created_at"},
                        "month": {"$month": "$created_at"}
                    },
                    "count": {"$sum": 1}
                }
            },
            {"$sort": {"_id": 1}}
        ]

        new_results = await self.db.clients.aggregate(new_pipeline).to_list(length=24)

        # Repeat customers (multiple jobs)
        repeat_pipeline = [
            {
                "$match": {
                    "business_id": self.business_id,
                    "completed_at": {"$gte": start_date, "$lte": end_date}
                }
            },
            {
                "$group": {
                    "_id": "$client_id",
                    "job_count": {"$sum": 1}
                }
            },
            {
                "$group": {
                    "_id": None,
                    "total_customers": {"$sum": 1},
                    "repeat_customers": {
                        "$sum": {"$cond": [{"$gt": ["$job_count", 1]}, 1, 0]}
                    }
                }
            }
        ]

        repeat_results = await self.db.hvac_quotes.aggregate(repeat_pipeline).to_list(length=1)

        repeat_data = repeat_results[0] if repeat_results else {"total_customers": 0, "repeat_customers": 0}
        retention_rate = (
            (repeat_data["repeat_customers"] / repeat_data["total_customers"] * 100)
            if repeat_data["total_customers"] > 0 else 0
        )

        return {
            "new_customers_by_month": [
                {
                    "month": f"{item['_id']['year']}-{item['_id']['month']:02d}",
                    "count": item["count"]
                }
                for item in new_results
            ],
            "total_customers": repeat_data["total_customers"],
            "repeat_customers": repeat_data["repeat_customers"],
            "retention_rate": round(retention_rate, 1)
        }
