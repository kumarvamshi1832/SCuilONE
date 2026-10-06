from email.message import EmailMessage

import aiosmtplib

from app.database.connection import settings


async def send_otp_email(
    recipient_email: str,
    otp: str
):

    message = EmailMessage()

    # message["From"] = settings.SMTP_USERNAME
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