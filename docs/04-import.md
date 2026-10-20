# 04 · Import (F-07) — technical

The most important flow: Pulley stops operating Dec 8, 2026. Goal: any export → OCF objects → validated → reconciled to the share → saved.

## Pipeline
```
files → detect() → map() → toOCF() → validate(ajv, OCF schemas) → reconcile() → preview → append events
```

## 1. Detect
Detect by **content**, not file name.

| Format | Signal [verify against real files] |
|---|---|
| OCF | zip/folder with an OCF manifest file. The JSON `file_type` fields start with `OCF_` |
| OCX (Open Cap Table Excel, e.g. Carta "Open Cap Table report") | Sheet names/headers matching the OCX template |
| Pulley "Detailed Cap Table" (xlsx) | Pulley-specific sheet names/header row. Get from real pilot files |
| Carta "Cap table report" (Summary / Detailed / Securities ledger), Vesting report, Stakeholder details | Header rows. Get from real files |
| Cake: Cap table (xlsx), Contact details (csv), Noteholders (csv), Equity grants, Transaction history | Header rows. Get from real files |
| Generic spreadsheet | Fallback |

**Detection is data, not code:** each detector lives in the rules pack (`docs/07`) as `{ format, match: { sheetNames?, headerContains[] }, mapping }`. A new vendor format needs only a rules-pack update.

## 2. Map
Map each source column to a **canonical field**:
```
stakeholder.name, stakeholder.email, stakeholder.type (individual|institution)
security.kind (common|preferred|option|safe|note|warrant)
security.class, quantity, price_per_share, strike, issue_date, certificate_id
vesting.start, vesting.months, vesting.cliff_months, vesting.frequency, vesting.vested_to_date
safe.amount, safe.cap, safe.discount, safe.mfn, safe.date
plan.name, plan.size
transaction.type, transaction.date, transaction.quantity (for ledgers/history)
summary.total_outstanding, summary.fully_diluted, summary.per_class (for reconcile)
```
- **Known formats:** the mapping comes from the rules pack.
- **Unknown format:** AI proposes a mapping (header names + 5 sample rows → canonical fields, JSON schema output), the founder confirms in a mapping table UI, and the mapping is saved locally (optionally shared back as an anonymized rule).

## 3. To OCF
- **With a transaction history** (ledger, OCF, Cake transaction history): replay it into OCF transactions with their real dates.
- **Snapshot only:** one issuance per position, dated with the original issue date if present, else the export date. Add `meta.note = "imported snapshot"` and create a gap: "History before import not available".
- **Vesting:**
  - If the full schedule is present, build `VESTING_TERMS` + `TX_VESTING_START`.
  - If only "vested to date" is present, mark the grant "vesting unknown" (a gap) and keep the vested number as a reconcile check.
- **People:** dedupe by email, then normalized name. Probable duplicates go to the merge suggestions (F-21).

## 4. Validate
- Run `ajv` against the OCF schemas for every object.
- Errors are shown per source row, as "Row 14 (Steve Wozniak): strike price missing".

## 5. Reconcile (blocks save)
Compare our computed values with the export's **own** summary numbers:

| Check | Tolerance |
|---|---|
| Total outstanding shares per class | exact |
| Fully diluted total | exact |
| Options granted / pool available | exact |
| Number of stakeholders | exact (after confirmed merges) |
| Per-holder % | ±0.01% (display rounding) |
| SAFE total amount | exact |

- **Mismatch:** a diff table shows the rows that explain the gap.
- **Founder options:** fix the mapping, edit a row, or "Accept with note". Accepting writes the reason into `meta.note` on a `note` event.

## 6. Save
- Append the events in one batch with `meta.source = "import:<filename>"`.
- Copy the original files to `docs/_imports/<date>_<file>`.
- Then prompt F-09: "Reports don't include signed documents. Drop them in now."

## Test plan
- **Fixtures needed (urgent, before Dec 8):** the pilot company's Pulley exports (every report Pulley offers + the Detailed Cap Table xlsx). Anonymize names/emails before committing (keep numbers).
- Synthetic fixtures for Carta/Cake, built from their help-page descriptions until real files arrive. Mark them `synthetic`.
- **Golden rule:** import(fixture) → reducer → equals the fixture's own summary sheet, exactly.

## Export instructions shown to the user (rules pack content)
| Tool | Steps |
|---|---|
| Pulley | Dashboard → **Download Cap Table** (uncheck "All Time" for an as-of date), or Company → **Reports** → Detailed Cap Table → Generate. Also download every signed document. |
| Carta | Cap Table / Essentials → **Run reports** → "Open Cap Table report" (OCX) if listed. Also Cap table report (Summary, Detailed, Securities ledger by type and class), Vesting report (with milestones) and Stakeholder details. Download signed docs separately. |
| Cake Equity | Compliance → **Reporting** → Exports: Cap table (XLSX), Contact details (CSV), Noteholders (CSV), Equity grants, Transaction history. |
