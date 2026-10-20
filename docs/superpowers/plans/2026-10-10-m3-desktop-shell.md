# Capfolder M3 (Desktop Shell) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (chosen: Native) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Tauri 2 desktop app Mads can run on his Mac to create a real vault and click through first run, the from-zero wizard, Home, People/Person, Documents and the New SAFE/Grant/Shares/Pool forms, with every change written through `@capfolder/core`.

**Architecture:** `apps/desktop` (React 19 + Vite + TS) renders state derived by `@capfolder/core`. One I/O module (`vault.ts`) reads and writes the vault through an `Fs` interface: Tauri plugin-fs in the app, an in-memory Fs in tests. Rust holds only the app-lock commands (argon2 hash in the OS keychain). The core gets three pure additions: `builders.ts`, `appendEvents`, `schedule.ts`.

**Tech Stack:** Tauri 2 (`@tauri-apps/cli`, `api`, `plugin-fs`, `plugin-dialog`, `plugin-opener`), React 19, Vite, vitest + jsdom + @testing-library/react, `@fontsource/ibm-plex-sans` and `@fontsource/ibm-plex-mono`. Rust crates: `keyring`, `argon2`. Pin exact versions. Every JS package must be published before 2026-09-26: check `npm view <pkg> time`.

**Spec:** `docs/superpowers/specs/2026-10-10-m3-desktop-shell-design.md`. Screens: `design/app/*.html`. Tokens: `docs/08-design-system.md`. Rules: `CLAUDE.md`.

**Repo:** `~/Desktop/claude_code_projects/capfolder`, branch `main` (Mads asked for linear history on main). **Never `git push`. No Co-Authored-By trailer.**

## Global Constraints
- `packages/core/src` stays pure (the purity test must keep passing). Only `apps/desktop/src/fs/tauri.ts` imports `@tauri-apps/plugin-fs`.
- Every write goes `builders` → `vault.append(drafts)` → `appendEvents`. On error, write nothing and show the errors verbatim.
- Numbers come only from core (`capTableRows`, `securityVested`, `computeGaps`, `schedule`). The UI does no cap-table math beyond formatting. Mono font for every amount and share count.
- Copy from the mockups verbatim where a mockup exists. The disclaimer text is exact (docs/00).
- Later features show `<ComingSoon milestone="M5" />`, never a dead button.
- App settings live in the Tauri app-data dir (`settings.json`), never in the vault.
- Paths stored in events are relative to the vault root.

## Review Focus
1. Vault folder chosen inside a folder that already has files → create `<folder>/<Company>/`, never write over existing files (vault test).
2. Broken chain on open → read-only mode; no append path can write (vault test).
3. A multi-event action (terminate, grant, exercise) that fails on its 2nd event writes nothing (appendEvents test).
4. Attaching a file with the same sha256 as an existing doc is skipped with a message, not duplicated (vault test).
5. As-of date changes recompute everything (vesting, pool, gaps) without stale state (UI smoke test).

---

