#!/usr/bin/env bash
# Post-deploy checks. These target the ways this app fails *while looking
# healthy* - a green /api/health proves almost nothing on its own.
#
#   ./verify.sh studio.example.com
set -uo pipefail

DOMAIN="${1:-}"
[ -z "$DOMAIN" ] && { echo "usage: $0 <domain>" >&2; exit 1; }
cd "$(dirname "$0")"

# bootstrap.sh runs under sudo, so .env is root-owned 0600. Every docker
# compose call below parses docker-compose.yml, whose ${VAR:?} entries read
# from it - unreadable .env means a confusing "variable is not set" error
# rather than an honest permissions one. Say so plainly instead.
if [ ! -r .env ]; then
  echo "cannot read deploy/.env (it is root-owned 0600)." >&2
  echo "run this the same way you ran bootstrap:  sudo $0 $DOMAIN" >&2
  exit 1
fi

fail=0
skip() { printf '  \033[33mskip\033[0m %s\n' "$1"; }
ok()   { printf '  \033[32mok\033[0m   %s\n' "$1"; }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$1"; fail=1; }

# This is normally run straight after "docker compose up", when the container
# is seconds old: Caddy answers 502 for an app still booting, and the first
# autopilot tick has not fired. Checking immediately reports a healthy deploy
# as broken, so wait for the app to be up before judging anything.
printf 'waiting for the Studio to be ready'
ready=0
for _ in $(seq 1 60); do
  if docker compose exec -T studio wget -q -O /dev/null http://127.0.0.1:3010/api/health 2>/dev/null; then
    ready=1; printf ' ready\n\n'; break
  fi
  printf '.'; sleep 1
done
[ "$ready" = 1 ] || { printf '\n'; bad "app never became ready - docker compose logs studio"; }

echo "1. TLS is real (not plaintext on 443)"
if curl -sS --max-time 15 "https://${DOMAIN}/api/health" | grep -q '"status":"ok"'; then
  ok "https handshake succeeds and health is ok"
else
  bad "https failed - certificate not issued yet, or DNS not pointing here"
fi

echo "2. http redirects to https"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "http://${DOMAIN}/api/health")
case "$code" in 30*) ok "http -> $code redirect";; *) bad "expected a redirect from http, got $code";; esac

echo "3. the auth boundary holds"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://${DOMAIN}/api/projects")
[ "$code" = "401" ] && ok "private API returns 401 without a session" \
                    || bad "private API returned $code, expected 401"

echo "4. the scheduler is actually running"
# The failure that matters most: the app serves fine while nothing ticks.
# A cycle line alone is not success - personal.mjs logs the status verbatim,
# so a 500 also prints "Autopilot cycle: 500", and the cycle itself reports
#   status = notes.length ? (analysesSaved ? 'partial' : 'failed') : 'complete'
# so a failed run can arrive under HTTP 200. Check both.
# The runner polls every 30s, so a freshly started container legitimately has
# no cycle yet. Wait out one interval before concluding the engine is dead.
last_cycle=""
for _ in $(seq 1 45); do
  last_cycle=$(docker compose logs studio 2>/dev/null | grep "Autopilot cycle:" | tail -1)
  [ -n "$last_cycle" ] && break
  sleep 1
done
if [ -z "$last_cycle" ]; then
  bad "no autopilot cycle yet - if the container started <30s ago wait and re-run;"
  echo "       otherwise look for 'has not reached the app' in: docker compose logs studio"
else
  cycle_code=$(printf '%s' "$last_cycle" | sed -n 's/.*Autopilot cycle: \([0-9][0-9]*\).*/\1/p')
  if [ "$cycle_code" != "200" ]; then
    bad "latest cycle returned HTTP ${cycle_code:-?} - the tick is failing"
  elif printf '%s' "$last_cycle" | grep -q '"status":"failed"'; then
    bad "latest cycle reported status failed - it ran but saved nothing"
  elif printf '%s' "$last_cycle" | grep -q '"status":"partial"'; then
    ok "cycles running, latest was partial (some projects errored - check notes)"
  else
    ok "latest cycle completed cleanly"
  fi
  printf '       %s\n' "$last_cycle"
fi
if docker compose logs studio 2>/dev/null | grep -q "has not reached the app"; then
  bad "the runner cannot reach the app - the engine is NOT working"
fi

echo "5. data survives the container being destroyed (the volume is real)"
# store.json is written by the first autopilot cycle, so on a brand-new
# install it legitimately does not exist yet. Absent is not the same as lost.
if ! docker compose exec -T studio sh -c 'test -f /data/store.json' 2>/dev/null; then
  skip "no store.json yet - the first cycle has not written one; re-run after it has"
  echo "6. exactly one instance"
  n=$(docker compose ps -q studio | wc -l | tr -d ' ')
  [ "$n" = "1" ] && ok "one studio container" \
                 || bad "$n studio containers - the JSON store has no concurrent writers"
  echo
  [ "$fail" = 0 ] && echo "All checks passed (persistence pending)." || echo "Some checks FAILED - see above."
  exit "$fail"
fi
before=$(docker compose exec -T studio sh -c 'cat /data/store.json 2>/dev/null | wc -c' | tr -d '\r')
# A plain restart reuses the same container, so its writable layer survives
# and the check would pass even with no volume mounted at all. Destroy and
# recreate it: only a real named volume carries the data across that.
docker compose up -d --force-recreate studio >/dev/null 2>&1
for i in $(seq 1 60); do
  docker compose exec -T studio wget -q -O /dev/null http://127.0.0.1:3010/api/health 2>/dev/null && break
  sleep 1
done
after=$(docker compose exec -T studio sh -c 'cat /data/store.json 2>/dev/null | wc -c' | tr -d '\r')
if [ -n "$after" ] && [ "${after:-0}" -gt 0 ] && [ "${after:-0}" -ge "${before:-0}" ]; then
  ok "store.json survived container recreation (${before:-0} -> ${after} bytes)"
else
  bad "store lost when the container was recreated - /data is NOT on the named volume"
fi

echo "6. exactly one instance"
n=$(docker compose ps -q studio | wc -l | tr -d ' ')
[ "$n" = "1" ] && ok "one studio container" \
               || bad "$n studio containers - the JSON store has no concurrent writers"

echo
[ "$fail" = 0 ] && echo "All checks passed." || echo "Some checks FAILED - see above."
exit "$fail"
