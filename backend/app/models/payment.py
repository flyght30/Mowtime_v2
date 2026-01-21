"""
Payment Model
Stripe integration for invoicing and payment processing
"""

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict

from app.models.common import BaseDocument, generate_id, utc_now


class PaymentStatus(str, Enum):
    """Payment status"""
    PENDING = "pending"
    PROCESSING = "processing"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    REFUNDED = "refunded"
    PARTIALLY_REFUNDED = "partially_refunded"
    CANCELED = "canceled"
    REQUIRES_ACTION = "requires_action"


class PaymentMethod(str, Enum):
    """Payment method type"""
    CARD = "card"
    BANK_TRANSFER = "bank_transfer"
    CASH = "cash"
    CHECK = "check"
    OTHER = "other"


class InvoiceStatus(str, Enum):
    """Invoice status"""
    DRAFT = "draft"
    OPEN = "open"
    PAID = "paid"
    VOID = "void"
    UNCOLLECTIBLE = "uncollectible"
    OVERDUE = "overdue"


class LineItem(BaseModel):
    """Invoice line item"""
    line_item_id: str = Field(default_factory=lambda: generate_id("li"))
    description: str
    quantity: float = 1.0
    unit_price: float  # In cents
    amount: float  # Total in cents (quantity * unit_price)
    service_id: Optional[str] = None
    appointment_id: Optional[str] = None
    taxable: bool = True


class Invoice(BaseDocument):
    """Invoice document model"""
    invoice_id: str = Field(default_factory=lambda: generate_id("inv"))
    business_id: str
    client_id: str

    # Invoice details
    invoice_number: str  # Business-specific numbering
    status: InvoiceStatus = InvoiceStatus.DRAFT

    # Amounts (in cents)
    subtotal: int = 0
    tax_rate: float = 0.0  # e.g., 0.0825 for 8.25%
    tax_amount: int = 0
    discount_amount: int = 0
    discount_percent: Optional[float] = None
    total: int = 0
    amount_paid: int = 0
    amount_due: int = 0

    # Line items
    line_items: list[LineItem] = []

    # Dates
    issue_date: str  # YYYY-MM-DD
    due_date: str  # YYYY-MM-DD
    paid_at: Optional[datetime] = None

    # Related
    appointment_ids: list[str] = []

    # Stripe
    stripe_invoice_id: Optional[str] = None
    stripe_payment_intent_id: Optional[str] = None
    stripe_hosted_invoice_url: Optional[str] = None

    # Notes
    notes: Optional[str] = None
    terms: Optional[str] = None

    def calculate_totals(self) -> None:
        """Calculate invoice totals from line items"""
        self.subtotal = sum(int(item.amount) for item in self.line_items)

        # Apply discount
        if self.discount_percent:
            self.discount_amount = int(self.subtotal * self.discount_percent / 100)
        discounted = self.subtotal - self.discount_amount

        # Calculate tax
        taxable_amount = sum(
            int(item.amount) for item in self.line_items if item.taxable
        )
        self.tax_amount = int(taxable_amount * self.tax_rate)

        self.total = discounted + self.tax_amount
        self.amount_due = self.total - self.amount_paid
        self.updated_at = utc_now()

    def add_line_item(
        self,
        description: str,
        unit_price: float,
        quantity: float = 1.0,
        service_id: Optional[str] = None,
        appointment_id: Optional[str] = None,
        taxable: bool = True
    ) -> None:
        """Add a line item to the invoice"""
        item = LineItem(
            description=description,
            quantity=quantity,
            unit_price=unit_price,
            amount=unit_price * quantity,
            service_id=service_id,
            appointment_id=appointment_id,
            taxable=taxable
        )
        self.line_items.append(item)
        self.calculate_totals()

    def mark_paid(self, amount: Optional[int] = None) -> None:
        """Mark invoice as paid"""
        self.amount_paid = amount or self.total
        self.amount_due = self.total - self.amount_paid
        self.paid_at = utc_now()

        if self.amount_due <= 0:
            self.status = InvoiceStatus.PAID
        self.updated_at = utc_now()


