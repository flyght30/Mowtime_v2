"""
QuickBooks Online Integration Service
Handles OAuth flow and data synchronization with QuickBooks
"""

import os
import httpx
import base64
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any
from motor.motor_asyncio import AsyncIOMotorDatabase
from urllib.parse import urlencode

logger = logging.getLogger(__name__)

# QuickBooks OAuth endpoints
QB_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2"
QB_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
QB_REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke"

# QuickBooks API base URLs
QB_API_BASE_SANDBOX = "https://sandbox-quickbooks.api.intuit.com"
QB_API_BASE_PRODUCTION = "https://quickbooks.api.intuit.com"


class QuickBooksService:
    """Service for QuickBooks Online integration"""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.client_id = os.getenv("QUICKBOOKS_CLIENT_ID", "")
        self.client_secret = os.getenv("QUICKBOOKS_CLIENT_SECRET", "")
        self.redirect_uri = os.getenv("QUICKBOOKS_REDIRECT_URI", "http://localhost:8000/api/v1/quickbooks/callback")
        self.environment = os.getenv("QUICKBOOKS_ENVIRONMENT", "sandbox")
        self.api_base = QB_API_BASE_SANDBOX if self.environment == "sandbox" else QB_API_BASE_PRODUCTION

    @property
    def is_configured(self) -> bool:
        """Check if QuickBooks integration is configured with required credentials"""
        return bool(self.client_id and self.client_secret)

    def get_auth_url(self, business_id: str, state: str) -> str:
        """Generate QuickBooks OAuth authorization URL"""
        params = {
            "client_id": self.client_id,
            "response_type": "code",
            "scope": "com.intuit.quickbooks.accounting",
            "redirect_uri": self.redirect_uri,
            "state": f"{business_id}:{state}",
        }
        return f"{QB_AUTH_URL}?{urlencode(params)}"

    async def exchange_code_for_tokens(self, code: str) -> Dict[str, Any]:
        """Exchange authorization code for access and refresh tokens"""
        auth_header = base64.b64encode(
            f"{self.client_id}:{self.client_secret}".encode()
        ).decode()

        async with httpx.AsyncClient() as client:
            response = await client.post(
                QB_TOKEN_URL,
                headers={
                    "Authorization": f"Basic {auth_header}",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": self.redirect_uri,
                },
            )

            if response.status_code != 200:
                logger.error(f"Token exchange failed: {response.text}")
                raise Exception(f"Token exchange failed: {response.status_code}")

            return response.json()

    async def refresh_access_token(self, refresh_token: str) -> Dict[str, Any]:
        """Refresh the access token using refresh token"""
        auth_header = base64.b64encode(
            f"{self.client_id}:{self.client_secret}".encode()
        ).decode()

        async with httpx.AsyncClient() as client:
            response = await client.post(
                QB_TOKEN_URL,
                headers={
                    "Authorization": f"Basic {auth_header}",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                },
            )

            if response.status_code != 200:
                logger.error(f"Token refresh failed: {response.text}")
                raise Exception(f"Token refresh failed: {response.status_code}")

            return response.json()

    async def revoke_tokens(self, refresh_token: str) -> bool:
        """Revoke QuickBooks tokens"""
        auth_header = base64.b64encode(
            f"{self.client_id}:{self.client_secret}".encode()
        ).decode()

        async with httpx.AsyncClient() as client:
            response = await client.post(
                QB_REVOKE_URL,
                headers={
                    "Authorization": f"Basic {auth_header}",
                    "Content-Type": "application/json",
                },
                json={"token": refresh_token},
            )

            return response.status_code == 200

    async def store_connection(
        self,
        business_id: str,
        realm_id: str,
        tokens: Dict[str, Any]
    ) -> None:
        """Store QuickBooks connection details for a business"""
        connection = {
            "business_id": business_id,
            "realm_id": realm_id,
            "access_token": tokens["access_token"],
            "refresh_token": tokens["refresh_token"],
            "token_type": tokens.get("token_type", "Bearer"),
            "expires_at": datetime.utcnow() + timedelta(seconds=tokens.get("expires_in", 3600)),
            "refresh_expires_at": datetime.utcnow() + timedelta(days=100),  # QB refresh tokens last ~100 days
            "connected_at": datetime.utcnow(),
            "last_sync_clients": None,
            "last_sync_invoices": None,
            "sync_stats": {
                "clients_imported": 0,
                "invoices_pushed": 0,
            },
        }

        await self.db.quickbooks_connections.update_one(
            {"business_id": business_id},
            {"$set": connection},
            upsert=True
        )

    async def get_connection(self, business_id: str) -> Optional[Dict[str, Any]]:
        """Get QuickBooks connection for a business"""
        return await self.db.quickbooks_connections.find_one({"business_id": business_id})

    async def remove_connection(self, business_id: str) -> bool:
        """Remove QuickBooks connection for a business"""
        connection = await self.get_connection(business_id)
        if connection and connection.get("refresh_token"):
            await self.revoke_tokens(connection["refresh_token"])

        result = await self.db.quickbooks_connections.delete_one({"business_id": business_id})
        return result.deleted_count > 0

    async def get_valid_access_token(self, business_id: str) -> Optional[str]:
        """Get a valid access token, refreshing if necessary"""
        connection = await self.get_connection(business_id)
        if not connection:
            return None

        # Check if token is expired (with 5 min buffer)
        if connection["expires_at"] < datetime.utcnow() + timedelta(minutes=5):
            try:
                new_tokens = await self.refresh_access_token(connection["refresh_token"])
                await self.db.quickbooks_connections.update_one(
                    {"business_id": business_id},
                    {
                        "$set": {
                            "access_token": new_tokens["access_token"],
                            "refresh_token": new_tokens.get("refresh_token", connection["refresh_token"]),
                            "expires_at": datetime.utcnow() + timedelta(seconds=new_tokens.get("expires_in", 3600)),
                        }
                    }
                )
                return new_tokens["access_token"]
            except Exception as e:
                logger.error(f"Failed to refresh token for business {business_id}: {e}")
                return None

        return connection["access_token"]

    async def _make_api_request(
        self,
        business_id: str,
        method: str,
        endpoint: str,
        data: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Make an authenticated request to QuickBooks API"""
        connection = await self.get_connection(business_id)
        if not connection:
            raise Exception("QuickBooks not connected")

        access_token = await self.get_valid_access_token(business_id)
        if not access_token:
            raise Exception("Unable to get valid access token")

        realm_id = connection["realm_id"]
        url = f"{self.api_base}/v3/company/{realm_id}/{endpoint}"

        async with httpx.AsyncClient() as client:
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/json",
                "Content-Type": "application/json",
            }

            if method == "GET":
                response = await client.get(url, headers=headers)
            elif method == "POST":
                response = await client.post(url, headers=headers, json=data)
            else:
                raise ValueError(f"Unsupported method: {method}")

            if response.status_code not in [200, 201]:
                logger.error(f"QB API error: {response.status_code} - {response.text}")
                raise Exception(f"QuickBooks API error: {response.status_code}")

            return response.json()

    # ============== Customer/Client Sync ==============

    async def fetch_qb_customers(self, business_id: str, max_results: int = 1000) -> List[Dict]:
        """Fetch customers from QuickBooks"""
        query = f"SELECT * FROM Customer MAXRESULTS {max_results}"
        result = await self._make_api_request(
            business_id,
            "GET",
            f"query?query={query}"
        )
        return result.get("QueryResponse", {}).get("Customer", [])

    async def sync_clients_from_qb(self, business_id: str) -> Dict[str, int]:
        """Import QuickBooks customers as ServicePro clients"""
        qb_customers = await self.fetch_qb_customers(business_id)

        stats = {"imported": 0, "updated": 0, "skipped": 0}

        for customer in qb_customers:
            # Extract customer data
            display_name = customer.get("DisplayName", "")
            name_parts = display_name.split(" ", 1)
            first_name = customer.get("GivenName") or (name_parts[0] if name_parts else "")
            last_name = customer.get("FamilyName") or (name_parts[1] if len(name_parts) > 1 else "")

            email = None
            if customer.get("PrimaryEmailAddr"):
                email = customer["PrimaryEmailAddr"].get("Address")

            phone = None
            if customer.get("PrimaryPhone"):
                phone = customer["PrimaryPhone"].get("FreeFormNumber")

            # Build address
            address = {}
            if customer.get("BillAddr"):
                bill_addr = customer["BillAddr"]
                address = {
                    "street": bill_addr.get("Line1", ""),
                    "city": bill_addr.get("City", ""),
                    "state": bill_addr.get("CountrySubDivisionCode", ""),
                    "zip": bill_addr.get("PostalCode", ""),
                }

            # Check for existing client by email or name match
            existing = None
            if email:
                existing = await self.db.clients.find_one({
                    "business_id": business_id,
                    "email": email,
                    "deleted_at": None
                })

            if not existing and first_name and last_name:
                existing = await self.db.clients.find_one({
                    "business_id": business_id,
                    "first_name": {"$regex": f"^{first_name}$", "$options": "i"},
                    "last_name": {"$regex": f"^{last_name}$", "$options": "i"},
                    "deleted_at": None
                })

            if existing:
                # Update existing client with QB ID
                await self.db.clients.update_one(
                    {"_id": existing["_id"]},
                    {
                        "$set": {
                            "quickbooks_id": customer["Id"],
                            "updated_at": datetime.utcnow(),
                        }
                    }
                )
                stats["updated"] += 1
            else:
                # Create new client
                import uuid
                new_client = {
                    "client_id": str(uuid.uuid4()),
                    "business_id": business_id,
                    "quickbooks_id": customer["Id"],
                    "first_name": first_name,
                    "last_name": last_name,
                    "email": email,
                    "phone": phone,
                    "address": address,
                    "status": "active",
                    "source": "quickbooks_import",
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                    "deleted_at": None,
                }
                await self.db.clients.insert_one(new_client)
                stats["imported"] += 1

        # Update sync stats
        await self.db.quickbooks_connections.update_one(
            {"business_id": business_id},
            {
                "$set": {
                    "last_sync_clients": datetime.utcnow(),
                    "sync_stats.clients_imported": stats["imported"] + stats["updated"],
                }
            }
        )

        return stats

    # ============== Invoice Sync ==============

    async def create_qb_customer(self, business_id: str, client: Dict) -> str:
        """Create a customer in QuickBooks and return QB ID"""
        customer_data = {
            "DisplayName": f"{client.get('first_name', '')} {client.get('last_name', '')}".strip(),
            "GivenName": client.get("first_name", ""),
            "FamilyName": client.get("last_name", ""),
        }

        if client.get("email"):
            customer_data["PrimaryEmailAddr"] = {"Address": client["email"]}

        if client.get("phone"):
            customer_data["PrimaryPhone"] = {"FreeFormNumber": client["phone"]}

        if client.get("address"):
            addr = client["address"]
            customer_data["BillAddr"] = {
                "Line1": addr.get("street", ""),
                "City": addr.get("city", ""),
                "CountrySubDivisionCode": addr.get("state", ""),
                "PostalCode": addr.get("zip", ""),
            }

        result = await self._make_api_request(
            business_id,
            "POST",
            "customer",
            customer_data
        )

        return result["Customer"]["Id"]

    async def push_invoice_to_qb(self, business_id: str, invoice: Dict) -> Dict[str, Any]:
        """Push a ServicePro invoice to QuickBooks"""
        # Get client
        client = await self.db.clients.find_one({"client_id": invoice["client_id"]})
        if not client:
            raise Exception(f"Client not found: {invoice['client_id']}")

        # Get or create QB customer
        qb_customer_id = client.get("quickbooks_id")
        if not qb_customer_id:
            qb_customer_id = await self.create_qb_customer(business_id, client)
            await self.db.clients.update_one(
                {"client_id": invoice["client_id"]},
                {"$set": {"quickbooks_id": qb_customer_id}}
            )

        # Build line items
        line_items = []
        for idx, item in enumerate(invoice.get("line_items", []), 1):
            line_items.append({
                "LineNum": idx,
                "Amount": item.get("total", 0),
                "DetailType": "SalesItemLineDetail",
                "Description": item.get("description", "Service"),
                "SalesItemLineDetail": {
                    "Qty": item.get("quantity", 1),
                    "UnitPrice": item.get("unit_price", item.get("total", 0)),
                }
            })

        # If no line items, create one from total
        if not line_items:
            line_items.append({
                "LineNum": 1,
                "Amount": invoice.get("total_amount", 0),
                "DetailType": "SalesItemLineDetail",
                "Description": "Service",
                "SalesItemLineDetail": {
                    "Qty": 1,
                    "UnitPrice": invoice.get("total_amount", 0),
                }
            })

        # Create QB invoice
        qb_invoice = {
            "CustomerRef": {"value": qb_customer_id},
            "Line": line_items,
            "DocNumber": invoice.get("invoice_number", ""),
            "TxnDate": invoice.get("issued_date", datetime.utcnow().isoformat())[:10],
            "DueDate": invoice.get("due_date", "")[:10] if invoice.get("due_date") else None,
        }

        # Remove None values
        qb_invoice = {k: v for k, v in qb_invoice.items() if v is not None}

        result = await self._make_api_request(
            business_id,
            "POST",
            "invoice",
            qb_invoice
        )

        qb_invoice_id = result["Invoice"]["Id"]

        # Update ServicePro invoice with QB reference
        await self.db.invoices.update_one(
            {"invoice_id": invoice["invoice_id"]},
            {
                "$set": {
                    "quickbooks_id": qb_invoice_id,
                    "quickbooks_synced_at": datetime.utcnow(),
                }
            }
        )

        return {
            "invoice_id": invoice["invoice_id"],
            "quickbooks_id": qb_invoice_id,
            "status": "synced"
        }

    async def sync_invoices_to_qb(
        self,
        business_id: str,
        invoice_ids: Optional[List[str]] = None,
        since_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """Push multiple invoices to QuickBooks"""
        query = {
            "business_id": business_id,
            "quickbooks_id": {"$exists": False},  # Only unsynced invoices
            "deleted_at": None,
        }

        if invoice_ids:
            query["invoice_id"] = {"$in": invoice_ids}

        if since_date:
            query["issued_date"] = {"$gte": since_date}

        invoices = await self.db.invoices.find(query).to_list(length=100)

        results = {"synced": 0, "failed": 0, "errors": []}

        for invoice in invoices:
            try:
                await self.push_invoice_to_qb(business_id, invoice)
                results["synced"] += 1
            except Exception as e:
                results["failed"] += 1
                results["errors"].append({
                    "invoice_id": invoice["invoice_id"],
                    "error": str(e)
                })
                logger.error(f"Failed to sync invoice {invoice['invoice_id']}: {e}")

        # Update sync stats
        await self.db.quickbooks_connections.update_one(
            {"business_id": business_id},
            {
                "$set": {
                    "last_sync_invoices": datetime.utcnow(),
                },
                "$inc": {
                    "sync_stats.invoices_pushed": results["synced"],
                }
            }
        )

        return results

    async def get_sync_status(self, business_id: str) -> Dict[str, Any]:
        """Get sync status for a business"""
        connection = await self.get_connection(business_id)
        if not connection:
            return {"connected": False}

        return {
            "connected": True,
            "realm_id": connection["realm_id"],
            "connected_at": connection.get("connected_at"),
            "last_sync_clients": connection.get("last_sync_clients"),
            "last_sync_invoices": connection.get("last_sync_invoices"),
            "sync_stats": connection.get("sync_stats", {}),
            "token_expires_at": connection.get("expires_at"),
        }
