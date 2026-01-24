"""
QuickBooks Online Integration Service
Sync customers, create invoices, and record payments
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


class QuickBooksService(BaseIntegrationService):
    """QuickBooks Online integration service"""

    provider = IntegrationProvider.QUICKBOOKS
    oauth_base_url = "https://appcenter.intuit.com/connect/oauth2"
    api_base_url = "https://quickbooks.api.intuit.com/v3"

    # OAuth configuration
    CLIENT_ID = os.getenv("QBO_CLIENT_ID", "")
    CLIENT_SECRET = os.getenv("QBO_CLIENT_SECRET", "")

    # Sandbox mode for testing
    SANDBOX_MODE = os.getenv("QBO_SANDBOX", "false").lower() == "true"

    @property
    def api_base_url(self) -> str:
        if self.SANDBOX_MODE:
            return "https://sandbox-quickbooks.api.intuit.com/v3"
        return "https://quickbooks.api.intuit.com/v3"

    def get_oauth_url(self, redirect_uri: str, state: str) -> str:
        """Generate OAuth authorization URL for QuickBooks"""
        params = {
            "client_id": self.CLIENT_ID,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "state": state,
            "scope": "com.intuit.quickbooks.accounting"
        }
        return f"{self.oauth_base_url}?{urlencode(params)}"

    async def handle_oauth_callback(
        self,
        code: str,
        redirect_uri: str,
        realm_id: Optional[str] = None
    ) -> Tuple[bool, Optional[str]]:
        """Exchange authorization code for access tokens"""
        try:
            import base64
            auth_header = base64.b64encode(
                f"{self.CLIENT_ID}:{self.CLIENT_SECRET}".encode()
            ).decode()

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
                    headers={
                        "Authorization": f"Basic {auth_header}",
                        "Content-Type": "application/x-www-form-urlencoded"
                    },
                    data={
                        "grant_type": "authorization_code",
                        "code": code,
                        "redirect_uri": redirect_uri
                    }
                )
                response.raise_for_status()
                token_data = response.json()

            # Calculate expiration
            expires_in = token_data.get("expires_in", 3600)
            expires_at = datetime.utcnow() + timedelta(seconds=expires_in)

            # Get company info
            company_info = await self._get_company_info(
                token_data["access_token"],
                realm_id
            )

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
                "expires_at": expires_at,
                "realm_id": realm_id
            }
            integration["remote_account_name"] = company_info.get("CompanyName")
            integration["remote_account_email"] = company_info.get("Email", {}).get("Address")

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

    async def _get_company_info(
        self,
        access_token: str,
        realm_id: str
    ) -> dict:
        """Get QuickBooks company information"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.api_base_url}/company/{realm_id}/companyinfo/{realm_id}",
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Accept": "application/json"
                    }
                )
                response.raise_for_status()
                data = response.json()
                return data.get("CompanyInfo", {})
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
            import base64
            auth_header = base64.b64encode(
                f"{self.CLIENT_ID}:{self.CLIENT_SECRET}".encode()
            ).decode()

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
                    headers={
                        "Authorization": f"Basic {auth_header}",
                        "Content-Type": "application/x-www-form-urlencoded"
                    },
                    data={
                        "grant_type": "refresh_token",
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

    async def _get_auth_headers(self, integration: Optional[dict]) -> Dict[str, str]:
        """Get authorization headers for QuickBooks API"""
        headers = await super()._get_auth_headers(integration)
        headers["Accept"] = "application/json"
        headers["Content-Type"] = "application/json"
        return headers

    def _get_realm_id(self) -> Optional[str]:
        """Get the QuickBooks realm ID"""
        if self._integration:
            return self._integration.get("credentials", {}).get("realm_id")
        return None

    async def api_request(
        self,
        method: str,
        path: str,
        **kwargs
    ) -> Tuple[Optional[dict], Optional[str]]:
        """Make QuickBooks API request with realm ID"""
        realm_id = self._get_realm_id()
        if not realm_id:
            return None, "No realm ID configured"

        full_path = f"/company/{realm_id}{path}"
        return await super().api_request(method, full_path, **kwargs)

    # Customer Sync

    async def sync_customers(self) -> Dict[str, int]:
        """Sync customers to QuickBooks"""
        await self.update_sync_status(in_progress=True, operation="Syncing customers to QuickBooks")

        results = {"pushed": 0, "pulled": 0, "errors": 0}

        try:
            # QuickBooks is typically push-only for customers from service software
            pushed = await self._push_customers()
            results["pushed"] = pushed

            await self.update_sync_status(in_progress=False, items_synced=pushed)

        except Exception as e:
            logger.error(f"Customer sync failed: {str(e)}")
            results["errors"] = 1
            await self.update_sync_status(in_progress=False, error=str(e))

        return results

    async def _push_customers(self) -> int:
        """Push local customers to QuickBooks"""
        pushed = 0

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
                # Check if needs update
                current_hash = self.compute_hash(customer)
                if mapping.get("last_hash") != current_hash:
                    if await self._update_qb_customer(customer, mapping["remote_id"]):
                        await self.update_mapping(mapping["mapping_id"], current_hash)
                        pushed += 1
            else:
                # Create new
                remote_id = await self._create_qb_customer(customer)
                if remote_id:
                    await self.create_mapping(
                        SyncEntityType.CUSTOMER,
                        customer["client_id"],
                        remote_id,
                        direction=SyncDirection.PUSH
                    )
                    pushed += 1

        return pushed

    async def _create_qb_customer(self, customer: dict) -> Optional[str]:
        """Create customer in QuickBooks"""
        qb_data = self._transform_customer_to_qb(customer)

        data, error = await self.api_request("POST", "/customer", json=qb_data)

        if data:
            return data.get("Customer", {}).get("Id")
        return None

    async def _update_qb_customer(self, customer: dict, remote_id: str) -> bool:
        """Update customer in QuickBooks"""
        # First get the current sync token
        existing, error = await self.api_request("GET", f"/customer/{remote_id}")

        if not existing:
            return False

        sync_token = existing.get("Customer", {}).get("SyncToken")

        qb_data = self._transform_customer_to_qb(customer)
        qb_data["Id"] = remote_id
        qb_data["SyncToken"] = sync_token

        data, error = await self.api_request("POST", "/customer", json=qb_data)

        return data is not None

    def _transform_customer_to_qb(self, customer: dict) -> dict:
        """Transform local customer to QuickBooks format"""
        display_name = f"{customer.get('first_name', '')} {customer.get('last_name', '')}".strip()
        if customer.get("company"):
            display_name = customer["company"]

        qb_customer = {
            "DisplayName": display_name[:100],  # QB has 100 char limit
            "GivenName": customer.get("first_name", "")[:25],
            "FamilyName": customer.get("last_name", "")[:25],
            "CompanyName": customer.get("company", "")[:100] if customer.get("company") else None,
        }

        # Primary email
        if customer.get("email"):
            qb_customer["PrimaryEmailAddr"] = {"Address": customer["email"]}

        # Primary phone
        if customer.get("phone"):
            qb_customer["PrimaryPhone"] = {"FreeFormNumber": customer["phone"]}

        # Billing address
        if customer.get("address"):
            qb_customer["BillAddr"] = {
                "Line1": customer.get("address", ""),
                "City": customer.get("city", ""),
                "CountrySubDivisionCode": customer.get("state", ""),
                "PostalCode": customer.get("zip_code", ""),
                "Country": "US"
            }

        # Notes
        if customer.get("notes"):
            qb_customer["Notes"] = customer["notes"][:2000]

        return qb_customer

    async def get_remote_customers(self, since: Optional[datetime] = None) -> List[dict]:
        """Get customers from QuickBooks"""
        customers = []
        start_position = 1
        max_results = 100

        while True:
            query = "SELECT * FROM Customer"
            if since:
                query += f" WHERE MetaData.LastUpdatedTime >= '{since.isoformat()}'"
            query += f" STARTPOSITION {start_position} MAXRESULTS {max_results}"

            data, error = await self.api_request(
                "GET",
                "/query",
                params={"query": query}
            )

            if not data:
                break

            batch = data.get("QueryResponse", {}).get("Customer", [])
            customers.extend(batch)

            if len(batch) < max_results:
                break
            start_position += max_results

        return customers

    async def push_job(self, job_id: str) -> Tuple[bool, Optional[str], Optional[str]]:
        """QuickBooks doesn't support jobs directly, return not supported"""
        return False, None, "QuickBooks does not support direct job sync. Use invoice creation instead."

    # Invoice Management

    async def create_invoice(self, job_id: str) -> Tuple[bool, Optional[str], Optional[str]]:
        """Create an invoice in QuickBooks from a job"""
        # Get job
        job = await self.db.hvac_quotes.find_one({
            "quote_id": job_id,
            "business_id": self.business_id
        })

        if not job:
            return False, None, "Job not found"

        # Check if invoice already exists
        mapping = await self.get_mapping(SyncEntityType.INVOICE, job_id)
        if mapping:
            return True, mapping["remote_id"], "Invoice already exists"

        # Get or create customer in QuickBooks
        customer_id = job.get("client_id")
        if not customer_id:
            return False, None, "Job has no customer"

        customer_mapping = await self.get_mapping(
            SyncEntityType.CUSTOMER,
            customer_id
        )

        if not customer_mapping:
            # Create customer first
            customer = await self.db.clients.find_one({"client_id": customer_id})
            if customer:
                remote_customer_id = await self._create_qb_customer(customer)
                if remote_customer_id:
                    await self.create_mapping(
                        SyncEntityType.CUSTOMER,
                        customer_id,
                        remote_customer_id
                    )
                    customer_mapping = {"remote_id": remote_customer_id}

        if not customer_mapping:
            return False, None, "Could not create customer in QuickBooks"

        # Get default income account
        integration = await self.get_integration()
        settings = integration.get("settings", {})
        income_account_id = settings.get("default_income_account")

        # Create invoice
        invoice_data = self._build_invoice(job, customer_mapping["remote_id"], income_account_id)

        data, error = await self.api_request("POST", "/invoice", json=invoice_data)

        if data:
            invoice = data.get("Invoice", {})
            invoice_id = invoice.get("Id")
            invoice_number = invoice.get("DocNumber")

            await self.create_mapping(
                SyncEntityType.INVOICE,
                job_id,
                invoice_id,
                direction=SyncDirection.PUSH
            )

            return True, invoice_number, None

        return False, None, error

    def _build_invoice(
        self,
        job: dict,
        qb_customer_id: str,
        income_account_id: Optional[str] = None
    ) -> dict:
        """Build QuickBooks invoice from job"""
        lines = []

        # Add line items from job
        if job.get("line_items"):
            for item in job["line_items"]:
                line = {
                    "Amount": item.get("total", 0),
                    "DetailType": "SalesItemLineDetail",
                    "SalesItemLineDetail": {
                        "Qty": item.get("quantity", 1),
                        "UnitPrice": item.get("unit_price", 0),
                    },
                    "Description": item.get("description", "")
                }

                if income_account_id:
                    line["SalesItemLineDetail"]["ItemAccountRef"] = {
                        "value": income_account_id
                    }

                lines.append(line)
        else:
            # Single line for job total
            lines.append({
                "Amount": job.get("total", 0),
                "DetailType": "SalesItemLineDetail",
                "SalesItemLineDetail": {
                    "Qty": 1,
                    "UnitPrice": job.get("total", 0),
                },
                "Description": job.get("scope_summary", "Service")
            })

        invoice = {
            "CustomerRef": {"value": qb_customer_id},
            "Line": lines
        }

        # Add billing address from job property
        if job.get("property"):
            prop = job["property"]
            invoice["BillAddr"] = {
                "Line1": prop.get("address", ""),
                "City": prop.get("city", ""),
                "CountrySubDivisionCode": prop.get("state", ""),
                "PostalCode": prop.get("zip_code", "")
            }

        # Add memo/notes
        if job.get("notes"):
            invoice["CustomerMemo"] = {"value": job["notes"][:1000]}

        return invoice

    async def record_payment(
        self,
        invoice_id: str,
        amount: float,
        payment_date: Optional[datetime] = None,
        payment_method: Optional[str] = None
    ) -> Tuple[bool, Optional[str]]:
        """Record a payment against an invoice in QuickBooks"""
        # Get invoice mapping
        mapping = await self.get_mapping_by_remote(
            SyncEntityType.INVOICE,
            invoice_id
        )

        if not mapping:
            return False, "Invoice not found in QuickBooks"

        # Get invoice to get customer
        invoice_data, error = await self.api_request("GET", f"/invoice/{invoice_id}")

        if not invoice_data:
            return False, error

        invoice = invoice_data.get("Invoice", {})
        customer_ref = invoice.get("CustomerRef", {})

        payment = {
            "CustomerRef": customer_ref,
            "TotalAmt": amount,
            "Line": [{
                "Amount": amount,
                "LinkedTxn": [{
                    "TxnId": invoice_id,
                    "TxnType": "Invoice"
                }]
            }]
        }

        if payment_date:
            payment["TxnDate"] = payment_date.strftime("%Y-%m-%d")

        data, error = await self.api_request("POST", "/payment", json=payment)

        if data:
            payment_id = data.get("Payment", {}).get("Id")
            return True, payment_id

        return False, error

    # Account Management

    async def get_accounts(self, account_type: Optional[str] = None) -> List[dict]:
        """Get chart of accounts from QuickBooks"""
        query = "SELECT * FROM Account"

        if account_type:
            query += f" WHERE AccountType = '{account_type}'"

        query += " MAXRESULTS 100"

        data, error = await self.api_request("GET", "/query", params={"query": query})

        if data:
            return data.get("QueryResponse", {}).get("Account", [])

        return []

    async def get_income_accounts(self) -> List[dict]:
        """Get income accounts for invoice configuration"""
        return await self.get_accounts("Income")

    async def get_expense_accounts(self) -> List[dict]:
        """Get expense accounts"""
        return await self.get_accounts("Expense")

    # Reporting

    async def get_sync_summary(self) -> Dict[str, Any]:
        """Get summary of synced items"""
        integration = await self.get_integration()
        if not integration:
            return {}

        # Count mappings by type
        pipeline = [
            {
                "$match": {
                    "integration_id": integration["integration_id"]
                }
            },
            {
                "$group": {
                    "_id": "$local_type",
                    "count": {"$sum": 1}
                }
            }
        ]

        counts = await self.db.sync_mappings.aggregate(pipeline).to_list(length=10)

        summary = {
            "customers_synced": 0,
            "invoices_synced": 0,
            "payments_synced": 0
        }

        for item in counts:
            if item["_id"] == "customer":
                summary["customers_synced"] = item["count"]
            elif item["_id"] == "invoice":
                summary["invoices_synced"] = item["count"]
            elif item["_id"] == "payment":
                summary["payments_synced"] = item["count"]

        return summary
