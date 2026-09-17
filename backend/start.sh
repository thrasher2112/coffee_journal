#!/usr/bin/env bash
set -euo pipefail

alembic upgrade head
python -m coffee_journal.scripts.seed_db

# Trust X-Forwarded-* only when a proxy is actually declared.
#
# --forwarded-allow-ips="*" makes uvicorn rewrite scope["client"] from
# X-Forwarded-For sent by ANY peer. Passing it unconditionally meant that with
# TRUSTED_PROXY_HOPS=0 - the default, and the case where the app is reachable
# directly - rate_limit._get_real_ip's fallback to request.client.host was
# reading attacker-supplied data, so rotating the header bypassed every limit.
# Gating it here is what actually makes the default fail closed.
PROXY_ARGS=()
if [ "${TRUSTED_PROXY_HOPS:-0}" -gt 0 ] 2>/dev/null; then
  # Behind a declared proxy: needed so the app sees the terminator's https
  # scheme. The number of hops is validated in rate_limit._get_real_ip.
  PROXY_ARGS=(--proxy-headers --forwarded-allow-ips="*")
fi

# $PORT is injected by most managed hosts (Render, Cloud Run, Railway); fall
# back to 8000 for docker-compose.
exec uvicorn coffee_journal.main:app \
  --host 0.0.0.0 \
  --port "${PORT:-8000}" \
  ${PROXY_ARGS[@]+"${PROXY_ARGS[@]}"}
