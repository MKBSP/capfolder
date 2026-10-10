# M6: Export and share (design)

Scope approved by Mads, 2026-10-10. Requirements: F-29 and F-30 in `docs/02-user-stories.md`, `docs/03-data-model.md` (exports), and `docs/09-build-plan.md` (M6 acceptance: an exported OCF re-imports into Capfolder with identical state).

## What ships
1. **Export as of a date (F-29).** Home → Export → pick an as-of date (default: the current as-of) and a format:
   - **.xlsx** with tabs Summary, By person, Vesting and SAFEs.
   - **.csv**, the existing `captable.csv` format.
   - **OCF (.zip)**, a standard OCF 1.2.0 manifest plus files.

   A date before the company's formation date is blocked with "The company didn't exist yet on <date>".
2. **Share with lawyer (F-30).** Documents → Share with lawyer → scope "Everything" or "One person" → a .zip saved where the founder picks. Nothing is uploaded.
3. **OCF import in core.** OCF files become event drafts, which are validated and appended to an empty log. This proves the round trip, and M2's import screen will reuse it.

## Libraries (all MIT)
- `exceljs`: writes the xlsx, and M2 will use it to read Pulley/Cake xlsx. Listed in `docs/01`.
- `fflate`: zip writing and reading. Small and pure.
- `pdf-lib`: a one-page-per-section cap table PDF for the lawyer zip. Text uses the standard Helvetica font. Characters outside WinAnsi are replaced. Embedding IBM Plex is a later polish.

## Core (`packages/core/src/export/`; pure, no I/O)
- `sheets(events, asOf)` returns plain sheet data `{name, columns, rows}[]` for the four tabs. It is tested directly.
  - **Summary:** company, as-of, the disclaimer, totals (fully diluted, pool available, SAFE total), then every cap table row.
  - **By person:** one row per stakeholder: shares & options, % FD, vested, unvested, SAFE amount.
  - **Vesting:** one row per grant or vesting stock: granted, vested, unvested, vesting start, next vest, fully vested on, schedule math.
  - **SAFEs:** holder, amount, cap, discount, post-money %, document status.
- `toXlsx(sheets)` returns `Uint8Array` via exceljs.
  - Shares are numbers, and percents are numbers formatted `0.00`.
  - Text stays text, so there is no formula injection.
- `toPdf(sheets)` returns `Uint8Array` via pdf-lib.
- `zip(files: Record<path, Uint8Array | string>)` returns `Uint8Array` via fflate. `unzip` reverses it.
- `lawyerPackage({events, asOf, docs, scope})` returns the file map. `docs` is a map from vault-relative path to bytes, and the caller reads them. Contents:
  - `README.txt`: what's inside, the as-of date, the disclaimer, and the record's chain head hash with its event count.
  - `cap-table.xlsx`, `cap-table.pdf`, `cap-table.csv`
  - `whats-missing.txt`
  - `events.jsonl`
  - `ocf/…`
  - `documents/<docs path>`: every non-removed attached document.
  - **One person:** only that person's holdings (xlsx and pdf), their gaps and the documents linked to them or their securities. No `events.jsonl`, no OCF and no full cap table, because those would show everyone else.
- `fromOcfExport(files: Record<name, string>)` returns `{drafts: EventDraft[]} | {errors: string[]}`.
  - Reads the manifest, then each listed file. Every object is validated with `validateOcf`.
  - Drafts are ordered: definitions (issuer, stakeholders, classes, vesting terms, plans, valuations, legends), then transactions by (date, file order).
  - The issuer comes from the manifest.

## Desktop
- `Platform.saveBytes(defaultName, bytes)` is the binary twin of `saveText`.
- **Home Export menu:**
  - The xlsx, csv and OCF entries open one Export dialog (date and format). The "Coming soon" entry is removed.
- **Documents:**
  - "Share with lawyer (.zip)" opens a dialog (scope, plus a person picker when "One person" is chosen).
  - The dialog reads document bytes through `fs`, and missing files are listed in README.txt rather than failing the export.
  - It saves and shows "Saved to <path>" with a Reveal button.

## Out of scope (later)
- Scope "one round": rounds aren't modeled yet.
- Signing status ("pending"): that is M5.
- Flags listed first: the side-letter flags don't exist yet.
- The OCF import screen: that is M2.
- DOCUMENT objects in the OCF export: they need md5s (deferred since M1).

## Tests
- **Round trip:** acme → `toOcfExport` → zip → unzip → `fromOcfExport` → `appendEvents` on an empty log. The `captableCsv` output is identical at several as-of dates, ignoring `doc_status` because docs aren't in OCF.
- **Sheets:** the acme values for every tab, and the formula-like name stays text in the xlsx (read back with exceljs).
- **Lawyer zip:**
  - The expected file list for both scopes.
  - Person scope leaks no other stakeholder's name in any text file.
  - A removed doc is excluded.
  - A missing file is noted in README.txt.
- **Desktop:** the export dialog blocks a pre-formation date, and both dialogs save bytes through the fake platform.
