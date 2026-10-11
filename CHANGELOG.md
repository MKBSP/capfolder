# Changelog

All notable changes. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow semver once the app ships.

## [Unreleased]

### Added — M4 · document sorting (2026-10-11)
- Documents → **Add documents** (and Start → "I only have documents"): choose a folder or files (PDFs, scans, photos). Each is read on this computer: the PDF's text, or OCR (tesseract.js, bundled; no CDN) for scans and photos.
- Sorting: rules first (YC SAFE and investor-form SAFEs, grant notices, purchase agreements, 83(b), IP assignments, board consents, plans, certificate, bylaws), then documents you confirmed before (nearest match, 4 of 5 must agree), then your local AI if connected. Fields are read (investor, amount, cap, discount, shares, price, date); a value OCR couldn't read is marked unreadable, never guessed.
- A document is filed by itself only when it matches exactly one holding by number and name (or a remembered alias), within 3 days, with nothing contradicting the cap table, and that holding doesn't already have one. Everything else waits in **Needs you** (ImportReview.html): fix the type, fields or holding, "Remember: 'Fund X Ventures I, L.P.' is Fund X", or "Not an equity document". An unknown SAFE can be added to the cap table and filed in one step. Duplicates (same content) and receipts are skipped, and originals are never moved.
- **Settings → AI** (F-10): finds Ollama or LM Studio on this computer and lets you pick a model. AI only proposes: whatever it sorts goes to Needs you. Its answer is checked (type, numbers, dates) and the document is sent as data, never as instructions.
- Core: `classify`, `extract`, `nearest`, `sortText`, the `stakeholder_alias` event and `state.aliases`; golden test folder `fixtures/acme-docs/` (13 of 13 clean documents filed, 0 wrong).

### Added — M5 · signing (2026-10-10)
- `apps/relay`: the only server. Email codes and device tokens (F-04); send in signing order with reminders (day 3, then every 4 days) and 30-day expiry; status per signer; your own signing link only; remind; cancel and delete; the sealed PDF; hourly purge of anything older than 30 days. Abuse limits on codes, guesses, envelopes (20/day), signers (10) and size (15 MB). Runs locally with Documenso + Mailpit (`apps/relay/README.md`).
- Desktop: verify your email on first run, in Settings or at the first send; Settings → Signing (relay address, test connection; F-37). Send any PDF from Documents, or a new SAFE from New SAFE: Capfolder adds a signature page, you sign last. Signatures screen: status per signer, Sign now (opens your signing page), Send reminder, Cancel & delete from relay (F-17). When everyone has signed, the sealed copy's original pages are checked (same text, nothing added on top, no page missing) against what was sent, filed in `docs/<type>/`, linked, and the relay copy deleted. A SAFE sent for signature is recorded on the cap table only once it's signed.
- Tests: the real relay over an in-memory Documenso in desktop tests; opt-in contract and end-to-end tests against a real local Documenso (both parties sign; the sealed PDF passes the check).

### Added — country and currency (2026-10-10, from Mads)
- **You:** your country (Welcome and Settings) sets how numbers look and are typed ("1.000.000,50" vs "1,000,000.50") and whether typed dates are month-first (US) or day-first. Defaults to the computer's language.
- **Company:** country and state of incorporation and the company currency (Create company and Settings → Company). Changing the name or incorporation records an ISSUER update; the currency is used for new records (amounts already recorded keep theirs) and for every amount shown.
- Imports use the company currency, and the founder's decimal mark when a file is ambiguous.

### Added — M2 · import (2026-10-10)
- Import screen (from Start, or Home when the folder is empty): pick the source (Pulley, Carta, Cake, OCF, any spreadsheet) with that tool's export steps, choose the file, match columns, check and save.
- OCF .zip imports with its full history. Spreadsheets (.xlsx, .csv): header row and columns guessed, editable; one position per row; people deduped by email, then name; dates in ISO, US, day-first, Excel serial or "Mar 14, 2023"; vesting schedules built from start + months + cliff, or "vesting unknown" when only "vested so far" is given; preferred classes; SAFEs with cap, discount, MFN; rows without a date become "imported snapshot".
- Saving is blocked until every row is valid and the fully diluted total matches the old tool to the share, or the founder accepts with a note (saved in the record). Events carry `source: import:<file>`; the original file is kept in `docs/_imports/`. Then Documents asks for the signed documents.
- Core: CSV (papaparse) and xlsx readers, field synonyms, `buildImport`, `reconcile`, `previewDrafts`, `ocfImportDrafts`; general `vestingTerms` builder.