### Task 1: Core builders (OCF drafts for every M3 action)
**Files:** Create `packages/core/src/builders.ts`, `packages/core/test/builders.test.ts`. Modify `src/index.ts`.
**Interfaces (produces):**
```ts
type Draft = EventDraft;
newId(prefix: string): string                        // `${prefix}_${ulid()}`
nextSecurityId(state: State, prefix: "CS" | "OPT" | "SAFE"): string   // next free CS-n
issuer(p: { name: string; formationDate: string; subdivision?: string; country?: string }): Draft
stockClass(p: { name: string; authorized: string; parValue: string }): Draft   // COMMON, prefix "CS-"
stakeholder(p: { id?: string; name: string; email?: string; type: "INDIVIDUAL" | "INSTITUTION" }): Draft
vestingTerms4y1y(id?: string): Draft                 // exact acme fixture shape, CUMULATIVE_ROUND_DOWN
stockIssuance(p: { state; stakeholderId; classId; quantity; price; date; vestingTermsId?; vestingStart?; securityId? }): Draft[]   // + TX_VESTING_START
stockPlan(p: { name; reserved; boardApprovalDate; classId }): Draft
poolAdjustment(p: { planId; newTotal; date }): Draft
optionGrant(p: { state; stakeholderId; planId; classId; quantity; strike; date; vestingTermsId; vestingStart?; type?: "OPTION_ISO" | "OPTION_NSO" }): Draft[]   // expiration = date + 10y
safe(p: { state; stakeholderId; amount; cap; discount?; mfn: boolean; date }): Draft
termination(p: { state; securityId; date; reason: string }): Draft[]   // cancel unvested + return to pool; [] if nothing unvested
exercise(p: { state; securityId; quantity; date }): Draft[]            // exercise + resulting TX_STOCK_ISSUANCE (CS-n)
repurchaseUnvested(p: { state; securityId; date }): Draft[]            // [] if nothing unvested
stakeholderUpdate(p: { previous: Data; name?: string; email?: string }): Draft   // same id, full object
correction(p: { target: string; field: string; old: unknown; new: unknown; reason: string }): Draft
reversal(p: { target: string; reason: string }): Draft
docAdded(p: { docId; path; sha256; docType; originalName; fields?; flags? }): Draft
docLinked(p: { docId; target }): Draft
docRemoved(p: { docId; movedTo }): Draft
```
- [ ] **Step 1: Failing tests:** (a) every OCF draft from every builder validates (`validateOcf(d.data) == []`); (b) replaying acme + `optionGrant` for a new hire of 10,000 gives the pool 910,000; (c) `termination` on OPT-1 dated 2026-11-07 gives a cancellation of 29,167 + return 29,167; (d) `exercise` of 5,000 on OPT-1 at 2026-11-01 gives CS-3 stock for sh_woz; (e) `nextSecurityId(acmeState,"CS") === "CS-3"`; (f) `repurchaseUnvested` on CS-1 at 2026-10-07 = 1,000,000.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. Ids for transactions: `newId("tx")`. `custom_id` = `security_id`. `security_law_exemptions: []`, `stock_legend_ids: []`, money `{amount, currency:"USD"}`. The SAFE trigger has the same shape as the acme fixture (`AUTOMATIC_ON_CONDITION`, `SAFE_CONVERSION`, `POST_MONEY`, `conversion_mfn`). **Step 4:** PASS + lint + typecheck. **Step 5:** Commit `core: OCF draft builders for M3 actions`.

### Task 2: Core `appendEvents` + vesting schedule helpers
**Files:** Modify `packages/core/src/append.ts`. Create `src/schedule.ts`, `test/schedule.test.ts`; add to `test/append.test.ts`.
**Produces:**
```ts
appendEvents(log: string, drafts: EventDraft[], ctx: AppendCtx): Promise<{ ok: true; events: VaultEvent[]; text: string } | { ok: false; errors: string[] }>
// text = lines joined with "\n" plus a trailing "\n", ready to append
vestingSchedule(sec: Security, s: State): { date: string; cumulative: bigint }[] | null   // null when vesting unknown/none
nextVest(sec: Security, s: State, at: string): { date: string; quantity: bigint } | null
fullyVestedOn(sec: Security, s: State): string | null
```
- [ ] Tests:
  - `appendEvents` with a valid grant plus a second invalid draft returns `ok:false` and the log is unchanged.
  - Two valid drafts produce a chain that verifies.
  - Woz: `nextVest(OPT-1, 2026-10-07)` = `{2026-11-07, 833}`; `fullyVestedOn` = `2029-10-07`; the schedule has 48 points with point 12 = 10,000.
  - Terminated grant: next vest null.
