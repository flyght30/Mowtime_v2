"""
Housecall Pro Integration Service
Bidirectional sync with Housecall Pro for customers, jobs, and appointments
"""

import os
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List, Tuple
from urllib.parse import urlencode
import httpx

from app.models.integration import (
    Integration, IntegrationProvider, IntegrationCredentials,
    SyncEntityType, SyncDirection
)
from app.services.integrations.base import BaseIntegrationService

logger = logging.getLogger(__name__)


class HousecallProService(BaseIntegrationService):
    """Housecall Pro integration service"""

    provider = IntegrationProvider.HOUSECALL_PRO
    oauth_base_url = "https://api.housecallpro.com/oauth"
    api_base_url = "https://api.housecallpro.com"

    # OAuth configuration
    CLIENT_ID = os.getenv("HCP_CLIENT_ID", "")
    CLIENT_SECRET = os.getenv("HCP_CLIENT_SECRET", "")

    def get_oauth_url(self, redirect_uri: str, state: str) -> str:
        """Generate OAuth authorization URL for Housecall Pro"""
        params = {
            "client_id": self.CLIENT_ID,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "state": state,
            "scope": "customers jobs estimates invoices"
        }
        return f"{self.oauth_base_url}/authorize?{urlencode(params)}"

    async def handle_oauth_callback(
        self,
        code: str,
        redirect_uri: str
    ) -> Tuple[bool, Optional[str]]:
        """Exchange authorization code for access tokens"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.oauth_base_url}/token",
                    data={
                        "grant_type": "authorization_code",
                        "client_id": self.CLIENT_ID,
                        "client_secret": self.CLIENT_SECRET,
                        "code": code,
                        "redirect_uri": redirect_uri
                    }
                )
                response.raise_for_status()
                token_data = response.json()

            # Calculate expiration
            expires_in = token_data.get("expires_in", 3600)
            expires_at = datetime.utcnow() + timedelta(seconds=expires_in)

            # Get account info
            account_info = await self._get_account_info(token_data["access_token"])

            # Create or update integration
            integration = await self.get_integration()
            if not integration:
                integration = Integration(
                    business_id=self.business_id,
                    provider=self.provider
                ).model_dump()

            integration["is_active"] = True
            integration["connected_at"] = datetime.utcnow()
            integration["credentials"] = {
                "access_token": token_data["access_token"],
                "refresh_token": token_data.get("refresh_token"),
                "expires_at": expires_at
            }
            integration["remote_account_name"] = account_info.get("company_name")
            integration["remote_account_email"] = account_info.get("email")

            await self.save_integration(integration)

            return True, None

        except httpx.HTTPStatusError as e:
            error = f"OAuth failed: {e.response.text}"
            logger.error(error)
            return False, error
        except Exception as e:
            error = f"OAuth error: {str(e)}"
            logger.error(error)
            return False, error

    async def _get_account_info(self, access_token: str) -> dict:
        """Get HCP account information"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.api_base_url}/company",
                    headers={"Authorization": f"Bearer {access_token}"}
                )
                response.raise_for_status()
                return response.json()
        except Exception:
            return {}

    async def refresh_access_token(self) -> bool:
        """Refresh the access token"""
        integration = await self.get_integration()
        if not integration:
            return False

        refresh_token = integration.get("credentials", {}).get("refresh_token")
        if not refresh_token:
            return False

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.oauth_base_url}/token",
                    data={
                        "grant_type": "refresh_token",
                        "client_id": self.CLIENT_ID,
                        "client_secret": self.CLIENT_SECRET,
                        "refresh_token": refresh_token
                    }
                )
                response.raise_for_status()
                token_data = response.json()

            expires_in = token_data.get("expires_in", 3600)
            expires_at = datetime.utcnow() + timedelta(seconds=expires_in)

            integration["credentials"]["access_token"] = token_data["access_token"]
            integration["credentials"]["expires_at"] = expires_at
            if "refresh_token" in token_data:
                integration["credentials"]["refresh_token"] = token_data["refresh_token"]

            await self.save_integration(integration)
            self._http_client = None  # Force recreation with new token

            return True

        except Exception as e:
            logger.error(f"Token refresh failed: {str(e)}")
            return False

    # Customer Sync

    async def sync_customers(self) -> Dict[str, int]:
        """Sync customers bidirectionally with HCP"""
        await self.update_sync_status(in_progress=True, operation="Syncing customers")

        results = {"pushed": 0, "pulled": 0, "errors": 0}
        integration = await self.get_integration()
        settings = integration.get("settings", {})

        try:
            if settings.get("sync_customers", True):
                direction = settings.get("customer_sync_direction", "bidirectional")

                if direction in ["push", "bidirectional"]:
                    pushed = await self._push_customers()
                    results["pushed"] = pushed

                if direction in ["pull", "bidirectional"]:
                    pulled = await self._pull_customers()
                    results["pulled"] = pulled

            await self.update_sync_status(
                in_progress=False,
                items_synced=results["pushed"] + results["pulled"]
            )

        except Exception as e:
            logger.error(f"Customer sync failed: {str(e)}")
            results["errors"] = 1
            await self.update_sync_status(
                in_progress=False,
                error=str(e)
            )

        return results

    async def _push_customers(self) -> int:
        """Push local customers to HCP"""
        pushed = 0

        # Get local customers without HCP mapping
        customers = await self.db.clients.find({
            "business_id": self.business_id,
            "deleted_at": None
        }).to_list(length=500)

        for customer in customers:
            mapping = await self.get_mapping(
                SyncEntityType.CUSTOMER,
                customer["client_id"]
            )

            if mapping:
                # Update existing
                if await self._update_hcp_customer(customer, mapping["remote_id"]):
                    await self.update_mapping(
                        mapping["mapping_id"],
                        self.compute_hash(customer)
                    )
                    pushed += 1
            else:
                # Create new
                remote_id = await self._create_hcp_customer(customer)
                if remote_id:
                    await self.create_mapping(
                        SyncEntityType.CUSTOMER,
                        customer["client_id"],
                        remote_id,
                        direction=SyncDirection.PUSH
                    )
                    pushed += 1

        return pushed

    async def _create_hcp_customer(self, customer: dict) -> Optional[str]:
        """Create customer in HCP"""
        hcp_data = self._transform_customer_to_hcp(customer)

        data, error = await self.api_request("POST", "/customers", json=hcp_data)

        if data:
            return data.get("id")
        return None

    async def _update_hcp_customer(self, customer: dict, remote_id: str) -> bool:
        """Update customer in HCP"""
        hcp_data = self._transform_customer_to_hcp(customer)

        data, error = await self.api_request(
            "PUT",
            f"/customers/{remote_id}",
            json=hcp_data
        )

        return data is not None

    def _transform_customer_to_hcp(self, customer: dict) -> dict:
        """Transform local customer to HCP format"""
        return {
            "first_name": customer.get("first_name", ""),
            "last_name": customer.get("last_name", ""),
            "email": customer.get("email"),
            "mobile_number": customer.get("phone"),
            "company": customer.get("company"),
            "addresses": [{
                "street": customer.get("address", ""),
                "city": customer.get("city", ""),
                "state": customer.get("state", ""),
                "zip": customer.get("zip_code", ""),
                "country": "US"
            }] if customer.get("address") else [],
            "notes": customer.get("notes")
        }

    async def _pull_customers(self) -> int:
        """Pull customers from HCP"""
        pulled = 0
        remote_customers = await self.get_remote_customers()

        for hcp_customer in remote_customers:
            mapping = await self.get_mapping_by_remote(
                SyncEntityType.CUSTOMER,
                hcp_customer["id"]
            )

            if not mapping:
                # Create local customer
                local_customer = await self._create_local_customer(hcp_customer)
                if local_customer:
                    await self.create_mapping(
                        SyncEntityType.CUSTOMER,
                        local_customer["client_id"],
                        hcp_customer["id"],
                        direction=SyncDirection.PULL
                    )
                    pulled += 1

        return pulled

    async def get_remote_customers(self, since: Optional[datetime] = None) -> List[dict]:
        """Get customers from HCP"""
        customers = []
        page = 1
        per_page = 100

        while True:
            params = {"page": page, "page_size": per_page}
            if since:
                params["updated_after"] = since.isoformat()

            data, error = await self.api_request("GET", "/customers", params=params)

            if not data:
                break

            batch = data.get("customers", [])
            customers.extend(batch)

            if len(batch) < per_page:
                break
            page += 1

        return customers

    async def _create_local_customer(self, hcp_customer: dict) -> Optional[dict]:
        """Create local customer from HCP data"""
        from app.models.common import generate_id

        address = {}
        if hcp_customer.get("addresses"):
            addr = hcp_customer["addresses"][0]
            address = {
                "address": addr.get("street", ""),
                "city": addr.get("city", ""),
                "state": addr.get("state", ""),
                "zip_code": addr.get("zip", "")
            }

        customer = {
            "client_id": generate_id("cli"),
            "business_id": self.business_id,
            "first_name": hcp_customer.get("first_name", ""),
            "last_name": hcp_customer.get("last_name", ""),
            "email": hcp_customer.get("email"),
            "phone": hcp_customer.get("mobile_number") or hcp_customer.get("home_number"),
            "company": hcp_customer.get("company"),
            "notes": hcp_customer.get("notes"),
            **address,
            "source": "housecall_pro",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }

        await self.db.clients.insert_one(customer)
        return customer

    # Job Sync

    async def push_job(self, job_id: str) -> Tuple[bool, Optional[str], Optional[str]]:
        """Push a job to HCP"""
        # Get job from database
        job = await self.db.hvac_quotes.find_one({
            "quote_id": job_id,
            "business_id": self.business_id
        })

        if not job:
            return False, None, "Job not found"

        # Check if already synced
        mapping = await self.get_mapping(SyncEntityType.JOB, job_id)

        if mapping:
            # Update existing
            success = await self._update_hcp_job(job, mapping["remote_id"])
            if success:
                await self.update_mapping(mapping["mapping_id"])
                return True, mapping["remote_id"], mapping.get("remote_url")
            return False, None, "Failed to update job"

        # Get customer mapping
        customer_id = job.get("client_id")
        customer_mapping = await self.get_mapping(
            SyncEntityType.CUSTOMER,
            customer_id
        ) if customer_id else None

        if not customer_mapping:
            # Try to find or create customer in HCP
            customer = await self.db.clients.find_one({"client_id": customer_id})
            if customer:
                remote_customer_id = await self._create_hcp_customer(customer)
                if remote_customer_id:
                    await self.create_mapping(
                        SyncEntityType.CUSTOMER,
                        customer_id,
                        remote_customer_id
                    )
                    customer_mapping = {"remote_id": remote_customer_id}

        if not customer_mapping:
            return False, None, "Could not sync customer to HCP"

        # Create job in HCP
        hcp_data = self._transform_job_to_hcp(job, customer_mapping["remote_id"])

        data, error = await self.api_request("POST", "/jobs", json=hcp_data)

        if data:
            remote_id = data.get("id")
            remote_url = f"https://pro.housecallpro.com/jobs/{remote_id}"

            await self.create_mapping(
                SyncEntityType.JOB,
                job_id,
                remote_id,
                remote_url,
                SyncDirection.PUSH
            )

            return True, remote_id, remote_url

        return False, None, error

    async def _update_hcp_job(self, job: dict, remote_id: str) -> bool:
        """Update job in HCP"""
        # Get customer mapping for the job
        customer_mapping = await self.get_mapping(
            SyncEntityType.CUSTOMER,
            job.get("client_id")
        )

        hcp_customer_id = customer_mapping["remote_id"] if customer_mapping else None
        hcp_data = self._transform_job_to_hcp(job, hcp_customer_id)

        data, error = await self.api_request(
            "PUT",
            f"/jobs/{remote_id}",
            json=hcp_data
        )

        return data is not None

    def _transform_job_to_hcp(
        self,
        job: dict,
        hcp_customer_id: Optional[str]
    ) -> dict:
        """Transform local job to HCP format"""
        integration = self._integration or {}
        settings = integration.get("settings", {})
        job_type_mapping = settings.get("job_type_mapping", {})

        job_type = job.get("job_type", "service")
        hcp_job_type = job_type_mapping.get(job_type, "Service Call")

        address = job.get("property", {})

        return {
            "customer_id": hcp_customer_id,
            "job_type": hcp_job_type,
            "description": job.get("notes") or job.get("scope_summary", ""),
            "address": {
                "street": address.get("address", ""),
                "city": address.get("city", ""),
                "state": address.get("state", ""),
                "zip": address.get("zip_code", "")
            },
            "scheduled_start": job.get("scheduled_date"),
            "tags": job.get("tags", [])
        }

    async def pull_jobs(self, since: Optional[datetime] = None) -> int:
        """Pull jobs from HCP (for migration)"""
        await self.update_sync_status(in_progress=True, operation="Pulling jobs from HCP")

        pulled = 0

        try:
            jobs = await self._get_remote_jobs(since)

            for hcp_job in jobs:
                mapping = await self.get_mapping_by_remote(
                    SyncEntityType.JOB,
                    hcp_job["id"]
                )

                if not mapping:
                    local_job = await self._create_local_job(hcp_job)
                    if local_job:
                        await self.create_mapping(
                            SyncEntityType.JOB,
                            local_job["quote_id"],
                            hcp_job["id"],
                            direction=SyncDirection.PULL
                        )
                        pulled += 1

            await self.update_sync_status(in_progress=False, items_synced=pulled)

        except Exception as e:
            logger.error(f"Job pull failed: {str(e)}")
            await self.update_sync_status(in_progress=False, error=str(e))

        return pulled

    async def _get_remote_jobs(self, since: Optional[datetime] = None) -> List[dict]:
        """Get jobs from HCP"""
        jobs = []
        page = 1
        per_page = 100

        while True:
            params = {"page": page, "page_size": per_page}
            if since:
                params["updated_after"] = since.isoformat()

            data, error = await self.api_request("GET", "/jobs", params=params)

            if not data:
                break

            batch = data.get("jobs", [])
            jobs.extend(batch)

            if len(batch) < per_page:
                break
            page += 1

        return jobs

    async def _create_local_job(self, hcp_job: dict) -> Optional[dict]:
        """Create local job from HCP data"""
        from app.models.common import generate_id

        # Find or create customer
        customer_id = None
        if hcp_job.get("customer_id"):
            customer_mapping = await self.get_mapping_by_remote(
                SyncEntityType.CUSTOMER,
                hcp_job["customer_id"]
            )
            if customer_mapping:
                customer_id = customer_mapping["local_id"]

        address = hcp_job.get("address", {})

        job = {
            "quote_id": generate_id("job"),
            "business_id": self.business_id,
            "client_id": customer_id,
            "property": {
                "address": address.get("street", ""),
                "city": address.get("city", ""),
                "state": address.get("state", ""),
                "zip_code": address.get("zip", "")
            },
            "job_type": "service",
            "status": self._map_hcp_status(hcp_job.get("work_status")),
            "notes": hcp_job.get("description"),
            "scheduled_date": hcp_job.get("scheduled_start"),
            "source": "housecall_pro",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }

        await self.db.hvac_quotes.insert_one(job)
        return job

    def _map_hcp_status(self, hcp_status: Optional[str]) -> str:
        """Map HCP job status to local status"""
        status_map = {
            "unscheduled": "pending",
            "scheduled": "scheduled",
            "in_progress": "in_progress",
            "completed": "completed",
            "cancelled": "cancelled"
        }
        return status_map.get(hcp_status, "pending")

    # Customer Matching

    async def match_customers(self) -> Dict[str, Any]:
        """Find matching customers between local and HCP"""
        local_customers = await self.db.clients.find({
            "business_id": self.business_id,
            "deleted_at": None
        }).to_list(length=1000)

        remote_customers = await self.get_remote_customers()

        # Get existing mappings
        integration = await self.get_integration()
        mappings = await self.db.sync_mappings.find({
            "integration_id": integration["integration_id"],
            "local_type": SyncEntityType.CUSTOMER.value
        }).to_list(length=10000)

        mapped_local = set(m["local_id"] for m in mappings)
        mapped_remote = set(m["remote_id"] for m in mappings)

        unmatched_local = []
        unmatched_remote = []
        suggestions = []

        for customer in local_customers:
            if customer["client_id"] not in mapped_local:
                unmatched_local.append(customer)

        for customer in remote_customers:
            if customer["id"] not in mapped_remote:
                unmatched_remote.append(customer)

        # Try to find matches by email or phone
        for local in unmatched_local:
            for remote in unmatched_remote:
                match_score = 0

                if local.get("email") and remote.get("email"):
                    if local["email"].lower() == remote["email"].lower():
                        match_score += 50

                if local.get("phone") and remote.get("mobile_number"):
                    local_phone = "".join(filter(str.isdigit, local["phone"]))
                    remote_phone = "".join(filter(str.isdigit, remote["mobile_number"]))
                    if local_phone[-10:] == remote_phone[-10:]:
                        match_score += 30

                local_name = f"{local.get('first_name', '')} {local.get('last_name', '')}".lower()
                remote_name = f"{remote.get('first_name', '')} {remote.get('last_name', '')}".lower()
                if local_name == remote_name:
                    match_score += 20

                if match_score >= 50:
                    suggestions.append({
                        "local_id": local["client_id"],
                        "local_name": local_name,
                        "remote_id": remote["id"],
                        "remote_name": remote_name,
                        "score": match_score
                    })

        return {
            "unmatched_local": len(unmatched_local),
            "unmatched_remote": len(unmatched_remote),
            "matched": len(mappings),
            "suggestions": sorted(suggestions, key=lambda x: -x["score"])[:20]
        }
