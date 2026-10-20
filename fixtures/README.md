# Fixtures

## acme-vault (golden test #1)
The company shown in every mockup. 29 events, hash-chained.

- `events.jsonl`: the input.
  - Hashes use `sha256` of canonical JSON (sorted keys, no spaces, UTF-8). All values are strings or ints, so this equals RFC 8785 JCS.
  - Recompute and verify the chain as the first test.
- `captable.expected.csv`: the expected output of `reduce(events, asOf = 2026-10-07)` written as `captable.csv`. Must match **byte for byte**.

**Numbers to check by hand:**
- **Fully diluted:** 4,000,000 + 3,000,000 + 40,000 + 40,000 + 920,000 pool available = **8,000,000**. SAFEs are excluded.
- **Tim:** vesting starts 2023-10-07, 36 of 48 months → floor(4,000,000 × 36 ÷ 48) = 3,000,000.
- **Woz:** starts 2025-10-07. On 2026-10-07 the cliff passes (12 months, inclusive) → 10,000.
- **Bill:** starts 2026-03-02, 7 months, before cliff → 0.
- **SAFEs as-converted (post-money):** 500k ÷ 10M = 5.00%; 150k ÷ 8M = 1.875% → displayed 1.88; 250k ÷ 10M = 2.50%.
- **doc_status:** `signed` if a `doc_linked` event targets the security; otherwise `missing`. Fund X is the missing SAFE from the mockups.

**OCF payloads:**
- They follow OCF field names as closely as known.
- Fields shown as `"[…]"` strings (vesting conditions, conversion triggers) are **placeholders**. Replace them with schema-valid OCF structures when wiring ajv validation [verify against OCF 1.2 schemas], then regenerate the hashes. Keep the computed numbers identical.
- 2026-10-09: placeholders replaced with schema-valid OCF 1.2.0 structures (official 4yr/1yr-cliff vesting sample, SAFE_CONVERSION mechanisms); hashes regenerated with `packages/core/scripts/rehash-fixture.mjs`. Expected numbers unchanged.

## To add
- `pilot-pulley/`: the anonymized real Pulley export from the pilot company (urgent, before Dec 8, 2026)
- Edge-case vaults listed in `docs/09-build-plan.md`

## import/
- `acme-generic.csv`: **synthetic**. A generic spreadsheet export of the acme cap table (US dates, `$` amounts, a title row above the header, a pool row). Importing it must give the acme numbers in `acme-vault/captable.expected.csv` (doc_status aside). Replace with real Pulley/Carta/Cake exports when they arrive.