- [ ] Implement `appendEvents` by looping `appendEvent` over an in-memory log text (each ok line appended to the working text). `schedule.ts` evaluates `securityVested` at each month offset from the vesting start (`addMonths`); next vest = first point after `at` whose cumulative grows. Commit `core: appendEvents batch and vesting schedule helpers`.

### Task 3: Desktop app scaffold + CI build matrix
**Files:** Create `apps/desktop/{package.json,index.html,vite.config.ts,tsconfig.json,src/main.tsx,src/App.tsx,src/styles/tokens.css,src/styles/app.css,src-tauri/**}`. Modify root `package.json` (`dev:desktop`, `build:desktop`), `.github/workflows/ci.yml` (job `desktop` matrix macos-latest/windows-latest/ubuntu-22.04: install Linux webkit deps, `pnpm --filter @capfolder/desktop tauri build --no-bundle` or `--bundles` default unsigned), `scripts/check-licenses.mjs` (allow `OFL-1.1`), `biome.json` (ignore `src-tauri/target`, `src-tauri/gen`).
- [ ] Scaffold by hand (no create-tauri-app):
  - `src-tauri/Cargo.toml` with `tauri = "2"` (the latest 2.x on crates.io older than 2 weeks, pinned with `=`), `tauri-plugin-fs`, `tauri-plugin-dialog`, `tauri-plugin-opener`, `serde`, `serde_json`; `build.rs`; `src/main.rs` + `src/lib.rs` registering the plugins.
  - `tauri.conf.json`: productName `Capfolder`, identifier `com.capfolder.app`, devUrl `http://localhost:1420`, frontendDist `../dist`, window 1280x820, min 1024x700.
  - `capabilities/default.json`: `core:default`, `dialog:default`, `opener:default`, plus fs scope `$HOME/**`, `$APPDATA/**`. ponytail: the home-wide scope narrows to the chosen vault once a runtime scope API is wired (M7 hardening).
- [ ] Icons: `pnpm --filter @capfolder/desktop tauri icon ../../brand/app-icon.svg`. If the command needs a PNG, convert first: `rsvg-convert -w 1024` or `qlmanage -t -s 1024`.
- [ ] Vite: React plugin, port 1420 strict, `clearScreen:false`, test env jsdom with `src/test/setup.ts` (Testing Library jest-dom). Fonts are imported in `main.tsx`.
- [ ] `tokens.css` gets every docs/08 token as a CSS custom property, plus the mockup extras (`--pill #F0F1EE`, `--soft #F3F4F1`, `--attn #FFFBF4`, `--sel #F7F8F5`, `--sep #B5B7B2`, `--dot-red #C0392B`, `--dot-amber #D97706`, `--bar-future #DDE3DE`, `--bar-part #7FB596`, `--purple-text #3D3170`). `app.css` ports `.chip(.green|.amber|.red|.purple)`, `.btn(.primary|.secondary|.danger)`, `.card`, `.th`, `.td`, `.num` (mono, tabular-nums), `.bar`, `.inp`, `.lbl`, `.stepper`, the press scale 0.97, and hover rules only inside `@media (hover:hover) and (pointer:fine)`.
- [ ] Verify: `pnpm --filter @capfolder/desktop build` (vite) succeeds. Then `cd apps/desktop/src-tauri && cargo build` succeeds. A placeholder `App.tsx` renders "Capfolder". Commit `desktop: Tauri 2 + React scaffold, tokens, CI build matrix`.

### Task 4: Rust app-lock commands
**Files:** `src-tauri/src/lock.rs`, register in `lib.rs`; `Cargo.toml` adds `keyring` (features apple-native, windows-native, sync-secret-service) and `argon2`.
**Produces (Tauri commands):** `lock_set(password: String) -> Result<(), String>`, `lock_verify(password: String) -> Result<bool, String>`, `lock_clear() -> Result<(), String>`, `lock_is_set() -> Result<bool, String>`. Keychain service `Capfolder`, account `app-lock`; the stored value is the argon2 PHC string.
- [ ] TDD in Rust: unit tests on the pure parts, `hash(password) -> String` and `verify(hash, password) -> bool` (correct, wrong, empty). Keychain calls stay thin wrappers, not unit-tested. `cargo test` → PASS. Commit `desktop: app lock commands (argon2 hash in OS keychain)`.

