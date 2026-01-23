"""
HVAC Quote PDF Generator

Generates professional PDF quotes for HVAC jobs.
Uses HTML templates converted to PDF.
"""

from datetime import datetime
from typing import Dict, Any, Optional
import io
import base64


def generate_quote_html(
    quote: Dict[str, Any],
    business: Dict[str, Any],
    client: Dict[str, Any],
    load_calc: Optional[Dict[str, Any]] = None
) -> str:
    """
    Generate HTML for a quote.

    Args:
        quote: Quote document from database
        business: Business document
        client: Client document
        load_calc: Optional load calculation document

    Returns:
        HTML string for the quote
    """
    # Format currency
    def fmt_currency(amount):
        return f"${amount:,.2f}"

    # Format date
    def fmt_date(date_str):
        if not date_str:
            return ""
        try:
            dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            return dt.strftime("%B %d, %Y")
        except:
            return date_str

    # Get tier display
    tier_display = {
        "good": "Good - Standard Efficiency",
        "better": "Better - High Efficiency",
        "best": "Best - Premium Efficiency"
    }
    tier_name = tier_display.get(quote.get("tier", "good"), quote.get("tier", ""))

    # Build line items table
    line_items_html = ""
    for item in quote.get("line_items", []):
        line_items_html += f"""
        <tr>
            <td>{item.get('description', '')}</td>
            <td class="text-center">{item.get('quantity', 1)}</td>
            <td class="text-right">{fmt_currency(item.get('unit_price', 0))}</td>
            <td class="text-right">{fmt_currency(item.get('total', 0))}</td>
        </tr>
        """

    # Load calculation section
    load_calc_html = ""
    if load_calc:
        load_calc_html = f"""
        <div class="section">
            <h3>Load Calculation Summary</h3>
            <table class="load-calc-table">
                <tr>
                    <td><strong>Square Footage:</strong></td>
                    <td>{load_calc.get('input_data', {}).get('square_footage', 'N/A'):,} sq ft</td>
                    <td><strong>Climate Zone:</strong></td>
                    <td>{load_calc.get('input_data', {}).get('climate_zone', 'N/A')}</td>
                </tr>
                <tr>
                    <td><strong>Cooling Load:</strong></td>
                    <td>{load_calc.get('cooling_btuh', 0):,} BTU/h</td>
                    <td><strong>Recommended Size:</strong></td>
                    <td>{load_calc.get('recommended_ac_tons', 0)} Ton</td>
                </tr>
                <tr>
                    <td><strong>Heating Load:</strong></td>
                    <td>{load_calc.get('heating_btuh', 0):,} BTU/h</td>
                    <td><strong>Airflow Required:</strong></td>
                    <td>{load_calc.get('cfm_required', 0):,} CFM</td>
                </tr>
            </table>
        </div>
        """

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Quote #{quote.get('quote_id', '')}</title>
        <style>
            @page {{
                size: letter;
                margin: 0.75in;
            }}
            body {{
                font-family: 'Helvetica Neue', Arial, sans-serif;
                font-size: 11pt;
                line-height: 1.4;
                color: #333;
            }}
            .header {{
                display: flex;
                justify-content: space-between;
                margin-bottom: 30px;
                padding-bottom: 20px;
                border-bottom: 2px solid #2196F3;
            }}
            .company-info {{
                flex: 1;
            }}
            .company-name {{
                font-size: 24pt;
                font-weight: bold;
                color: #2196F3;
                margin-bottom: 5px;
            }}
            .quote-info {{
                text-align: right;
            }}
            .quote-number {{
                font-size: 14pt;
                font-weight: bold;
                color: #333;
            }}
            .quote-date {{
                color: #666;
            }}
            .addresses {{
                display: flex;
                justify-content: space-between;
                margin-bottom: 30px;
            }}
            .address-block {{
                width: 45%;
            }}
            .address-block h4 {{
                color: #2196F3;
                margin-bottom: 5px;
                font-size: 10pt;
                text-transform: uppercase;
            }}
            .section {{
                margin-bottom: 25px;
            }}
            .section h3 {{
                color: #2196F3;
                border-bottom: 1px solid #ddd;
                padding-bottom: 5px;
                margin-bottom: 15px;
            }}
            table {{
                width: 100%;
                border-collapse: collapse;
            }}
            .line-items-table th {{
                background-color: #2196F3;
                color: white;
                padding: 10px;
                text-align: left;
                font-size: 10pt;
            }}
            .line-items-table td {{
                padding: 10px;
                border-bottom: 1px solid #eee;
            }}
            .line-items-table tr:nth-child(even) {{
                background-color: #f9f9f9;
            }}
            .text-right {{
                text-align: right;
            }}
            .text-center {{
                text-align: center;
            }}
            .totals-table {{
                width: 300px;
                margin-left: auto;
                margin-top: 20px;
            }}
            .totals-table td {{
                padding: 8px;
            }}
            .totals-table .total-row {{
                font-size: 14pt;
                font-weight: bold;
                border-top: 2px solid #2196F3;
            }}
            .totals-table .total-row td {{
                color: #2196F3;
            }}
            .load-calc-table td {{
                padding: 5px 10px;
            }}
            .tier-badge {{
                display: inline-block;
                padding: 5px 15px;
                background-color: #2196F3;
                color: white;
                border-radius: 20px;
                font-size: 10pt;
                margin-bottom: 15px;
            }}
            .notes {{
                background-color: #f5f5f5;
                padding: 15px;
                border-radius: 5px;
                margin-top: 20px;
            }}
            .terms {{
                margin-top: 30px;
                padding-top: 20px;
                border-top: 1px solid #ddd;
                font-size: 9pt;
                color: #666;
            }}
            .signature-section {{
                margin-top: 40px;
                display: flex;
                justify-content: space-between;
            }}
            .signature-block {{
                width: 45%;
            }}
            .signature-line {{
                border-bottom: 1px solid #333;
                margin-top: 40px;
                margin-bottom: 5px;
            }}
            .footer {{
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                text-align: center;
                font-size: 9pt;
                color: #999;
                padding: 10px;
            }}
            .valid-until {{
                background-color: #fff3cd;
                padding: 10px 15px;
                border-radius: 5px;
                margin-top: 15px;
                font-weight: bold;
            }}
        </style>
    </head>
    <body>
        <div class="header">
            <div class="company-info">
                <div class="company-name">{business.get('name', 'HVAC Company')}</div>
                <div>{business.get('address_line1', '')}</div>
                <div>{business.get('city', '')}, {business.get('state', '')} {business.get('zip_code', '')}</div>
                <div>Phone: {business.get('phone', '')}</div>
                <div>Email: {business.get('email', '')}</div>
            </div>
            <div class="quote-info">
                <div class="quote-number">QUOTE #{quote.get('quote_id', '').upper()}</div>
                <div class="quote-date">Date: {fmt_date(quote.get('created_at'))}</div>
                <div class="valid-until">Valid Until: {fmt_date(quote.get('expires_at'))}</div>
            </div>
        </div>

        <div class="addresses">
            <div class="address-block">
                <h4>Prepared For</h4>
                <strong>{client.get('first_name', '')} {client.get('last_name', '')}</strong><br>
                {client.get('address_line1', '')}<br>
                {client.get('city', '')}, {client.get('state', '')} {client.get('zip_code', '')}<br>
                Phone: {client.get('phone', '')}<br>
                Email: {client.get('email', '')}
            </div>
            <div class="address-block">
                <h4>Service Location</h4>
                {client.get('address_line1', '')}<br>
                {client.get('city', '')}, {client.get('state', '')} {client.get('zip_code', '')}
            </div>
        </div>

        <div class="section">
            <h3>Proposal Details</h3>
            <span class="tier-badge">{tier_name}</span>
            <p>{quote.get('description', 'HVAC System Installation')}</p>
        </div>

        {load_calc_html}

        <div class="section">
            <h3>Pricing</h3>
            <table class="line-items-table">
                <thead>
                    <tr>
                        <th style="width: 50%">Description</th>
                        <th style="width: 10%" class="text-center">Qty</th>
                        <th style="width: 20%" class="text-right">Unit Price</th>
                        <th style="width: 20%" class="text-right">Total</th>
                    </tr>
                </thead>
                <tbody>
                    {line_items_html}
                </tbody>
            </table>

            <table class="totals-table">
                <tr>
                    <td>Subtotal:</td>
                    <td class="text-right">{fmt_currency(quote.get('subtotal', 0))}</td>
                </tr>
                <tr>
                    <td>Tax ({quote.get('tax_rate', 0)}%):</td>
                    <td class="text-right">{fmt_currency(quote.get('tax', 0))}</td>
                </tr>
                <tr class="total-row">
                    <td>TOTAL:</td>
                    <td class="text-right">{fmt_currency(quote.get('total', 0))}</td>
                </tr>
            </table>
        </div>

        {"<div class='notes'><strong>Notes:</strong><br>" + quote.get('notes', '') + "</div>" if quote.get('notes') else ""}

        <div class="terms">
            <h4>Terms & Conditions</h4>
            <ul>
                <li>Quote valid for 30 days from date of issue</li>
                <li>50% deposit required to schedule installation</li>
                <li>Balance due upon completion</li>
                <li>All equipment includes manufacturer warranty</li>
                <li>Permits and inspections included where noted</li>
                <li>Price subject to change if job scope changes</li>
            </ul>
        </div>

        <div class="signature-section">
            <div class="signature-block">
                <div class="signature-line"></div>
                <div>Customer Signature</div>
                <div style="margin-top: 5px; font-size: 9pt;">Date: _______________</div>
            </div>
            <div class="signature-block">
                <div class="signature-line"></div>
                <div>Company Representative</div>
                <div style="margin-top: 5px; font-size: 9pt;">Date: _______________</div>
            </div>
        </div>

        <div class="footer">
            {business.get('name', '')} | {business.get('phone', '')} | {business.get('email', '')}
        </div>
    </body>
    </html>
    """

    return html


async def generate_quote_pdf(
    quote: Dict[str, Any],
    business: Dict[str, Any],
    client: Dict[str, Any],
    load_calc: Optional[Dict[str, Any]] = None
) -> bytes:
    """
    Generate PDF bytes for a quote.

    Args:
        quote: Quote document from database
        business: Business document
        client: Client document
        load_calc: Optional load calculation document

    Returns:
        PDF file as bytes
    """
    html = generate_quote_html(quote, business, client, load_calc)

    try:
        # Try using weasyprint if available
        from weasyprint import HTML
        pdf_bytes = HTML(string=html).write_pdf()
        return pdf_bytes
    except ImportError:
        # Fallback: return HTML with instructions
        # In production, you'd want weasyprint installed
        html_with_note = f"""
        <!--
        PDF Generation requires weasyprint package.
        Install with: pip install weasyprint

        For now, this HTML can be printed to PDF from a browser.
        -->
        {html}
        """
        return html_with_note.encode('utf-8')


def quote_to_base64_pdf(pdf_bytes: bytes) -> str:
    """Convert PDF bytes to base64 string for API response."""
    return base64.b64encode(pdf_bytes).decode('utf-8')
