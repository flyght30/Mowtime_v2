"""
Email Templates
HTML email templates for transactional emails
"""

from typing import Optional


def render_base_template(title: str, content: str, footer_text: str = "") -> str:
    """Render base HTML email template"""
    return f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #f5f5f5;
        }}
        .container {{
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }}
        .card {{
            background-color: #ffffff;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }}
        .header {{
            padding: 24px;
            text-align: center;
        }}
        .header h1 {{
            margin: 0;
            font-size: 24px;
            font-weight: 600;
        }}
        .body {{
            padding: 24px;
        }}
        .info-box {{
            background-color: #f8f9fa;
            border-radius: 8px;
            padding: 16px;
            margin: 16px 0;
        }}
        .info-row {{
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #e9ecef;
        }}
        .info-row:last-child {{
            border-bottom: none;
        }}
        .info-label {{
            font-weight: 500;
            color: #6c757d;
        }}
        .info-value {{
            font-weight: 600;
            color: #212529;
        }}
        .btn {{
            display: inline-block;
            padding: 12px 24px;
            font-size: 16px;
            font-weight: 600;
            text-decoration: none;
            border-radius: 6px;
            text-align: center;
        }}
        .btn-primary {{
            background-color: #4CAF50;
            color: #ffffff !important;
        }}
        .btn-secondary {{
            background-color: #6c757d;
            color: #ffffff !important;
        }}
        .footer {{
            text-align: center;
            padding: 24px;
            color: #6c757d;
            font-size: 14px;
        }}
        .amount {{
            font-size: 28px;
            font-weight: 700;
            color: #212529;
        }}
        .success-header {{
            background-color: #4CAF50;
            color: #ffffff;
        }}
        .info-header {{
            background-color: #2196F3;
            color: #ffffff;
        }}
        .warning-header {{
            background-color: #FF9800;
            color: #ffffff;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="card">
            {content}
        </div>
        <div class="footer">
            {footer_text}
            <p style="margin-top: 8px; font-size: 12px; color: #adb5bd;">
                This email was sent via ServicePro
            </p>
        </div>
    </div>
</body>
</html>
"""


def render_booking_confirmation(
    client_name: str,
    business_name: str,
    service_name: str,
    scheduled_date: str,
    scheduled_time: str,
    confirmation_number: str,
    address: str,
    total_price: float,
    business_phone: str,
    business_email: str
) -> str:
    """Render booking confirmation email"""
    content = f"""
        <div class="header success-header">
            <h1>Booking Confirmed!</h1>
        </div>
        <div class="body">
            <p>Hi {client_name},</p>
            <p>Great news! Your appointment has been confirmed. Here are the details:</p>

            <div class="info-box">
                <div class="info-row">
                    <span class="info-label">Confirmation #</span>
                    <span class="info-value">{confirmation_number}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Service</span>
                    <span class="info-value">{service_name}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Date</span>
                    <span class="info-value">{scheduled_date}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Time</span>
                    <span class="info-value">{scheduled_time}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Address</span>
                    <span class="info-value">{address}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Total</span>
                    <span class="info-value">${total_price:.2f}</span>
                </div>
            </div>

            <p>We'll send you a reminder before your appointment.</p>

            <p><strong>Need to make changes?</strong><br>
            Contact us at {business_phone} or reply to this email.</p>

            <p>Thank you for choosing {business_name}!</p>
        </div>
    """
    return render_base_template(
        "Booking Confirmed",
        content,
        f"Questions? Contact {business_name} at {business_phone}"
    )


def render_invoice_sent(
    client_name: str,
    business_name: str,
    invoice_number: str,
    amount_due: float,
    due_date: str,
    line_items: list,
    payment_link: Optional[str] = None,
    business_phone: str = "",
    business_email: str = ""
) -> str:
    """Render invoice sent email"""
    # Build line items HTML
    items_html = ""
    for item in line_items:
        items_html += f"""
            <div class="info-row">
                <span class="info-label">{item.get('description', 'Service')}</span>
                <span class="info-value">${item.get('total', 0):.2f}</span>
            </div>
        """

    payment_button = ""
    if payment_link:
        payment_button = f"""
            <div style="text-align: center; margin: 24px 0;">
                <a href="{payment_link}" class="btn btn-primary">Pay Now - ${amount_due:.2f}</a>
            </div>
        """

    content = f"""
        <div class="header info-header">
            <h1>Invoice #{invoice_number}</h1>
        </div>
        <div class="body">
            <p>Hi {client_name},</p>
            <p>Please find your invoice from {business_name}.</p>

            <div style="text-align: center; margin: 24px 0;">
                <div class="amount">${amount_due:.2f}</div>
                <div style="color: #6c757d; margin-top: 8px;">Due by {due_date}</div>
            </div>

            <div class="info-box">
                <div style="font-weight: 600; margin-bottom: 12px; color: #212529;">Invoice Details</div>
                {items_html}
                <div class="info-row" style="border-top: 2px solid #dee2e6; margin-top: 8px; padding-top: 12px;">
                    <span class="info-label" style="font-weight: 700;">Total Due</span>
                    <span class="info-value" style="font-weight: 700;">${amount_due:.2f}</span>
                </div>
            </div>

            {payment_button}

            <p style="color: #6c757d; font-size: 14px;">
                If you have any questions about this invoice, please contact us at {business_phone} or {business_email}.
            </p>
        </div>
    """
    return render_base_template(
        f"Invoice #{invoice_number}",
        content,
        f"Invoice from {business_name}"
    )


def render_payment_received(
    client_name: str,
    business_name: str,
    invoice_number: str,
    amount_paid: float,
    payment_date: str,
    payment_method: str = "Credit Card",
    remaining_balance: float = 0,
    business_phone: str = ""
) -> str:
    """Render payment received/thank you email"""
    balance_text = ""
    if remaining_balance > 0:
        balance_text = f"""
            <div class="info-row">
                <span class="info-label">Remaining Balance</span>
                <span class="info-value">${remaining_balance:.2f}</span>
            </div>
        """
    else:
        balance_text = """
            <div style="text-align: center; padding: 16px; background-color: #d4edda; border-radius: 6px; margin-top: 16px;">
                <span style="color: #155724; font-weight: 600;">✓ Invoice Paid in Full</span>
            </div>
        """

    content = f"""
        <div class="header success-header">
            <h1>Payment Received</h1>
        </div>
        <div class="body">
            <p>Hi {client_name},</p>
            <p>Thank you for your payment! Here's your receipt:</p>

            <div style="text-align: center; margin: 24px 0;">
                <div class="amount">${amount_paid:.2f}</div>
                <div style="color: #6c757d; margin-top: 8px;">Payment Received</div>
            </div>

            <div class="info-box">
                <div class="info-row">
                    <span class="info-label">Invoice #</span>
                    <span class="info-value">{invoice_number}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Amount Paid</span>
                    <span class="info-value">${amount_paid:.2f}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Payment Date</span>
                    <span class="info-value">{payment_date}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Payment Method</span>
                    <span class="info-value">{payment_method}</span>
                </div>
                {balance_text}
            </div>

            <p>Thank you for your business! We appreciate you choosing {business_name}.</p>
        </div>
    """
    return render_base_template(
        "Payment Received",
        content,
        f"Receipt from {business_name}"
    )


def render_password_reset(
    user_name: str,
    reset_link: str,
    expires_minutes: int = 60
) -> str:
    """Render password reset email"""
    content = f"""
        <div class="header info-header">
            <h1>Reset Your Password</h1>
        </div>
        <div class="body">
            <p>Hi {user_name},</p>
            <p>We received a request to reset your password. Click the button below to create a new password:</p>

            <div style="text-align: center; margin: 32px 0;">
                <a href="{reset_link}" class="btn btn-primary">Reset Password</a>
            </div>

            <p style="color: #6c757d; font-size: 14px;">
                This link will expire in {expires_minutes} minutes. If you didn't request this, you can safely ignore this email.
            </p>

            <p style="color: #6c757d; font-size: 14px; margin-top: 24px;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="{reset_link}" style="word-break: break-all;">{reset_link}</a>
            </p>
        </div>
    """
    return render_base_template(
        "Reset Your Password",
        content,
        "If you didn't request this, please ignore this email."
    )


def render_appointment_reminder(
    client_name: str,
    business_name: str,
    service_name: str,
    scheduled_date: str,
    scheduled_time: str,
    address: str,
    business_phone: str,
    hours_until: int = 24
) -> str:
    """Render appointment reminder email"""
    time_text = "tomorrow" if hours_until >= 20 else f"in {hours_until} hours"

    content = f"""
        <div class="header warning-header">
            <h1>Appointment Reminder</h1>
        </div>
        <div class="body">
            <p>Hi {client_name},</p>
            <p>This is a friendly reminder that your appointment is {time_text}:</p>

            <div class="info-box">
                <div class="info-row">
                    <span class="info-label">Service</span>
                    <span class="info-value">{service_name}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Date</span>
                    <span class="info-value">{scheduled_date}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Time</span>
                    <span class="info-value">{scheduled_time}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Address</span>
                    <span class="info-value">{address}</span>
                </div>
            </div>

            <p><strong>Need to reschedule?</strong><br>
            Please contact us at {business_phone} as soon as possible.</p>

            <p>We look forward to seeing you!</p>

            <p>Best regards,<br>{business_name}</p>
        </div>
    """
    return render_base_template(
        "Appointment Reminder",
        content,
        f"From {business_name}"
    )
