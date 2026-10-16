# Hosting signing (relay.capfolder.com)

Runs Documenso, its database, the relay and a Cloudflare Tunnel with Docker, on any computer: a laptop for the beta, a
server later (same files). Nothing is opened on your network; Cloudflare carries the traffic through the tunnel.

| Address | Goes to |
|---|---|
| `https://relay.<domain>` | the relay (the desktop app talks to this) |
| `https://sign.<domain>` | Documenso's signing page (investors open this from their email) |

Cost: €0 (Cloudflare Tunnel and Resend's free plan: 3,000 emails a month, 100 a day).

## Before you start
- Docker Desktop installed and running. In its settings, turn on **Start Docker Desktop when you sign in**.
- Your domain's DNS on Cloudflare (status **Active**).

## 1. Email: Resend
1. Sign up at resend.com.
2. **Domains → Add domain →** your domain (e.g. `capfolder.com`), region EU.
3. Add the DNS records it shows. Resend's **Auto configure** button adds them in Cloudflare for you; otherwise copy each record into Cloudflare → DNS → Records. Wait for **Verified**.
4. **API Keys → Create API key**, permission **Sending access**, your domain. Copy it (starts with `re_`); it's shown once.

## 2. Settings and secrets
```
cd apps/relay/docker
./host-setup.sh      # asks for the domain, the Resend key and an email address of yours
./host.sh account    # creates the relay's Documenso login (once), then closes sign-up
```
Everything secret lands in `apps/relay/docker/.host/` (never committed). **Back up that folder** (password manager or an
encrypted USB stick): it holds the database password, the relay secret and the signing certificate.

## 3. The tunnel
1. Cloudflare dashboard → **Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared**, name it `capfolder-signing`.
2. On "Install and run a connector", pick **Docker** and copy the long token after `--token` (starts with `eyJ`).
   Paste it in `.host/host.env` as `TUNNEL_TOKEN=eyJ...`. Don't run Cloudflare's command; `host.sh` runs the connector.
3. **Public hostnames** (Next, or the tunnel's *Public Hostname* tab), add two:
   - Subdomain `relay`, your domain, Service **HTTP**, URL `relay:8787`
   - Subdomain `sign`, your domain, Service **HTTP**, URL `documenso:3000`

## 4. Start it
```
./host.sh up
```
Check `https://relay.capfolder.com/health` in a browser: `{"ok":true,"service":"capfolder-relay"}`.
Then in the app: Settings → Signing → verify your email, and send yourself a test document.

## Keep it running (laptop)
- Plugged in: System Settings → Battery → Options → **Prevent automatic sleeping on power adapter when the display is off**.
  Or run `caffeinate -s` in a terminal window while you're away.
- Closed lid or sleep = signing is offline. Envelopes wait; links work again when the laptop is back.
- Containers restart by themselves after a reboot once Docker Desktop starts.

## Day to day
| | |
|---|---|
| `./host.sh status` | what's running |
| `./host.sh logs` | live logs (Ctrl+C to stop watching) |
| `./host.sh pause` / `resume` | kill switch: refuse new envelopes (status, downloads and reminders keep working) |
| `./host.sh down` | stop everything (data is kept) |

Fair use (in `.host/host.env`, then `./host.sh up`): `RELAY_PER_EMAIL_MONTH=10` signing requests (envelopes and
wire-instruction emails) per free account per calendar month (UTC), `RELAY_TOTAL_DAY=15` for everyone together (about 5 emails each keeps Resend under 100 a day). Raise both when you move
to a paid email plan.

**Pro accounts (no monthly limit):** edit `.host/plans/plans.json` (made by `./host.sh up`). The account is the
email the founder verified in the app. Saved changes apply at once, no restart:

```json
{"pro": ["founder@example.com", "tester@example.com"]}
```

A missing or broken file means everyone is free (the relay logs it once). Billing will write this same list later.

Optional, free: Cloudflare → Security → WAF → **Rate limiting rules**: for `relay.<domain>`, 60 requests per minute per IP.

## Moving to a server later
Install Docker on the server, copy the repo and the `.host/` folder, then
`docker exec capfolder-signing-database-1 pg_dump -U documenso documenso > backup.sql` on the laptop,
restore it on the server, and `./host.sh up` there. Stop the laptop (`./host.sh down`) first: the same tunnel token
moves the addresses with it. No DNS changes.

## Known limits
- The signing certificate is self-signed: PDF readers say "signer unknown" in the signature panel. A document-signing
  certificate from a CA replaces `.host/cert.p12` later.
- One instance only: codes and rate limits live in the relay's memory (a restart clears them).
