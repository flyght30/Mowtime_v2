"""
Purchase Order PDF Generation Service
Generate professional PDF documents for purchase orders
"""

import io
import logging
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

# Optional WeasyPrint import for PDF generation
try:
    from weasyprint import HTML, CSS
    WEASYPRINT_AVAILABLE = True
except ImportError:
    WEASYPRINT_AVAILABLE = False
    logger.warning("WeasyPrint not installed - PDF generation will not be available")


class POPdfService:
    """Service for generating Purchase Order PDFs"""

    def generate_po_pdf(
        self,
        po: dict,
        distributor: dict,
        business: dict
    ) -> bytes:
        """
        Generate a PDF for a purchase order.

        Args:
            po: Purchase order data
            distributor: Distributor data
            business: Business data

        Returns:
            PDF bytes
        """
        if not WEASYPRINT_AVAILABLE:
            raise RuntimeError("WeasyPrint is not installed. Install with: pip install weasyprint")

        html_content = self._render_po_html(po, distributor, business)
        css = self._get_css()

        html = HTML(string=html_content)
        pdf_bytes = html.write_pdf(stylesheets=[CSS(string=css)])

        return pdf_bytes

    def _format_currency(self, value: float) -> str:
        """Format currency value"""
        return f"${value:,.2f}"

    def _format_date(self, date_value) -> str:
        """Format date value"""
        if isinstance(date_value, str):
            try:
                date_value = datetime.fromisoformat(date_value.replace('Z', '+00:00'))
            except:
                return date_value
        if isinstance(date_value, datetime):
            return date_value.strftime("%B %d, %Y")
        return str(date_value) if date_value else ""

    def _render_po_html(self, po: dict, distributor: dict, business: dict) -> str:
        """Render PO as HTML"""
        # Build line items rows
        items_html = ""
        for idx, item in enumerate(po.get("items", []), 1):
            qty = item.get("quantity_ordered", 0)
            unit_cost = item.get("unit_cost", 0)
            total = qty * unit_cost
            items_html += f"""
            <tr>
                <td>{idx}</td>
                <td>{item.get('part_number', '')}</td>
                <td>{item.get('description', '')}</td>
                <td class="right">{qty} {item.get('unit', 'ea')}</td>
                <td class="right">{self._format_currency(unit_cost)}</td>
                <td class="right">{self._format_currency(total)}</td>
            </tr>
            """

        # Ship to address
        ship_to = ""
        if po.get("ship_to_address"):
            ship_to = f"""
            <div class="ship-to">
                <h3>Ship To:</h3>
                <p>{po.get('ship_to_name', '')}</p>
                <p>{po.get('ship_to_address', '')}</p>
                {f"<p>Phone: {po.get('ship_to_phone')}</p>" if po.get('ship_to_phone') else ""}
            </div>
            """

        # Delivery instructions
        delivery_instructions = ""
        if po.get("delivery_instructions"):
            delivery_instructions = f"""
            <div class="instructions">
                <strong>Delivery Instructions:</strong>
                <p>{po.get('delivery_instructions')}</p>
            </div>
            """

        # Notes
        notes = ""
        if po.get("notes"):
            notes = f"""
            <div class="notes">
                <strong>Notes:</strong>
                <p>{po.get('notes')}</p>
            </div>
            """

        # Expected delivery
        expected_delivery = ""
        if po.get("expected_delivery"):
            expected_delivery = f"""
            <p><strong>Expected Delivery:</strong> {self._format_date(po.get('expected_delivery'))}</p>
            """

        # Job reference
        job_ref = ""
        if po.get("job_id"):
            job_ref = f"""
            <p><strong>Job Reference:</strong> {po.get('job_id', '')[:8].upper()}</p>
            {f"<p><strong>Job Address:</strong> {po.get('job_address')}</p>" if po.get('job_address') else ""}
            """

        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Purchase Order {po.get('po_number', '')}</title>
        </head>
        <body>
            <div class="header">
                <div class="company-info">
                    <h1>{business.get('name', 'Company Name')}</h1>
                    <p>{business.get('address', '')}</p>
                    <p>{business.get('city', '')}, {business.get('state', '')} {business.get('zip_code', '')}</p>
                    <p>Phone: {business.get('phone', '')}</p>
                    <p>Email: {business.get('email', '')}</p>
                </div>
                <div class="po-info">
                    <h2>PURCHASE ORDER</h2>
                    <p class="po-number">{po.get('po_number', '')}</p>
                    <p><strong>Date:</strong> {self._format_date(po.get('created_at', datetime.utcnow()))}</p>
                    <p><strong>Status:</strong> {po.get('status', '').replace('_', ' ').title()}</p>
                </div>
            </div>

            <div class="addresses">
                <div class="vendor">
                    <h3>Vendor:</h3>
                    <p><strong>{distributor.get('name', '')}</strong></p>
                    {f"<p>Attn: {distributor.get('contact_name')}</p>" if distributor.get('contact_name') else ""}
                    <p>{distributor.get('address', '')}</p>
                    <p>{distributor.get('city', '')}, {distributor.get('state', '')} {distributor.get('zip_code', '')}</p>
                    {f"<p>Phone: {distributor.get('phone')}</p>" if distributor.get('phone') else ""}
                    {f"<p>Email: {distributor.get('email')}</p>" if distributor.get('email') else ""}
                    {f"<p>Account #: {distributor.get('account_number')}</p>" if distributor.get('account_number') else ""}
                </div>
                {ship_to}
            </div>

            {job_ref}
            {expected_delivery}

            <table class="items">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Part Number</th>
                        <th>Description</th>
                        <th class="right">Qty</th>
                        <th class="right">Unit Price</th>
                        <th class="right">Total</th>
                    </tr>
                </thead>
                <tbody>
                    {items_html}
                </tbody>
            </table>

            <div class="totals">
                <table>
                    <tr>
                        <td>Subtotal:</td>
                        <td>{self._format_currency(po.get('subtotal', 0))}</td>
                    </tr>
                    {f"<tr><td>Tax ({po.get('tax_rate', 0)}%):</td><td>{self._format_currency(po.get('tax', 0))}</td></tr>" if po.get('tax', 0) > 0 else ""}
                    {f"<tr><td>Shipping:</td><td>{self._format_currency(po.get('shipping', 0))}</td></tr>" if po.get('shipping', 0) > 0 else ""}
                    <tr class="total-row">
                        <td><strong>Total:</strong></td>
                        <td><strong>{self._format_currency(po.get('total', 0))}</strong></td>
                    </tr>
                </table>
            </div>

            {delivery_instructions}
            {notes}

            <div class="footer">
                <p>Please reference PO # {po.get('po_number', '')} on all correspondence and invoices.</p>
                <p>Generated on {datetime.utcnow().strftime('%B %d, %Y at %I:%M %p')} UTC</p>
            </div>
        </body>
        </html>
        """

        return html

    def _get_css(self) -> str:
        """Get CSS for PDF styling"""
        return """
        @page {
            size: letter;
            margin: 0.75in;
        }

        body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            font-size: 10pt;
            line-height: 1.4;
            color: #333;
        }

        .header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #4CAF50;
        }

        .company-info h1 {
            margin: 0 0 10px 0;
            color: #4CAF50;
            font-size: 18pt;
        }

        .company-info p {
            margin: 2px 0;
            color: #666;
        }

        .po-info {
            text-align: right;
        }

        .po-info h2 {
            margin: 0;
            color: #333;
            font-size: 16pt;
        }

        .po-info .po-number {
            font-size: 14pt;
            font-weight: bold;
            color: #4CAF50;
            margin: 5px 0;
        }

        .po-info p {
            margin: 3px 0;
        }

        .addresses {
            display: flex;
            justify-content: space-between;
            margin-bottom: 20px;
        }

        .vendor, .ship-to {
            width: 45%;
        }

        .vendor h3, .ship-to h3 {
            margin: 0 0 10px 0;
            padding-bottom: 5px;
            border-bottom: 1px solid #ddd;
            color: #555;
            font-size: 11pt;
        }

        .vendor p, .ship-to p {
            margin: 3px 0;
        }

        table.items {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }

        table.items th {
            background-color: #4CAF50;
            color: white;
            padding: 10px 8px;
            text-align: left;
            font-weight: 600;
        }

        table.items th.right,
        table.items td.right {
            text-align: right;
        }

        table.items td {
            padding: 8px;
            border-bottom: 1px solid #ddd;
        }

        table.items tbody tr:nth-child(even) {
            background-color: #f9f9f9;
        }

        .totals {
            margin-top: 20px;
            display: flex;
            justify-content: flex-end;
        }

        .totals table {
            width: 250px;
        }

        .totals td {
            padding: 5px 10px;
        }

        .totals td:first-child {
            text-align: right;
        }

        .totals td:last-child {
            text-align: right;
            width: 100px;
        }

        .totals .total-row {
            border-top: 2px solid #4CAF50;
            font-size: 12pt;
        }

        .instructions, .notes {
            margin: 20px 0;
            padding: 15px;
            background-color: #f5f5f5;
            border-radius: 4px;
        }

        .instructions strong, .notes strong {
            display: block;
            margin-bottom: 5px;
            color: #555;
        }

        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            text-align: center;
            color: #888;
            font-size: 9pt;
        }

        .footer p {
            margin: 5px 0;
        }
        """


# Singleton
_po_pdf_service: Optional[POPdfService] = None


def get_po_pdf_service() -> POPdfService:
    """Get PO PDF service singleton"""
    global _po_pdf_service
    if _po_pdf_service is None:
        _po_pdf_service = POPdfService()
    return _po_pdf_service
