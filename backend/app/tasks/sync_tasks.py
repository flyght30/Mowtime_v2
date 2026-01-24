"""
Integration Sync Tasks
Background scheduler for automatic integration syncing
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import Database
from app.models.integration import IntegrationProvider
from app.services.integrations.housecall import HousecallProService
from app.services.integrations.quickbooks import QuickBooksService

logger = logging.getLogger(__name__)


class IntegrationSyncScheduler:
    """
    Background scheduler for automatic integration syncing.

    Runs periodically to sync data with configured integrations
    based on each integration's sync_interval_minutes setting.
    """

    def __init__(self):
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._check_interval = 60  # Check every minute for due syncs

    async def start(self):
        """Start the sync scheduler"""
        if self._running:
            return

        self._running = True
        self._task = asyncio.create_task(self._run_scheduler())
        logger.info("Integration sync scheduler started")

    async def stop(self):
        """Stop the sync scheduler"""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Integration sync scheduler stopped")

    async def _run_scheduler(self):
        """Main scheduler loop"""
        while self._running:
            try:
                await self._check_and_run_syncs()
            except Exception as e:
                logger.error(f"Scheduler error: {str(e)}")

            await asyncio.sleep(self._check_interval)

    async def _check_and_run_syncs(self):
        """Check for integrations that need syncing and run them"""
        db = Database.get_db()

        # Find all active integrations with auto_sync_enabled
        integrations = await db.integrations.find({
            "is_active": True,
            "settings.auto_sync_enabled": True
        }).to_list(length=100)

        now = datetime.utcnow()

        for integration in integrations:
            try:
                if await self._should_sync(integration, now):
                    await self._run_sync(db, integration)
            except Exception as e:
                logger.error(
                    f"Error syncing {integration['provider']} for "
                    f"business {integration['business_id']}: {str(e)}"
                )

    async def _should_sync(self, integration: dict, now: datetime) -> bool:
        """Check if an integration is due for sync"""
        settings = integration.get("settings", {})
        sync_interval = settings.get("sync_interval_minutes", 60)

        sync_status = integration.get("sync_status", {})
        last_sync = sync_status.get("last_sync")

        # If currently syncing, skip
        if sync_status.get("in_progress"):
            return False

        # If never synced, sync now
        if not last_sync:
            return True

        # Check if interval has passed
        if isinstance(last_sync, str):
            last_sync = datetime.fromisoformat(last_sync.replace('Z', '+00:00'))

        next_sync_time = last_sync + timedelta(minutes=sync_interval)
        return now >= next_sync_time

    async def _run_sync(self, db: AsyncIOMotorDatabase, integration: dict):
        """Run sync for an integration"""
        provider = integration["provider"]
        business_id = integration["business_id"]

        logger.info(f"Starting scheduled sync for {provider} (business: {business_id})")

        service = None
        try:
            if provider == IntegrationProvider.HOUSECALL_PRO.value:
                service = HousecallProService(db, business_id)
            elif provider == IntegrationProvider.QUICKBOOKS.value:
                service = QuickBooksService(db, business_id)
            else:
                logger.warning(f"Unknown provider for scheduled sync: {provider}")
                return

            # Run customer sync
            results = await service.sync_customers()

            logger.info(
                f"Scheduled sync completed for {provider}: "
                f"pushed={results.get('pushed', 0)}, "
                f"pulled={results.get('pulled', 0)}, "
                f"errors={results.get('errors', 0)}"
            )

        finally:
            if service:
                await service.close()

    async def trigger_sync(
        self,
        business_id: str,
        provider: IntegrationProvider
    ) -> Dict[str, Any]:
        """
        Manually trigger a sync for a specific integration.

        This is called from API endpoints for manual sync triggers.
        """
        db = Database.get_db()

        integration = await db.integrations.find_one({
            "business_id": business_id,
            "provider": provider.value,
            "is_active": True
        })

        if not integration:
            return {"error": "Integration not found or not active"}

        # Check if already syncing
        if integration.get("sync_status", {}).get("in_progress"):
            return {"error": "Sync already in progress"}

        # Run sync
        await self._run_sync(db, integration)

        return {"success": True}


class SyncJobQueue:
    """
    Queue for managing sync jobs.

    Useful for handling large batches of records without blocking.
    """

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self._queue: asyncio.Queue = asyncio.Queue()
        self._workers: list = []
        self._running = False

    async def start(self, num_workers: int = 3):
        """Start the job queue with specified number of workers"""
        self._running = True
        for i in range(num_workers):
            worker = asyncio.create_task(self._worker(i))
            self._workers.append(worker)
        logger.info(f"Started {num_workers} sync job workers")

    async def stop(self):
        """Stop all workers"""
        self._running = False
        for worker in self._workers:
            worker.cancel()
        await asyncio.gather(*self._workers, return_exceptions=True)
        self._workers.clear()
        logger.info("Stopped sync job workers")

    async def enqueue(self, job: Dict[str, Any]):
        """Add a job to the queue"""
        await self._queue.put(job)

    async def _worker(self, worker_id: int):
        """Worker that processes jobs from the queue"""
        while self._running:
            try:
                job = await asyncio.wait_for(
                    self._queue.get(),
                    timeout=1.0
                )

                try:
                    await self._process_job(job)
                except Exception as e:
                    logger.error(f"Worker {worker_id} job error: {str(e)}")
                finally:
                    self._queue.task_done()

            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break

    async def _process_job(self, job: Dict[str, Any]):
        """Process a single sync job"""
        job_type = job.get("type")
        business_id = job.get("business_id")

        if job_type == "sync_customer":
            await self._sync_customer(job)
        elif job_type == "sync_job":
            await self._sync_job(job)
        elif job_type == "create_invoice":
            await self._create_invoice(job)
        else:
            logger.warning(f"Unknown job type: {job_type}")

    async def _sync_customer(self, job: Dict[str, Any]):
        """Sync a single customer"""
        business_id = job["business_id"]
        customer_id = job["customer_id"]
        provider = job["provider"]

        service = None
        try:
            if provider == "housecall_pro":
                service = HousecallProService(self.db, business_id)
            elif provider == "quickbooks":
                service = QuickBooksService(self.db, business_id)

            if service:
                customer = await self.db.clients.find_one({"client_id": customer_id})
                if customer:
                    # The specific sync logic is in the service
                    pass

        finally:
            if service:
                await service.close()

    async def _sync_job(self, job: Dict[str, Any]):
        """Sync a single job"""
        business_id = job["business_id"]
        job_id = job["job_id"]
        provider = job["provider"]

        service = None
        try:
            if provider == "housecall_pro":
                service = HousecallProService(self.db, business_id)
                await service.push_job(job_id)

        finally:
            if service:
                await service.close()

    async def _create_invoice(self, job: Dict[str, Any]):
        """Create invoice in QuickBooks"""
        business_id = job["business_id"]
        job_id = job["job_id"]

        service = None
        try:
            service = QuickBooksService(self.db, business_id)
            await service.create_invoice(job_id)

        finally:
            if service:
                await service.close()


# Global scheduler instance
_scheduler: Optional[IntegrationSyncScheduler] = None


def get_scheduler() -> IntegrationSyncScheduler:
    """Get the global scheduler instance"""
    global _scheduler
    if _scheduler is None:
        _scheduler = IntegrationSyncScheduler()
    return _scheduler


async def start_scheduler():
    """Start the global scheduler"""
    scheduler = get_scheduler()
    await scheduler.start()


async def stop_scheduler():
    """Stop the global scheduler"""
    scheduler = get_scheduler()
    await scheduler.stop()
