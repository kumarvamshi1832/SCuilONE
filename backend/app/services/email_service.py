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


def is_email_service_configured() -> bool:
    return bool(
        settings.SMTP_HOST
        and settings.SMTP_PORT
        and settings.SMTP_USERNAME
        and settings.SMTP_PASSWORD
    )


async def send_user_invitation_email(
    recipient_email: str,
    full_name: str,
    invitation_token: str
):
    from urllib.parse import quote
    import email.utils

    logger.info("Invitation requested for: %s", recipient_email)
    logger.info("Invitation token generated: YES")

    if not is_email_service_configured():
        logger.error(
            "Email service initialized: NO - Missing SMTP configuration (host=%s, port=%s, user_present=%s)",
            settings.SMTP_HOST,
            settings.SMTP_PORT,
            bool(settings.SMTP_USERNAME),
        )
        raise RuntimeError("The user could not be invited because the email service is not configured.")

    logger.info("Email service initialized: YES")

    invitation_url = (
        f"{settings.FRONTEND_URL.rstrip('/')}"
        f"/set-password?token={quote(invitation_token)}"
    )

    logger.info("Attempting to send invitation email")
    print(f"[INVITATION URL] {recipient_email}: {invitation_url}", flush=True)

    sender_email = (
        settings.SMTP_FROM_EMAIL
        if (settings.SMTP_FROM_EMAIL and settings.SMTP_FROM_EMAIL != "your-sender-email@example.com")
        else (settings.SMTP_USERNAME or "no-reply@scuilone.com")
    )

    message = EmailMessage()
    message["From"] = f"SCuilONE CRM <{sender_email}>"
    message["To"] = recipient_email
    message["Reply-To"] = sender_email
    message["Subject"] = "Welcome to SCuilONE CRM - Set Up Your Password"
    message["Date"] = email.utils.formatdate(localtime=True)
    message["Message-ID"] = email.utils.make_msgid(domain="scuilone.com")

    # Plain text version
    plain_content = f"""Welcome to SCuilONE CRM

Hello {full_name},

You have been invited to join your organization's CRM workspace on SCuilONE.

Use the link below to set your password and complete your account setup:
{invitation_url}

This invitation link expires in 24 hours and can only be used once.

If you did not expect this invitation, you can safely ignore this email.

Regards,
SCuilONE Team
"""
    message.set_content(plain_content)

    # Rich HTML version with SCuilONE branding
    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to SCuilONE CRM</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f6fb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f6fb; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 540px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(15,23,42,0.06);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 26px 32px; text-align: left;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width: 36px; height: 36px; background: #2563eb; border-radius: 8px; text-align: center; color: #ffffff; font-weight: bold; font-size: 18px; line-height: 36px;">S</td>
                  <td style="padding-left: 12px; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.02em;">SCuilONE <span style="font-size: 12px; font-weight: 600; color: #38bdf8; background: rgba(56, 189, 248, 0.15); padding: 2px 8px; border-radius: 4px; margin-left: 6px;">CRM</span></td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Content Body -->
          <tr>
            <td style="padding: 32px 32px 24px 32px;">
              <h2 style="margin: 0 0 12px 0; color: #0f172a; font-size: 20px; font-weight: 700;">Welcome to SCuilONE CRM</h2>
              <p style="margin: 0 0 16px 0; color: #475569; font-size: 15px; line-height: 1.6;">Hello <strong>{full_name}</strong>,</p>
              <p style="margin: 0 0 24px 0; color: #475569; font-size: 15px; line-height: 1.6;">You have been invited to join your organization's CRM workspace. Click the button below to set your password and complete your account setup.</p>
              
              <div style="text-align: center; margin: 32px 0;">
                <a href="{invitation_url}" style="display: inline-block; background: linear-gradient(90deg, #0284c7 0%, #2563eb 100%); color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 13px 32px; border-radius: 8px; box-shadow: 0 4px 12px rgba(37,99,235,0.25);">Set Password</a>
              </div>

              <p style="margin: 0 0 8px 0; color: #64748b; font-size: 13px; line-height: 1.5;">If the button does not open, copy and paste this link into your browser:</p>
              <p style="margin: 0 0 24px 0; word-break: break-all;"><a href="{invitation_url}" style="color: #2563eb; font-size: 13px;">{invitation_url}</a></p>

              <div style="padding: 12px 16px; background-color: #f8fafc; border-left: 3px solid #0284c7; border-radius: 4px;">
                <p style="margin: 0; color: #64748b; font-size: 12px; line-height: 1.5;">This invitation link expires in <strong>24 hours</strong> and can only be used once.</p>
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; color: #94a3b8; font-size: 12px; line-height: 1.5;">If you did not expect this invitation, you can safely ignore this email.</p>
              <p style="margin: 6px 0 0 0; color: #94a3b8; font-size: 12px;">&copy; SCuilONE CRM. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""
    message.add_alternative(html_content, subtype="html")

    try:
        await aiosmtplib.send(
            message,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USERNAME,
            password=settings.SMTP_PASSWORD,
            start_tls=True,
            timeout=20,
        )
        logger.info("Email provider response: SUCCESS")
    except Exception as exc:
        logger.error("Email provider response: FAILURE - %s", str(exc))
        raise

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