### Task 5: Fs adapters + vault module
**Files:** `apps/desktop/src/fs/{types.ts,memory.ts,tauri.ts}`, `src/vault.ts`, `src/vault.test.ts`.
**Produces:**
```ts
interface Fs { readText(p): Promise<string>; writeText(p, s): Promise<void>; appendText(p, s): Promise<void>; readBytes(p): Promise<Uint8Array>; writeBytes(p, b): Promise<void>; exists(p): Promise<boolean>; mkdir(p): Promise<void>; list(p): Promise<string[]>; rename(from, to): Promise<void>; }
type Vault = { root: string; meta: Data; log: string; events: VaultEvent[]; broken?: { line: number; reason: string }; csvEdited: boolean; missingDocs: string[] };
createVault(fs, ctx, p: { parent: string; company: { name; formationDate; type: "DE_CCORP" | "OTHER" } }): Promise<Vault>
openVault(fs, root): Promise<Vault>
append(fs, vault, drafts, ctx): Promise<{ ok: true; vault: Vault } | { ok: false; errors: string[] }>   // rejects when vault.broken
attachDocument(fs, vault, ctx, p: { source: string; bytes: Uint8Array; docType: string; date: string; person: string; target?: string }): Promise<{ ok: true; vault: Vault } | { ok: false; errors: string[] } | { ok: "duplicate"; docId: string }>
removeDocument(fs, vault, ctx, docId): Promise<...>
exportCsv(vault, asOf): string
```
- [ ] Tests (memory Fs):
  - Create in an empty parent: the files exist, the README contains the company name, and the chain verifies.
  - Create in a parent that has `Acme/` with files: the vault goes to `Acme/Acme/`. Spec: "creates Capfolder/ inside" an existing non-empty target folder; target = `parent/<Company>`, and if that is non-empty, use `parent/<Company>/<Company>`.
  - Append a grant: `events.jsonl` grows, `captable.csv` is regenerated and `ocf/Manifest.ocf.json` is written.
  - Hand-edit `captable.csv`, then `openVault`: `captable.edited.csv` exists and `csvEdited` is true.
  - Tamper with line 2: `broken.line === 2` and `append` returns ok:false "The record is broken…".
  - Attach copies to `docs/<docType folder>/<date>_<person-slug>.pdf` and writes doc_added + doc_linked. Attaching the same bytes again returns duplicate.
  - Remove moves the file to `docs/_removed/` and writes doc_removed.
  - A linked file missing on open is listed in `missingDocs`.
- [ ] `tauri.ts` maps each method to plugin-fs (`readTextFile`, `writeTextFile`, `writeTextFile(...,{append:true})`, `readFile`, `writeFile`, `exists`, `mkdir({recursive:true})`, `readDir`, `rename`). Paths come from `@tauri-apps/api/path` (`homeDir`, `join`). Commit `desktop: Fs adapters and vault module`.

### Task 6: Settings + backup detection
**Files:** `src/settings.ts`, `src/backup.ts`, tests.
- **Settings:** `{ deviceId, lock: "password" | "none", idleMinutes: 5 | 15 | 60 | 0, telemetry: boolean, recentVaults: {name, root}[] }`. Defaults: `lock "none"`, `idleMinutes 15`, `telemetry true`. Load/save `settings.json` in app-data through Fs.
- **`backupStatus(root, exists)`:** returns `{ backedUp: boolean; by?: "iCloud Drive" | "Dropbox" | "Google Drive" | "OneDrive" | "git" }`:
  - path contains `Library/Mobile Documents` → iCloud
  - `/Dropbox` → Dropbox
  - `CloudStorage/GoogleDrive` or `/Google Drive` → Google Drive
  - `OneDrive` → OneDrive
  - `.git` in root or a parent → git
