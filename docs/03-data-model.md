# 03 · Data model

## Vault folder
```
Acme/                         # any folder name; usually inside iCloud/Dropbox/Drive/git
├── README.txt                # human explanation of the folder (template in fixtures/acme-vault/README.txt)
├── capfolder.json           # vault meta: vault_id, created_at, format_version, issuer_id
├── events.jsonl              # THE record. Append-only, hash-chained. One JSON object per line
├── captable.csv              # derived, regenerated on every change. Never read back
├── ocf/                      # derived OCF export (manifest + files), regenerated
└── docs/
    ├── company/  founders/  employees/  grants/  safes/  consents/  83b/
    ├── _imports/             # original export files from other tools
    ├── _removed/             # "deleted" docs (never hard-deleted by the app)
    └── _voided/              # partially signed docs from cancelled envelopes
```

## Event envelope (one line of events.jsonl)
```json
{
  "seq": 12,
  "id": "evt_01J9Z6…",            // ULID: globally unique, sortable. seq is a per-device counter only
  "ts": "2026-10-07T14:03:00Z",
  "kind": "ocf",
  "type": "TX_EQUITY_COMPENSATION_ISSUANCE",
  "data": { "...": "the OCF object, exactly as the OCF schema defines it" },
  "meta": { "source": "app|import:<file>|docsort", "device_id": "dev_…", "note": "", "doc_ids": ["doc_…"] },
  "prev": "sha256 hex of the previous line's hash (\"0\"*64 for seq 1)",
  "hash": "sha256 hex of JCS-canonical JSON of this object without the 'hash' field"
}
```
- `kind: "ocf"` → `data` is an OCF object or transaction. Validate it against the OCF schema before appending.
- `kind: "app"` → our own events, which OCF doesn't cover:

| type | data | purpose |
|---|---|---|
| `vault_created` | name, created_by | first line |
| `doc_added` | doc_id, path, sha256, doc_type, extracted fields, flags | a file is filed in `docs/` |
| `doc_linked` / `doc_unlinked` | doc_id, target (stakeholder/security/transaction id) | proof for a holding |
| `doc_removed` | doc_id, moved_to | moved to `_removed/` |
| `doc_replaced` | old_doc_id, new_doc_id | F-28 |
| `envelope_sent` / `envelope_signed` / `envelope_voided` | envelope_id, relay_ref, signers, doc sha256 | signing (F-11, F-16, F-17) |
| `correction` | target event id, field, old, new, reason | F-18. The reducer applies it |
| `reversal` | target event id, reason | F-18. The reducer ignores the target |
| `stakeholder_alias` | stakeholder_id, alias | F-09 "Remember", F-19, F-21: another name in documents; collected in `state.aliases` for matching |
| `rebaseline` | from_seq, reason | F-31. Accepts outside edits as the new start |
| `schema_migrated` | from, to | F-38 |
| `note` | target, text | free notes |

## OCF mapping for our stories (names verified against OCF 1.2.0, 2026-10-10)
| Story | OCF objects / transactions |
|---|---|
| F-05 company | `ISSUER` |
| F-08 founders | `STAKEHOLDER`, `STOCK_CLASS`, `TX_STOCK_ISSUANCE`, `VESTING_TERMS`, `TX_VESTING_START` |
| F-11/12 SAFE | `TX_CONVERTIBLE_ISSUANCE` (SAFE conversion mechanism: cap, discount, MFN) |
| F-13/25 pool | `STOCK_PLAN`, `TX_STOCK_PLAN_POOL_ADJUSTMENT` |
| F-14 grant | `TX_EQUITY_COMPENSATION_ISSUANCE` (+ vesting terms) |
| F-15 shares | `TX_STOCK_ISSUANCE` |
| F-20 SAFE transfer | `TX_CONVERTIBLE_TRANSFER` |
| F-22 termination | `TX_EQUITY_COMPENSATION_CANCELLATION` (unvested) + `TX_STOCK_PLAN_RETURN_TO_POOL` |
| F-23 exercise | `TX_EQUITY_COMPENSATION_EXERCISE` + resulting `TX_STOCK_ISSUANCE` |
| F-24 repurchase | `TX_STOCK_REPURCHASE` |
| Valuation (409A) | `VALUATION` |
| Documents | OCF `DOCUMENT` objects are written to the derived `ocf/` export from our `doc_*` events |

## Hash chain
- `hash = sha256(JCS(event without "hash"))`, and `prev` equals the previous line's `hash`.
- On open, the app verifies the whole chain. If line N breaks the chain, show the red banner (F-31).
- The app never edits old lines. Rebaseline appends.

## Reducer (pure)
`reduce(events, asOf?) → State { issuer, stakeholders, classes, plans, securities, docs, envelopes, gaps }`

1. Drop events after `asOf` (by the OCF `date` for transactions, or `ts` for app events).
2. Drop reversed events, then apply corrections in `seq` order.
3. Apply transactions in a deterministic order: OCF `date`, then `ts`, then `id`. Never order by `seq`, so a future multi-device sync gives the same result (see docs/12).
4. Compute the derived values (below).

## Derived numbers
- **Outstanding shares** per class = issued − repurchased − cancelled (by class).
- **Fully diluted (FD)** = outstanding shares + granted options outstanding + pool available. SAFEs are **excluded** and shown as-converted separately.
- **Pool available** = pool size + pool adjustments − granted + returned to pool.
- **SAFE as-converted %** (post-money) = purchase amount ÷ post-money valuation cap. With no cap: show "—" and "converts at next round".
- **% column** = holding ÷ FD, shown to 2 decimals. Totals must sum to 100.00% using largest-remainder rounding for display.

