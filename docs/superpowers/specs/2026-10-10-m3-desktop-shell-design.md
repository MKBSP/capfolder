# M3 · Desktop shell — design

Date: 2026-10-10 · Scope: milestone M3 from `docs/09-build-plan.md`, reordered to come before M2. Goal: Mads can install-and-run the app on his Mac, create a real vault, and click through the whole daily flow on real numbers.

## Decisions
| Topic | Decision |
|---|---|
| Order | M3 now. Then M6 export, M2 import (OCF + generic first), M5 signing, M4 docsort, M7, M8 |
| App lock | App password (argon2 hash in the OS keychain) or no lock, plus the idle timer. Touch ID / Windows Hello moves to M7 |
| Later features | Visible but marked "Coming soon (Mx)": Signatures, Settings · AI, Import, Only documents, Send for signature, Share with lawyer, Export .xlsx |
| Email (F-04) | Screen is shown; only "Skip for now" works. Verification needs the relay (M5) |
| Documents | Manual attach: pick a file, it's copied into `docs/<type>/`, hashed and linked. No sorting/OCR (M4) |
| SAFE | "Investor sent their own paper / already signed" records a SAFE (F-12), with optional PDF. "Send for signature" is Coming soon (M5). No drafts in M3 |
| Not in M3 | F-20 transfer UI, F-21 merge, F-28 replace/rename, F-35 forks, rebaseline, document generation from templates. Logged in docs/15 |
| Platforms | Built and run on macOS. CI builds unsigned bundles on macOS, Windows, Linux |

## Stack
- `apps/desktop`: Tauri 2, React 19, TypeScript, Vite. Imports `@capfolder/core` from the workspace.
- Tauri plugins: `fs` (vault I/O, scoped), `dialog` (folder/file pickers, save dialog), `opener` (reveal in Finder).
- Rust: only what JS can't do. Three commands for the app lock: `lock_set(password)`, `lock_verify(password) → bool`, `lock_clear()`. `argon2` + `keyring` crates. File hashes are computed in JS with WebCrypto.
- Styling: plain CSS. `src/styles/tokens.css` (custom properties from docs/08 plus the extra hexes the mockups use) and `src/styles/app.css` (classes ported from the mockups: `.chip`, `.btn`, `.card`, `.bar`, `.th/.td`, stepper). No UI kit.
- Fonts: IBM Plex Sans + Mono self-hosted via `@fontsource/ibm-plex-sans` / `@fontsource/ibm-plex-mono` (OFL-1.1; add to the license allow-list). Works offline.
- Routing: one `useState` route object (`{name, params}`) in `App.tsx`. No router library.

## Architecture
```
apps/desktop/src/
  main.tsx, App.tsx            route state, lock gate, vault context
  fs/types.ts                  Fs interface: readText, writeText, appendText, exists, mkdir, copyFile, rename, readBytes, list
  fs/tauri.ts                  Fs over @tauri-apps/plugin-fs
  fs/memory.ts                 in-memory Fs for tests
  vault.ts                     createVault, openVault, append, attachDocument, removeDocument, verify
  settings.ts                  app-data settings.json (lock method, idle minutes, recent vaults, device_id, telemetry toggle)
  backup.ts                    backupStatus(path) heuristic
  screens/                     one file per screen
  components/                  Header, Stepper, Chip, VestingBar, StatCard, Money, ShowMath, ComingSoon, ErrorList
  styles/
packages/core/src/
  builders.ts                  pure OCF draft builders for every M3 action (new)
  append.ts                    + appendEvents(log, drafts, ctx): all-or-nothing batch (new)
  schedule.ts                  vesting schedule points for the Person chart + next vest date (new)
```
- **Core stays pure.** `vault.ts` is the only code that touches files, and it does so only through `Fs`. Tests run `vault.ts` against `fs/memory.ts`.
- **Write path:** UI builds drafts with `builders.ts` → `vault.append(drafts)` → `appendEvents(currentLog, drafts)` → on ok, `appendText(events.jsonl, lines)`, then regenerate `captable.csv` and `ocf/`. On error, show the plain-language errors and write nothing.
- **Read path:** `openVault` reads `events.jsonl`, `verifyChain`, `reduce(events, asOf)`; the UI renders `capTableRows`, `computeGaps`, `checkInvariants`. Everything is recomputed in memory on each change (vaults are small).