- **`suggestedFolders(home)`:** the known synced roots that exist.
- [ ] Tests, then implement, then commit `desktop: settings and backup detection`.

### Task 7: App shell, components, lock gate
**Files:** `src/App.tsx`, `src/state.tsx` (VaultContext: vault, asOf, setAsOf, run(drafts) → errors, settings), `src/components/{Header,Stepper,Chip,VestingBar,StatCard,Money,ShowMath,ComingSoon,ErrorList,Modal,Field}.tsx`, `src/screens/Unlock.tsx`, `src/idle.ts`.
- **Route type:** `welcome | email | create | start | wizard | home | people | person(id) | documents | newSafe | newGrant | newShares | pool | newPerson | signatures | settings`.
- **Boot:**
  - Load settings, then pick the start screen:
    - lock = password and locked → Unlock
    - otherwise, the last vault exists → open it and go to `home`
    - otherwise → `welcome`
  - The idle timer re-locks after `idleMinutes` with no input.
- **Header:** port Main.html. It shows the company, the mono path, the backup chip from `backupStatus` and the nav tabs, plus the As-of date and `+ New` menu on `home`.
- **`Modal`:** a native `<dialog>`.
- **`ShowMath`:** a popover holding the `math` strings.
- **`ComingSoon`:** a card with "Coming soon · arrives in M5", plus an optional explainer.
- [ ] UI test: with settings `lock=password`, the Unlock screen renders, and `lock_verify` (mocked with `@tauri-apps/api/mocks` `mockIPC`) set to true lets it through. Commit `desktop: app shell, shared components, lock gate`.

### Task 8: First-run screens
**Files:** `src/screens/{Welcome,Email,CreateCompany,StartChoice}.tsx`, tests.
- **Welcome:** port Welcome.html.
  - "Touch ID…" option disabled with the chip "Coming soon (M7)".
  - Password + confirm fields appear when "A separate app password" is chosen. Mismatch error: "The passwords don't match."
  - Telemetry toggle, the disclaimer box, "Open existing folder" (dialog → `openVault`; error "This folder isn't a Capfolder vault (no capfolder.json)."), and the recent vault buttons.
- **Email:** port the mockup. Inputs disabled plus the note "Arrives with signing (M5)", and "Skip for now".
- **CreateCompany:**
  - Fields: name (required), type, date (required, ≤ today).
  - Folder default `~/Documents/<name>`, with "Change…" opening a dialog.
  - Backup box: green, or amber with the suggested folders.
  - The tree preview, then "Create folder" → `createVault` and save the vault to the recent list.
- **StartChoice:** three cards. "Start from zero" → wizard; the other two → ComingSoon (M2 / M4).
- [ ] UI test: Welcome (no lock) → Skip email → Create "Test Co" in a memory fs → Start → wizard renders. Commit `desktop: first-run screens`.

### Task 9: From-zero wizard (F-08)
**Files:** `src/screens/Wizard.tsx`, test.
- Steps, one question per screen, with Back/Next and the live mini cap table on the right (`capTableRows` of the draft events applied in memory via `appendEvents` on the current log, without writing):
  1. Authorized shares and par value, defaults 10,000,000 and $0.00001.
  2. Founders, a repeatable list:
     - name, email, shares, live "= 40.00% of authorized"
     - vesting toggle, defaulting to "4 years · 1-year cliff · monthly"
     - vesting start, defaulting to the incorporation date
     - if issued in the last 30 days: "File your 83(b) within 30 days of <date>, by <date+30>"
     - a note when vesting is off: "Investors usually ask for founder vesting."
  3. Optional pool: size, plan name (default "<year> Equity Incentive Plan"), board approval date.
  4. Optional signed SAFEs (repeatable): investor, amount, cap, discount, date, MFN.
