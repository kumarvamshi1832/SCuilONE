from email.message import EmailMessage
import logging
import os
import smtplib
import ssl
from typing import Callable

import aiosmtplib

from app.database.connection import settings

logger = logging.getLogger(__name__)

# In-memory outbox for inspection in tests and audit verification
SENT_EMAIL_OUTBOX: list[dict] = []
_CUSTOM_SENDER_HOOK: Callable[[EmailMessage], None] | None = None


def set_email_sender_hook(hook: Callable[[EmailMessage], None] | None) -> None:
    """Optional test hook to intercept or simulate SMTP failures during tests."""
    global _CUSTOM_SENDER_HOOK
    _CUSTOM_SENDER_HOOK = hook


def _deliver_smtp_message(email: EmailMessage, metadata: dict | None = None) -> None:
    """Deliver an EmailMessage via Brevo SMTP (or custom hook / test capture)."""
    import time as _time
    started = _time.monotonic()
    is_alert_email = bool(metadata and metadata.get("type") == "technical_incident_alert")
    try:
        if _CUSTOM_SENDER_HOOK is not None:
            _CUSTOM_SENDER_HOOK(email)
        elif os.environ.get("SCUILONE_DISABLE_LIVE_SMTP", "").strip().lower() in {"1", "true", "yes"}:
            logger.info("Live SMTP disabled via SCUILONE_DISABLE_LIVE_SMTP; captured email to %s", email["To"])
        else:
            with smtplib.SMTP(
                settings.SMTP_HOST,
                settings.SMTP_PORT,
                timeout=20,
            ) as server:
                server.ehlo()
                server.starttls(context=ssl.create_default_context())
                server.ehlo()
                server.login(
                    settings.SMTP_USERNAME,
                    settings.SMTP_PASSWORD,
                )
                server.send_message(email)
        if not is_alert_email:
            try:
                from app.services.monitoring_service import record_email_operation
                record_email_operation(
                    success=True,
                    latency_ms=(_time.monotonic() - started) * 1000.0,
                    recipient=str(email["To"]),
                )
            except Exception:
                pass
    except Exception as exc:
        if not is_alert_email:
            try:
                from app.services.monitoring_service import record_email_operation
                record_email_operation(
                    success=False,
                    latency_ms=(_time.monotonic() - started) * 1000.0,
                    error=exc,
                    recipient=str(email["To"]),
                )
            except Exception:
                pass
        raise

    SENT_EMAIL_OUTBOX.append(
        {
            "to": str(email["To"]),
            "from": str(email["From"]),
            "subject": str(email["Subject"]),
            "body": email.get_body(preferencelist=("plain",)).get_content()
            if email.get_body(preferencelist=("plain",))
            else email.get_content(),
            "html": email.get_body(preferencelist=("html",)).get_content()
            if email.get_body(preferencelist=("html",))
            else None,
            "metadata": metadata or {},
        }
    )


async def send_otp_email(
    recipient_email: str,
    otp: str
):
    message = EmailMessage()

    message["From"] = settings.SMTP_FROM_EMAIL
    message["To"] = recipient_email
    message["Subject"] = "SCuilONE Email Verification"

    message.set_content(
        f"""
Hello,

Your SCuilONE verification OTP is:

{otp}

This OTP is valid for 10 minutes.

If you did not request this registration, please ignore this email.

Regards,
SCuilONE Team
"""
    )

    if _CUSTOM_SENDER_HOOK is not None or os.environ.get("SCUILONE_DISABLE_LIVE_SMTP", "").strip().lower() in {"1", "true", "yes"}:
        _deliver_smtp_message(message, {"type": "otp", "otp": otp})
        return

    await aiosmtplib.send(
        message,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USERNAME,
        password=settings.SMTP_PASSWORD,
        start_tls=True
    )


