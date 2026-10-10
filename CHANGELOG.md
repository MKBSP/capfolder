# Changelog

All notable changes. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow semver once the app ships.

## [Unreleased]

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