- **Finish:** a single `vault.append` of every draft: class + vesting terms + stakeholders + issuances + plan + SAFEs. If it errors, the list shows and nothing is written.
- [ ] UI test: 2 founders, 4M + 3M, a 1M pool and a YC SAFE of 500k at a 10M cap → Home shows 50.00 / 37.50 / 12.50 and the SAFE at 5.00%. Commit `desktop: from-zero wizard`.

### Task 10: Home
**Files:** `src/screens/Home.tsx`, test.
- **Layout:** port Main.html, mapping each part to core data:
  - Stat cards:
    - FD total
    - Founders % = sum of the fd% of stakeholders holding stock that was issued in the wizard or marked founder (ponytail: "founder" = holder of common stock that has vesting terms or was issued on the formation date; refine when roles exist)
    - Pool available
    - SAFEs outstanding = the sum of SAFE amounts
  - Table rows from `capTableRows`:
    - Type label: "Founder · Common", "Employee · Option" or "Pool"
    - Vesting bar: vested ÷ shares, or the cliff text "Cliff <Mon YYYY>" when vested = 0 and the cliff is in the future
    - Document chip from the gaps: Signed / "83(b) missing" / "IP assignment missing" / "No signed doc"
  - Expandable row: "X of Y vested", "Next: N on <date>", the schedule text, the strike, and "How is this calculated?" opening `ShowMath`.
  - SAFE section: "≈x.xx%", "Cap $10M · 20%".
  - Aside:
    - What's missing, one line per gap with an action: Attach → attach modal pre-targeted; Send for signature → ComingSoon
    - "Waiting for signature" ComingSoon
    - Verify footer: "Vault verified · N events · totals add to 100.00%", or the broken/edited/missing-docs banner
- **As-of input:** changes the context `asOf`, and everything recomputes.
- **Export:** a menu with "Export .csv (as of <date>)" → save dialog → `exportCsv`; ".xlsx · Coming soon (M6)".
- **`+ New` menu:** SAFE, Grant, Shares, Option pool, Person.
- [ ] UI test: acme loaded into the memory fs → 8 rows with the exact numbers. Changing the as-of to 2023-01-01 leaves 3 rows. Commit `desktop: Home cap table`.

### Task 11: New SAFE / Grant / Shares / Pool / Person forms
**Files:** `src/screens/{NewSafe,NewGrant,NewShares,Pool,NewPerson}.tsx`, tests.
- **NewSafe:** port NewSafe.html.
  - Live impact through `appendEvents` in memory: "Fund Y ≈ 2.00% as-converted ($200k ÷ $10M)" and "SAFEs outstanding: $900k → $1.1M".
  - Buttons: "Record as signed" (optional PDF attach after append → `attachDocument` with docType safe) and "Send for signature" → ComingSoon (M5).
  - "Investor sent their own paper" equals Record as signed.
  - The investor is picked from or created among the existing stakeholders.
- **NewGrant:**
  - Employee (pick or new), quantity, strike, date, vesting default.
  - Pool line: "920,000 available → 880,000 after this grant".
  - Warning when the strike is empty or 0: "Strike may be challenged. Get a 409A." Not blocking.
- **NewShares:** holder, class, quantity, price, date, vesting toggle, and the 83(b) reminder.
- **Pool:** create if no plan exists, else increase (a new total, which must be > current).
- **NewPerson:** name, email, individual or institution.
- All five show core errors through `ErrorList`.
- [ ] UI test: New SAFE for Fund Y 200k at a 10M cap → Home SAFE section shows Fund Y 2.00%. Commit `desktop: issue forms`.