### Added — M6 · export + share (2026-10-10)
- Export dialog on Home: as-of date + format: Excel (.xlsx with Summary, By person, Vesting, SAFEs tabs), CSV, or OCF (.zip). Dates before incorporation are blocked.
- Share with lawyer on Documents: a .zip with README (contents, record hash), cap table .xlsx/.pdf/.csv, every attached document, events.jsonl, OCF and the What's missing list. Scope "Everything" or "One person" (only their holdings, documents and gaps). Nothing is uploaded.
- Core: sheet builder, a small xlsx writer (no formulas, exact decimals), cap table PDF (pdf-lib), zip/unzip (fflate), lawyer package, and OCF import (`fromOcfExport`). An exported OCF re-imports with an identical cap table (M6 acceptance test).

### Changed (2026-10-10, from Mads testing M3)
- Welcome: one "I accept the terms and conditions" checkbox; the usage-count details and disclaimer live in the terms. The usage toggle stays in Settings.
- Dates read day month year ("6 Oct 2026") everywhere; date fields accept "6 Oct 2026", "06/10/2026" or "2026-10-06" and have a calendar button.
- "Lock after" is hidden when there's no lock; side-by-side fields line up.

### Added — M3 · desktop app (2026-10-10)
- Tauri 2 + React desktop app (`apps/desktop`), run with `pnpm dev:desktop`. CI builds unsigned bundles on macOS, Windows, Linux.
- First run: Welcome with app password lock (argon2 hash in the OS keychain) or no lock, idle re-lock, anonymous-usage toggle, disclaimer; Email (skip; verification with M5); Create company (folder picker, backup detection: iCloud, Dropbox, Google Drive, OneDrive, git); Start choice.
- Start from zero wizard: authorized shares, founders with vesting and 83(b) reminder, optional pool and signed SAFEs, live cap table.
- Home: cap table as of any date, fully diluted, vesting bars, expandable rows with next vest and "How is this calculated?", SAFEs as-converted, What's missing with Attach, vault verification banners, CSV export.
- New SAFE (record as signed, live impact), New grant (pool check, 409A warning), New shares, Option pool (create / increase), New person.
- People and Person: vesting chart, holdings, history, Correct… / Reverse…, Edit (same entity), Terminate, Record exercise, Repurchase unvested.
- Documents: due-diligence checklist, attach (copied into docs/, hashed, linked), remove (moved to docs/_removed).
- Settings: lock, idle time, telemetry toggle, company folder. Signatures, AI, relay, updates, import, xlsx and lawyer zip are visible as "Coming soon".
- Core: OCF draft builders, all-or-nothing `appendEvents`, vesting schedule helpers.

### Security (M3)
- Document paths from the vault are kept inside `docs/`; company names can't escape the chosen folder.
- File access scoped to app data, ~/Documents and folders picked in a dialog (persisted-scope plugin).
- A password set during first run is enforced by the idle lock immediately.

### Added — M0 · repo + CI (2026-10-10)
- pnpm monorepo (`packages/core`; other apps/packages are added when their milestone starts).
- CI on GitHub Actions: lint (biome), typecheck, tests, license allow-list check.
- AGPL-3.0 `LICENSE`, draft `CLA.md` / `CCLA.md` (Apache-based, lawyer review pending), `CONTRIBUTING.md`, generated `THIRD_PARTY_LICENSES.md`.
- Handoff package: product docs, user stories, designs, brand, favicon, golden fixture. Domain changed to capfolder.com.

### Added — M1 · core engine (2026-10-10)
- Hash-chained, append-only `events.jsonl` (RFC 8785 canonical JSON, SHA-256); verification reports the first broken line.
- OCF 1.2.0 JSON schemas vendored; ajv validation of every OCF object and export file.
- Reducer: OCF transactions → cap table, as of any date; corrections and reversals; deterministic order (date, ts, id).
- Vesting from real OCF vesting conditions (start + monthly chain, cliff, day-of-month rule, cumulative round-down / rounding); unsupported shapes show as "vesting unknown".
- Exact bigint math; fully-diluted % with largest-remainder rounding; SAFE as-converted % (post-money); "show the math" string for each number.
- Invariants (authorized, pool ≥ 0, vested ≤ granted, exercise ≤ vested, balances, links), "What's missing" gaps, `appendEvent` as the single write path.
- `captable.csv` writer (byte-for-byte golden test), OCF export (manifest + files + md5).
- 132 tests incl. 10k-run property test.

### Security
- Corrections can't pollute object prototypes; CSV cells are guarded against spreadsheet formulas.
- Replay of an untrusted vault never crashes: bad events (duplicate security ids, unknown references, non-positive money, malformed payloads) become listed violations.
