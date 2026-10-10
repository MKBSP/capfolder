#!/usr/bin/env sh
# Creates the relay's Documenso account on the LOCAL dev stack and writes DOCUMENSO_API_TOKEN to .local/relay.env.
# Needs: the stack running (compose.dev.yml), python3, curl. Dev only: fixed throwaway password.
set -eu
cd "$(dirname "$0")"
D=http://localhost:3100
EMAIL=relay@capfolder.local
PASS='Capfolder-dev-2026!'
JAR=.local/cookies
rm -f "$JAR"
curl -s -o /dev/null -X POST "$D/api/auth/email-password/signup" -H 'content-type: application/json' \
  -d "{\"name\":\"Capfolder relay\",\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"signature\":null}" || true
sleep 2
LINK=$(curl -s "http://localhost:8025/api/v1/search?query=to:$EMAIL" | python3 -c '
import json,sys,urllib.request,re
for m in json.load(sys.stdin)["messages"]:
    t=json.load(urllib.request.urlopen("http://localhost:8025/api/v1/message/"+m["ID"]))["Text"]
    f=re.search(r"/verify-email/(\w+)",t)
    if f: print(f.group(1)); break')
[ -n "$LINK" ] && curl -s -o /dev/null -X POST "$D/api/auth/email-password/verify-email" -H 'content-type: application/json' -d "{\"token\":\"$LINK\"}"
CSRF=$(curl -s -c "$JAR" -b "$JAR" "$D/api/auth/csrf" | python3 -c 'import json,sys; print(json.load(sys.stdin)["csrfToken"])')
curl -s -o /dev/null -c "$JAR" -b "$JAR" -X POST "$D/api/auth/email-password/authorize" -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"csrfToken\":\"$CSRF\"}"
for T in 1 2 3 4 5 6 7 8 9 10; do
  R=$(curl -s -b "$JAR" -X POST "$D/api/trpc/apiToken.create" -H 'content-type: application/json' \
    -d "{\"json\":{\"teamId\":$T,\"tokenName\":\"capfolder-relay-dev-$(date +%s)\",\"expirationDate\":null}}")
  TOKEN=$(echo "$R" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("result",{}).get("data",{}).get("json",{}).get("token",""))')
  if [ -n "$TOKEN" ]; then
    printf 'DOCUMENSO_URL=%s\nDOCUMENSO_API_TOKEN=%s\n' "$D" "$TOKEN" > .local/relay.env
    echo "wrote .local/relay.env (team $T)"
    exit 0
  fi
done
echo "couldn't create a token" >&2
exit 1
