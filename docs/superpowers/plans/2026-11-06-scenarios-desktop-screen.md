# Scenarios, plan 2 of 3: the desktop "Try a scenario" screen

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Try a scenario" screen in the desktop app, reachable with no folder open (from Welcome) and with a company open (from the cap table), that edits a list of steps on the left and shows the engine's table for the selected step on the right, with "Save as my cap table" handing the real part to Create company and the setup wizard.

**Architecture:** The screen keeps `Step[]` in React state and calls `runScenario` from `@capfolder/core` (plan 1) in an effect with the latest-run-wins pattern `Wizard.tsx` uses; it never adds up shares. No vault is needed: `start` is `app.vault?.events ?? null`. Saving reuses the existing flow: Create company → wizard, with the wizard's initial `WizardInput` prefilled from the scenario's founders, pool and SAFEs through a new `prefill` on the `create` and `wizard` routes. Rounds and exits are never saved.

**Tech Stack:** React 19, TypeScript, vitest + Testing Library (jsdom), `@capfolder/core` scenario API, the app's `fmt.ts` helpers and `components/ui.tsx`.

**Spec:** `docs/superpowers/specs/2026-11-06-scenarios-design.md` ("Where it runs → Desktop"). Plan 1 (`2026-11-06-scenarios-engine-and-ai-tool.md`) built the engine.

## Global Constraints

- The screen displays results; it never computes shares or percentages itself (spec anti-goal "math outside the engine").
- Never a recommendation: copy says "typical" with the source, never "should". The screen shows `BENCHMARKS` labels, values and sources next to the typical rounds.
- Nothing is written from this screen. Saving goes through Create company and the wizard's own save.
- Numbers typed by the founder go through `num()` (their decimal mark); labels use `withCurrency()`; placeholders use `wholeInput()`.
- Sample names only in tests and copy: Tim Apple, Steve Jobs, Steve Wozniak, Bill Gates, Acme.
- A new screen gets a help page (`apps/website/help/scenario/`) and an entry in `apps/website/help/pages.json` (CLAUDE.md).
- Commits on `main`, `feat(desktop): …`, `docs: …`.

## Review Focus

1. A founder typing a half number ("50,") or a letter in any amount field: the screen shows the engine's error for that step and keeps the other steps' tables (Task 2 test `a bad amount shows the engine's words, nothing crashes`).
2. Deleting a step in the middle (the SAFE before a round): the later tables recompute; no stale table remains (Task 2 test `removing a step recomputes the ones after it`).
3. "Save as my cap table" with a round in the list: only founders, pool and SAFEs go to the wizard; a note says rounds are recorded in the app when they close (Task 3 test `save hands founders, pool and SAFEs to the wizard, not the round`).
4. Company start on the sample company (read-only): the screen works and offers no save (Task 4 test `sample company: scenarios run, no save button`).
5. Leaving the screen and coming back: the steps are gone (state lives in the screen); the help page says so. No test; noted in the help page copy.

---

### Task 1: Route, entry points, and the screen shell with the engine hook

**Files:**
- Modify: `apps/desktop/src/state.tsx` (Route union: add `{ name: "scenario" }`; `create` and `wizard` gain `prefill?: ScenarioPrefill`)
- Modify: `apps/desktop/src/screens/index.tsx` (case `"scenario"` → `<Scenario />`)
- Modify: `apps/desktop/src/screens/Welcome.tsx` (button "Try a scenario" next to "Try the sample company", meta text "Founders, a SAFE, the usual rounds, an exit. Nothing is saved.")
- Modify: `apps/desktop/src/screens/Home.tsx` (MainHeader button "Try a scenario" → `app.go({ name: "scenario" })`)
- Modify: `apps/desktop/src/components/Header.tsx` (CrumbHeader back label for `welcome`)
- Create: `apps/desktop/src/scenario.ts` (pure helpers for the screen)
- Create: `apps/desktop/src/screens/Scenario.tsx`
- Test: `apps/desktop/src/screens/Scenario.test.tsx`

