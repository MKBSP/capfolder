#!/usr/bin/env sh
# Makes ./.local/{documenso.env,cert.p12} for the local signing stack. Safe to re-run (keeps existing files).
set -eu
cd "$(dirname "$0")"
mkdir -p .local
if [ ! -f .local/documenso.env ]; then
  {
    echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)"
    echo "NEXT_PRIVATE_ENCRYPTION_KEY=$(openssl rand -hex 32)"
    echo "NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY=$(openssl rand -hex 32)"
    echo "NEXT_PRIVATE_SIGNING_PASSPHRASE=capfolder-dev"
  } > .local/documenso.env
fi
if [ ! -f .local/cert.p12 ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -subj "/CN=Capfolder dev signing/O=Capfolder" \
    -keyout .local/key.pem -out .local/cert.pem 2>/dev/null
  openssl pkcs12 -export -out .local/cert.p12 -inkey .local/key.pem -in .local/cert.pem -passout pass:capfolder-dev
  rm .local/key.pem
  chmod 644 .local/cert.p12 # the container runs as uid 1001
fi
echo "ready: docker compose -f compose.dev.yml up -d"
