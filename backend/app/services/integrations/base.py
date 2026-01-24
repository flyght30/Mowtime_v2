"""
Base Integration Service
Abstract base class for third-party integrations
"""

import logging
import hashlib
import json
from abc import ABC, abstractmethod
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List, Tuple
from motor.motor_asyncio import AsyncIOMotorDatabase
import httpx

from app.models.integration import (
    Integration, IntegrationProvider, IntegrationCredentials,
    SyncMapping, SyncEntityType, SyncDirection, SyncStatus
)

logger = logging.getLogger(__name__)


class BaseIntegrationService(ABC):
    """
    Abstract base class for integration services.

    Each provider (HCP, QuickBooks, etc.) extends this class.
    """

    provider: IntegrationProvider = None
    oauth_base_url: str = ""
    api_base_url: str = ""

    def __init__(self, db: AsyncIOMotorDatabase, business_id: str):
        self.db = db
        self.business_id = business_id
        self._integration: Optional[Integration] = None
        self._http_client: Optional[httpx.AsyncClient] = None

    async def get_integration(self) -> Optional[dict]:
        """Get the current integration configuration"""
        if self._integration:
            return self._integration

        self._integration = await self.db.integrations.find_one({
            "business_id": self.business_id,
            "provider": self.provider.value
        })
        return self._integration

    async def save_integration(self, integration: dict) -> None:
        """Save integration configuration"""
        integration["updated_at"] = datetime.utcnow()
        await self.db.integrations.update_one(
            {"integration_id": integration["integration_id"]},
            {"$set": integration},
            upsert=True
        )
        self._integration = integration

    @property
    async def http_client(self) -> httpx.AsyncClient:
        """Get HTTP client with authorization headers"""
        if self._http_client is None:
            integration = await self.get_integration()
            headers = await self._get_auth_headers(integration)
            self._http_client = httpx.AsyncClient(
                base_url=self.api_base_url,
                headers=headers,
                timeout=30.0
            )
        return self._http_client

    async def close(self):
        """Close HTTP client"""
        if self._http_client:
            await self._http_client.aclose()
            self._http_client = None

    # OAuth Methods

    @abstractmethod
    def get_oauth_url(self, redirect_uri: str, state: str) -> str:
        """Generate OAuth authorization URL"""
        pass

    @abstractmethod
    async def handle_oauth_callback(
        self,
        code: str,
        redirect_uri: str
    ) -> Tuple[bool, Optional[str]]:
        """
        Handle OAuth callback and exchange code for tokens.

        Returns:
            Tuple of (success, error_message)
        """
        pass

    @abstractmethod
    async def refresh_access_token(self) -> bool:
        """Refresh the access token using refresh token"""
        pass

    async def _get_auth_headers(self, integration: Optional[dict]) -> Dict[str, str]:
        """Get authorization headers for API requests"""
        if not integration or not integration.get("credentials"):
            return {}

        creds = integration["credentials"]
        access_token = creds.get("access_token")

        if not access_token:
            return {}

        # Check if token is expired
        expires_at = creds.get("expires_at")
        if expires_at and isinstance(expires_at, datetime):
            if datetime.utcnow() >= expires_at - timedelta(minutes=5):
                # Token is expired or about to expire
                if await self.refresh_access_token():
                    integration = await self.get_integration()
                    access_token = integration["credentials"].get("access_token")

        return {"Authorization": f"Bearer {access_token}"}

    # Sync Methods

    async def get_mapping(
        self,
        local_type: SyncEntityType,
        local_id: str
    ) -> Optional[dict]:
        """Get sync mapping for a local entity"""
        integration = await self.get_integration()
        if not integration:
            return None

        return await self.db.sync_mappings.find_one({
            "business_id": self.business_id,
            "integration_id": integration["integration_id"],
            "local_type": local_type.value,
            "local_id": local_id
        })

    async def get_mapping_by_remote(
        self,
        local_type: SyncEntityType,
        remote_id: str
    ) -> Optional[dict]:
        """Get sync mapping by remote ID"""
        integration = await self.get_integration()
        if not integration:
            return None

        return await self.db.sync_mappings.find_one({
            "business_id": self.business_id,
            "integration_id": integration["integration_id"],
            "local_type": local_type.value,
            "remote_id": remote_id
        })

    async def create_mapping(
        self,
        local_type: SyncEntityType,
        local_id: str,
        remote_id: str,
        remote_url: Optional[str] = None,
        direction: SyncDirection = SyncDirection.BIDIRECTIONAL
    ) -> dict:
        """Create a sync mapping"""
        integration = await self.get_integration()

        mapping = SyncMapping(
            business_id=self.business_id,
            integration_id=integration["integration_id"],
            local_type=local_type,
            local_id=local_id,
            remote_id=remote_id,
            remote_url=remote_url,
            sync_direction=direction,
            last_synced=datetime.utcnow()
        )

        await self.db.sync_mappings.insert_one(mapping.model_dump())
        return mapping.model_dump()

    async def update_mapping(
        self,
        mapping_id: str,
        last_hash: Optional[str] = None
    ) -> None:
        """Update mapping after sync"""
        await self.db.sync_mappings.update_one(
            {"mapping_id": mapping_id},
            {"$set": {
                "last_synced": datetime.utcnow(),
                "last_hash": last_hash
            }}
        )

    def compute_hash(self, data: dict) -> str:
        """Compute hash for change detection"""
        json_str = json.dumps(data, sort_keys=True, default=str)
        return hashlib.md5(json_str.encode()).hexdigest()

    async def update_sync_status(
        self,
        in_progress: bool = False,
        operation: Optional[str] = None,
        error: Optional[str] = None,
        items_synced: Optional[int] = None
    ) -> None:
        """Update integration sync status"""
        integration = await self.get_integration()
        if not integration:
            return

        update = {
            "sync_status.in_progress": in_progress,
            "updated_at": datetime.utcnow()
        }

        if operation:
            update["sync_status.current_operation"] = operation
        if error:
            update["sync_status.last_error"] = error
        if items_synced is not None:
            update["sync_status.items_synced"] = items_synced
        if not in_progress:
            update["sync_status.last_sync"] = datetime.utcnow()
            update["sync_status.current_operation"] = None

        await self.db.integrations.update_one(
            {"integration_id": integration["integration_id"]},
            {"$set": update}
        )

    # Abstract sync methods to be implemented by providers

    @abstractmethod
    async def sync_customers(self) -> Dict[str, int]:
        """
        Sync customers with remote system.

        Returns:
            Dict with counts: {"pushed": N, "pulled": N, "errors": N}
        """
        pass

    @abstractmethod
    async def push_job(self, job_id: str) -> Tuple[bool, Optional[str], Optional[str]]:
        """
        Push a job to remote system.

        Returns:
            Tuple of (success, remote_id, remote_url)
        """
        pass

    @abstractmethod
    async def get_remote_customers(self, since: Optional[datetime] = None) -> List[dict]:
        """Get customers from remote system"""
        pass

    # Helper methods

    async def api_request(
        self,
        method: str,
        path: str,
        **kwargs
    ) -> Tuple[Optional[dict], Optional[str]]:
        """
        Make an API request with error handling.

        Returns:
            Tuple of (response_data, error_message)
        """
        try:
            client = await self.http_client
            response = await client.request(method, path, **kwargs)

            if response.status_code == 401:
                # Try refreshing token
                if await self.refresh_access_token():
                    # Recreate client with new token
                    await self.close()
                    client = await self.http_client
                    response = await client.request(method, path, **kwargs)

            response.raise_for_status()

            if response.content:
                return response.json(), None
            return {}, None

        except httpx.HTTPStatusError as e:
            error_msg = f"HTTP {e.response.status_code}: {e.response.text[:200]}"
            logger.error(f"API request failed: {error_msg}")
            return None, error_msg

        except Exception as e:
            error_msg = str(e)
            logger.error(f"API request error: {error_msg}")
            return None, error_msg

    async def disconnect(self) -> bool:
        """Disconnect integration and clean up"""
        integration = await self.get_integration()
        if not integration:
            return False

        # Delete all mappings
        await self.db.sync_mappings.delete_many({
            "integration_id": integration["integration_id"]
        })

        # Delete integration
        await self.db.integrations.delete_one({
            "integration_id": integration["integration_id"]
        })

        self._integration = None
        await self.close()

        return True
