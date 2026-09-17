"""Shared rate limiter instance."""

from slowapi import Limiter
from starlette.requests import Request

from .config import settings


def _get_real_ip(request: Request) -> str:
    """Client identity for rate limiting.

    Read from the RIGHT of X-Forwarded-For. Proxies append to that header, so
    the rightmost entries are the ones our own infrastructure added and
    everything to their left is whatever the caller chose to send.

    Reading the leftmost entry - as this used to - let any caller set
    `X-Forwarded-For: <anything>` and mint a fresh rate-limit bucket per
    request, making every @limiter.limit in the app decorative. It matters most
    on POST /api/auth/magic-link, where the limit is the only thing stopping
    someone using this app to send unlimited mail to an address of their
    choosing.

    The header is ignored entirely unless TRUSTED_PROXY_HOPS says how many
    proxies actually sit in front, because when the app is reachable directly
    the header is pure attacker input. Default 0 = trust nothing.
    """
    hop_count = settings.trusted_proxy_hops
    if hop_count > 0:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            hops = [hop.strip() for hop in forwarded.split(",") if hop.strip()]
            # Too few hops means the header did not come through the expected
            # proxy chain, so none of it is trustworthy.
            if len(hops) >= hop_count:
                return hops[-hop_count]
    return request.client.host if request.client else "127.0.0.1"


limiter = Limiter(key_func=_get_real_ip)
