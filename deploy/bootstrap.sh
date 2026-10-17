#!/usr/bin/env bash
# One-time setup on a fresh Ubuntu VPS. Safe to re-run: it never overwrites
# secrets that already exist.
#
#   sudo ./bootstrap.sh studio.example.com
set -euo pipefail

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  echo "usage: $0 <domain>    e.g. $0 studio.legendary-branding.com" >&2
  exit 1
fi

cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "==> installing Docker"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || { echo "docker compose plugin missing" >&2; exit 1; }

# Secrets are generated here, on this machine, and never leave it. Three
# distinct values: reusing one weakens all of them.
if [ -f .env ]; then
  echo "==> .env exists; keeping the secrets already in it"
  grep -q '^STUDIO_DOMAIN=' .env \
    && sed -i "s|^STUDIO_DOMAIN=.*|STUDIO_DOMAIN=${DOMAIN}|" .env \
    || echo "STUDIO_DOMAIN=${DOMAIN}" >> .env
else
  echo "==> generating secrets"
  gen() { openssl rand -base64 32 | tr -d '=+/' | cut -c1-43; }
  umask 077
  cat > .env <<ENVEOF
STUDIO_DOMAIN=${DOMAIN}
APP_ACCESS_TOKEN=$(gen)
SESSION_SECRET=$(gen)
AUTOPILOT_TOKEN=$(gen)
ENVEOF
fi
chmod 600 .env

echo "==> building and starting"
docker compose up -d --build

echo "==> waiting for the Studio to become healthy"
for i in $(seq 1 60); do
  if docker compose exec -T studio wget -q -O /dev/null http://127.0.0.1:3010/api/health 2>/dev/null; then
    echo "    healthy after ${i}s"; break
  fi
  [ "$i" = 60 ] && { echo "    did not become healthy; check: docker compose logs studio" >&2; exit 1; }
  sleep 1
done

echo
echo "================================================================"
echo " Studio is up at https://${DOMAIN}"
echo
echo " Sign in with this token. It is stored in deploy/.env (0600) and"
echo " is shown here once - copy it into your password manager now:"
echo
echo "   $(grep '^APP_ACCESS_TOKEN=' .env | cut -d= -f2-)"
echo
echo " Certificates: Caddy issues them on the first HTTPS request. If the"
echo " DNS A record was added moments ago, give it a minute and retry."
echo
echo " Now run:  sudo ./verify.sh ${DOMAIN}"
echo " (sudo, because .env is root-owned 0600)"
echo "================================================================"