async def send_user_invitation_email(
    recipient_email: str,
    full_name: str,
    invitation_token: str
):
    from urllib.parse import quote

    invitation_url = (
        f"{settings.FRONTEND_URL.rstrip('/')}"
        f"/accept-invitation?token={quote(invitation_token)}"
    )

    message = EmailMessage()
    message["From"] = settings.SMTP_FROM_EMAIL
    message["To"] = recipient_email
    message["Subject"] = "You're invited to SCuilONE"

    message.set_content(
        f"""Hello {full_name},

You have been invited to join SCuilONE.

Use the secure link below to set your password and begin account setup:

{invitation_url}

This invitation expires in 24 hours and can only be used once.

If you were not expecting this invitation, please ignore this email.

Regards,
SCuilONE Team
"""
    )

    if _CUSTOM_SENDER_HOOK is not None or os.environ.get("SCUILONE_DISABLE_LIVE_SMTP", "").strip().lower() in {"1", "true", "yes"}:
        _deliver_smtp_message(message, {"type": "user_invitation", "invitation_url": invitation_url})
        return

    await aiosmtplib.send(
        message,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USERNAME,
        password=settings.SMTP_PASSWORD,
        start_tls=True
    )


def send_notification_email(
    recipient_email: str,
    title: str,
    message_text: str
) -> None:
    logger.info(
        "NOTIFICATION EMAIL FUNCTION CALLED: recipient=%s, title=%s",
        recipient_email,
        title,
    )
    if not recipient_email:
        logger.warning(
            "Notification email skipped: recipient email is missing."
        )
        return

    email = EmailMessage()
    email["From"] = settings.SMTP_FROM_EMAIL
    email["To"] = recipient_email
    email["Subject"] = f"SCuilONE: {title}"

    email.set_content(
        f"""Hello,

{message_text}

Please log in to SCuilONE to view the details.

Regards,
SCuilONE Team
"""
    )

    try:
        _deliver_smtp_message(email, {"type": "notification", "title": title})
        logger.info(
            "Notification email sent to %s",
            recipient_email
        )

    except Exception:
        logger.exception(
            "Failed to send notification email to %s",
            recipient_email
        )
        raise


async def send_customer_portal_invitation_email(
    recipient_email: str, full_name: str, invitation_token: str, tenant_id: str
):
    from urllib.parse import quote

    invitation_url = (
        f"{settings.FRONTEND_URL.rstrip('/')}"
        f"/customer-portal/activate?token={quote(invitation_token)}&tenant_id={quote(tenant_id)}"
    )
    message = EmailMessage()
    message["From"] = settings.SMTP_FROM_EMAIL
    message["To"] = recipient_email
    message["Subject"] = "Your SCuilONE customer portal invitation"
    message.set_content(
        f"Hello {full_name},\n\n"
        "You have been invited to access your company’s SCuilONE customer support portal.\n\n"
        "Activate your account using this one-time link (expires in 48 hours):\n"
        f"{invitation_url}\n\n"
        "If you were not expecting this invitation, please ignore this email.\n\n"
        "Regards,\nSCuilONE Team\n"
    )
    if _CUSTOM_SENDER_HOOK is not None or os.environ.get("SCUILONE_DISABLE_LIVE_SMTP", "").strip().lower() in {"1", "true", "yes"}:
        _deliver_smtp_message(message, {"type": "portal_invitation"})
        return

    await aiosmtplib.send(
        message, hostname=settings.SMTP_HOST, port=settings.SMTP_PORT,
        username=settings.SMTP_USERNAME, password=settings.SMTP_PASSWORD, start_tls=True
    )


async def send_customer_portal_password_reset_email(
    recipient_email: str, full_name: str, reset_token: str, tenant_id: str
):
    from urllib.parse import quote

    reset_url = (
        f"{settings.FRONTEND_URL.rstrip('/')}"
        f"/customer-portal/reset-password?token={quote(reset_token)}&tenant_id={quote(tenant_id)}"
    )
    message = EmailMessage()
    message["From"] = settings.SMTP_FROM_EMAIL
    message["To"] = recipient_email
    message["Subject"] = "Reset your SCuilONE customer portal password"
    message.set_content(
        f"Hello {full_name},\n\n"
        "We received a request to reset your SCuilONE customer portal password.\n\n"
        "Reset your password using this one-time link (expires in 1 hour):\n"
        f"{reset_url}\n\n"
        "If you did not request a password reset, you can safely ignore this email.\n\n"
        "Regards,\nSCuilONE Team\n"
    )
    if _CUSTOM_SENDER_HOOK is not None or os.environ.get("SCUILONE_DISABLE_LIVE_SMTP", "").strip().lower() in {"1", "true", "yes"}:
        _deliver_smtp_message(message, {"type": "portal_password_reset"})
        return

    await aiosmtplib.send(
        message, hostname=settings.SMTP_HOST, port=settings.SMTP_PORT,
        username=settings.SMTP_USERNAME, password=settings.SMTP_PASSWORD, start_tls=True
    )


