# Not incorporated yet: promised shares (CAP-61) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A founder who hasn't incorporated can create a company, record promised shares, and later turn every promise into real shares in one previewed step, in the desktop app and from the AI.

**Architecture:** A not-yet-incorporated company is a vault with **no ISSUER event** (OCF 1.2.0 requires `formation_date` on ISSUER, so we never write one without a date). The planned name, country and a reserved issuer id ride on the existing `vault_created` app event. Promises are `kind: "app"` events (`shares_promised`), outside OCF. Incorporation is one atomic batch: ISSUER (with the reserved id) + a Common class if none + one TX_STOCK_ISSUANCE per open promise + a `promise_kept` app event naming the promise and the new security. All append-only, so the docs/12 sync rules hold.

**Tech Stack:** TypeScript, vitest, React (desktop), MCP SDK + zod (packages/capfolder).

**Spec:** Linear CAP-61, plus `docs/superpowers/specs/2026-10-29-agentic-install-journey-design.md` (step 3.1 and "Our calls", changed in Task 4). Sync rules: `docs/12-cloud-later.md`.

## Global Constraints
- TDD: failing test first, then code. Smallest diff. Don't break the working desktop app: run the desktop suite in every task that touches core or vault.
- Existing vaults (all have an ISSUER) must behave exactly as today. The golden tests (`fixtures/acme-vault`) stay green, with the fixture untouched.
- Append-only. ULID ids from `builders.newId`. No rewriting earlier lines. Promises and their conversion are ordered by the reducer's (ts, id) app-event order.
- Copy is plain English and never legal advice. Promised shares always carry the label: **"Promised — not legal until the company exists."**
- Sample names only: Tim Apple, Steve Jobs, Steve Wozniak, Bill Gates, Acme.
- Commit only own paths: `git commit -- <paths>`. No Co-Authored-By trailer. Never push. Never commit `.agents/ .claude/ .github/agents|hooks|skills/ .impeccable/ .taste-skill/ design/preview/ skills-lock.json .superpowers/`.
- `pnpm lint` (biome) must pass for touched files.

## Our calls (Mads can overrule)
1. **Not incorporated = no ISSUER event.** Derived, never stored as a flag, so it can't drift. Cost if wrong: a vault that lost its ISSUER line some other way also looks "not incorporated" (only a hand-edited vault).
2. **Promises are app events, not OCF.** OCF has no "promise" object, and OCF exports stay valid. Cost if wrong: promises don't appear in OCF exports (there are none before incorporation anyway: export is blocked).
3. **A promise is a person, a share count and vesting (4y/1y cliff or none, optional start).** No class, no price. The class and price are fixed at incorporation. Cost if wrong: a founder can't promise preferred shares (not a pre-incorporation thing).
4. **Incorporation asks for the date, the legal name, the place, authorized shares (default 10,000,000) and par value (default 0.00001).** The shares are issued on the incorporation date by default, at par, or on `issue_date` if given (the stock purchase agreement date). Cost if wrong: one more question at incorporation.
5. **Before incorporation, core refuses new securities and option pools** (a new invariant). One guard covers the app, the AI and imports. Old vaults aren't affected, because only *new* violations block a write. Cost if wrong: a founder who wants to log a pre-incorporation SAFE can't (a SAFE needs a company to sign it).
6. **Withdraw a promise = the existing `reversal` of its event.** No new event type. Cost if wrong: none.
7. **Before incorporation, CSV exports the promised split; Excel and OCF wait** (Mads 2026-11-02: "there should be some type of export possible"). The CSV is `<company>-promised-split-<today>.csv`: first line `# Promised shares, not legal until the company exists. Not legal advice.`, then `Name,Shares,Percent,Vesting` rows from `promisedTable`. Excel and OCF return "Excel and OCF exports start once the company is incorporated. CSV exports the promised split." Cost if wrong: none; it adds one file shape.
8. **Promises are only for not-yet-incorporated companies.** After incorporation the AI and app use issue_shares / New shares. Cost if wrong: none.