**Interfaces:**
- Consumes: `runScenario`, `defaultPath`, `BENCHMARKS`, `Step`, `ScenarioResult`, `StepResult`, `titleOf` from `@capfolder/core`; `useApp`, `Route` from `../state`; `todayIso`, `num`, `withCurrency`, `wholeInput`, `shares`, `money` from `../fmt`.
- Produces (in `scenario.ts`):

```ts
export type ScenarioPrefill = { founders: { name: string; shares: string }[]; pool?: { percent?: string; shares?: string }; safes: { investor: string; amount: string; cap: string; discount: string }[] };
export const STARTER_STEPS: Step[]; // [{kind:"founders", founders:[{name:"",shares:""},{name:"",shares:""}]}]
export function useScenario(start: VaultEvent[] | null, steps: Step[], today: string): { result: ScenarioResult | null; running: boolean }; // effect + latest-wins, like Wizard.tsx
export function prefillOf(steps: Step[]): ScenarioPrefill; // founders, pool, SAFEs only; discount fraction "0.2" → "20"
```
- Produces: route `{ name: "scenario" }`; `{ name: "create"; prefill?: ScenarioPrefill }`; `{ name: "wizard"; prefill?: ScenarioPrefill }`.

- [ ] **Step 1: Write the failing test**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { App } from "../App";
import { acmePlatform } from "../test/acme";
import { fakePlatform } from "../test/fakePlatform";

test("Welcome offers Try a scenario; the screen opens with two empty founders and no table yet", async () => {
  const fp = fakePlatform();
  render(<App platform={fp.platform} />);
  await screen.findByRole("heading", { name: "Welcome to Capfolder" });
  await userEvent.click(screen.getByRole("button", { name: "Try a scenario" }));
  await screen.findByRole("heading", { name: "Try a scenario" });
  expect(screen.getAllByLabelText("Founder name")).toHaveLength(2);
  expect(screen.getByText("Name the founders and their shares to see the first table.")).toBeInTheDocument();
});
```

(`App.test.tsx` shows a fresh `fakePlatform()` boots straight to Welcome; the buttons there need no accepted terms.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @capfolder/desktop exec vitest run src/screens/Scenario.test.tsx`
Expected: FAIL, no button named "Try a scenario".

- [ ] **Step 3: Implement the route, the entry points, `scenario.ts`, and `Scenario.tsx` as a shell**

