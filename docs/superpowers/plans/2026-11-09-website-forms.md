# Website forms off Tally Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three Tally popups on capfolder.com (download gate, Pro waitlist, Book a call) with our own `<dialog>` forms, stored in Cloudflare D1 and mirrored to a Google Sheet (one tab per form) that emails Mads on every new row.

**Architecture:** One Pages Function `functions/api/submit.js` (same place as the existing `functions/stats/`) verifies Turnstile, validates against a per-form field schema, inserts into D1, then in `waitUntil` POSTs the row to a Google Apps Script web app that appends it to the tab named after the form. One lazily imported `apps/website/forms.js` builds the dialog from the same schema shape, submits JSON, and shows the thank-you state. Tally is removed from the site, the CSP and the privacy section.

**Tech Stack:** Cloudflare Pages Functions (JS, no build), D1, Turnstile, Google Apps Script, vitest (existing `apps/website` test suite).

**Spec:** this plan's Design section (settled in chat with Mads, 2026-11-09). Field inventory copied from the live Tally forms rjxQjR, aONDJb, 8NqXQ5 and `integrations/tally.md`.

## Design

- **Forms and ids** (also the Sheet tab names): `download`, `pro-waitlist`, `book-a-call`.
- **Fields** (name → control, required, options). Every form also carries hidden `utm_source` and `ref` from the page URL, and the honeypot `website`.
  - `download`: `email` email ✱ · `stage` radio (STAGES) · `os` radio ✱ (macOS, Windows, Linux) · `updates` checkbox "Email me when there's a new version". Intro: "Free and open source. Tick the box below if you'd like an email when there's a new version." Thank-you: close the dialog, the page shows its existing `#dlthanks` panel.
  - `pro-waitlist`: `email` ✱ · `company` text "Company (optional)" placeholder "Acme Inc." · `stage` radio (STAGES) · `want_pro` radio (Yes, No) "Yes, I want the Pro Paid version" · `before` checkboxes (Pulley, Carta, Cake Equity, Ledgy, Eqvista, Excel) "What software, if any, were you using before?" · `notes` textarea "What would make Pro worth it for you? (optional)" placeholder "Sync with my co-founder, backups, AI that drafts grants…". Intro: "Pro adds sync across computers, encrypted online backup, no signing limit and AI included. Leave your email and we'll tell you when it's ready. Everyone on this list gets **25% off the first year**." Thank-you: "You're on the list" / "We'll email you when Pro is ready, with your 25% off the first year. Until then, Capfolder stays free."
  - `book-a-call`: `name` text ✱ "Your name" · `email` ✱ · `company` text "Company (if it has a name yet)" · `stage` radio ✱ (STAGES) · `help` checkboxes (Demo Capfolder, My first SAFE or valuation cap, Incorporating, Moving from a spreadsheet, Pulley or Carta, Setting up Capfolder, Something else) "What do you want help with?" · `notes` textarea "What should we cover on the call?" placeholder "e.g. two cofounders, not incorporated, an angel wants to invest $50k". Intro: "I just want to help. I've been through Y Combinator and worked with other accelerator programs, and I'm happy to share what I learned. Want to learn about Capfolder, fundraising or something else? Tell me a bit about where you are, and I'll email you a time for a short call." Thank-you: "Thanks, we'll be in touch." / "We'll email you a time for the call, usually within a day. Capfolder isn't legal advice, so for anything binding, check with a lawyer."
  - STAGES = Idea stage, company not founded yet · Founded, no funding yet · Pre-seed or seed (SAFEs, notes) · Priced round, Series A · Series B or later.