### Task 12: People + Person
**Files:** `src/screens/{People,Person}.tsx`, `src/components/{VestingChart,HistoryList,CorrectDialog}.tsx`, tests.
- **People:** a table of name, type, holdings summary and email; "+ Person".
- **Person** (port Person.html):
  - Summary from `securityVested`, `nextVest` and `fullyVestedOn`.
  - VestingChart: 48 bars from `vestingSchedule`, colored past / partial / future, with axis labels.
  - Security cards (grant, shares, SAFE).
  - History: the events that touch the stakeholder or their securities, as "date · plain sentence", each with "Correct…" and "Reverse…" (CorrectDialog → `correction` / `reversal`).
  - Actions:
    - Edit → "Same person or legal entity?" yes → `stakeholderUpdate`; no → ComingSoon "Transfers arrive later"
    - Terminate… → preview "Vested 12,500 · returns 27,500 to the pool · exercise by <date+90d>" → append `termination`
    - Record exercise → quantity (≤ vested) → `exercise`
    - Repurchase unvested… → preview → `repurchaseUnvested`
  - Buttons hide when they don't apply.
- [ ] UI test: terminate Woz at 2026-11-07 → pool +29,167 and Woz shows 10,833 / 0 unvested. Commit `desktop: People and Person`.

### Task 13: Documents
**Files:** `src/screens/Documents.tsx`, `src/components/AttachModal.tsx`, `src/checklist.ts` (pure: state + gaps → groups), tests.
- **`checklist(state, gaps)`:**
  - Company group: certificate, bylaws and plan, from the docs with `doc_type` in `company_certificate`, `company_bylaws`, `plan`.
  - Founders: per stock holder, an SPA (linked doc on CS), a CIIAA and an 83(b) when vesting.
  - Employees: per option holder, a grant and a CIIAA.
  - Investors: per SAFE, a signed doc.
  - Items are `{label, ok, path?, action}`, plus the totals and the "Due-diligence ready x / y" figure.
- **AttachModal:** file dialog (pdf, png, jpg), then a doc type select (SAFE, Option grant, Stock purchase agreement, IP assignment (CIIAA), 83(b), Board consent, Plan, Certificate of incorporation, Bylaws, Other), a target select (securities and stakeholders) and a date, then `attachDocument`. A duplicate shows "This file is already in your folder (same content)."
- **Remove:** a confirmation; when it's the only proof, "This is the only signed document for <x>. Removing it will show a gap." Then `removeDocument`.
- **"Share with lawyer (.zip)":** ComingSoon (M6).
- [ ] Tests: the `checklist` unit test on acme gives 13/16-style counts (compute the exact numbers and assert them), plus a UI attach test. Commit `desktop: Documents checklist and attach/remove`.

### Task 14: Signatures, Settings, docs, manual run
**Files:** `src/screens/{Signatures,Settings}.tsx`; update `docs/15-status-and-todo.md`, `CHANGELOG.md`, `docs/09-build-plan.md`, `README.md` (`pnpm dev:desktop`).
- **Signatures:** ComingSoon (M5) with the mockup's explainer copy.
- **Settings:**
  - Lock: set/change password (`lock_set`), remove (`lock_clear`), idle select.
  - Telemetry toggle, and an Open vault folder button (`opener` reveal).
  - ComingSoon cards: AI (M4), Signing relay (M5), Updates (M7).
- [ ] Full verification: `pnpm lint && pnpm typecheck && pnpm test`, `cargo test`, then `pnpm dev:desktop` launches. Walk the flow manually with the computer-use or Chrome tooling where possible, otherwise state what wasn't verified. Commit `desktop: settings, signatures placeholder; docs for M3`.

## Verification (end to end)
1. `pnpm test`: core plus desktop unit/UI tests green, and the golden test still passes.
2. `cd apps/desktop/src-tauri && cargo test`: lock hash tests green.
3. `pnpm dev:desktop`: the app opens. First run → wizard → Home with real numbers; New SAFE, Grant, Terminate, Attach and the As-of change all work; quit and reopen → the vault reopens and verifies.
4. Open the vault folder in Finder: `events.jsonl` has one line per change, and `captable.csv` opens in Numbers or Excel.
