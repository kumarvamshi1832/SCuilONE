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
