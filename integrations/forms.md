# Website forms: D1 + Google Sheet

The three forms on capfolder.com (download gate, Pro waitlist, Book a call) are our own `<dialog>` forms
(`apps/website/forms.js`). Submissions go to `POST /api/submit` (`functions/api/submit.js`, a Pages
Function), which checks Turnstile, validates, inserts into the D1 database `forms`, then copies the row to a
Google Sheet. One Sheet tab per form id: `download`, `pro-waitlist`, `book-a-call`. The Sheet emails Mads on
every new row (Google's own notification, no email service of ours).

The Tally forms rjxQjR, aONDJb and 8NqXQ5 (`integrations/tally.md`) are retired. Keep them published until
the Sheet has received one real row from each form on production, then delete them in Tally.

## Where to read submissions

- The Google Sheet "Capfolder forms" (one tab per form; the first row is the header).
- Cloudflare dashboard → Workers & Pages → D1 → `forms` → Tables → `submissions`.
- Terminal:
  ```bash
  npx wrangler d1 execute forms --remote --command "SELECT created_at, form_id, email, data FROM submissions ORDER BY id DESC LIMIT 50"
  ```

## One-off setup (Mads, in this order)

### 1. D1 database

```bash
npx wrangler login
npx wrangler d1 create forms
npx wrangler d1 execute forms --remote --command "CREATE TABLE submissions (id INTEGER PRIMARY KEY AUTOINCREMENT, form_id TEXT NOT NULL, data TEXT NOT NULL, email TEXT, ip_hash TEXT, user_agent TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))); CREATE INDEX idx_submissions_form_created ON submissions(form_id, created_at);"
```

Dashboard → Workers & Pages → `capfolder` (the Pages project) → Settings → Bindings → Add → D1 database:
variable name `DB`, database `forms`. Add it for **Production** and **Preview**.

### 2. Google Sheet + Apps Script

1. Create a Google Sheet named "Capfolder forms" (tabs are created automatically on the first submission).
2. Extensions → Apps Script. Replace the editor contents with:
   ```js
   const SECRET = "<paste SHEETS_SECRET>";
   function doPost(e) {
     const b = JSON.parse(e.postData.contents);
     if (b.secret !== SECRET) return ContentService.createTextOutput("no");
     if (!["download", "pro-waitlist", "book-a-call"].includes(b.form)) return ContentService.createTextOutput("no");
     const ss = SpreadsheetApp.getActiveSpreadsheet();
     const sh = ss.getSheetByName(b.form) || ss.insertSheet(b.form);
     if (sh.getLastRow() === 0) sh.appendRow(["created_at", ...b.columns]);
     sh.appendRow([b.created_at, ...b.values]);
     return ContentService.createTextOutput("ok");
   }
   ```
   `SECRET` is any long random string (for example `openssl rand -hex 24`). The same string becomes the
   Pages secret `SHEETS_SECRET` below.
3. Deploy → New deployment → type **Web app** → Execute as **Me** → Who has access **Anyone** → Deploy.
   Approve the permissions prompt. Copy the **Web app URL** (ends in `/exec`): it becomes `SHEETS_WEBHOOK_URL`.
   After any later edit to the script, Deploy → Manage deployments → edit → New version, or the URL keeps
   serving the old code.
4. Notifications: in the Sheet, Tools → Notification settings → Edit notifications → "Any changes are made"
   → "Email - right away" → Save. Google emails the account that owns the Sheet.

Payload the function sends (for reference):
`{ secret, form, created_at, columns: string[], values: string[] }`. Checkbox groups are joined with `, `,
a single checkbox is `yes` or empty.

### 3. Turnstile

Dashboard → Turnstile → Add widget: name `capfolder.com`, hostname `capfolder.com` (add `capfolder.pages.dev`
for previews), widget mode **Managed** (the form renders it with `appearance: interaction-only`, so visitors
only see it when a challenge is needed). Copy:
- **Site key** → `SITE_KEY` at the top of `apps/website/forms.js` (commit it; it's public).
- **Secret key** → Pages secret `TURNSTILE_SECRET`.

Local development uses Cloudflare's always-pass test keys: site `1x00000000000000000000AA`, secret
`1x0000000000000000000000000000000AA`.

### 4. Secrets

Dashboard → Workers & Pages → `capfolder` → Settings → Variables and Secrets → Add, type **Secret**, for
**Production** and **Preview**:

| Name | Value |
|---|---|
| `TURNSTILE_SECRET` | from step 3 |
| `IP_SALT` | any long random string (`openssl rand -hex 24`); IPs are stored as SHA-256(ip + salt) |
| `SHEETS_WEBHOOK_URL` | the Apps Script `/exec` URL from step 2 |
| `SHEETS_SECRET` | the same string as `SECRET` in the Apps Script |

Redeploy the Pages project after adding bindings or secrets (Deployments → latest → Retry deployment), or
push a commit.

### 5. Check, then retire Tally

Submit each form once on capfolder.com. Expect three tabs in the Sheet, one row each, and three emails. Then
delete the three Tally forms.

## Optional

- Security → WAF → Rate limiting rules: one rule (the free plan allows one) on URI path equals `/api/submit`,
  10 requests per 10 seconds per IP, block.
- Retention: not set up. If wanted later, a Cron Trigger Worker running
  `DELETE FROM submissions WHERE created_at < datetime('now','-12 months')`.

## Local development

`wrangler d1 execute --local` needs a config file naming the database, and the repo deliberately has no
wrangler.toml (bindings live in the Pages dashboard). Use a throwaway one outside the repo, and run `pages dev`
from the repo root so it finds `functions/`:

```bash
mkdir -p /tmp/forms-dev && printf 'name = "forms-dev"\ncompatibility_date = "2026-11-01"\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "forms"\ndatabase_id = "forms"\n' > /tmp/forms-dev/wrangler.toml
npx wrangler d1 execute forms --local --config /tmp/forms-dev/wrangler.toml --persist-to /tmp/forms-dev/state --command "<the CREATE TABLE statement from step 1>"
(cd apps/website && pnpm build)
npx wrangler pages dev apps/website/dist --port 8788 --d1 DB=forms --persist-to /tmp/forms-dev/state --binding TURNSTILE_SECRET=1x0000000000000000000000000000000AA IP_SALT=dev SHEETS_SECRET=dev SHEETS_WEBHOOK_URL=https://example.invalid
# open http://localhost:8788, submit a form, then:
npx wrangler d1 execute forms --local --config /tmp/forms-dev/wrangler.toml --persist-to /tmp/forms-dev/state --command "SELECT form_id, email FROM submissions"
```
