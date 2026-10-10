# M5: Signing (design)

Requirements: F-04, F-11 (sending part), F-16, F-17, F-36, F-37 in `docs/02-user-stories.md`, and `docs/05-signing.md`.

I checked Documenso v2.18.0 against a local install (2026-10-10, community edition with no license key) and confirmed:
- create (multipart `payload` + `files`), with recipients, `signingOrder` and `SIGNATURE` fields placed by page percentage
- `distribute`, which returns each recipient's `signingUrl`
- reading an envelope: `status` and each recipient's `readStatus`/`signingStatus`
- `redistribute` (reminders), `cancel`, `delete`
- downloading an item with `version=signed`
- built-in reminder settings and envelope expiry

None of this needs a license.

## Pieces
1. **`apps/relay`** is a thin Node API, using Hono (MIT) and `@hono/node-server`. It's the only thing holding the Documenso API token.
   - `GET /health`
   - **Auth (F-04):**
     - `POST /auth/start {email}` emails a 6-digit code. The code lives 10 minutes, allows 5 tries, and is rate-limited per email.
     - `POST /auth/verify {email, code}` returns a device token: `email.issuedAt.HMAC(RELAY_SECRET)`. Rotating the secret revokes every token.
     - The SMTP transport is nodemailer (MIT). In dev it's Mailpit.
   - **Envelopes** (all need `Authorization: Bearer <device token>`):
     - `POST /envelopes`: multipart `pdf` plus `meta` JSON `{title, signers:[{name, email}], fields:[{signer, page, x, y, w, h}]}`. It creates the envelope and sends it in signing order.
       - Reminders: on day 3, then every 4 days.
       - The envelope expires after 30 days.
       - `externalId = capfolder:<sha256(email)>:<random>`. Every other route checks that prefix, so a device only ever touches its own envelopes.
     - `GET /envelopes/:id` returns `{status: pending | completed | cancelled | rejected | expired, signers:[{name, email, status: sent | opened | signed | rejected, signedAt}]}`.
     - `GET /envelopes/:id/signing-url` returns the URL for the **authenticated email's own** recipient, never anyone else's.
     - `GET /envelopes/:id/signed.pdf` returns the sealed PDF (completed envelopes only).
     - `POST /envelopes/:id/remind` resends to signers who haven't signed.
     - `DELETE /envelopes/:id` cancels a pending envelope, or deletes a finished one (after the app has filed it).
   - **Cron (hourly):** delete any `capfolder:` envelope older than 30 days.
   - **CORS:** the Tauri origins and the Vite dev origin.
   - **Config by env:** `DOCUMENSO_URL`, `DOCUMENSO_API_TOKEN`, `RELAY_SECRET`, `SMTP_*`, `PORT`.
   - **Local stack:** `apps/relay/docker/compose.dev.yml` (Documenso, Postgres, Mailpit), with `dev-setup.sh` and `dev-account.sh`.
   - **Self-host:** `docker/compose.yml` adds the relay to the same stack (F-37).
2. **Core, pure:** `withSignaturePage(pdf, {title, signers})` appends a Capfolder signature page (title, each signer's name, a box) and returns `{pdf, fields}`. That works for any PDF, and the original pages stay untouched.
3. **Desktop:**
   - **Settings → Signing:**
     - the relay URL (default `https://relay.capfolder.com`; `http://localhost:8787` when developing)
     - Test connection
     - the verified email
   - **Email step (F-04) and first send:** request a code, then verify it. The email and device token are stored in app settings.
   - **Send for signature:**
     - Where: Documents → "Send for signature", and New SAFE → "Send for signature".
     - Pick the PDF, title it, and choose signers: the people from the cap table (with their email), plus "I sign last" (the founder) on by default.
     - The app hashes the original, adds the signature page and sends it.
     - It keeps the outgoing copy in `docs/_outbox/` and records `envelope_sent` with `{envelope_id, relay, title, doc_type, target, person, signers, original_sha256, outbox}`.
   - **Signatures screen:**
     - Every open envelope from the record, with status per signer ("Sent 5 days ago · opened").
     - Statuses refresh when the screen opens and every minute.
     - **Sign now** appears when it's the founder's turn. It opens the signing page in the browser.
     - **Send reminder.**
     - **Cancel & delete from relay (F-17):** asks first, warns when someone has already signed, and records `envelope_voided`.
   - **When completed:**
     1. Download the signed PDF.
     2. **Verify it.** The text of each original page (pdf.js) must equal the outbox copy's. If it doesn't: not filed, and a red "Signed copy doesn't match what you sent".
     3. File it through the normal attach: `doc_added`, `doc_linked` to the target holding, `envelope_signed`.
     4. Delete the envelope on the relay and remove the outbox copy.
   - **Offline or relay down (F-36):** the relay calls show "Can't reach the signing relay. Everything else works; try again when you're online." Statuses retry on the next refresh.

## Out of scope (later)
- Filling the YC SAFE template. Sending works with any PDF; the SAFE template is its own step.
- An automatic offline send queue.
- Webhooks (polling is enough at our volume).
- An in-app signing window (the signing page opens in the browser).
- Sender-domain email (signing emails come from the relay's address).
- Hosting `relay.capfolder.com` (that's Mads's decision).

## Tests
- **Relay (vitest)**, against an in-memory fake Documenso:
  - auth codes: expiry, tries and rate limit
  - device tokens: forged and expired
  - ownership: another device's envelope gives 404
  - the signing URL is only for your own email
  - the status mapping
  - remind and cancel
  - an opt-in contract test against the local Documenso (`RELAY_CONTRACT=1`)
- **Core:** the signature page adds one page and puts each field on it, and the original pages are unchanged.
- **Desktop**, with a fake relay in the fake platform:
  - verify email
  - send
  - the statuses show
  - Sign now opens the URL
  - remind
  - cancel records `envelope_voided`
  - completed: the PDF is verified and filed, and the relay delete is called
  - a tampered signed PDF is not filed
  - relay down shows the offline message