`Scenario.tsx`: a header (`CrumbHeader` with `back: { name: "welcome" }` when no vault is open; `CrumbHeader`'s label map in `Header.tsx` gets `welcome → "Welcome"`), `<h1>Try a scenario</h1>`, a two-column layout (`display:flex; gap:24; flexWrap:wrap`): left column `flex: 1 1 360px` holds the step list (Task 2 fills it; this task renders the founders step's two name/shares rows with labels "Founder name" and "Shares"), right column `flex: 1 1 420px` shows the placeholder text until `result` has a step without error. `useScenario` runs only when the founders step has at least one name and whole shares.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @capfolder/desktop exec vitest run src/screens/Scenario.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/state.tsx apps/desktop/src/screens/index.tsx apps/desktop/src/screens/Welcome.tsx apps/desktop/src/screens/Home.tsx apps/desktop/src/scenario.ts apps/desktop/src/screens/Scenario.tsx apps/desktop/src/screens/Scenario.test.tsx
git commit -m "feat(desktop): Try a scenario screen shell, reachable from Welcome and the cap table"
```

---

### Task 2: Step editors, the typical rounds, the tables and the math

**Files:**
- Modify: `apps/desktop/src/screens/Scenario.tsx`
- Modify: `apps/desktop/src/scenario.ts` (step editing helpers)
- Test: `apps/desktop/src/screens/Scenario.test.tsx`

**Interfaces:**
- Consumes: Task 1.
- Produces (in `scenario.ts`): `export function setStep(steps: Step[], i: number, step: Step): Step[]`, `removeStep(steps, i)`, `addStep(steps, kind: Step["kind"], today: string): Step[]` (a new step with empty fields; a `round` defaults to `{ name: "Seed", sells: "20", poolTarget: "12" }` from `BENCHMARKS`, an `exit` to `{ value: "" }`), `typicalRounds(steps): Step[]` (removes existing rounds, inserts `defaultPath({ from: "preseed", through: "series-b" })` before a trailing exit).

Step editors (one card per step, in order, each with a "Remove" button except the founders step):
- Founders: rows of "Founder name" + "Shares", "+ Add founder". Shares typed through `num()`.
- Option pool: one input "Pool, % of fully diluted" (percent) and a link "by shares instead" that swaps to a "Pool shares" input.
- SAFE: "Investor", `withCurrency("Amount")`, `withCurrency("Valuation cap")`, "Discount %" (stored as a fraction string, "20" → "0.2" via `discountFraction` from `../wizard`).
- Round: "Round name", a toggle "Sells %" | "Money and valuation": sells → "Sells, % of the company" and "Pool after, %"; money → `withCurrency("New money")`, `withCurrency("Pre-money valuation")`.
- Exit: `withCurrency("Company sells for")`.
- Under the list: a "+ Add step" `Menu` (Option pool, SAFE, Priced round, Exit) and a button "Use the typical rounds" with the meta line "Seed 20%, Series A 18%, Series B 16%, pool to 12% at seed. Carta, 2025." built from `BENCHMARKS` (label: value, source, year), never hard-coded.

Right column: a row of step chips (one per `result.steps`, the selected one `aria-current="step"`; the last is selected by default and stays selected when steps change unless it no longer exists); the selected step's `title` as `<h2>`; its table (`Holder | Shares | % | Change`, `Proceeds` on an exit) with `shares()` for counts and a `ShowMath` per row from `line.math`; the step's `notes` as `.meta` lines; on `error`, a `.banner` with the engine's text instead of a table. Under every table the fixed line "Projections, not advice. Nothing is saved."

- [ ] **Step 1: Write the failing tests**

```tsx
async function openEmpty() { /* as Task 1's test, then returns screen helpers */ }
async function founders(names: [string, string], shares: string) { /* types into the two founder rows */ }

