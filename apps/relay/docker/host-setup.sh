#!/usr/bin/env sh
# Makes ./.host/ for hosted signing (compose.host.yml): host.env with every setting and secret, documenso.env and a
# signing certificate. Safe to re-run: existing files are kept. Then: ./host.sh account, ./host.sh up.
set -eu
cd "$(dirname "$0")"
mkdir -p .host
chmod 700 .host
ask() { printf '%s [%s]: ' "$1" "$2" >&2; read -r v; echo "${v:-$2}"; }
if [ ! -f .host/host.env ]; then
  DOMAIN=$(ask "Your domain" "capfolder.com")
  RESEND=$(ask "Resend API key (resend.com → API Keys; starts with re_)" "")
  [ -n "$RESEND" ] || { echo "A Resend API key is needed to send email." >&2; exit 1; }
  ACCOUNT=$(ask "An email address of yours for the relay's Documenso login (receives nothing)" "")
  [ -n "$ACCOUNT" ] || { echo "Enter an email address." >&2; exit 1; }
  {
    echo "SIGN_URL=https://sign.$DOMAIN"
    echo "MAIL_FROM=signing@$DOMAIN"
    echo "SMTP_HOST=smtp.resend.com"
    echo "SMTP_PORT=465"
    echo "SMTP_SECURE=true"
    echo "SMTP_USER=resend"
    echo "SMTP_PASS=$RESEND"
    echo "DB_PASSWORD=$(openssl rand -hex 24)"
    echo "RELAY_SECRET=$(openssl rand -hex 32)"
    echo "RELAY_ACCOUNT_EMAIL=$ACCOUNT"
    echo "RELAY_ACCOUNT_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')Aa1!"
    echo "RELAY_PER_EMAIL_DAY=5"
    echo "RELAY_TOTAL_DAY=15"
    echo "TUNNEL_TOKEN="
    echo "DOCUMENSO_API_TOKEN="
  } > .host/host.env
  chmod 600 .host/host.env
fi
if [ ! -f .host/documenso.env ]; then
  PASS=$(openssl rand -hex 16)
  {
    echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)"
    echo "NEXT_PRIVATE_ENCRYPTION_KEY=$(openssl rand -hex 32)"
    echo "NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY=$(openssl rand -hex 32)"
    echo "NEXT_PRIVATE_SIGNING_PASSPHRASE=$PASS"
  } > .host/documenso.env
  chmod 600 .host/documenso.env
  # ponytail: self-signed signing certificate; PDF readers show "signer unknown". A CA-issued document signing
  # certificate replaces it later (same path, same passphrase variable).
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -subj "/CN=Capfolder signing/O=Capfolder" \
    -keyout .host/key.pem -out .host/cert.pem 2>/dev/null
  openssl pkcs12 -export -out .host/cert.p12 -inkey .host/key.pem -in .host/cert.pem -passout "pass:$PASS"
  rm .host/key.pem
  chmod 644 .host/cert.p12 # the container runs as uid 1001
fi
echo "ready. Next: ./host.sh account   (once), then ./host.sh up"