- **Storage:** D1 database `forms`, binding `DB`, table `submissions` (schema in Task 1). Bindings and secrets are set in the Pages dashboard; the repo has no wrangler.toml and we don't add one.
- **Sheet mirror:** the function POSTs `{ secret, form, created_at, columns: string[], values: string[] }` to `SHEETS_WEBHOOK_URL`. Apps Script appends a header row on an empty tab, then the values. Checkbox fields are joined with `, `. Mads turns on Sheet → Tools → Notification settings → "Any changes" → "Email right away".
- **Secrets (Pages → Settings → Variables and Secrets, Production + Preview):** `TURNSTILE_SECRET`, `IP_SALT`, `SHEETS_WEBHOOK_URL`, `SHEETS_SECRET`.
- **Turnstile:** site key is a constant in `forms.js`; widget rendered explicitly with `appearance: "interaction-only"` inside the dialog; `api.js` loaded on first dialog open (keeps "no third-party request before the visitor asks", same promise Tally had). Test keys for local dev: site `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA`.
- **Not built (say so, don't build):** admin UI, CSV export, retention cron, confirmation emails, Resend. Review happens in the Sheet or the D1 table browser in the Cloudflare dashboard. The `testing-landing-page/*` variants keep their Tally wiring (throwaway pages; the Tally forms stay published until Mads deletes them).

## Global Constraints

- Plain JS in `functions/` (matches `functions/stats/[[path]].js`); website files are plain HTML/JS/CSS, no framework, no new dependencies.
- No third-party request before the visitor opens a form (site.test.ts already enforces this for Tally; keep the same promise for Turnstile).
- Parameterised SQL only (`.bind()`); IP stored as SHA-256(ip + IP_SALT), never raw.
- Umami events preserved exactly: `download-form-submitted`, `pro-waitlist-submitted`, `book-call-submitted`.
- Copy is the Tally copy above, verbatim. Accessibility: real `<label>`s, `<dialog>` with Escape/backdrop close, focus moves into the dialog on open.
- Commits: no Co-Authored-By trailer (Mads' rule). Never `git push`.

## Review Focus

1. Double submit (button mashed, or a retry after a slow network) must not create two rows: the submit button disables while sending (Task 3 implementation; checked by hand in Task 4 step 5, no DOM test runner in this package).
2. A value outside the fixed options (radio tampered to "Series Z") is rejected with 422, not stored (Task 2 test).
3. A 2,000-character `notes` field is accepted up to 2,000 and rejected above; `name`/`company`/`email` cap at 200 (Task 2 test).
4. Sheets webhook down or slow: the visitor still gets `{ ok: true }` because the D1 insert already happened and the Sheet POST runs in `waitUntil` (Task 2 test asserts the response doesn't await the Sheet fetch's failure).
5. Turnstile script blocked (adblocker): the form shows a plain error line with a `mailto:` fallback instead of hanging (Task 3 ERROR_HTML test; the 8 s timeout is checked by hand in Task 4 step 5 with the Turnstile host blocked).

---

### Task 1: D1 schema, Apps Script and setup doc

**Files:**
- Create: `integrations/forms.md`

**Interfaces:**
- Produces: table `submissions(id INTEGER PK AUTOINCREMENT, form_id TEXT NOT NULL, data TEXT NOT NULL, email TEXT, ip_hash TEXT, user_agent TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))` with index `idx_submissions_form_created(form_id, created_at)`; the webhook payload contract `{ secret, form, created_at, columns, values }`.

- [ ] **Step 1: Write `integrations/forms.md`** in the style of `integrations/tally.md`, with these sections:
  - "Where submissions go": D1 `forms` → Google Sheet (one tab per form id) → Sheet emails Mads. Tally forms rjxQjR, aONDJb, 8NqXQ5 are retired (keep published until the Sheet has received a real row from each form, then delete).
  - "D1": the one-off command `npx wrangler d1 create forms`, then `npx wrangler d1 execute forms --remote --command "<CREATE TABLE + CREATE INDEX from Interfaces>"`, then dashboard: Pages project `capfolder` → Settings → Bindings → D1 `DB` = `forms` (Production and Preview).
  - "Google Sheet": create a Sheet "Capfolder forms"; Extensions → Apps Script; paste the script below; Deploy → Web app, execute as Me, access Anyone; copy the URL into `SHEETS_WEBHOOK_URL`; pick a random string for `SHEETS_SECRET` and set it in both the script's `SECRET` constant and the Pages secret; Tools → Notification settings → Any changes → Email right away.
  - The Apps Script, complete:
    ```js
    const SECRET = "<paste SHEETS_SECRET>";
    function doPost(e) {
      const b = JSON.parse(e.postData.contents);
      if (b.secret !== SECRET) return ContentService.createTextOutput("no");
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sh = ss.getSheetByName(b.form) || ss.insertSheet(b.form);
      if (sh.getLastRow() === 0) sh.appendRow(["created_at", ...b.columns]);
      sh.appendRow([b.created_at, ...b.values]);
      return ContentService.createTextOutput("ok");
    }
    ```
  - "Turnstile": dashboard → Turnstile → Add widget for capfolder.com (managed, invisible is fine); site key goes in `apps/website/forms.js` `SITE_KEY`; secret → `TURNSTILE_SECRET`. Test keys listed in Design.
  - "Secrets": the four names from Design, set for Production and Preview.
  - "Reading submissions": the Sheet, or dashboard → D1 → forms → Tables; or `npx wrangler d1 execute forms --remote --command "SELECT created_at, form_id, email, data FROM submissions ORDER BY id DESC LIMIT 50"`.
  - "Optional": one WAF rate-limiting rule on `/api/submit` (free plan allows one).

- [ ] **Step 2: Commit**

```bash
git add integrations/forms.md
git commit -m "docs(website): own forms on D1 + Google Sheet, setup and Apps Script"
```

---

### Task 2: Submit endpoint

**Files:**
- Create: `functions/api/submit.js`
- Test: `apps/website/forms-api.test.ts`

**Interfaces:**
- Produces: `export const FORMS` — `{ [formId]: { [field]: { type: "text"|"email"|"textarea"|"radio"|"checkbox"|"checkboxes", required?: true, options?: string[], max?: number } } }` for the three forms, field order = Sheet column order, hidden `utm_source`/`ref` as `type: "text"` last. `export async function onRequestPost({ request, env, waitUntil })`. Request body `{ formId, fields, token }`; responses `{ ok: true }` 200, `{ error }` 400/403/413/422/500. `env`: `DB`, `TURNSTILE_SECRET`, `IP_SALT`, `SHEETS_WEBHOOK_URL`, `SHEETS_SECRET`.
- Validation: unknown form → 400; body > 16,000 bytes → 413; `fields.website` truthy → 200 `{ ok: true }` with no insert and no Sheet POST (honeypot); Turnstile `success:false` → 403; missing required / not in `options` / string over `max` (default 200, textarea 2,000) / email failing `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` → 422 `{ error: "<field>" }`. Unknown field names are dropped. `checkboxes` accepts an array whose every item is in `options`; `checkbox` is boolean; email lower-cased and trimmed. Sheet `values[i]` = string, arrays joined `", "`, booleans `"yes"`/`""`.

- [ ] **Step 1: Write the failing tests** in `apps/website/forms-api.test.ts`. Build `env` with a fake `DB` whose `prepare(sql).bind(...args).run()` records `{ sql, args }`, stub `globalThis.fetch` to answer `siteverify` with `{ success: true }` (or `false` per test) and the Sheet URL with 200, collecting calls; `waitUntil` collects promises. Helper `post(body, envOverrides?)` builds a `Request("https://capfolder.com/api/submit", { method: "POST", body })`. Tests:
  - `unknown form id → 400`
  - `honeypot filled → 200 ok, no insert, no sheet call`
  - `turnstile failure → 403, no insert`
  - `download without os → 422 {error:"os"}`
  - `stage outside STAGES → 422 {error:"stage"}` (Review Focus 2)
  - `book-a-call notes of 2000 chars accepted, 2001 rejected 422` (Review Focus 3)
  - `valid download → 200, one INSERT with form_id "download", data JSON has email lower-cased, email column set, ip_hash is 64 hex chars and not the raw IP, user_agent passed`
  - `valid book-a-call → sheet POST body is { secret, form:"book-a-call", created_at ISO, columns: Object.keys(FORMS["book-a-call"]), values: same length, help joined with ", " }`
  - `sheet webhook rejecting → still 200 ok` (fetch to the Sheet URL rejects; assert the response resolved before awaiting `waitUntil` promises; Review Focus 4)
  - `body over 16000 bytes → 413`

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/website && npx vitest run forms-api.test.ts`
Expected: FAIL, cannot find module `../../functions/api/submit.js`.

- [ ] **Step 3: Implement `functions/api/submit.js`** per Interfaces. Header comment in the style of `functions/stats/[[path]].js` naming `integrations/forms.md`. `sha256(s)` via `crypto.subtle`. One `json(data, status)` helper. Validation is one loop over `FORMS[formId]`; no per-form code paths.

- [ ] **Step 4: Run tests**

Run: `cd apps/website && npx vitest run forms-api.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add functions/api/submit.js apps/website/forms-api.test.ts
git commit -m "feat(website): /api/submit stores form submissions in D1 and mirrors them to the Sheet"
```

---

### Task 3: forms.js dialog

**Files:**
- Create: `apps/website/forms.js` (ES module)
- Modify: `apps/website/package.json` build script: add `forms.js` to the `cp -r` list
- Test: `apps/website/forms-ui.test.ts` (plain node vitest, no DOM library: jsdom is not a dependency of the website package and we don't add one; DOM behaviour is checked by hand in Task 4 step 5)

**Interfaces:**
- Consumes: `FORMS` from `functions/api/submit.js` is *not* imported (the function and the page are separate deploy units); `forms.js` has its own `FORMS` with the same keys plus `label`, `placeholder`, `intro`, `thanks: [heading, text]` per Design. A test asserts the two `FORMS` have identical form ids, field names, order and options.
- Produces: `export function toFields(fd: FormData, schema, search: string)` → the `fields` object for the request (checkbox groups via `fd.getAll`, `checkbox` → boolean, `utm_source`/`ref` from `search`, honeypot passed through). `export const ERROR_HTML` = the error line copy. `export function open(formId, opts = {})` → shows the dialog; `opts.onSubmit()` is called after a 200; `opts.autoClose` (ms) closes the dialog after success. Dialog markup: `<dialog class="cfdlg"><form method="dialog"…>` with `<h2>`, intro `<p>`, one `<label>` per field (radio/checkbox groups in `<fieldset><legend>`), hidden `website` honeypot `tabindex=-1 autocomplete=off`, a `<div class="cf-ts">` Turnstile mount, submit `<button class="btn btn-d">` whose text is the form's button label ("Download" / "Tell me when it's ready" / "Book a call"), and a `<p class="cf-err" hidden>` for errors. Styles injected once as a `<style id="cfdlg-css">` from a template string in the module: IBM Plex Sans, white panel, `border-radius:16px`, `border:1px solid #E4E4E0`, backdrop `rgba(14,18,15,.45)`, inputs `padding:12px 14px; border:1px solid #D9DAD6; border-radius:10px; font:inherit`, focus ring `2px solid #1F6F4A`, max-width 520px, full-width sheet under 560px.
- Turnstile: `const SITE_KEY = "1x00000000000000000000AA"` (Mads swaps in the real key per `integrations/forms.md`); `api.js?render=explicit` appended to `<head>` on first `open()`; `turnstile.render(mount, { sitekey, appearance: "interaction-only" })`; on submit read `turnstile.getResponse(widgetId)`. If the script fails to load within 8 s, or `/api/submit` returns non-2xx, show in `.cf-err`: "Something went wrong. Email <a href="mailto:privacy@capfolder.com">privacy@capfolder.com</a> and we'll sort it." (Review Focus 5).
- Submit: `e.preventDefault()`, disable the button and set its text to "Sending…" (Review Focus 1), `fetch("/api/submit", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ formId, fields, token }) })` where `fields` = `Object.fromEntries(new FormData(form))` with checkbox groups collected via `fd.getAll`, `updates`/booleans as `true`/`false`, plus `utm_source`/`ref` from `location.search`. On 200: replace the form body with the thank-you heading and text, re-enable nothing, call `opts.onSubmit?.()`, and `autoClose` if set.

- [ ] **Step 1: Write the failing tests** in `apps/website/forms-ui.test.ts` (Node 22 has `FormData` built in):
  - `FORMS in forms.js matches FORMS in the function` (ids, field order, options, required flags)
  - `toFields: checkbox groups become arrays, the updates checkbox becomes a boolean, utm_source and ref come from the search string, unticked checkbox is false`
  - `toFields passes the honeypot through untouched`
  - `every form has intro, thanks[heading, text] and a button label, and ERROR_HTML links mailto:privacy@capfolder.com`
  - `forms.js never references tally.so and loads Turnstile from https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit` (read the file as text)

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/website && npx vitest run forms-ui.test.ts`
Expected: FAIL, cannot find module `./forms.js`.

- [ ] **Step 3: Implement `apps/website/forms.js`** per Interfaces, and add `forms.js` to the build `cp -r` list in `apps/website/package.json`.

- [ ] **Step 4: Run tests**

Run: `cd apps/website && npx vitest run forms-ui.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/website/forms.js apps/website/forms-ui.test.ts apps/website/package.json
git commit -m "feat(website): own form dialog (download, Pro waitlist, Book a call) replaces the Tally popup"
```

---

### Task 4: Wire the site, drop Tally

**Files:**
- Modify: `apps/website/track.js:22-47` (Book a call handler)
- Modify: `apps/website/index.html:705-706` (privacy copy), `:812-840` (download/Pro handlers)
- Modify: `apps/website/_headers:2` (CSP)
- Modify: `apps/website/help/local-ai/index.html:97`, `apps/website/help/install-local-ai/index.html:96` (foot links)
- Modify: `apps/website/PRODUCT.md:33`, `integrations/tally.md` (top note: retired, see forms.md)
- Test: `apps/website/site.test.ts:45-51, 142-148`

**Interfaces:**
- Consumes: `import("/forms.js").then((m) => m.open(id, opts))`.

- [ ] **Step 1: Update `site.test.ts`** (these fail first):
  - Rename the Tally test to `download goes through our own form, then GitHub Releases; donations through Revolut`: assert `html` contains `import("/forms.js")`, `"download"`, the GitHub and Revolut URLs; assert `html` does not contain `tally.so`.
  - New test `no Tally anywhere on the live site`: for every file in `git ls-files 'apps/website/*.html' 'apps/website/*.js' 'apps/website/_headers'` excluding `testing-landing-page/`, assert it does not contain `tally.so`.
  - New test `CSP allows Turnstile and nothing else new`: `_headers` contains `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com`, `frame-src https://challenges.cloudflare.com`, and not `tally`.
  - In the privacy test, replace `"Tally"` in the named list with `"Turnstile"` and add `"Google Sheets"`.
  - Build-list test: `package.json` build script contains `forms.js`.

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/website && npx vitest run site.test.ts`
Expected: FAIL on the four changed/new tests.

- [ ] **Step 3: Wire it**
  - `track.js`: replace the Tally block with: on `DOMContentLoaded`, for each `[data-talk]` add a click handler `import("/forms.js").then((m) => m.open("book-a-call", { onSubmit: () => globalThis.umami?.track("book-call-submitted") }))`. Update the comment to name `integrations/forms.md`.
  - `index.html`: `#getdl` → `open("download", { autoClose: 800, onSubmit: () => { window.umami?.track("download-form-submitted"); showDownloads(); } })`; `#prowait` → `open("pro-waitlist", { onSubmit: () => window.umami?.track("pro-waitlist-submitted") })`; delete `openForm` and the Tally comments. Privacy paragraphs: "**The forms.** The download, Pro list and Book-a-call forms are ours. What you type is stored on Cloudflare (D1) and copied to a Google Sheet we read, with your IP hashed, not stored. A Cloudflare Turnstile check runs when you open a form to keep bots out. Email privacy@capfolder.com to be removed, or reply to any email." Keep the Pro-list 25% sentence.
  - `_headers` CSP: `default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://api.github.com; frame-src https://challenges.cloudflare.com; form-action 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'`.
  - Help foot links: `<a href="/#contact">Book a call</a>`.
  - `PRODUCT.md:33`: "(our own form, integrations/forms.md)". `integrations/tally.md`: first line "**Retired 2026-11: the site uses its own forms, see `integrations/forms.md`.** Kept for the field history."

- [ ] **Step 4: Run the whole website suite and the build**

Run: `cd apps/website && npx vitest run && pnpm build && grep -c "forms.js" dist/index.html`
Expected: all tests PASS; build succeeds; grep prints a number ≥ 1 and `ls dist/forms.js` exists.

- [ ] **Step 5: Manual check (local)**

Run: `cd apps/website && pnpm build && npx wrangler pages dev dist --d1 DB=forms --binding TURNSTILE_SECRET=1x0000000000000000000000000000000AA IP_SALT=dev SHEETS_SECRET=dev SHEETS_WEBHOOK_URL=https://example.invalid` (first run `npx wrangler d1 execute forms --local --command "<CREATE TABLE…>"` from `integrations/forms.md`). Open the page, submit each of the three forms once, confirm the thank-you state, then `npx wrangler d1 execute forms --local --command "SELECT form_id, email FROM submissions"` shows three rows.
Expected: three rows, one per form id.

- [ ] **Step 6: Commit**

```bash
git add apps/website/track.js apps/website/index.html apps/website/_headers apps/website/help apps/website/site.test.ts apps/website/PRODUCT.md integrations/tally.md
git commit -m "feat(website): all three forms are ours; Tally removed from the site, CSP and privacy copy"
```

---

### Mads' dashboard steps (after merge, before the Tally forms are deleted)

Everything in `integrations/forms.md`, in order: create D1 + table, bind `DB`; create the Sheet + Apps Script, set `SHEETS_WEBHOOK_URL` and `SHEETS_SECRET`; create the Turnstile widget, put the site key in `forms.js` (one-line commit) and the secret in Pages; set `IP_SALT`; turn on Sheet notifications; submit each form once on production and check the three tabs and the email; then delete the Tally forms.