def _clean_header_text(value: str, limit: int = 120) -> str:
    """Remove control characters so user-entered text can never break a header."""
    return "".join(ch for ch in str(value) if ch.isprintable())[:limit].strip()


def send_customer_payment_reminder_email(
    recipient_email: str,
    customer_name: str,
    business_name: str,
    invoice_number: str,
    outstanding_amount: str,
    currency: str,
    due_date: str,
    days_overdue: int = 0,
    reply_to: str | None = None,
) -> None:
    """Payment reminder sent to a customer on behalf of the tenant's business."""
    recipient_email = _clean_header_text(recipient_email, 254)

    if not recipient_email or "@" not in recipient_email or " " in recipient_email:
        raise ValueError("Invalid customer email address")

    business = _clean_header_text(business_name, 80) or "Your service provider"
    number = _clean_header_text(invoice_number, 50)
    name = _clean_header_text(customer_name, 80) or "Customer"

    if days_overdue > 0:
        subject = f"Payment reminder: invoice {number} is overdue"
        intro = (
            f"This is a reminder that invoice {number} was due on {due_date} "
            f"and is now {days_overdue} day(s) overdue."
        )
    else:
        subject = f"Payment reminder: invoice {number} is due on {due_date}"
        intro = f"This is a friendly reminder that invoice {number} is due on {due_date}."

    email = EmailMessage()
    email["From"] = settings.SMTP_FROM_EMAIL
    email["To"] = recipient_email
    email["Subject"] = f"{business}: {subject}"

    if reply_to:
        cleaned_reply_to = _clean_header_text(reply_to, 254)
        if "@" in cleaned_reply_to and " " not in cleaned_reply_to:
            email["Reply-To"] = cleaned_reply_to

    email.set_content(
        f"""Dear {name},

{intro}

Outstanding amount: {outstanding_amount} {currency}

If you have already made this payment, please ignore this message or reply with the payment details so we can update our records.

Regards,
{business}
"""
    )

    _deliver_smtp_message(email, {"type": "customer_payment_reminder", "invoice_number": number})
    logger.info("Customer payment reminder sent for invoice %s", number)