test("the first question: founders, 10% pool, $500k at $2M, typical rounds, exit at $200M", async () => {
  await openEmpty();
  await founders(["Steve Jobs", "Steve Wozniak"], "5000000");
  await userEvent.click(screen.getByRole("button", { name: "+ Add step" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Option pool" }));
  await userEvent.type(screen.getByLabelText("Pool, % of fully diluted"), "10");
  await userEvent.click(screen.getByRole("button", { name: "+ Add step" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "SAFE" }));
  await userEvent.type(screen.getByLabelText("Investor"), "Bill Gates");
  await userEvent.type(screen.getByLabelText("Amount (USD)"), "500000");
  await userEvent.type(screen.getByLabelText("Valuation cap (USD)"), "2000000");
  await userEvent.click(screen.getByRole("button", { name: "Use the typical rounds" }));
  await userEvent.click(screen.getByRole("button", { name: "+ Add step" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Exit" }));
  await userEvent.type(screen.getByLabelText("Company sells for (USD)"), "200000000");
  const chips = await screen.findAllByRole("button", { name: /^(Founders|Option pool|SAFE: Bill Gates|Seed|Series A|Series B|Exit at \$200M)$/ });
  expect(chips.map((c) => c.textContent)).toEqual(["Founders", "Option pool", "SAFE: Bill Gates", "Seed", "Series A", "Series B", "Exit at $200M"]);
  expect(await screen.findByRole("heading", { name: "Exit at $200M" })).toBeInTheDocument();
  const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1).map((r) => r.textContent);
  expect(rows.find((r) => r!.startsWith("Option pool"))).toContain("$0");
  expect(screen.getByText(/Unissued options are cancelled/)).toBeInTheDocument();
  expect(screen.getByText("Projections, not advice. Nothing is saved.")).toBeInTheDocument();
  expect(screen.getByText(/Carta, 2025/)).toBeInTheDocument();
});

test("a bad amount shows the engine's words, nothing crashes", async () => {
  await openEmpty();
  await founders(["Steve Jobs", "Steve Wozniak"], "5000000");
  await userEvent.click(screen.getByRole("button", { name: "+ Add step" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "SAFE" }));
  await userEvent.type(screen.getByLabelText("Investor"), "Bill Gates");
  await userEvent.type(screen.getByLabelText("Amount (USD)"), "50,");
  expect(await screen.findByText(/whole/)).toBeInTheDocument(); // the engine's "is not a whole number"
  await userEvent.click(screen.getByRole("button", { name: "Founders" }));
  expect(screen.getByRole("table")).toBeInTheDocument(); // the founders table is still there
});

test("removing a step recomputes the ones after it", async () => {
  // founders, SAFE, Seed (sells 20) → remove the SAFE → the Seed chip's table has no Bill Gates row
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @capfolder/desktop exec vitest run src/screens/Scenario.test.tsx`
Expected: FAIL, no "+ Add step" button.

- [ ] **Step 3: Implement the editors, the chips, the table and the math**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @capfolder/desktop exec vitest run src/screens/Scenario.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/scenario.ts apps/desktop/src/screens/Scenario.tsx apps/desktop/src/screens/Scenario.test.tsx
git commit -m "feat(desktop): scenario steps, typical rounds with sources, tables with the math"
```

---

### Task 3: Save as my cap table

**Files:**
- Modify: `apps/desktop/src/screens/Scenario.tsx` (button, only when `app.vault` is null and the founders step is valid)
- Modify: `apps/desktop/src/screens/CreateCompany.tsx` (after create, `app.go(planned ? { name: "home" } : route.prefill ? { name: "wizard", prefill: route.prefill } : { name: "start" })`; a `.banner` at the top when `prefill` is set: "Your scenario's founders, pool and SAFEs will be filled into the setup after this step. Rounds that haven't happened are recorded in the app when they close.")
- Modify: `apps/desktop/src/screens/Wizard.tsx` (initial `WizardInput` from `route.prefill`: founders name/shares, `pool: { size, name: "Option plan", approved: formation }` when the prefill has a pool by shares (a percent pool is converted by the screen: `prefillOf` resolves percent to shares using the engine's result for that step, so the wizard never computes), safes with `discount` as "20")
- Test: `apps/desktop/src/screens/Scenario.test.tsx`

**Interfaces:**
- Consumes: `ScenarioPrefill`, `prefillOf` from Task 1; `WizardInput` from `../wizard`.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

```tsx
test("save hands founders, pool and SAFEs to the wizard, not the round", async () => {
  await openEmpty();
  await founders(["Steve Jobs", "Steve Wozniak"], "5000000");
  // add pool 10%, SAFE Bill Gates 500000 at 2000000, and a Seed round (sells 20)
  await userEvent.click(screen.getByRole("button", { name: "Save as my cap table" }));
  await screen.findByRole("heading", { name: /Create|company/i });
  expect(screen.getByText(/Rounds that haven't happened/)).toBeInTheDocument();
  // fill the create form as CreateCompany's own test does (name, date, folder), submit
  await screen.findByRole("heading", { name: "Who are the founders?" });
  expect(screen.getAllByLabelText("Name").map((i) => (i as HTMLInputElement).value)).toEqual(["Steve Jobs", "Steve Wozniak"]);
  expect(screen.getAllByLabelText(/^Shares/).map((i) => (i as HTMLInputElement).value)).toEqual(["5,000,000", "5,000,000"]);
  // step through to the SAFE step and check Bill Gates / 500,000 / 2,000,000 are filled
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @capfolder/desktop exec vitest run src/screens/Scenario.test.tsx -t "save hands"`
Expected: FAIL, no "Save as my cap table" button.

- [ ] **Step 3: Implement the button, the create handoff and the wizard prefill**

- [ ] **Step 4: Run the desktop suite**

Run: `pnpm --filter @capfolder/desktop test`
Expected: all pass (Wizard and CreateCompany tests unchanged).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/screens/Scenario.tsx apps/desktop/src/screens/CreateCompany.tsx apps/desktop/src/screens/Wizard.tsx apps/desktop/src/screens/Scenario.test.tsx
git commit -m "feat(desktop): Save as my cap table hands the scenario's real part to Create company and the wizard"
```

---

### Task 4: Company start, help page, docs, full gate

**Files:**
- Modify: `apps/desktop/src/screens/Scenario.tsx` (with a vault: start from `app.vault.events`, the first chip is "Today" showing the current table, no founders step in the list, no save button; `.meta` line "To record a SAFE or a grant for real, use + New on the cap table.")
- Create: `apps/website/help/scenario/index.html` (sub-page template as `help/founders/index.html`: title "Try a scenario · Capfolder help", description ≤ 155 chars, canonical, steps, "Nothing is saved; the steps are gone when you leave the screen", the "not advice" line, a link to `/features/ai/` for the same from your AI)
- Modify: `apps/website/help/index.html` (list item), `apps/website/help/pages.json` (`"scenario": { "checked": "<head sha>", "covers": ["apps/desktop/src/screens/Scenario.tsx", "apps/desktop/src/scenario.ts", "packages/core/src/scenario/benchmarks.ts"] }`)
- Modify: `docs/02-user-stories.md` (F-39 step 5: the desktop screen is built), `docs/15-status-and-todo.md` (item 19: desktop screen built; next the website calculator), `CHANGELOG.md` (Unreleased, Added: "**Try a scenario** in the app: from Welcome with no company, or from the cap table. Founders, a pool, SAFEs, the typical rounds with their sources, an exit. Nothing is saved until you choose Save as my cap table, which fills the setup for you.")
- Test: `apps/desktop/src/screens/Scenario.test.tsx`, `apps/website/site.test.ts` (runs as is; the help page must pass its rules)

- [ ] **Step 1: Write the failing tests**

```tsx
test("from the cap table: Today, then an exit at $100M; nothing is written", async () => {
  const fp = acmePlatform();
  render(<App platform={fp.platform} />);
  await screen.findByText("Fully diluted");
  const before = fp.fs.readSync(`${fp.root}/events.jsonl`);
  await userEvent.click(screen.getByRole("button", { name: "Try a scenario" }));
  await screen.findByRole("heading", { name: "Try a scenario" });
  expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Save as my cap table" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "+ Add step" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Exit" }));
  await userEvent.type(screen.getByLabelText("Company sells for (USD)"), "100000000");
  await screen.findByRole("heading", { name: "Exit at $100M" });
  expect(screen.getByText(/Convert the SAFEs with a round first/)).toBeInTheDocument(); // acme has SAFEs outstanding
  expect(fp.fs.readSync(`${fp.root}/events.jsonl`)).toBe(before);
});

test("sample company: scenarios run, no save button", async () => { /* open the sample from Welcome, then Try a scenario */ });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @capfolder/desktop exec vitest run src/screens/Scenario.test.tsx -t "cap table|sample"`
Expected: FAIL, no "Today" chip.

- [ ] **Step 3: Implement the company start; write the help page, pages.json, index entry, docs and changelog**

- [ ] **Step 4: Run lint, typecheck, every test, and the help check**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm help:check`
Expected: all green; `help:check` lists no stale page for `scenario`.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/screens/Scenario.tsx apps/desktop/src/screens/Scenario.test.tsx apps/website/help docs/02-user-stories.md docs/15-status-and-todo.md CHANGELOG.md
git commit -m "feat(desktop): scenarios from the open company; help page; docs"
```