class Payment(BaseDocument):
    """Payment document model"""
    payment_id: str = Field(default_factory=lambda: generate_id("pay"))
    business_id: str
    client_id: str
    invoice_id: Optional[str] = None

    # Amount (in cents)
    amount: int
    currency: str = "usd"

    # Status
    status: PaymentStatus = PaymentStatus.PENDING
    method: PaymentMethod = PaymentMethod.CARD

    # Stripe
    stripe_payment_intent_id: Optional[str] = None
    stripe_charge_id: Optional[str] = None
    stripe_customer_id: Optional[str] = None
    stripe_payment_method_id: Optional[str] = None

    # Card details (for display only)
    card_brand: Optional[str] = None  # visa, mastercard, etc.
    card_last4: Optional[str] = None

    # Refund tracking
    refunded_amount: int = 0
    refund_reason: Optional[str] = None

    # Error
    error_message: Optional[str] = None
    error_code: Optional[str] = None

    # Processing
    processed_at: Optional[datetime] = None

    def mark_succeeded(self) -> None:
        """Mark payment as succeeded"""
        self.status = PaymentStatus.SUCCEEDED
        self.processed_at = utc_now()
        self.updated_at = utc_now()

    def mark_failed(self, error: str, code: Optional[str] = None) -> None:
        """Mark payment as failed"""
        self.status = PaymentStatus.FAILED
        self.error_message = error
        self.error_code = code
        self.updated_at = utc_now()


class StripeCustomer(BaseDocument):
    """Stripe customer mapping"""
    customer_mapping_id: str = Field(default_factory=lambda: generate_id("scm"))
    business_id: str
    client_id: str
    stripe_customer_id: str

    # Default payment method
    default_payment_method_id: Optional[str] = None
    default_card_brand: Optional[str] = None
    default_card_last4: Optional[str] = None

    # Customer email
    email: Optional[str] = None


# Request/Response schemas

class InvoiceCreate(BaseModel):
    """Schema for creating an invoice"""
    client_id: str
    issue_date: str  # YYYY-MM-DD
    due_date: str  # YYYY-MM-DD
    tax_rate: float = 0.0
    discount_percent: Optional[float] = None
    notes: Optional[str] = None
    terms: Optional[str] = None
    appointment_ids: list[str] = []

    model_config = ConfigDict(str_strip_whitespace=True)


class LineItemCreate(BaseModel):
    """Schema for adding a line item"""
    description: str
    quantity: float = 1.0
    unit_price: float  # In cents
    service_id: Optional[str] = None
    appointment_id: Optional[str] = None
    taxable: bool = True


class InvoiceResponse(BaseModel):
    """Public invoice response"""
    invoice_id: str
    business_id: str
    client_id: str
    invoice_number: str
    status: InvoiceStatus

    subtotal: int
    tax_rate: float
    tax_amount: int
    discount_amount: int
    total: int
    amount_paid: int
    amount_due: int

    line_items: list[LineItem]

    issue_date: str
    due_date: str
    paid_at: Optional[datetime] = None

    stripe_hosted_invoice_url: Optional[str] = None
    notes: Optional[str] = None

    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaymentCreate(BaseModel):
    """Schema for creating a payment"""
    client_id: str
    amount: int  # In cents
    invoice_id: Optional[str] = None
    method: PaymentMethod = PaymentMethod.CARD
    stripe_payment_method_id: Optional[str] = None

    model_config = ConfigDict(str_strip_whitespace=True)


class PaymentResponse(BaseModel):
    """Public payment response"""
    payment_id: str
    business_id: str
    client_id: str
    invoice_id: Optional[str] = None

    amount: int
    currency: str
    status: PaymentStatus
    method: PaymentMethod

    card_brand: Optional[str] = None
    card_last4: Optional[str] = None

    processed_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
