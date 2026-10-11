# 09 · Build plan

**Target:** public launch (Show HN + Bookface) **before Nov 30, 2026**, the Pulley→Carta opt-in deadline. Pulley shuts down Dec 8.

## M0 · Repo + CI (days 1–2) ✅ done 2026-10-10
- pnpm monorepo per `docs/01`, AGPL-3.0 `LICENSE`, `THIRD_PARTY_LICENSES.md`, `CLA.md` + CLA Assistant + `CONTRIBUTING.md` (`docs/13`).
- CI: lint, typecheck, unit + golden tests, Tauri build matrix (mac/win/linux).
- **Accept:** `pnpm test` runs green on an empty core with the Acme golden test failing on purpose ("not implemented").

## M1 · Core engine (week 1) ✅ done 2026-10-10 (Tauri build matrix moved to M3)
- Event envelope, JCS hashing, chain verify, append API.
- OCF validation (ajv + OCF schemas).
- Reducer, vesting (cumulative floor), invariants, gaps, as-of replay.
- `captable.csv` + `ocf/` writers.
- **Accept:**
  - `fixtures/acme-vault` reproduces `captable.expected.csv` byte-for-byte.
  - Tampering with any line fails chain verification at that line.
  - Property tests: invariants hold for 10k random valid event sequences.

## M2 · Import (weeks 1–2) — highest risk ✅ done 2026-10-10 (OCF + generic spreadsheet; vendor detectors when real files arrive)
- Detectors + mappers for OCF, Pulley xlsx, Carta reports/OCX, Cake exports, generic + AI mapping.
- Reconcile + diff view data.
- **Accept:**
  - Pilot company's real Pulley export imports with totals matching to the share.
  - Every unmappable column is surfaced, never silently dropped.

## M3 · Desktop shell (weeks 2–3) ✅ done 2026-10-10 (built before M2)
- First run (F-02 to F-06): lock, email, company, start choice.
- Home (cap table + What's missing), Person, Documents, guided from-zero form (F-08), New SAFE/Grant/Shares forms, Settings.
- **Accept:** a founder goes from install to a populated cap table in under 5 minutes with the pilot data.

## M4 · Document sorting (week 3) ✅ done 2026-10-11 (synthetic acme-docs: 13/13 clean docs auto-filed, 0 wrong; re-run on the pilot's folder when it arrives)
- PDF.js + tesseract.js, rules, kNN (local embeddings), AI extract, match, review UI (ImportReview screen), learning rules.
- **Accept:** on the pilot's document folder, ≥80% are auto-filed correctly, the rest land in "Needs you", and 0 are filed against the wrong row.

## M5 · Signing (weeks 3–4) ✅ done 2026-10-10 (runs locally; hosting is Mads' decision)
- `apps/relay` + Documenso docker-compose, email verification, envelopes, reminders, purge.
- App: send, status, in-app founder signing, fetch + verify + file + purge.
- **Accept:**
  - End-to-end YC SAFE round trip with a real email.
  - Relay holds nothing 24h after filing.
  - A tampered signed PDF is rejected.

## M6 · Export + share (week 4) ✅ done 2026-10-10
- xlsx/csv as-of export, lawyer zip, OCF export.
- **Accept:** exported OCF re-imports into Capfolder with identical state (round trip).

## M7 · Updates + release (week 4) ✅ built 2026-10-11 (acceptance needs a real v0.1.0 → v0.1.1 release with Mads' certificates)
- Tauri updater with signed builds, notarized macOS, signed Windows. Rules pack channel.
- **Accept:** v0.1.0 → v0.1.1 auto-updates on all three OS. A rules-pack change shows up with no restart.

## M8 · Website + launch (by ~Nov 23)
- `apps/website` from `design/website/index.html`, with the Tally form wired (`integrations/tally.md`), download links to GitHub Releases, Revolut link, acknowledgements with real licenses.
- Metrics wired per `docs/11-metrics.md`: Plausible/Umami on the site, `/ping` on the relay + the toggle on the Welcome screen, a daily cron for GitHub downloads and stars.
- Show HN post + Bookface post. Pass/fail table in `docs/11-metrics.md`.
- Re-check every cell of the website comparison table against the vendors' pages the week of launch (`docs/10-research.md`).

## Golden tests to keep adding
- `acme-vault` (provided)
- Pilot company (anonymized)
- Edge cases: cliff day-of-month 31st, termination before cliff, partial SAFE transfer, exercise then repurchase, pool increase, correction + reversal, as-of before/after each event

## Out of scope for v1
See `docs/00-overview.md`.
