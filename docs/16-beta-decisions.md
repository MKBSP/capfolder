# Decisions before the HN beta (2026-10-11)

From five tester passes (cap table, import/documents, signing/relay/security, install/updates, website/launch) and one code review. Already fixed items are at the bottom. **R:** is the recommendation.

## Blockers: decide before any tester downloads

| # | Issue | R |
|---|---|---|
| B1 | **capfolder.com is unregistered**, but the app has `https://relay.capfolder.com` built in (signing + install ping). Whoever registers it receives pings and documents. | Register it today. |
| B2 | **The signing relay isn't hosted.** The site and the Show HN post say investors sign from a link. In a beta, Send fails with "you're offline". | Host it (B3) before posting, or relabel signing "self-host only during the beta" on the site, in the post and in the app. |
| B3 | **No production relay setup exists**: only the dev compose (Mailpit, fixed passwords). Vercel can't run it (in-memory codes, files, Documenso, the 4.5 MB body limit). | One Hetzner VPS in the EU (about €6–9 a month) running relay, Documenso, Postgres and Caddy, plus an email API (Resend/Postmark). I write the prod compose and a runbook; it is also the self-host recipe. Website on Vercel, relay on the VPS. |
| B4 | **Relay abuse.** Open Documenso signup; any verified email can send 200 Documenso-branded emails a day; the relay's own inbox may receive every signed PDF. | Disable signup, set 5 envelopes per email per day plus a global cap and a kill switch, and turn off owner emails. |
| B5 | **(Refusal done 2026-10-12: unapplied OCF records are refused at import and append.)** **Priced rounds can't be recorded** (no new class, no authorized increase, no SAFE conversion). OCF imports with conversions or splits are accepted and **silently ignored**, so the cap table comes out wrong with no warning. | Refuse transactions the engine doesn't apply, with a plain list (small). Then a minimal "Record priced round" (new class, authorized, convert SAFEs to typed share counts), or say "pre-priced-round companies" in the launch copy. |
| B6 | **Import loses data.** Pulley's one-column-per-class export maps only Name and Options. Grants without vesting columns import as fully vested. | An "unpivot class columns" step. Unknown vesting becomes "vesting unknown" plus a one-time question ("4y/1y from grant date?"). |
| B7 | **Comma-decimal countries can't finish the wizard**: the default "10,000,000" fails to parse; par isn't parsed. "(USD)" is hard-coded for EUR/GBP companies. | Locale-formatted defaults; currency labels from the company. |
| B8 | **A filled-in but unsigned PDF auto-files as signed proof** (no draft markers). | Auto-file as proof only with evidence of signing (PDF signature, e-sign stamp, OCR'd scan); everything else asks "Is this the signed copy?". Fewer auto-files, zero wrong ones. |
| B9 | **"I only have documents" dead-ends** for anything but SAFEs (SPAs and grants can't be added from a document). | "Add to cap table" for SPAs and grants, pre-filled; or change the copy. |

## Decide before launch

- **Options never expire** after termination (the 90-day window shown isn't enforced). R: store the window, raise a What's-missing item, one-click "Record expiry".
- **Pool not counted against authorized shares** (9M issued + 2M pool on 10M passes). R: add the invariant.
- **Every grant is an ISO; no custom vesting.** R: ISO/NSO toggle; "Custom" months/cliff (the builder exists).
- **Terminate on founder stock** writes a cancellation, not a repurchase. R: Terminate for options only; stock goes to Repurchase.
- **SAFE discount "0.2" becomes 0.2%; pre-money SAFEs are stored as post-money.** R: exact percent parsing with a plain error; pre/post toggle on "Record as signed".
- **A missed 83(b) disappears** after 30 days. R: red gap until a document is attached or dismissed.
- **One bad row blocks a whole import; one file only; can't undo an import; same-name people merge silently; Windows-1252 CSVs garble accents.** R: "Skip these rows" with a note, multi-file import, "Discard import" while it's the only data, list merges in review, windows-1252 fallback.
- **Signed PDF lost if Signatures isn't opened within 7 days**; filing doesn't verify a signature exists. R: keep 30 days, poll on start, require a PDF signature plus the certificate page.
- **Device tokens in plain settings.json, no per-device revoke.** R: keychain plus "sign out all devices".
- **Signing emails don't name the founder**; replies go to the relay. R: founder and company in the message, reply-to the founder, SPF/DKIM/DMARC on a subdomain.
- **GDPR**: privacy contact, sub-processor list, a data processing clause in the terms (founder = controller, you = processor for signer data), EU host, proxy logs off for /ping. The in-app terms don't mention the relay. R: add one clause now, lawyer later.
- **Two laptops on Dropbox/iCloud lose edits silently** (conflicted copies of events.jsonl are ignored; derived files rewritten on every open cause churn). R: banner on conflict copies, write derived files only when changed, say "one computer at a time".
- **A torn last line (crash, disk full) makes the vault read-only forever.** R: set a torn final line aside to `events.jsonl.torn-<time>` and continue (valid lines untouched).
- **settings.json written in place; a corrupt file silently turns the lock off.** R: temp file plus rename; on parse failure keep the lock if a password exists.
- **CLA + AGPL will be asked about on HN** (the draft CLA wants relicensing rights; CLA Assistant isn't installed). R: DCO for the beta, or one honest sentence on why.
- **The email gate vs Show HN rules.** Done: email is now optional ("No thanks, just download") — revert if you disagree.
- **Mobile visitors** get desktop download buttons. R: "Open on your computer" on phones.
- **Claims to verify after the first real build**: "~15 MB", "Import from Pulley/Carta: Yes", "YC W22", "28 investors", "100% open source" (Documenso licence).

## Later
Pool can't shrink / one plan only · corrections can't add a cap or change discount/MFN · documents count from their attach date in past as-of views · issuing before formation allowed · wizard angels saved as institutions · MFN/acceleration not modelled · HEIC/Word files silently skipped (count them) · the 500-file cap re-reads the same files and the review queue isn't saved · local AI failures are silent, no Stop · "Locate…" for moved files · checklist misses imported preferred holders, no Unlink · lawyer zip includes drafts · password-protected PDFs · single-instance guard · old macOS WebKit · dark mode · UTC "today".

## Fixed in this pass (each with a test)
- Transfer refuses holdings whose vesting stopped with unvested shares left, and schedules with no recorded start. Previously they turned vested.
- Draft detection ignores checkboxes and filled-in brackets. A reversal can't be reversed.
- Dropped folders: Rust expands them and grants read access to the documents only (pdf/png/jpg, max 500), not the whole tree.
- A locked captable.csv (Excel on Windows) no longer fails a save or rolls back a rename/replace. The save stands and the app says why.
- Rename: Windows-reserved names, missing files, case-only changes. Replace drops the old copy's OCR/sorting flags. Symlinked folders in docs/ are refused.
- Unlock shows keychain errors instead of "wrong password". The minimum window height is 560 (it fits 1366×768 and 150% scaling).
- release.yml: beta builds are ad-hoc signed on macOS, published as normal releases, with install steps. Fixed a bug where Apple secrets would leak into beta builds.
- Website: email optional, a noscript link, beta install steps, the exact disclaimer in the footer, an honest deletion window (7 days). Issue templates and SECURITY.md.
