from email.message import EmailMessage

import aiosmtplib

from app.database.connection import settings

import logging
import smtplib
import ssl
from email.message import EmailMessage

from app.database.connection import settings

logger = logging.getLogger(__name__)


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
        with smtplib.SMTP(
            settings.SMTP_HOST,
            settings.SMTP_PORT,
            timeout=20
        ) as server:
            server.ehlo()
            server.starttls(context=ssl.create_default_context())
            server.ehlo()

            server.login(
                settings.SMTP_USERNAME,
                settings.SMTP_PASSWORD
            )

            server.send_message(email)

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

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20) as server:
        server.ehlo()
        server.starttls(context=ssl.create_default_context())
        server.ehlo()
        server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        server.send_message(email)

    logger.info("Customer payment reminder sent for invoice %s", number)