## Review Focus
1. A promise withdrawn (reversed) before incorporation must not be converted. Pinned in Task 1 (`incorporation skips withdrawn promises`).
2. Two promises to the same person become two securities with distinct ids (CS-1, CS-2), in promise order. Pinned in Task 1.
3. Recording the incorporation twice must be refused, not create a second issuer. Pinned in Task 3 (`record_incorporation refuses when already incorporated`) and Task 5 (the button only shows without an issuer).
4. An incorporation date in the future, or an issue date before the incorporation date, is refused. Pinned in Task 3.
5. Opening an existing incorporated vault: Home, Get started and exports are unchanged. Pinned by the existing desktop suite, run in Tasks 1, 2 and 5.

---

### Task 1: Core: the promise model, the incorporation builder and the guard

**Files:**
- Modify: `packages/core/src/types.ts` (State, new `Promised`)
- Modify: `packages/core/src/reduce.ts` (init state; `vault_created` moves out of `APP_IGNORED` into `applyApp`; new cases)
- Modify: `packages/core/src/builders.ts` (`issuer` takes an optional `id`; new `sharesPromised`, `incorporation`)
- Modify: `packages/core/src/invariants.ts` (one rule)
- Modify: `packages/core/src/index.ts` only if `promisedTable` needs exporting (it lives in `rows.ts`, already exported)
- Modify: `packages/core/src/rows.ts` (new `promisedTable`)
- Test: `packages/core/test/promises.test.ts` (new)

**Interfaces:**
- Produces:
  - `interface Promised { id: string; eventId: string; stakeholderId: string; quantity: bigint; vesting: "4y_1y_cliff" | "none"; vestingStart?: string }`
  - `State.planned?: { name: string; country: string; subdivision: string; issuer_id: string }` (from `vault_created` data when it has `issuer_id`)
  - `State.promises: Map<string, Promised>` keyed by `promise_id`, in reducer (ts, id) order
  - `builders.issuer(p: { id?: string; name; formationDate; country?; subdivision? })`
  - `builders.sharesPromised(p: { stakeholderId: string; quantity: string; vesting: "4y_1y_cliff" | "none"; vestingStart?: string }): EventDraft` → `app("shares_promised", { promise_id: newId("prm"), stakeholder_id, quantity, vesting, vesting_start? })`
  - `builders.incorporation(p: { state: State; issuerId: string; name: string; country: string; subdivision: string; date: string; issueDate?: string; authorized: string; parValue: string; currency?: string; terms: { id: string; drafts: EventDraft[] } | null }): EventDraft[]`
    Order: ISSUER (id = issuerId); a `stockClass` "Common" (authorized, parValue) if the state has no class, else the first class; `terms.drafts` if any open promise vests; then per open promise in `state.promises` order: `stockIssuance` (date = issueDate ?? date, price = parValue, `securityId` = `CS-${nextSecurityIdNumber(state,"CS") + i}`, vesting start = promise.vestingStart ?? issue date) followed by `app("promise_kept", { promise_id, security_id })`.
  - `promisedTable(s: State): { promiseId: string; eventId: string; stakeholderId: string; name: string; shares: bigint; percent: string; vesting: string }[]`: percent of all open promises, via the existing `largestRemainder(…, 2)`.

- [ ] **Step 1: Write the failing tests** in `packages/core/test/promises.test.ts`. Build logs with `appendEvents("", drafts, ctx)`, using the `ctx` style from `test/append.test.ts`.
  - `promises before incorporation`: `vault_created` with `{ name: "Acme", country: "US", subdivision: "DE", issuer_id: "iss_A" }`, stakeholders Tim Apple and Steve Wozniak, promises 6,000,000 (4y_1y_cliff) and 4,000,000 (none). Expect `reduce(...).issuer` undefined, `planned.issuer_id === "iss_A"`, `promises.size === 2`, and `promisedTable` percents `["60.00", "40.00"]`.
  - `no shares or pool before incorporation`: appending a `stockIssuance` (with a class) is refused with the error `"The company isn't incorporated yet. Record the incorporation first; until then shares can only be promised."`. The same applies to a `stockPlan`.
  - `incorporation turns each promise into shares`: `incorporation({ date: "2026-03-03", authorized: "10000000", parValue: "0.00001", terms: { id: "vt_1", drafts: [b.vestingTerms4y1y("vt_1")] }, ... })` appends cleanly. Then: issuer id `iss_A` with `formation_date: "2026-03-03"`; securities CS-1 = 6,000,000 to Tim with `vestingTermsId: "vt_1"`, CS-2 = 4,000,000 to Steve with no vesting; `promises.size === 0`; `checkInvariants` is empty.
  - `incorporation skips withdrawn promises`: a `reversal` of Steve's promise event before incorporation → only CS-1 is issued.
  - `two promises to one person become two securities`: Tim promised 1,000 twice → CS-1 and CS-2, both Tim.
  - `an incorporated vault is unchanged`: the acme golden log reduces with `planned` undefined and `promises.size === 0`.
