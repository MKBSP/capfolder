#!/usr/bin/env sh
# Runs hosted signing (compose.host.yml). ./host.sh up | down | status | logs | account | pause | resume
set -eu
cd "$(dirname "$0")"
[ -f .host/host.env ] || { echo "Run ./host-setup.sh first." >&2; exit 1; }
set -a; . ./.host/host.env; set +a
dc() {
  if [ -n "$TUNNEL_TOKEN" ]; then docker compose --env-file .host/host.env -f compose.host.yml --profile tunnel "$@"
  else docker compose --env-file .host/host.env -f compose.host.yml "$@"; fi
}
set_env() { # set_env KEY value: rewrites one line of host.env
  grep -v "^$1=" .host/host.env > .host/host.env.tmp
  echo "$1=$2" >> .host/host.env.tmp
  mv .host/host.env.tmp .host/host.env
  chmod 600 .host/host.env
}
case "${1:-}" in
  up)
    [ -n "$DOCUMENSO_API_TOKEN" ] || { echo "Run ./host.sh account first." >&2; exit 1; }
    [ -n "$TUNNEL_TOKEN" ] || echo "No TUNNEL_TOKEN yet: running on this computer only (see README, step 4)."
    mkdir -p .host/plans
    [ -f .host/plans/plans.json ] || echo '{"pro": []}' > .host/plans/plans.json
    dc up -d --build
    echo "relay:  http://localhost:8790/health   documenso: http://localhost:3200"
    [ -z "$TUNNEL_TOKEN" ] || echo "public: https://relay.${SIGN_URL#https://sign.}/health" ;;
  down) dc down ;;
  status) dc ps ;;
  logs) dc logs -f --tail 100 ;;
  pause) dc exec relay touch data/PAUSED && echo "Paused: new envelopes are refused." ;;
  resume) dc exec relay rm -f data/PAUSED && echo "Resumed." ;;
  account)
    # The relay's own Documenso login, made once while sign-up is briefly open; then sign-up closes again.
    # Sign-up must never be open to the internet: the tunnel goes down first, and sign-up closes again on any exit,
    # error or Ctrl+C included (the tunnel stays down until ./host.sh up).
    docker compose --env-file .host/host.env -f compose.host.yml --profile tunnel stop tunnel >/dev/null 2>&1 || true
    # (Subshells: in sh, "VAR=x function" keeps VAR set after the call, which once left sign-up open.)
    trap '(export DISABLE_SIGNUP=true; dc up -d documenso >/dev/null 2>&1) || echo "Run ./host.sh up now: sign-up may still be open." >&2' EXIT
    trap 'exit 1' INT TERM
    # local address while we log in: with the https one its cookies are "secure" and plain localhost drops them
    (export SIGN_URL=http://localhost:3200 DISABLE_SIGNUP=false; dc up -d database documenso)
    D=http://localhost:3200
    printf 'waiting for Documenso'
    until curl -sf "$D/api/health" >/dev/null; do printf .; sleep 3; done; echo
    curl -s -o /dev/null -X POST "$D/api/auth/email-password/signup" -H 'content-type: application/json' \
      -d "{\"name\":\"Capfolder relay\",\"email\":\"$RELAY_ACCOUNT_EMAIL\",\"password\":\"$RELAY_ACCOUNT_PASSWORD\",\"signature\":null}" || true
    # verified directly in the database: no email round trip needed for our own account
    dc exec -T database psql -U documenso -d documenso -qc \
      "UPDATE \"User\" SET \"emailVerified\" = now() WHERE email = '$(echo "$RELAY_ACCOUNT_EMAIL" | tr 'A-Z' 'a-z')'"
    JAR=.host/cookies
    rm -f "$JAR"
    CSRF=$(curl -s -c "$JAR" -b "$JAR" "$D/api/auth/csrf" | python3 -c 'import json,sys; print(json.load(sys.stdin)["csrfToken"])')
    curl -s -o /dev/null -c "$JAR" -b "$JAR" -X POST "$D/api/auth/email-password/authorize" -H 'content-type: application/json' \
      -d "{\"email\":\"$RELAY_ACCOUNT_EMAIL\",\"password\":\"$RELAY_ACCOUNT_PASSWORD\",\"csrfToken\":\"$CSRF\"}"
    TOKEN=""
    for T in 1 2 3 4 5 6 7 8 9 10; do
      TOKEN=$(curl -s -b "$JAR" -X POST "$D/api/trpc/apiToken.create" -H 'content-type: application/json' \
        -d "{\"json\":{\"teamId\":$T,\"tokenName\":\"capfolder-relay\",\"expirationDate\":null}}" |
        python3 -c 'import json,sys; print(json.load(sys.stdin).get("result",{}).get("data",{}).get("json",{}).get("token",""))')
      [ -z "$TOKEN" ] || break
    done
    rm -f "$JAR"
    [ -n "$TOKEN" ] || { echo "Couldn't create the API token (see ./host.sh logs)." >&2; exit 1; }
    set_env DOCUMENSO_API_TOKEN "$TOKEN"
    echo "Relay account ready (sign-up closes now). Next: ./host.sh up" ;;
  *) echo "usage: ./host.sh up | down | status | logs | account | pause | resume" >&2; exit 1 ;;
esac
