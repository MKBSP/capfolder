# 20 · SumoShares: gap analysis (2026-10-19)

[SumoShares](https://github.com/noahdevkagan/sumoshares) is Noah Kagan's (AppSumo) self-hosted Carta replacement.
- **Basics:** MIT licence, released 2026-10-12, ~1,600 lines of TypeScript, no tests.
- **Stack:** Cloudflare Workers + D1 + R2 + Cron, email through SendFox or Resend, optional Stripe.
- **Who it's for:** a company that has already raised and has many option holders (AppSumo leaving Carta, ~$10k/yr).
- **Overlap:** only partial. Capfolder is for early founders: SAFEs, documents, signing.

Code links are pinned to commit `9bcb136` so the line numbers stay right. `S` below = `https://github.com/noahdevkagan/sumoshares/blob/9bcb136a2685fb8fe8254c45c35975e19a7bb958`.

## What we do better (keep saying it)
- **No setup.**
  - Their install is ~15 minutes in a terminal: wrangler, D1, R2, secrets, DNS records for email.
  - Only developers can do it. Ours is download and open.
- **SAFEs and convertible notes.** They have none, so they don't fit a pre-seed or seed company.
- **Signing.** We have a signing flow. Their only "signature" is a typed name on the exercise form ([S/src/holder.ts#L123-L165]).
- **Documents.** We have Sort, gap detection ("what's missing") and templates. They only upload.
- **The log can't be rewritten.**
  - Our `events.jsonl` is append-only and hash-chained, and fixes are new events.
  - Their triggers block editing or deleting the audit log, but only *deleting* transactions ([S/schema.sql#L147-L150]). Transactions can still be `UPDATE`d.
  - Stakeholders are edited in place, e.g. termination ([S/src/admin.ts#L154]).
- **OCF done properly.**
  - Ours is validated against the official schemas, and import and export round-trip.
  - Theirs is a "simplified" hand-built export, not validated ([S/src/reports.ts#L98-L120]).
- **Math checked by tests.** Golden fixtures gate our CI, and every number can "show the math". They have no tests, only the tie-out script against Carta.
- **Ask AI, onboarding, sample company, help pages.**

## What they have that we don't

### 1. 409A record + expiry banner + grant guard. **Copy (next, offline).**
- **Their version:**
  - They record a valuation (FMV, effective date, expiry, which defaults to 12 months).
  - Every admin page shows a banner from 90 days before expiry. Once it lapses, exercises pause. ([S/src/admin.ts#L13-L20], holder side [S/src/holder.ts#L33-L47])
  - The README says grants below FMV are blocked.
- **Good:**
  - A clear rule: no current 409A means no exercise.
  - The banner text is plain.
  - The 12-month default is right.
- **Bad:** the FMV lives in a separate table, so it isn't tied to a document.
- **For us:**
  - Store the 409A as an OCF `VALUATION` object through an event, linked to the filed PDF.
  - Show the banner on Home.
  - Warn when a new grant's strike is below the current FMV (we already warn on a $0 strike in `NewGrant.tsx`).

### 2. Option deadlines + auto-expire. **Copy (offline version).**
- **Their version:**
  - A daily cron expires vested options past the post-termination deadline and logs it ([S/src/cron.ts#L39-L50]).
  - Termination stops vesting, forfeits unvested options and sets the window, 90 days by default ([S/src/admin.ts#L117-L160]).
- **Good:**
  - The deadline rule: `exercise_deadline` overrides `expiration_date` when it's earlier ([S/schema.sql#L53], [S/src/logic.ts#L74]).
  - The "Ex-Employee" relationship is set on termination.
- **Bad:** writing the expiry automatically with no click. That breaks our "the founder confirms" rule.
- **For us:**
  - When the app opens, list "options past their deadline", with an **Expire them** button. It writes one event per grant.
  - Show a deadline countdown on Person.
  - We already have Terminate; add the exercise-window field if it's missing.

### 3. Carta import from 4 standard reports + tie-out. **Copy the tie-out; consider the multi-report import.**
- **Their version:**
  - The import reads Securities Ledger, Stakeholder Details, Exercised and Settled, and OCX ([S/scripts/import-carta.mjs]). It warns when issued ≠ outstanding + exercised + forfeited + expired + canceled ([L119](https://github.com/noahdevkagan/sumoshares/blob/9bcb136a2685fb8fe8254c45c35975e19a7bb958/scripts/import-carta.mjs#L119)).
  - The tie-out compares totals with the numbers you write down from Carta ([S/scripts/tieout.mjs]).
  - The per-holder check uses Carta's Cap Table and Options Outstanding exports ([S/scripts/compare-carta.mjs]).
- **Good:**
  - Exact Carta menu paths for each report.
  - The balance check per grant.
  - "Must say All totals match Carta".
  - A "before you cancel Carta" checklist (README).
- **Bad:**
  - It's a CLI that writes SQL with string escaping.
  - When it can't reproduce a vesting schedule, it copies Carta's vested count silently, as a warning only.
- **For us:**
  - After any import, a **Check against Pulley/Carta** step: type in their totals (fully diluted, per class, options outstanding, pool available, counts), then see match or mismatch.
  - Add the per-grant balance check to our import warnings.
  - Update our Carta steps in `importRules.ts` to their report names (Securities Ledger etc.). `[verify]` against a real Carta account.
  - A "before you cancel Pulley" checklist on the website and in the help pages.

### 4. Exercise, transaction and audit CSV exports (Form 3921 inputs). **Copy later.**
- **Their version:** `exercises.csv` has FMV at exercise, which feeds Form 3921 and NSO payroll ([S/src/reports.ts#L20-L30]). There are also securities, options and audit CSVs.
- **Good:** the Form 3921 framing is what a US finance person asks for in January.
- **For us:** add an exercises CSV (with FMV on the exercise event) and an events CSV to ExportDialog once a 409A exists (item 1). Only matters for US companies with exercises.

### 5. Holder portal + online exercise. **Pro / cloud tier only. Don't copy the stack.**
- **Their version:**
  - Holders log in with an emailed magic link ([S/src/auth.ts#L30-L50]). They see vested, exercised and available options, the deadline, FMV and ownership %.
  - To exercise, a holder picks a quantity, ticks the agreement and types their name, then gets wire instructions or pays through Stripe Checkout ([S/src/stripe.ts], webhook [S/src/index.ts#L66-L80]).
  - An admin queue marks it paid, approves it and issues the next certificate.
- **Good:**
  - Magic links (hashed tokens, 30-minute expiry, single use).
  - The exercise queue states: requested → paid → approved.
  - "View as holder" for admins.
- **Bad for us:**
  - It needs our data on a server, which goes against local-first.
  - The exercise "signature" is a typed name with no signed document.
  - The cap table has to be online all the time.
- **For us:**
  - Build it with the web app / sync (`docs/12`). Each holder sees only a read-only snapshot the founder publishes, not the vault.
  - Exercise goes through our signing relay with a real document, then comes back as an event the founder confirms.

### 6. Daily email reminders + nightly backup + Monday digest. **Pro only.**
- **Their version:**
  - 409A emails to admins at 90/60/30/7/0 days, and option-deadline emails to holders at 90/30/7 days.
  - `reminders_sent` makes each one send once ([S/src/cron.ts#L1-L60]).
  - A nightly JSON backup goes to R2.
- **Good:** the once-only key pattern (`409a:<id>:<step>`).
- **Bad:** it needs a server that is always on.
- **For us:**
  - Free tier: show these in the app on open (items 1–2).
  - Emails to holders and the backup are Pro features (already on the Pro list: "encrypted online backup").

### 7. Admin conveniences. **Small, copy when we touch those screens.**
- **Their version:**
  - A holders table that can be sorted and searched, with filters: employees, ex-employees, investors, deadline in 90 days.
  - An as-of date picker on the cap table.
  - Fully diluted totals with the plan pool ([S/src/logic.ts#L96]).
- **For us:**
  - Check that People has search and these filters.
  - The as-of picker: we have `asOf` in state, so check that it's exposed on Home.

## Don't copy
- Server-held cap table and the Cloudflare deploy as the only way to run it.
- Rows edited in place (`UPDATE stakeholders`); our fixes stay events.
- No tests.
- Writes made automatically by the system (cron expiring options). Ours propose, and the founder confirms.
- Typed-name "signatures" for legal acts.

## Order (proposal)
1. 409A + banner + grant guard (offline).
2. Deadlines + "Expire them" on open.
3. Import tie-out screen + per-grant balance check + "before you cancel Pulley" checklist.
4. Exercise/events CSVs.
5. Portal, online exercise and reminder emails, together with the web app / Pro.

[S/src/holder.ts#L123-L165]: https://github.com/noahdevkagan/sumoshares/blob/9bcb136a2685fb8fe8254c45c35975e19a7bb958/src/holder.ts#L123-L165
[S/schema.sql#L147-L150]: https://github.com/noahdevkagan/sumoshares/blob/9bcb136a2685fb8fe8254c45c35975e19a7bb958/schema.sql#L147-L150
[S/src/admin.ts#L154]: https://github.com/noahdevkagan/sumoshares/blob/9bcb136a2685fb8fe8254c45c35975e19a7bb958/src/admin.ts#L154
[S/src/reports.ts#L98-L120]: https://github.com/noahdevkagan/sumoshares/blob/9bcb136a2685fb8fe8254c45c35975e19a7bb958/src/reports.ts#L98-L120
[S/src/admin.ts#L13-L20]: https://github.com/noahdevkagan/sumoshares/blob/9bcb136a2685fb8fe8254c45c35975e19a7bb958/src/admin.ts#L13-L20
[S/src/holder.ts#L33-L47]: https://github.com/noahdevkagan/sumoshares/blob/9bcb136a2685fb8fe8254c45c35975e19a7bb958/src/holder.ts#L33-L47
[S/src/cron.ts#L39-L50]: https://github.com/noahdevkagan/sumoshares/blob/9bcb136a2685fb8fe8254c45c35975e19a7bb958/src/cron.ts#L39-L50
[S/src/admin.ts#L117-L160]: https://github.com/noahdevkagan/sumoshares/blob/9bcb136a2685fb8fe8254c45c35975e19a7bb958/src/admin.ts#L117-L160
[S/schema.sql#L53]: https://github.com/noahdevkagan/sumoshares/blob/9bcb136a2685fb8fe8254c45c35975e19a7bb958/schema.sql#L53
[S/src/logic.ts#L74]: https://github.com/noahdevkagan/sumoshares/blob/9bcb136a2685fb8fe8254c45c35975e19a7bb958/src/logic.ts#L74
[S/scripts/import-carta.mjs]: https://github.com/noahdevkagan/sumoshares/blob/9bcb136a2685fb8fe8254c45c35975e19a7bb958/scripts/import-carta.mjs
[S/scripts/tieout.mjs]: https://github.com/noahdevkagan/sumoshares/blob/9bcb136a2685fb8fe8254c45c35975e19a7bb958/scripts/tieout.mjs
[S/scripts/compare-carta.mjs]: https://github.com/noahdevkagan/sumoshares/blob/9bcb136a2685fb8fe8254c45c35975e19a7bb958/scripts/compare-carta.mjs
[S/src/reports.ts#L20-L30]: https://github.com/noahdevkagan/sumoshares/blob/9bcb136a2685fb8fe8254c45c35975e19a7bb958/src/reports.ts#L20-L30
[S/src/auth.ts#L30-L50]: https://github.com/noahdevkagan/sumoshares/blob/9bcb136a2685fb8fe8254c45c35975e19a7bb958/src/auth.ts#L30-L50
[S/src/stripe.ts]: https://github.com/noahdevkagan/sumoshares/blob/9bcb136a2685fb8fe8254c45c35975e19a7bb958/src/stripe.ts
[S/src/index.ts#L66-L80]: https://github.com/noahdevkagan/sumoshares/blob/9bcb136a2685fb8fe8254c45c35975e19a7bb958/src/index.ts#L66-L80
[S/src/cron.ts#L1-L60]: https://github.com/noahdevkagan/sumoshares/blob/9bcb136a2685fb8fe8254c45c35975e19a7bb958/src/cron.ts#L1-L60
[S/src/logic.ts#L96]: https://github.com/noahdevkagan/sumoshares/blob/9bcb136a2685fb8fe8254c45c35975e19a7bb958/src/logic.ts#L96