- [ ] **Step 2: Run** `pnpm --filter @capfolder/core exec vitest run test/promises.test.ts`. Expected: FAIL (`sharesPromised` is not a function).
- [ ] **Step 3: Implement** the interfaces above.
  - Reducer: `vault_created` sets `s.planned` only when `d.issuer_id` is a string. `shares_promised` uses the existing `qty` for the quantity (a bad number becomes a violation). `promise_kept` deletes the promise.
  - Invariant (in `checkInvariants`): `if (!s.issuer && (s.securities.size || s.plans.size)) out.push(<message above>)`.
- [ ] **Step 4: Run** `pnpm --filter @capfolder/core test`, then `pnpm --filter @capfolder/desktop test`. Expected: all pass. If an existing core test builds securities without an ISSUER, add an ISSUER to that test's setup; never weaken the rule.
- [ ] **Step 5: Commit** `feat(core): promised shares before incorporation, and the incorporation batch (CAP-61)`.

### Task 2: Vault: create without a date, block exports, describe the new lines

**Files:**
- Modify: `packages/vault/src/vault.ts` (`CompanyInput.formationDate?: string`; `createVault`; `exportFile`)
- Modify: `packages/vault/src/agents-md.ts` (one sentence)
- Modify: `docs/03-data-model.md` (the two app event types)
- Test: `packages/vault/src/vault.test.ts` (or that package's existing createVault test file)

**Interfaces:**
- Consumes: Task 1 `builders.issuer({ id })` and `State.planned`.
- Produces:
  - `createVault` with no `formationDate`: no ISSUER event. `vault_created.data` = `{ name, created_by: "founder", country, subdivision, issuer_id }`, and `capfolder.json` `issuer_id` is that same reserved id. With a date: exactly today's events (unchanged).
  - `exportFile` with no issuer: `csv` returns the promised-split CSV (Our call 7, exact name, comment line and header); `xlsx` and `ocf` return `{ error: "Excel and OCF exports start once the company is incorporated. CSV exports the promised split." }`.

- [ ] **Step 1: Failing tests:**
  - `createVault without a date writes no ISSUER and reserves the issuer id`: MemoryFs, company `{ name: "Acme", country: "US", subdivision: "DE" }`. Expect the events to be `[vault_created]`, `meta.issuer_id === reduce(...).planned.issuer_id`, and `docs/` folders exist.
  - `exportFile before incorporation`: csv for Tim Apple 6,000,000 and Steve Wozniak 4,000,000 gives the comment line, the header and rows `Tim Apple,6000000,60.00,4 years, 1-year cliff` style values (quote any field with a comma); xlsx and ocf give the error string above.
  - `createVault with a date is unchanged`: the event types are `["vault_created", "ISSUER"]`.
- [ ] **Step 2: Run** `pnpm --filter @capfolder/vault test`. Expected: FAIL.
- [ ] **Step 3: Implement.** agents-md: add "A company that isn't incorporated yet has no ISSUER line; `shares_promised` app lines are promises, not shares." docs/03: list `shares_promised` and `promise_kept` with their fields.
- [ ] **Step 4: Run** the vault, core and desktop tests. Expected: all pass.
- [ ] **Step 5: Commit** `feat(vault): create a company before incorporation; exports wait for it (CAP-61)`.

### Task 3: AI tools: create without a date, promise, withdraw, record the incorporation

**Files:**
- Modify: `packages/capfolder/src/tools/write.ts`, `packages/capfolder/src/tools/read.ts`
- Test: `packages/capfolder/src/tools/write.test.ts`, `packages/capfolder/src/tools/read.test.ts`, `packages/capfolder/src/golden.test.ts` (new scenario test in the same file)

**Interfaces:**
- Consumes: Tasks 1–2. Uses the existing `vaultTool`, `personFor`, the local `standardTerms(c.s)`, `vestingArg`, `date`, `count`, `decimal`, `plus30` in write.ts.
- Produces tools (all preview → confirm, via `vaultTool` except create_company):
  - `create_company`: `formation_date` stays optional. Without it the summary reads `Creates the company Acme (not incorporated yet, plans US-DE, currency USD) in a new folder …`. Delete `NO_FORMATION_DATE` and its test; a future date is still refused.
  - `promise_shares { person, email?, shares, vesting, vesting_start? }`. Refused when incorporated: `"Acme is incorporated: use issue_shares."`. Summary: `Promises 6,000,000 shares to Tim Apple, vesting 4 years with a 1-year cliff, monthly. Promised — not legal until the company exists.`
  - `withdraw_promise { person }`: reverses that person's open promise(s). With none: `"Tim Apple has no open promise."`.
  - `record_incorporation { date, legal_name?, country?, subdivision?, authorized = "10000000", par_value = "0.00001", issue_date? }`. Refusals:
    - incorporated: `"Acme is already incorporated."`
    - future date: `"The incorporation date can't be in the future."`
    - `issue_date < date`: `"Shares can't be issued before the company exists."`

    The summary lists every conversion: `Tim Apple: 6,000,000 Common shares (CS-1), vesting from 2026-03-03.` If anything vests, it ends with the same 83(b) warning text issue_shares uses.
  - `get_cap_table` before incorporation: the text starts `Acme isn't incorporated yet. Promised shares (Promised — not legal until the company exists):`, followed by name, shares and % rows from `promisedTable`. `data.promised` holds the same rows.
- [ ] **Step 1: Failing tests** (write.test.ts / read.test.ts, existing helpers):
  - `create_company without a date creates a not-incorporated company`
  - `promise_shares previews, then records a promise`
  - `promise_shares refuses once incorporated`
  - `withdraw_promise reverses the open promise`
  - `record_incorporation turns promises into shares` (CS-1/CS-2 as in Task 1)
  - `record_incorporation refuses when already incorporated`
  - `record_incorporation refuses a future date and an issue date before it`
  - `get_cap_table lists promised shares before incorporation`
  - In golden.test.ts, `scenario: promise then incorporate`: create Acme with no date → promise Tim Apple 6,000,000 (vesting) and Steve Wozniak 4,000,000 (none) → record_incorporation 2026-03-03 → `get_cap_table` as of 2026-03-03 has exactly two stock rows at 60.00 and 40.00.
- [ ] **Step 2: Run** `pnpm --filter capfolder test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** Add the new tool names to the "write tools are listed" test.
- [ ] **Step 4: Run** `pnpm --filter capfolder test && pnpm --filter capfolder typecheck`. Expected: pass.
- [ ] **Step 5: Commit** `feat(capfolder): promise shares and record the incorporation from chat (CAP-61)`.

### Task 4: Skill and spec

**Files:**
- Modify: `skills/capfolder/SKILL.md`, then copy it byte-for-byte to `plugin/skills/capfolder/SKILL.md` (packaging.test.ts checks the copy)
- Modify: `docs/superpowers/specs/2026-10-29-agentic-install-journey-design.md` (step 3.1, "Our calls" → "No company yet")
- Modify: `CHANGELOG.md` ([Unreleased])

- [ ] **Step 1:** Rewrite the skill's step 1 "Not yet" branch:
  - Ask the name they plan to use and where they plan to incorporate.
  - Then ask for the folder, then `create_company` without a date.
  - Then for each founder, `promise_shares`, always saying "Promised — not legal until the company exists".
  - Offer the founder guide link as further reading.
  - Add: "When they say the company is incorporated: `record_incorporation`, show the preview, wait for yes."
- [ ] **Step 2:** In the spec, replace "stops" / "no folder is created" with the promise flow and a reference to CAP-61.
- [ ] **Step 3: Run** `pnpm --filter capfolder test` (packaging test). Expected: pass.
- [ ] **Step 4: Commit** `docs: the not-incorporated path in the skill and spec (CAP-61)`.

### Task 5: Desktop: create without a date, promise, see promises, incorporate

**Files:**
- Modify: `apps/desktop/src/screens/CreateCompany.tsx` (checkbox; skip the date check; go home when not incorporated)
- Modify: `apps/desktop/src/screens/NewShares.tsx` (promise mode when `!latest.issuer`)
- Modify: `apps/desktop/src/screens/Home.tsx` (not-incorporated card)
- Create: `apps/desktop/src/components/IncorporateDialog.tsx`
- Modify: `apps/desktop/src/onboarding.ts` (two steps when not incorporated)
- Modify: `design/app/` only if the screen's mock lives there (match existing look; no new styles unless needed)
- Test: `apps/desktop/src/screens/Promises.test.tsx` (new), plus the existing Home, Forms and Export tests must stay green

**Interfaces:**
- Consumes: Task 1 builders and `promisedTable`, Task 2 `createVault`, desktop `standardTerms(s, id)`, `app.run`, `CompanyPlace`, `DateInput`, `PersonPicker`.
- Behaviour:
  - **CreateCompany:** a checkbox **"Not incorporated yet"**. When it's ticked, the date field hides, the place label reads "Where you plan to incorporate", and the date is not required. On success, it goes to `{ name: "home" }`, not `start`, because the start / questions / wizard flow sets up classes and issuances.
  - **NewShares** with no issuer:
    - Title "Promise shares"; the class, price and date fields are hidden.
    - The drafts are `person.drafts + sharesPromised(...)`, with vesting "4y_1y_cliff" when the vesting box is ticked, else "none".
    - A meta line: "Promised — not legal until the company exists."
  - **Home** with no issuer: one card "Not incorporated yet" instead of the cap table.
    - It holds the `promisedTable` rows: name, shares, %, vesting, and a Remove button that runs `b.reversal({ target: eventId, reason: "Promise withdrawn" })`.
    - Buttons "Promise shares" (→ `newShares`) and "We're incorporated" (opens IncorporateDialog).
  - **IncorporateDialog:**
    - Fields: legal name (prefilled from `planned.name`), CompanyPlace (prefilled from `planned`), date (≤ today), authorized (10000000) and par value (0.00001).
    - Below the fields, a list of what each promise becomes (same lines as the AI summary).
    - The "Record incorporation" button runs `b.incorporation(...)`. Errors show in the existing ErrorList.
  - **Export** with no issuer: only CSV is offered, labelled "Promised split (CSV)"; the as-of date is hidden. It saves the Task 2 promised-split CSV. Test: `export before incorporation offers the promised split`.
  - **getStarted** with no issuer returns only:
    - "Promise shares to founders" (done when `promises.size > 0`; → newShares)
    - "Record the incorporation" (done: never while no issuer; → home)
- [ ] **Step 1: Failing tests** in `Promises.test.tsx`, with the existing render helpers from `Forms.test.tsx` / `Home.test.tsx`:
  - `create a company that isn't incorporated yet`: tick the box, no date → the vault has no ISSUER and the route is home.
  - `promise shares from New shares`: Tim Apple 6,000,000 → Home shows "Promised — not legal until the company exists" and 100.00%.
  - `remove a promise`: Remove → the row is gone.
  - `record the incorporation`: date 2026-03-03 → Home shows the normal cap table with Tim Apple CS-1.
  - `an incorporated company shows no promise UI`: the acme fixture Home has no "Not incorporated yet".
- [ ] **Step 2: Run** `pnpm --filter @capfolder/desktop exec vitest run src/screens/Promises.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the whole desktop suite, `pnpm --filter @capfolder/desktop typecheck` and `pnpm --filter @capfolder/desktop build`. Expected: pass.
- [ ] **Step 5: Commit** `feat(desktop): not incorporated yet: promise shares, then record the incorporation (CAP-61)`.

### Task 6: Full gate

- [ ] Run `pnpm lint && pnpm typecheck && pnpm -r test && pnpm licenses:check` and `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`. Expected: all green, test counts at least: core 347+, vault 45+, capfolder 68+, desktop 195+.
- [ ] Rehearse CI in a clean clone (`git clone` into the scratchpad, `pnpm i --frozen-lockfile`; on this Mac add `pnpm i --force` for the rolldown binding), then lint and test there. Untracked local folders hide CI failures.
- [ ] No commit unless the gate needed a fix.
