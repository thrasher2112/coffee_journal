"""Tests for the rate-limit client key.

The key decides which bucket a request counts against. If a caller can choose
it, every @limiter.limit in the app stops working - most importantly the 5/min
on POST /api/auth/magic-link, which is what prevents this app being used to send
unlimited mail to an arbitrary address.
"""
from __future__ import annotations

import pytest
from starlette.requests import Request

from coffee_journal import rate_limit
from coffee_journal.rate_limit import _get_real_ip

REAL = "203.0.113.9"      # what the proxy observed
SPOOF = "198.51.100.7"    # what the caller claimed


def make_request(xff: str | None = None, client_host: str = REAL) -> Request:
    headers = []
    if xff is not None:
        headers.append((b"x-forwarded-for", xff.encode()))
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/",
            "headers": headers,
            "client": (client_host, 51234),
        }
    )


@pytest.fixture()
def hops(monkeypatch):
    """Set the configured number of trusted proxy hops."""

    def _set(count: int):
        monkeypatch.setattr(rate_limit.settings, "trusted_proxy_hops", count)

    return _set


def test_no_proxy_configured_ignores_the_header(hops):
    """Default deployment is reached directly, so X-Forwarded-For is caller input."""
    hops(0)
    assert _get_real_ip(make_request(f"{SPOOF}")) == REAL


def test_spoofed_prefix_is_ignored_behind_one_proxy(hops):
    """The regression this file exists for.

    Proxies append, so a caller-supplied value ends up on the LEFT and the
    address the proxy actually saw on the right. Reading the left let anyone
    mint a new bucket per request.
    """
    hops(1)
    assert _get_real_ip(make_request(f"{SPOOF}, {REAL}")) == REAL


def test_single_hop_is_used_as_is(hops):
    hops(1)
    assert _get_real_ip(make_request(REAL)) == REAL


def test_two_trusted_proxies_reads_two_from_the_right(hops):
    """e.g. a CDN in front of the host: XFF is `client, cdn` by the time we see it."""
    hops(2)
    assert _get_real_ip(make_request(f"{SPOOF}, {REAL}, 10.0.0.1")) == REAL


def test_fewer_hops_than_configured_falls_back_to_the_peer(hops):
    """A header shorter than the proxy chain did not come through it - distrust it."""
    hops(2)
    assert _get_real_ip(make_request(SPOOF)) == REAL


def test_missing_header_falls_back_to_the_peer(hops):
    hops(1)
    assert _get_real_ip(make_request(None)) == REAL


def test_whitespace_and_empty_entries_do_not_shift_the_index(hops):
    hops(1)
    assert _get_real_ip(make_request(f" {SPOOF} ,  , {REAL} ")) == REAL
