# M2: Import (design)

Mads, 2026-10-10: OCF and generic spreadsheets now. Pulley, Carta and Cake get their own detectors once real export files arrive (he's collecting them from testers). Requirements: F-07 in `docs/02-user-stories.md` and `docs/04-import.md`.

## Flow (StartChoice → "Import from Pulley or Carta" → Import screen)
1. **Where is your cap table now?** Pulley, Carta, Cake, an OCF file, or any spreadsheet. Each choice shows that tool's export steps (the table in docs/04). The steps live in `importRules.ts`, which will move to the rules pack in M7.
2. **Choose the file.**
   - `.zip` or `.json` is detected as OCF by content (a manifest with `file_type OCF_MANIFEST_FILE`).
   - `.csv` and `.xlsx` are spreadsheets.
   - `.xls` and anything else: "Save it as .xlsx or .csv and try again."
3. **Spreadsheet only: match the columns.**
   - Pick a sheet (xlsx). The header row is guessed: the row in the first 20 with the most recognised headers.
   - Each column gets a field from a dropdown, pre-filled from header synonyms. The first five rows are shown as a preview.
   - The AI mapping for unknown formats is M4.
4. **Check and save.**
   - **Row issues block saving.** Example: "Row 14 (Lisa Moreau): strike price missing".
   - **Inputs:** authorized shares per class (pre-filled with the issued total), the option pool's total reserved (pre-filled as granted + any "available" pool row), and the export date (default today).
   - **Reconcile:** the founder types the fully diluted total their old tool shows. Saving is blocked until it matches to the share, or until they choose "Accept with note". The note is saved as a `note` event. The computed summary is shown next to it: fully diluted, outstanding per class, stakeholders, SAFE total.
   - **OCF:** lossless, so there are no mapping or reconcile steps. Schema errors are shown per file and object.
5. **Save.**
   - One batch append with `meta.source = "import:<file name>"`.
   - The original file is copied to `docs/_imports/<date>_<file name>`.
   - Then go to Documents with: "Reports don't include signed documents. Drop them in now." (F-09)

Import is for a company folder with nothing issued yet. Otherwise: "Import works on a new company folder. Create one first." Merging into an existing cap table comes later.

## Core (`packages/core/src/import/`; pure)
- `parseCsv(text)` returns `string[][]` (papaparse, MIT).
- `readXlsx(bytes)` returns `{name, rows: string[][]}[]`.
  - A minimal reader on fflate covering shared strings, inline strings, numbers and cell references.
  - Date cells come through as Excel serial numbers. They're turned into dates by the field that holds them, not by cell styles.
- `FIELDS`: the canonical fields from docs/04 that the generic importer understands.
  - Name, email and type.
  - Kind, class, shares, price per share, strike and issue date.
  - Vesting start, months, cliff months and vested to date.
  - SAFE amount, cap, discount and MFN.
- `guessMapping(header)` maps each column to a field via a synonym table, or null.
- `buildImport({table, mapping, issuer, exportDate, authorized, poolReserved})` returns `{drafts, issues, summary, classes, poolGranted}`.
  - **People** are deduped by email first, then by normalized name. Institution vs individual is a name heuristic: Inc, LLC, LP, Fund, Ventures, Capital, Partners, Combinator and so on.
  - **Kind:** the kind column if present. Otherwise it's a SAFE if there's a SAFE amount, an option if there's a strike, and common otherwise. A class name containing "preferred" gives a PREFERRED class.
  - **Dates:**
    - Accepted: ISO, Excel serial, "Mar 14, 2023", "14 Mar 2023", and numeric a/b/yyyy.
    - Numeric dates are read month-first, since US tools export them that way. If any value in the column has a first part over 12, the whole column is read day-first.
    - A missing issue date falls back to the export date, with `meta.note = "imported snapshot"`. That raises the existing gap.
  - **Vesting:**
    - With start and months (and an optional cliff), a `VESTING_TERMS` per distinct schedule plus `TX_VESTING_START`.
    - With only "vested to date" below the total, an "unknown schedule" `VESTING_TERMS` (start, then a `VESTING_EVENT`). The cap table then shows "vesting unknown" and What's missing lists it, never a guess.
  - **Options** need a stock plan. The plan's reserve is the `poolReserved` input, and its board date is the earliest grant date.
  - **Numbers:** `$`, commas and spaces are stripped. Shares must be whole and greater than 0. The discount accepts "20%" or "0.20".
  - Every draft is checked with `validateOcf`, and errors are reported against their source row.
- `reconcile(summary, expectedFullyDiluted)` returns `{ok, diff}`.
- `ocfImportDrafts(files, existingIssuerId)` wraps `fromOcfExport`. The imported ISSUER gets the vault's issuer id, so it updates the company instead of adding a second issuer.
- `builders.vestingTerms({months, cliffMonths})` generalizes the 4y/1y builder, which keeps its name and output.

## Desktop
- `Platform.pickFile(title, extensions?)` takes optional file types (the default stays PDF and images).
- `vault.importIntoVault(fs, v, {drafts, fileName, bytes, note?}, ctx)`: the append, the copy of the original and the note.
- `screens/Import.tsx` holds the four steps in one screen with a small step header. StartChoice links to it.

## Tests
- **Core:**
  - CSV and xlsx parsing, including an xlsx made by our own writer and shared strings.
  - Header guessing.
  - Dates (serial, US, day-first column).
  - Dedupe.
  - Kinds: common, option, SAFE, preferred.
  - Vesting: a schedule, vested-only (unknown), none.
  - Row issues.
  - Reconcile.
  - A golden test: an acme-like CSV imported into an empty vault gives the acme cap table numbers (FD 8,000,000, the same shares and vested per row).
- **Desktop:** OCF zip import into a new vault gives the acme cap table. CSV import with mapping and reconcile blocks on a mismatch, then saves with a note. A non-empty vault is refused.

## Out of scope (later)
- Detectors for Pulley, Carta and Cake (they need real files).
- OCX.
- Transaction-history ledgers.
- AI mapping (M4).
- Merge suggestions (F-21).
- Importing into a non-empty vault.
- Checking "vested to date" against the computed number.
