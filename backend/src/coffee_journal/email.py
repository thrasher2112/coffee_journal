"""Email sending for magic link authentication."""
from __future__ import annotations

import html
import logging

from .config import settings

logger = logging.getLogger(__name__)


def send_magic_link_email(to_email: str, token: str) -> None:
    """Send a magic link email to the user.

    Uses Resend when RESEND_API_KEY is configured, otherwise logs to console.
    """
    verify_url = f"{settings.frontend_url.rstrip('/')}/auth/verify?token={token}"

    if not settings.resend_api_key:
        logger.info("Magic link for %s: %s", to_email, verify_url)
        print(f"\n{'='*60}")
        print(f"  Magic Link for {to_email}")
        print(f"  {verify_url}")
        print(f"{'='*60}\n")
        return

    import resend

    resend.api_key = settings.resend_api_key
    safe_url = html.escape(verify_url)
    resend.Emails.send(
        {
            "from": "Coffee Journal <noreply@updates.coffeejournal.app>",
            "to": [to_email],
            "subject": "Sign in to Coffee Journal",
            "html": (
                f"<p>Click the link below to sign in to your Coffee Journal:</p>"
                f'<p><a href="{safe_url}">Sign in to Coffee Journal</a></p>'
                f"<p>This link expires in {settings.magic_link_expiry_minutes} minutes "
                f"and can only be used once.</p>"
                f"<p>If you didn't request this, you can safely ignore this email.</p>"
            ),
        }
    )