## Vault files (docs/03)
- `createVault(folder, company)` writes: `README.txt` (fixture text with the company name), `capfolder.json` (`vault_id` ULID, `format_version: 1`, `created_at`, `issuer_id`, `ocf_version: "1.2.0"`), `events.jsonl` with `vault_created` + `ISSUER`, empty `docs/` subfolders (`company founders employees grants safes consents 83b _imports _removed _voided`), `captable.csv` (header only), `ocf/`.
- If the chosen folder already has files, create `<folder>/<Company>/` inside it (F-05).
- Default folder: `~/Documents/<Company>`.
- Folder for "Open existing folder" (F-32): must contain `capfolder.json` + `events.jsonl`.

## Verify on open (F-31)
- Broken chain at line N → red banner "The record is broken at line N: <reason>. Restore the folder from your backup." The vault opens read-only (no appends). Rebaseline is later.
- `captable.csv` differs from the regenerated one → save the found file as `captable.edited.csv`, regenerate, and show "Your edits weren't applied. Make changes in the app."
- A linked document file is missing → the row shows "Document missing".
- Footer on Home: "Vault verified · N events · totals add to 100.00%" (or the problem).

## Screens (match `design/app/*.html` layout and copy)
| Screen | Source | M3 behaviour |
|---|---|---|
| Welcome + lock | Welcome.html, F-02/F-03 | Lock: "A separate app password" (password + confirm fields appear) or "No lock". "Touch ID or your Mac password" shown disabled with "Coming soon (M7)". Lock-after select. Telemetry toggle "Send anonymous usage counts (no company data)" (stored; nothing sent until M8). Disclaimer box (exact text, docs/00). Links: "Open existing folder" and recent vaults ("Open Acme") |
| Unlock | none (new, minimal) | Password field, "Unlock". Wrong password: "That's not it. Try again." Forgot: "Remove the 'Capfolder app lock' item in Keychain Access. Your files are never locked." |
| Email | EmailStep.html | Email + code fields disabled with "Arrives with signing (M5)"; "Skip for now" continues |
| Create company | CreateCompany.html | Legal name, type (Delaware C-corp / Other (track only) → banner "Templates and checks are US-only for now"), incorporated date, folder picker, backup status, "We'll create" tree, Create folder |
| Start choice | StartChoice.html | From zero → wizard. Import and Only documents → Coming soon (M2 / M4) |
| From-zero wizard (F-08) | FlowSetup.html x/y/z | One question per screen, live cap table on the right. 1) authorized shares + par (default 10,000,000 at $0.00001). 2) founders: name, email, shares, vesting toggle ("4 years · 1-year cliff · monthly" preselected), vesting start; live "4,000,000 shares = 40% of authorized"; 83(b) deadline if issued in the last 30 days; "Add another founder". 3) optional pool (size, plan name, board approval date). 4) optional SAFEs already signed. Finish → Home |
| Home | Main.html | Header with company, path, backup chip, nav (Cap table / People / Documents / Signatures / Settings), As-of date (default today), Export → "Export .csv" (save dialog, as-of) + ".xlsx Coming soon (M6)", `+ New` menu (SAFE, Grant, Shares, Option pool, Person). Stat cards (Fully diluted, Founders %, Pool available, SAFEs outstanding). Table + expandable row (vested of total, next vest, schedule text, strike, "How is this calculated?" → show-the-math). SAFE section. Aside: What's missing (gap actions: Attach → attach dialog; Send for signature → Coming soon), Waiting for signature (Coming soon), verify footer |
| People | none (new, simple) | List of stakeholders with holdings; click → Person; "+ Person" |
| Person | Person.html | Summary (vested, next vest, fully vested), 48-bar schedule chart, grant/shares card, history (events touching this person, each with Correct… / Reverse…), Edit (F-19: same entity → updated STAKEHOLDER; different → "Use a transfer (coming soon)"), Terminate… (F-22), Record exercise (F-23), Repurchase unvested… (F-24) |
| Documents | Documents.html | Checklist groups computed from state and gaps (Company, Founders, Employees, Investors · SAFEs) with counts and the "Due-diligence ready" bar. Attach / Remove (F-27, moved to `docs/_removed/`, warns when it's the only proof). Add documents → attach dialog. Share with lawyer → Coming soon (M6) |
| New SAFE | NewSafe.html | Form (investor, email, amount, cap, discount, date, MFN), live "On the cap table" impact. "Record as signed" (with optional PDF) appends. "Send for signature" → Coming soon (M5). Preview panel: static YC SAFE text with merged fields |
| New grant (F-14) | none (form in NewSafe style) | Employee (pick or new), quantity, strike, grant date, vesting (default), pool check "920,000 available → 880,000 after this grant", 409A warning if no strike entered |
| New shares (F-15) | none | Holder, class, quantity, price, date, optional vesting, 83(b) reminder |
| Option pool (F-13/F-25) | none | Create (size, plan name, board approval date) or increase (new total) |
| Correct / Reverse (F-18) | FlowChanges.html | Dialog on a history item: correct one field (with reason) or reverse the whole event (with reason) |
| Signatures | Signing.html | Coming soon (M5) panel with the mockup's explainer copy |
| Settings | AiConnect.html + new | Lock (change/remove password, idle time), telemetry toggle, AI · Coming soon (M4), Signing relay · Coming soon (M5), Updates · Coming soon (M7) |

Copy rules (docs/08): plain language, always show where a file lives, mono for numbers, never "encrypted" without what it means.

## Core additions
- `builders.ts`: `issuer`, `stockClass`, `stakeholder`, `vestingTerms4y1y` (the official OCF sample shape), `stockIssuance` (+ `vestingStart`), `stockPlan`, `poolAdjustment`, `optionGrant` (+ `vestingStart`), `safe`, `termination` (cancellation + return to pool, computed from `securityVested`), `exercise` (+ resulting stock issuance), `repurchaseUnvested`, `stakeholderUpdate`, `correction`, `reversal`, `docAdded`, `docLinked`, `docRemoved`. Every OCF draft they produce validates against the schemas (test).
- `appendEvents(log, drafts, ctx)`: applies drafts in order on an in-memory log, all-or-nothing, same checks as `appendEvent`.
- `schedule.ts`: `vestingSchedule(sec, state)` → monthly points `{date, cumulative}` for the chart; `nextVest(sec, state, at)` → `{date, quantity} | null`; `fullyVestedOn(sec, state)`.
- New ids: securities `CS-n` / `OPT-n` / `SAFE-n` (next free number), objects `sh_<ulid>` etc.

## Testing
- Core: builder schema tests, `appendEvents` atomicity, schedule tests (Lisa: next vest 833 on 2026-11-07; fully vested 2029-10-07).
- Desktop: `vault.test.ts` against the memory Fs (create → wizard events → reopen → verify; edited CSV detected; missing doc flagged; broken chain → read-only). UI smoke tests with vitest + Testing Library + jsdom for: first run → wizard → Home shows the founders; New SAFE updates the SAFE section; Terminate returns unvested to the pool.
- Manual: `pnpm dev:desktop` on macOS, walk the whole flow. Acceptance (docs/09): from first open to a populated cap table in under 5 minutes.

## Out of scope
Everything marked Coming soon above; Touch ID; import; docsort; AI/MCP; signing; xlsx/zip; updates; forks; rebaseline; transfer/merge/replace UIs; document generation.