## Vesting math (decide once, test hard)
- **Schedule:** total months M, cliff C months, frequency monthly, start date S.
- **Vested at date t:**
  - m = whole months elapsed from S to t, using the OCF day-of-month rule (default: same day of month; if that day doesn't exist, use the last day of the month).
  - If m < C, vested = 0.
  - Otherwise, vested = floor(total × min(m, M) ÷ M).
  - This is cumulative floor, so it never drifts: monthly amounts vary by 1 (833/834) and the total is exact at M.
- **Acceleration:** single and double trigger as defined in VestingTerms. The founder records the trigger event.
- **Termination:** unvested at the termination date returns to the pool. The exercise window comes from the plan (default 90 days).
- Every number in the UI has a "show the math" string, e.g. `10,000 = floor(40,000 × 12 ÷ 48), cliff passed 2026-10-07`.

## Invariants (run after every append; failure blocks the save)
1. Issued shares per class ≤ authorized shares for that class.
2. Pool available ≥ 0.
3. Vested ≤ granted, for every grant.
4. Exercised ≤ vested, for every grant (unless early exercise is allowed and recorded).
5. A transfer or repurchase quantity ≤ the holder's current balance.
6. FD percentages sum to 100.00% (display rounding).
7. Every `doc_linked` target exists.
8. The hash chain is intact.

## Gaps ("What's missing") — computed, not stored
- An issued security with no linked signed document
- Common stock with vesting, issued in the last 30 days, with no 83(b) document
- A founder or employee with no IP assignment (CIIAA)
- A grant with no board consent
- A stock plan with no plan document or approvals
- An envelope sent more than 7 days ago and not signed
- Vesting unknown (imported snapshot)

## Derived files
- `captable.csv`: one row per holding. Columns: `stakeholder, type, class, shares, fd_percent, vested, unvested, safe_amount, safe_cap, safe_discount, as_converted_percent, doc_status`.
- `ocf/`: full OCF export (manifest + files), so the vault is portable to any OCF tool.
- Exports (F-29): xlsx with tabs Summary, By person, Vesting, SAFEs, plus CSV.

## Decisions where OCF is silent (M1, 2026-10-10)
- **OCF version:** 1.2.0 schemas, vendored in `packages/core/src/ocf/`. The deprecated `TX_PLAN_SECURITY_*` names are read as `TX_EQUITY_COMPENSATION_*`.
- **captable.csv row order:** stock, then equity compensation, then pool rows, then convertibles. Within a group: issue date, then security id. Zero-balance rows are hidden.
- **As-of:**
  - Transactions are filtered by `date`.
  - Definitions (stakeholders, classes, vesting terms) are always present.
  - A stock plan appears only from its `board_approval_date`.
  - App events are filtered by the date part of `ts`.
- **Consuming transactions** (cancellation, repurchase, exercise, transfer):
  - Without `balance_security_id` they reduce the source security.
  - With it, the source closes and the remainder must be issued as its own security (strict OCF).
  - A quantity above the outstanding balance is a violation.
- **Vesting:**
  - Vesting stops at the date of any cancellation or repurchase on that security.
  - Vested is measured on the original quantity, minus exercised, capped at outstanding.
- **Pool:** available = `shares_reserved` (the latest pool adjustment is the new total) − granted (original quantities) + returned (`TX_STOCK_PLAN_RETURN_TO_POOL`). A cancellation without a return-to-pool retires the shares.
- **Supported vesting subset:**
  - A `VESTING_START_DATE` condition, then a linear chain of month-based `VESTING_SCHEDULE_RELATIVE` conditions.
  - Allocation `CUMULATIVE_ROUND_DOWN` (floor) or `CUMULATIVE_ROUNDING` (half up), or explicit `vestings[]`.
  - Month steps are anchored to the start date (no drift) and use the condition's `day_of_month` rule.
  - Anything else is "vesting unknown": a gap, never a guessed number.
  - Acceleration is recorded, not computed.
- **Corrections:**
  - Format: `{target, field, old, new, reason}`, where `field` is a dot path with numeric parts for array indices.
  - Applied in file order to a copy of the target.
  - Paths through `__proto__`, `constructor` or `prototype`, or through keys that don't exist, are rejected as violations.
  - Reversals of reversals are ignored.
- **Gap document types:** `83b`, `ciiaa`, `board_consent`. Plan documents are any document linked to the plan id. The 83(b) gap shows while the 30-day deadline hasn't passed.
- **Invariants on append:** `appendEvent` blocks only violations the new event introduces, so an already-inconsistent import can still be fixed.
- **Number formats:**
  - Money and percentages keep their OCF strings.
  - `as_converted_percent` is half-up to 2 decimals (post-money cap only).
  - `fd_percent` uses largest-remainder so rows sum to exactly 100.00.
- **CSV safety:** any cell that starts with `= + - @`, tab or CR and isn't a plain number gets a leading `'`. Vault data is untrusted when it's opened in a spreadsheet.
- **Hash chain scope:** the unsigned chain detects accidental or naive edits. Someone who rewrites a line and recomputes every later hash is not detected. Signing or anchoring the chain is later work.
- **Reading untrusted vaults (final review, 2026-10-10):** replay never throws. An event that can't be applied becomes a violation. That includes a reused `security_id`, references to an unknown stakeholder, class or plan, money amounts ≤ 0, valuation caps ≤ 0, explicit vestings that are negative or add up to more than the grant, and malformed payloads. A vesting fraction with a zero or negative denominator is "vesting unknown".
- **Append checks every affected as-of:** `appendEvent` runs the invariants at the new event's date, at every later transaction date, and at the end of time. A correction or reversal checks every date. Violations are compared without their trailing "(numbers)", so a step that improves an existing problem is allowed. (Ceiling: making it worse is allowed too.)