def send_trial_or_post_trial_reminder_email(
    recipient_email: str,
    company_name: str,
    reminder_key: str,
    subject: str,
    headline: str,
    trial_expiration_date: str,
    selected_plan_name: str | None = None,
    unsubscribe_token: str | None = None,
    payment_instructions: dict | None = None,
) -> None:
    """
    Sends branded SCuilONE pre-expiration trial reminder (Days 12, 13, 14) or
    post-trial 30-day campaign email (Days 1, 3, 7, 14, 21, 30) via Brevo SMTP (PART 8 & PART 9).
    """
    clean_to = _clean_header_text(recipient_email, 254)
    if not clean_to or "@" not in clean_to or " " in clean_to:
        raise ValueError("Invalid recipient email address")

    company = _clean_header_text(company_name, 120) or "Valued Customer"
    clean_subject = _clean_header_text(subject, 180)
    base_url = (settings.FRONTEND_URL or "http://localhost:5173").rstrip("/")
    plans_url = f"{base_url}/subscription/plans"
    billing_url = f"{base_url}/subscription/billing"
    unsubscribe_url = (
        f"{base_url}/subscription/unsubscribe?token={unsubscribe_token}"
        if unsubscribe_token
        else f"{base_url}/subscription/preferences"
    )

    instr = payment_instructions or {}
    bank_summary = (
        f"Beneficiary: {instr.get('beneficiary_name', 'StaunchCuil Services Private Limited')} | "
        f"Bank: {instr.get('bank_name', 'HDFC Bank')} | "
        f"A/C: {instr.get('account_number', '50200098765432')} | "
        f"IFSC: {instr.get('ifsc_code', 'HDFC0001234')} | "
        f"UPI: {instr.get('upi_id', 'billing@scuilone')}"
    )

    plan_note = (
        f"Selected Plan: {selected_plan_name}\n"
        if selected_plan_name
        else "You can choose from Starter (INR 4,999/mo), Professional (INR 12,999/mo), Business (INR 24,999/mo), or Enterprise (INR 99,999/yr).\n"
    )

    text_body = f"""Hello {company} Team,

{headline}.

Company Name: {company}
Trial Expiration Date: {trial_expiration_date}
{plan_note}
Select or manage your subscription plan:
{plans_url}

View your invoice & submit manual payment details:
{billing_url}

Offline Payment Instructions:
{bank_summary}

All of your CRM data in SCuilONE remains safely preserved. Once your payment is verified and approved by our Platform Billing team, full CRM module access is active immediately.

To unsubscribe from trial reminder emails:
{unsubscribe_url}

Regards,
SCuilONE Billing & Customer Success Team
StaunchCuil Services Private Limited
"""

    html_body = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>{clean_subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color: #1e293b; background-color: #f8fafc; padding: 24px;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
    <div style="background: #0f172a; color: #ffffff; padding: 20px 24px;">
      <h2 style="margin: 0; font-size: 20px;">SCuilONE CRM</h2>
      <p style="margin: 4px 0 0; font-size: 13px; color: #94a3b8;">Multi-Industry SaaS CRM Platform</p>
    </div>
    <div style="padding: 24px;">
      <h3 style="margin-top: 0; color: #0f172a;">{headline}</h3>
      <p>Hello <strong>{company}</strong> Team,</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0; background: #f1f5f9; border-radius: 6px;">
        <tr>
          <td style="padding: 10px 14px; font-weight: 600;">Company</td>
          <td style="padding: 10px 14px;">{company}</td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; font-weight: 600;">Trial Expiration Date</td>
          <td style="padding: 10px 14px;">{trial_expiration_date}</td>
        </tr>
        {"<tr><td style='padding: 10px 14px; font-weight: 600;'>Selected Plan</td><td style='padding: 10px 14px;'>" + selected_plan_name + "</td></tr>" if selected_plan_name else ""}
      </table>
      <p>{plan_note}</p>
      <p style="margin: 20px 0;">
        <a href="{plans_url}" style="background: #2563eb; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-weight: 600; display: inline-block; margin-right: 10px;">Select Subscription Plan</a>
        <a href="{billing_url}" style="background: #0f172a; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-weight: 600; display: inline-block;">View Invoice &amp; Submit Payment</a>
      </p>
      <div style="background: #f8fafc; border-left: 4px solid #2563eb; padding: 12px 16px; margin: 16px 0; font-size: 13px;">
        <strong>Payment Instructions:</strong><br/>
        {bank_summary}
      </div>
      <p style="font-size: 13px; color: #475569;">
        Your existing CRM records remain safely preserved. As soon as your payment is verified and approved by Platform Billing, your subscription and plan resources are activated immediately.
      </p>
    </div>
    <div style="background: #f1f5f9; padding: 14px 24px; font-size: 12px; color: #64748b;">
      SCuilONE by StaunchCuil Services Private Limited &bull;
      <a href="{unsubscribe_url}" style="color: #475569;">Unsubscribe from trial reminders</a>
    </div>
  </div>
</body>
</html>
"""

    email = EmailMessage()
    email["From"] = settings.SMTP_FROM_EMAIL
    email["To"] = clean_to
    email["Subject"] = clean_subject
    email["List-Unsubscribe"] = f"<{unsubscribe_url}>"
    email.set_content(text_body)
    email.add_alternative(html_body, subtype="html")

    _deliver_smtp_message(
        email,
        {
            "type": "subscription_reminder",
            "reminder_key": reminder_key,
            "company_name": company,
            "trial_expiration_date": trial_expiration_date,
            "plans_url": plans_url,
            "billing_url": billing_url,
        },
    )
    logger.info(
        "Subscription reminder email (%s) sent to %s for company %s",
        reminder_key,
        clean_to,
        company,
    )


def send_subscription_activated_email(
    recipient_email: str,
    company_name: str,
    plan_name: str,
    billing_cycle: str,
    invoice_number: str,
    amount_paid: str,
    currency: str,
    starts_at: str,
    ends_at: str,
) -> None:
    """Send confirmation email when Platform Admin approves payment and activates subscription (PART 5 Req 12)."""
    clean_to = _clean_header_text(recipient_email, 254)
    if not clean_to or "@" not in clean_to:
        return

    company = _clean_header_text(company_name, 120) or "Customer"
    base_url = (settings.FRONTEND_URL or "http://localhost:5173").rstrip("/")
    dashboard_url = f"{base_url}/dashboard"
    billing_url = f"{base_url}/subscription/billing"

    subject = f"SCuilONE Subscription Activated – {plan_name} Plan ({company})"
    text_body = f"""Hello {company} Team,

Your payment for invoice {invoice_number} ({amount_paid} {currency}) has been verified and approved.
Your SCuilONE {plan_name} ({billing_cycle}) subscription is now Active!

Subscription Details:
- Company: {company}
- Plan: {plan_name} ({billing_cycle})
- Invoice Number: {invoice_number}
- Amount Paid: {amount_paid} {currency}
- Subscription Start: {starts_at}
- Renewal / End Date: {ends_at}

Access your CRM Dashboard:
{dashboard_url}

View your Subscription & Billing Portal:
{billing_url}

Thank you for choosing SCuilONE!

Regards,
SCuilONE Billing & Customer Success Team
"""

    email = EmailMessage()
    email["From"] = settings.SMTP_FROM_EMAIL
    email["To"] = clean_to
    email["Subject"] = subject
    email.set_content(text_body)

    try:
        _deliver_smtp_message(
            email,
            {
                "type": "subscription_activated",
                "company_name": company,
                "plan_name": plan_name,
                "invoice_number": invoice_number,
            },
        )
    except Exception:
        logger.exception("Failed to send subscription activation email to %s", clean_to)


def send_technical_incident_alert_email(
    recipient_email: str,
    event_kind: str,
    incident_number: str,
    title: str,
    service_name: str,
    severity: str,
    status: str,
    environment: str,
    first_occurrence_at: str,
    last_occurrence_at: str,
    occurrence_count: int,
    summary: str,
    affected_endpoint: str | None = None,
    affected_tenant_count: int = 0,
) -> None:
    """
    Sends an automatic Technical Incident / Escalation / Recovery / Reminder email
    to authorized Platform Admin and Technical employees via Brevo SMTP (Section 8).
    Never includes raw stack traces or sensitive secrets.
    """
    from app.core.monitoring_config import redact_sensitive_text

    clean_to = _clean_header_text(recipient_email, 254)
    if not clean_to or "@" not in clean_to or " " in clean_to:
        return

    safe_title = _clean_header_text(redact_sensitive_text(title, 180), 180)
    safe_summary = redact_sensitive_text(summary, 1500)
    base_url = (settings.FRONTEND_URL or "http://localhost:5173").rstrip("/")
    dashboard_url = f"{base_url}/platform/technical/health"

    kind_label = {
        "created": "NEW INCIDENT DETECTED",
        "escalated": "INCIDENT SEVERITY ESCALATED",
        "resolved": "SERVICE RECOVERED / INCIDENT RESOLVED",
        "reminder": "UNRESOLVED INCIDENT REMINDER",
    }.get(event_kind, "TECHNICAL INCIDENT ALERT")

    subject = _clean_header_text(
        f"[SCuilONE {severity.upper()}] {kind_label}: {incident_number} – {service_name}",
        200,
    )

    endpoint_line = f"Affected Endpoint: {affected_endpoint}\n" if affected_endpoint else ""
    text_body = f"""SCuilONE Platform Technical Monitoring Alert
================================================
Alert Type: {kind_label}
Incident Number: {incident_number}
Title: {safe_title}
Service Name: {service_name}
Severity: {severity}
Status: {status}
Environment: {environment}
First Occurrence (UTC): {first_occurrence_at}
Latest Occurrence (UTC): {last_occurrence_at}
Occurrence Count: {occurrence_count}
Affected Tenants Count: {affected_tenant_count}
{endpoint_line}
Summary:
{safe_summary}

Platform Admin Technical Dashboard:
{dashboard_url}

Regards,
SCuilONE Automatic Technical Monitoring Engine
"""

    email = EmailMessage()
    email["From"] = settings.SMTP_FROM_EMAIL
    email["To"] = clean_to
    email["Subject"] = subject
    email.set_content(text_body)

    _deliver_smtp_message(
        email,
        {
            "type": "technical_incident_alert",
            "event_kind": event_kind,
            "incident_number": incident_number,
            "service_name": service_name,
            "severity": severity,
            "status": status,
            "environment": environment,
            "occurrence_count": occurrence_count,
            "dashboard_url": dashboard_url,
        },
    )
    logger.info(
        "Technical incident alert email (%s) sent to %s for %s",
        event_kind,
        clean_to,
        incident_number,
    )
