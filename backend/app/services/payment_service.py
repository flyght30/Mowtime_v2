"""
Payment Service
Stripe integration for payments and invoicing
"""

import logging
from typing import Optional
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase
import httpx

from app.config import get_settings
from app.models.payment import (
    Invoice, InvoiceCreate, InvoiceResponse, InvoiceStatus,
    Payment, PaymentCreate, PaymentResponse, PaymentStatus, PaymentMethod,
    LineItem, LineItemCreate, StripeCustomer
)
from app.models.common import utc_now

logger = logging.getLogger(__name__)
settings = get_settings()


class PaymentError(Exception):
    """Payment processing error"""
    pass


class PaymentService:
    """Stripe payment service"""

    STRIPE_API_URL = "https://api.stripe.com/v1"

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.api_key = settings.STRIPE_SECRET_KEY
        self.webhook_secret = settings.STRIPE_WEBHOOK_SECRET
        self._configured = bool(self.api_key)

    @property
    def is_configured(self) -> bool:
        """Check if Stripe is configured"""
        return self._configured

    async def _stripe_request(
        self,
        method: str,
        endpoint: str,
        data: Optional[dict] = None
    ) -> dict:
        """Make a request to Stripe API"""
        if not self.is_configured:
            raise PaymentError("Stripe not configured")

        url = f"{self.STRIPE_API_URL}/{endpoint}"
        headers = {"Authorization": f"Bearer {self.api_key}"}

        async with httpx.AsyncClient() as client:
            if method == "GET":
                response = await client.get(url, headers=headers, timeout=30.0)
            elif method == "POST":
                response = await client.post(
                    url, headers=headers, data=data, timeout=30.0
                )
            elif method == "DELETE":
                response = await client.delete(url, headers=headers, timeout=30.0)
            else:
                raise ValueError(f"Unsupported method: {method}")

            if response.status_code >= 400:
                error_data = response.json()
                error_msg = error_data.get("error", {}).get("message", "Unknown error")
                raise PaymentError(error_msg)

            return response.json()

    # ==================== Customer Management ====================

    async def get_or_create_stripe_customer(
        self,
        business_id: str,
        client_id: str
    ) -> str:
        """Get or create Stripe customer for a client"""
        # Check if we already have a mapping
        mapping = await self.db.stripe_customers.find_one({
            "business_id": business_id,
            "client_id": client_id
        })

        if mapping:
            return mapping["stripe_customer_id"]

        # Get client info
        client = await self.db.clients.find_one({
            "client_id": client_id,
            "business_id": business_id
        })

        if not client:
            raise PaymentError("Client not found")

        # Create Stripe customer
        customer_data = {
            "email": client.get("email"),
            "name": f"{client.get('first_name', '')} {client.get('last_name', '')}".strip(),
            "phone": client.get("phone"),
            "metadata[business_id]": business_id,
            "metadata[client_id]": client_id
        }

        # Remove None values
        customer_data = {k: v for k, v in customer_data.items() if v}

        try:
            result = await self._stripe_request("POST", "customers", customer_data)
            stripe_customer_id = result["id"]

            # Save mapping
            mapping = StripeCustomer(
                business_id=business_id,
                client_id=client_id,
                stripe_customer_id=stripe_customer_id,
                email=client.get("email")
            )
            await self.db.stripe_customers.insert_one(mapping.model_dump())

            return stripe_customer_id

        except Exception as e:
            logger.error(f"Failed to create Stripe customer: {e}")
            raise PaymentError(f"Failed to create customer: {str(e)}")

    # ==================== Invoice Management ====================

    async def create_invoice(
        self,
        business_id: str,
        data: InvoiceCreate
    ) -> Invoice:
        """Create a new invoice"""
        # Get next invoice number
        last_invoice = await self.db.invoices.find_one(
            {"business_id": business_id},
            sort=[("created_at", -1)]
        )

        if last_invoice:
            last_num = int(last_invoice["invoice_number"].split("-")[-1])
            invoice_number = f"INV-{str(last_num + 1).zfill(5)}"
        else:
            invoice_number = "INV-00001"

        invoice = Invoice(
            business_id=business_id,
            invoice_number=invoice_number,
            **data.model_dump()
        )

        await self.db.invoices.insert_one(invoice.model_dump())

        return invoice

    async def add_line_item(
        self,
        invoice_id: str,
        business_id: str,
        data: LineItemCreate
    ) -> Invoice:
        """Add a line item to an invoice"""
        invoice_doc = await self.db.invoices.find_one({
            "invoice_id": invoice_id,
            "business_id": business_id,
            "deleted_at": None
        })

        if not invoice_doc:
            raise PaymentError("Invoice not found")

        if invoice_doc["status"] not in [InvoiceStatus.DRAFT.value, InvoiceStatus.OPEN.value]:
            raise PaymentError("Cannot modify invoice in current status")

        invoice = Invoice(**invoice_doc)
        invoice.add_line_item(
            description=data.description,
            unit_price=data.unit_price,
            quantity=data.quantity,
            service_id=data.service_id,
            appointment_id=data.appointment_id,
            taxable=data.taxable
        )

        await self.db.invoices.update_one(
            {"invoice_id": invoice_id},
            {"$set": invoice.model_dump(exclude={"_id"})}
        )

        return invoice

    async def finalize_invoice(
        self,
        invoice_id: str,
        business_id: str,
        send_to_stripe: bool = True
    ) -> Invoice:
        """Finalize and optionally send invoice to Stripe"""
        invoice_doc = await self.db.invoices.find_one({
            "invoice_id": invoice_id,
            "business_id": business_id,
            "deleted_at": None
        })

        if not invoice_doc:
            raise PaymentError("Invoice not found")

        invoice = Invoice(**invoice_doc)

        if invoice.status != InvoiceStatus.DRAFT:
            raise PaymentError("Only draft invoices can be finalized")

        if not invoice.line_items:
            raise PaymentError("Invoice has no line items")

        invoice.status = InvoiceStatus.OPEN
        invoice.updated_at = utc_now()

        if send_to_stripe and self.is_configured:
            try:
                # Create Stripe invoice
                stripe_customer_id = await self.get_or_create_stripe_customer(
                    business_id, invoice.client_id
                )

                # Create invoice in Stripe
                stripe_invoice_data = {
                    "customer": stripe_customer_id,
                    "auto_advance": "false",
                    "collection_method": "send_invoice",
                    "days_until_due": "30",
                    "metadata[invoice_id]": invoice.invoice_id,
                    "metadata[business_id]": business_id
                }

                stripe_invoice = await self._stripe_request(
                    "POST", "invoices", stripe_invoice_data
                )

                # Add line items to Stripe invoice
                for item in invoice.line_items:
                    await self._stripe_request("POST", "invoiceitems", {
                        "customer": stripe_customer_id,
                        "invoice": stripe_invoice["id"],
                        "description": item.description,
                        "quantity": str(int(item.quantity)),
                        "unit_amount": str(int(item.unit_price))
                    })

                # Finalize Stripe invoice
                finalized = await self._stripe_request(
                    "POST", f"invoices/{stripe_invoice['id']}/finalize", {}
                )

                invoice.stripe_invoice_id = finalized["id"]
                invoice.stripe_hosted_invoice_url = finalized.get("hosted_invoice_url")

            except Exception as e:
                logger.error(f"Failed to create Stripe invoice: {e}")
                # Continue without Stripe - invoice is still valid locally

        await self.db.invoices.update_one(
            {"invoice_id": invoice_id},
            {"$set": invoice.model_dump(exclude={"_id"})}
        )

        return invoice

    async def void_invoice(self, invoice_id: str, business_id: str) -> Invoice:
        """Void an invoice"""
        invoice_doc = await self.db.invoices.find_one({
            "invoice_id": invoice_id,
            "business_id": business_id,
            "deleted_at": None
        })

        if not invoice_doc:
            raise PaymentError("Invoice not found")

        if invoice_doc["status"] == InvoiceStatus.PAID.value:
            raise PaymentError("Cannot void a paid invoice")

        # Void in Stripe if exists
        if invoice_doc.get("stripe_invoice_id") and self.is_configured:
            try:
                await self._stripe_request(
                    "POST",
                    f"invoices/{invoice_doc['stripe_invoice_id']}/void",
                    {}
                )
            except Exception as e:
                logger.warning(f"Failed to void Stripe invoice: {e}")

        result = await self.db.invoices.find_one_and_update(
            {"invoice_id": invoice_id},
            {"$set": {
                "status": InvoiceStatus.VOID.value,
                "updated_at": utc_now()
            }},
            return_document=True
        )

        return Invoice(**result)

    async def get_invoice(
        self,
        invoice_id: str,
        business_id: str
    ) -> Optional[Invoice]:
        """Get invoice by ID"""
        doc = await self.db.invoices.find_one({
            "invoice_id": invoice_id,
            "business_id": business_id,
            "deleted_at": None
        })
        return Invoice(**doc) if doc else None

    async def get_invoices(
        self,
        business_id: str,
        page: int = 1,
        per_page: int = 20,
        status_filter: Optional[InvoiceStatus] = None,
        client_id: Optional[str] = None
    ) -> tuple[list[InvoiceResponse], int]:
        """Get invoices for a business"""
        query = {
            "business_id": business_id,
            "deleted_at": None
        }

        if status_filter:
            query["status"] = status_filter.value

        if client_id:
            query["client_id"] = client_id

        total = await self.db.invoices.count_documents(query)
        skip = (page - 1) * per_page

        cursor = self.db.invoices.find(query).sort(
            "created_at", -1
        ).skip(skip).limit(per_page)

        docs = await cursor.to_list(length=per_page)
        invoices = [InvoiceResponse(**doc) for doc in docs]

        return invoices, total

    # ==================== Payment Processing ====================

    async def create_payment_intent(
        self,
        business_id: str,
        data: PaymentCreate
    ) -> dict:
        """Create a Stripe PaymentIntent"""
        if not self.is_configured:
            raise PaymentError("Stripe not configured")

        stripe_customer_id = await self.get_or_create_stripe_customer(
            business_id, data.client_id
        )

        intent_data = {
            "amount": str(data.amount),
            "currency": "usd",
            "customer": stripe_customer_id,
            "metadata[business_id]": business_id,
            "metadata[client_id]": data.client_id
        }

        if data.invoice_id:
            intent_data["metadata[invoice_id]"] = data.invoice_id

        if data.stripe_payment_method_id:
            intent_data["payment_method"] = data.stripe_payment_method_id
            intent_data["confirm"] = "true"

        result = await self._stripe_request("POST", "payment_intents", intent_data)

        # Create payment record
        payment = Payment(
            business_id=business_id,
            client_id=data.client_id,
            invoice_id=data.invoice_id,
            amount=data.amount,
            method=data.method,
            stripe_payment_intent_id=result["id"],
            stripe_customer_id=stripe_customer_id
        )

        if result.get("status") == "succeeded":
            payment.mark_succeeded()
        elif result.get("status") == "requires_action":
            payment.status = PaymentStatus.REQUIRES_ACTION

        await self.db.payments.insert_one(payment.model_dump())

        return {
            "payment_id": payment.payment_id,
            "client_secret": result.get("client_secret"),
            "status": result.get("status"),
            "requires_action": result.get("status") == "requires_action"
        }

    async def confirm_payment(self, payment_intent_id: str) -> Payment:
        """Confirm a payment after client-side confirmation"""
        payment_doc = await self.db.payments.find_one({
            "stripe_payment_intent_id": payment_intent_id
        })

        if not payment_doc:
            raise PaymentError("Payment not found")

        # Get status from Stripe
        result = await self._stripe_request(
            "GET", f"payment_intents/{payment_intent_id}"
        )

        payment = Payment(**payment_doc)

        if result.get("status") == "succeeded":
            payment.mark_succeeded()

            # Get card details if available
            if result.get("payment_method"):
                pm = await self._stripe_request(
                    "GET", f"payment_methods/{result['payment_method']}"
                )
                if pm.get("card"):
                    payment.card_brand = pm["card"].get("brand")
                    payment.card_last4 = pm["card"].get("last4")

            # Update invoice if linked
            if payment.invoice_id:
                await self.db.invoices.update_one(
                    {"invoice_id": payment.invoice_id},
                    {"$set": {
                        "status": InvoiceStatus.PAID.value,
                        "amount_paid": payment.amount,
                        "amount_due": 0,
                        "paid_at": utc_now()
                    }}
                )
        else:
            payment.mark_failed(
                error=result.get("last_payment_error", {}).get("message", "Payment failed")
            )

        await self.db.payments.update_one(
            {"payment_id": payment.payment_id},
            {"$set": payment.model_dump(exclude={"_id"})}
        )

        return payment

    async def process_webhook(self, payload: bytes, signature: str) -> dict:
        """Process Stripe webhook event"""
        import hashlib
        import hmac
        import time

        if not self.webhook_secret:
            raise PaymentError("Webhook secret not configured")

        # Verify signature
        timestamp, signatures = self._parse_stripe_signature(signature)
        expected_sig = hmac.new(
            self.webhook_secret.encode(),
            f"{timestamp}.{payload.decode()}".encode(),
            hashlib.sha256
        ).hexdigest()

        if not any(hmac.compare_digest(expected_sig, sig) for sig in signatures):
            raise PaymentError("Invalid webhook signature")

        # Check timestamp (5 min tolerance)
        if abs(time.time() - int(timestamp)) > 300:
            raise PaymentError("Webhook timestamp too old")

        import json
        event = json.loads(payload)

        event_type = event.get("type")
        data = event.get("data", {}).get("object", {})

        if event_type == "payment_intent.succeeded":
            await self.confirm_payment(data.get("id"))
        elif event_type == "payment_intent.payment_failed":
            payment_doc = await self.db.payments.find_one({
                "stripe_payment_intent_id": data.get("id")
            })
            if payment_doc:
                await self.db.payments.update_one(
                    {"stripe_payment_intent_id": data.get("id")},
                    {"$set": {
                        "status": PaymentStatus.FAILED.value,
                        "error_message": data.get("last_payment_error", {}).get("message")
                    }}
                )
        elif event_type == "invoice.paid":
            await self.db.invoices.update_one(
                {"stripe_invoice_id": data.get("id")},
                {"$set": {
                    "status": InvoiceStatus.PAID.value,
                    "paid_at": utc_now()
                }}
            )

        return {"received": True, "type": event_type}

    def _parse_stripe_signature(self, header: str) -> tuple[str, list[str]]:
        """Parse Stripe webhook signature header"""
        parts = dict(pair.split("=") for pair in header.split(","))
        return parts.get("t", ""), [parts.get(f"v{i}", "") for i in range(1, 3)]

    async def refund_payment(
        self,
        payment_id: str,
        business_id: str,
        amount: Optional[int] = None,
        reason: Optional[str] = None
    ) -> Payment:
        """Refund a payment"""
        payment_doc = await self.db.payments.find_one({
            "payment_id": payment_id,
            "business_id": business_id
        })

        if not payment_doc:
            raise PaymentError("Payment not found")

        payment = Payment(**payment_doc)

        if payment.status != PaymentStatus.SUCCEEDED:
            raise PaymentError("Can only refund successful payments")

        refund_amount = amount or payment.amount

        if self.is_configured and payment.stripe_payment_intent_id:
            try:
                refund_data = {
                    "payment_intent": payment.stripe_payment_intent_id,
                    "amount": str(refund_amount)
                }
                if reason:
                    refund_data["reason"] = reason

                await self._stripe_request("POST", "refunds", refund_data)
            except Exception as e:
                raise PaymentError(f"Refund failed: {str(e)}")

        payment.refunded_amount += refund_amount
        payment.refund_reason = reason

        if payment.refunded_amount >= payment.amount:
            payment.status = PaymentStatus.REFUNDED
        else:
            payment.status = PaymentStatus.PARTIALLY_REFUNDED

        payment.updated_at = utc_now()

        await self.db.payments.update_one(
            {"payment_id": payment_id},
            {"$set": payment.model_dump(exclude={"_id"})}
        )

        return payment

    async def get_payments(
        self,
        business_id: str,
        page: int = 1,
        per_page: int = 20,
        status_filter: Optional[PaymentStatus] = None,
        client_id: Optional[str] = None
    ) -> tuple[list[PaymentResponse], int]:
        """Get payments for a business"""
        query = {
            "business_id": business_id,
            "deleted_at": None
        }

        if status_filter:
            query["status"] = status_filter.value

        if client_id:
            query["client_id"] = client_id

        total = await self.db.payments.count_documents(query)
        skip = (page - 1) * per_page

        cursor = self.db.payments.find(query).sort(
            "created_at", -1
        ).skip(skip).limit(per_page)

        docs = await cursor.to_list(length=per_page)
        payments = [PaymentResponse(**doc) for doc in docs]

        return payments, total

    async def get_payment_stats(self, business_id: str) -> dict:
        """Get payment statistics"""
        pipeline = [
            {"$match": {"business_id": business_id, "deleted_at": None}},
            {"$group": {
                "_id": "$status",
                "count": {"$sum": 1},
                "total_amount": {"$sum": "$amount"}
            }}
        ]

        cursor = self.db.payments.aggregate(pipeline)
        results = await cursor.to_list(length=20)

        stats = {
            "total_payments": 0,
            "total_revenue": 0,
            "by_status": {}
        }

        for r in results:
            stats["total_payments"] += r["count"]
            stats["by_status"][r["_id"]] = {
                "count": r["count"],
                "amount": r["total_amount"]
            }
            if r["_id"] == PaymentStatus.SUCCEEDED.value:
                stats["total_revenue"] = r["total_amount"]

        return stats
