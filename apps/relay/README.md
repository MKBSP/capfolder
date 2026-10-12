# Capfolder relay

The only server Capfolder uses: a thin API in front of a self-hosted [Documenso](https://github.com/documenso/documenso) (AGPL-3.0). It holds the Documenso API token, sends the 6-digit email codes, and only lets a device see envelopes it sent. See `docs/05-signing.md`.

## Run it locally
```bash
cd apps/relay/docker
./dev-setup.sh                          # secrets + a self-signed signing certificate in .local/
docker compose -f compose.dev.yml up -d # Documenso :3100, Mailpit (all email) :8025, Postgres
./dev-account.sh                        # relay's Documenso account + API token → .local/relay.env
cd .. && pnpm dev                       # relay on http://localhost:8787
```
Point the desktop app at `http://localhost:8787` (Settings → Signing). Every email (codes, signing requests) shows up in Mailpit at http://localhost:8025.

## Config (env)
| Variable | |
|---|---|
| `DOCUMENSO_URL` | Documenso's address as the relay reaches it |
| `DOCUMENSO_PUBLIC_URL` | its public address (signing links), if different |
| `DOCUMENSO_API_TOKEN` | API token of the relay's Documenso account |
| `RELAY_SECRET` | ≥ 32 random characters; rotating it signs every device out |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | email for the codes |
| `PORT` (8787), `HOST` | where it listens |
| `PING_FILE` (`data/pings.jsonl`) | where anonymous install pings go, one JSON line each (docs/11). No IPs are stored |
| `RELAY_PER_EMAIL_DAY` (5) | envelopes one founder can send per day |
| `RELAY_TOTAL_DAY` (none) | envelopes everyone together can send per day; keep it under your email quota (~5 emails each) |
| `PAUSE_FILE` (`data/PAUSED`) | kill switch: while this file exists, new envelopes are refused (status and downloads still work) |
| `TRUST_PROXY` | `true` only behind a reverse proxy: rate limits then use the last X-Forwarded-For hop (the one your proxy adds) |

## Tests
`pnpm test` runs against an in-memory Documenso. `RELAY_CONTRACT=1 pnpm test` also runs against the local stack.

## Before a public deployment
The relay's rate limits live in memory, bounded to 200,000 keys: when full, the oldest key is forgotten rather than everyone being locked out. Resetting a key that way takes 200,000 fresh IPv4 addresses or IPv6 /64 networks. A public relay should **also** rate-limit at its proxy (Caddy, nginx, Cloudflare), keep `TRUST_PROXY=true` only behind that proxy, and run a single instance (codes and limits aren't shared between instances).
