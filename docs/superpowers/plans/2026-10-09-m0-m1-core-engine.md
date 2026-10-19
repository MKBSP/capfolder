# Capfolder M0 + M1 (Repo and Core Engine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pnpm monorepo with CI and licensing, plus a pure-TypeScript `packages/core` that turns a hash-chained `events.jsonl` of OCF transactions into a cap table that matches `fixtures/acme-vault/captable.expected.csv` byte for byte.

**Architecture:** `packages/core` has no I/O. Text or parsed events go in, values come out. Flow: `verifyChain(text)` → `reduce(events, asOf)` → `State` → `capTableRows(state, at)` → `toCaptableCsv(rows)`. `appendEvent` is the only write path. It checks the chain, validates the OCF schema, checks invariants, and returns the canonical line to append. OCF 1.2.0 schemas are vendored as one JSON file so validation works offline and in the Tauri webview later.

**Tech Stack:** Node 22, pnpm 10.4.1 workspaces, TypeScript 7.0.2, vitest 5.0.1, @biomejs/biome 2.5.14, fast-check 4.10.2. Runtime dependencies: ajv 8.20.0, ajv-formats 3.0.1, canonicalize 5.1.0, ulid 3.0.2, js-md5 0.9.2 (all MIT or Apache-2.0).

**Spec:** `docs/superpowers/specs/2026-10-09-m0-m1-core-engine-design.md` (read it with this plan). Product rules: `CLAUDE.md`, `docs/03-data-model.md`.

**Repo:** `~/Desktop/claude_code_projects/capfolder` (git, `main`, remote `origin` = github.com/MKBSP/capfolder). **Never `git push`. Commit messages carry no Co-Authored-By trailer.**

## Context
Pulley shuts down on Dec 8, 2026, and Capfolder must launch before Nov 30. M0+M1 builds the foundation every later milestone depends on: the event log and the math. The spec is approved. The plan below fixes the exact OCF 1.2.0 shapes, which I checked against the official schemas at tag v1.2.0 (commit 9f987b4):
- `VestingTerms.vesting_conditions[]`: `{id, trigger, next_condition_ids, portion{numerator,denominator,remainder?} | quantity}`.
  - Trigger types: `VESTING_START_DATE`, or `VESTING_SCHEDULE_RELATIVE` with `{period:{type:"MONTHS",length,occurrences,day_of_month}, relative_to_condition_id}`.
  - `allocation_type` enum includes `CUMULATIVE_ROUND_DOWN` and `CUMULATIVE_ROUNDING`.
- The official sample "4yr-1yr-cliff-schedule" is: start (quantity 0) → cliff (12/48 after 12 months) → monthly (1/48, 36 occurrences, relative to the cliff).
- SAFE: `conversion_triggers[]` (`trigger_id`, `type`, `conversion_right{type:"CONVERTIBLE_CONVERSION_RIGHT", conversion_mechanism{type:"SAFE_CONVERSION", conversion_mfn (required), conversion_valuation_cap{amount,currency}, conversion_discount ("0.20"), conversion_timing "POST_MONEY"}}`).
- `TX_STOCK_PLAN_POOL_ADJUSTMENT.shares_reserved` is the **new total**, not a delta.
- Cancellation, repurchase and transfer carry an optional `balance_security_id`. In strict OCF, the remainder lives in a new security created by its own issuance.
- The schemas are draft-07 with `additionalProperties:false`. They need ajv-formats (date, date-time, email). Every `DOCUMENT` object and manifest file entry requires `md5`.
- The schema license is the "OCF Schema and Documentation License": copying is allowed if the notice is kept.

**Execution (recommended): Native.** I implement the tasks in order in this session, then one fresh reviewer checks the whole branch. The 14 tasks are strictly sequential and share interfaces. The plan carries the full code, and the golden and property tests gate correctness. Say "subagent-driven" at approval if you'd rather have a reviewer after every task (slower, more tokens).
First step of execution: copy this plan to `docs/superpowers/plans/2026-10-09-m0-m1-core-engine.md` and commit it.

## Global Constraints
- `packages/core/src/**` is pure: no `node:` imports, no fs, no network. It uses `globalThis.crypto.subtle` for SHA-256 (enforced by `test/purity.test.ts`).
- Shares and money use bigint or scaled bigint. No floating-point arithmetic for any number written to a file.
- `events.jsonl` lines are written as RFC 8785 canonical JSON (`canonicalize`), with LF line endings and a trailing newline. Old lines are never rewritten, except fixture files via `scripts/rehash-fixture.mjs`.
- The reducer orders transactions by (`data.date`, `ts`, `id`). Never by `seq`.
- Event ids for new events: `evt_` + ULID. `meta.device_id` is always set on appended events. Document paths are relative to the vault.
- The CSV header is exactly `stakeholder,type,class,shares,fd_percent,vested,unvested,safe_amount,safe_cap,safe_discount,as_converted_percent,doc_status`.
- Exact dependency pins (`pnpm add -E`). Every prod dependency license must be on the allow-list in `scripts/check-licenses.mjs`.
- Plain-language error strings, e.g. `Issued would exceed authorized for Common (12,000,000 > 10,000,000)`.

## Review Focus
1. **Spreadsheet formula injection:** a stakeholder named `=HYPERLINK(...)` must not execute when `captable.csv` is opened in Excel. Text cells starting with `= + - @` get a leading `'` (test in Task 9).
2. **Old violations blocking all appends:** an imported vault that already breaks an invariant must still accept unrelated appends. `appendEvent` blocks only violations the new event *introduces* (test in Task 11).
3. **As-of before a plan existed:** a pool must not appear, or count in FD, before the plan's `board_approval_date` (test in Task 10).
4. **Negative or fractional quantities:** OCF `Numeric` allows `"-5"` and `"1.5"`. Share quantities must be whole and > 0, otherwise the reducer reports a violation instead of producing wrong math (tests in Tasks 6 and 10).
5. **A correction that makes an OCF object schema-invalid** (for example, setting `quantity` to `"abc"`) must be rejected at append time (test in Task 11).

---

## File map
```
package.json  pnpm-workspace.yaml  tsconfig.base.json  biome.json  .nvmrc  .gitignore
.github/workflows/ci.yml
scripts/check-licenses.mjs                 license allow-list + THIRD_PARTY_LICENSES.md
LICENSE  CLA.md  CCLA.md  CONTRIBUTING.md  THIRD_PARTY_LICENSES.md  README.md
docs/handoff-README.md                     (moved from README.md)
packages/core/package.json  tsconfig.json
packages/core/scripts/vendor-ocf.sh        rebuilds src/ocf/schemas-1.2.0.json
packages/core/scripts/rehash-fixture.mjs   recomputes prev/hash in a fixture events.jsonl
packages/core/src/
  types.ts        VaultEvent, EventDraft, Data, Security, State, Row, Gap
  chain.ts        sha256Hex, hashEvent, verifyChain, GENESIS
  num.ts          parseDec, toInt, decFraction, subDec, fmtInt, ratioFixed, largestRemainder
  dates.ts        addMonths, datePart, MAX_DATE
  ocf/validate.ts validateOcf (objects + files)
  ocf/schemas-1.2.0.json  ocf/OCF-LICENSE.md  ocf/SOURCE.md
  vesting.ts      scheduleSteps, vestedAt, securityVested
  reduce.ts       liveEvents, reduce
  rows.ts         capTableRows
  captable-csv.ts toCaptableCsv, captableCsv
  invariants.ts   checkInvariants
  gaps.ts         computeGaps
  append.ts       appendEvent, defaultCtx
  ocf-export.ts   toOcfExport
  index.ts        public API
packages/core/test/  helpers.ts + one *.test.ts per module + golden.test.ts + invariants.property.test.ts + purity.test.ts
```

---

### Task 1: Monorepo scaffold + CI + failing golden test (M0)

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `biome.json`, `.nvmrc`, `.gitignore`, `.github/workflows/ci.yml`, `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/types.ts`, `packages/core/src/index.ts`, `packages/core/test/helpers.ts`, `packages/core/test/golden.test.ts`, `packages/core/test/purity.test.ts`

**Interfaces:**
- Produces: `captableCsv(events: VaultEvent[], asOf: string): string` (stub that throws "not implemented"), the `VaultEvent`/`EventDraft`/`Data` types, and test helpers `readFix`, `acmeEvents`, `ev`.

- [ ] **Step 1: Root files**

`package.json`:
```json
{
  "name": "capfolder",
  "private": true,
  "license": "AGPL-3.0-only",
  "packageManager": "pnpm@10.4.1",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "lint": "biome check .",
    "licenses:gen": "node scripts/check-licenses.mjs --write",
    "licenses:check": "node scripts/check-licenses.mjs"
  }
}
```
`pnpm-workspace.yaml`:
```yaml
packages:
  - "packages/*"
  - "apps/*"
```
`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true
  }
}
```
`biome.json`:
```json
{
  "files": { "includes": ["**", "!**/node_modules", "!fixtures", "!design", "!brand", "!docs", "!**/src/ocf/schemas-*.json"] },
  "formatter": { "indentStyle": "space", "indentWidth": 2, "lineWidth": 110 },
  "linter": { "rules": { "suspicious": { "noExplicitAny": "off" }, "style": { "noNonNullAssertion": "off" } } }
}
```
`.nvmrc`: `22`. `.gitignore`: `node_modules/`, `.DS_Store`, `coverage/`, `*.log`.

- [ ] **Step 2: Dev dependencies**

Run: `cd ~/Desktop/claude_code_projects/capfolder && pnpm add -w -D -E typescript@7.0.2 vitest@5.0.1 @biomejs/biome@2.5.14 @types/node@22`
Expected: lockfile created. If `tsc` from TS 7.0.2 fails on this setup, use `typescript@6.0.3` and note it in the commit message.

- [ ] **Step 3: `packages/core` package**

`packages/core/package.json`:
```json
{
  "name": "@capfolder/core",
  "version": "0.0.0",
  "private": true,
  "license": "AGPL-3.0-only",
  "type": "module",
  "main": "src/index.ts",
  "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit -p ." }
}
```
`packages/core/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "types": ["node"] }, "include": ["src", "test"] }
```
`src/types.ts`:
```ts
// OCF payloads are validated by ajv against the vendored schemas, so `any` here is deliberate.
export type Data = Record<string, any>;

export interface EventMeta {
  source: string;
  device_id?: string;
  note?: string;
  doc_ids?: string[];
}

export interface VaultEvent {
  seq: number;
  id: string;
  ts: string;
  kind: "ocf" | "app";
  type: string;
  data: Data;
  meta: EventMeta;
  prev: string | string[];
  hash: string;
}

export interface EventDraft {
  kind: "ocf" | "app";
  type: string;
  data: Data;
  meta?: Partial<EventMeta>;
}
```
`src/index.ts` (M0 stub):
```ts
import type { VaultEvent } from "./types";
export * from "./types";

export function captableCsv(_events: VaultEvent[], _asOf: string): string {
  throw new Error("not implemented");
}
```

- [ ] **Step 4: Test helpers, golden test (expected to fail), purity test**

`test/helpers.ts`:
```ts
import { readFileSync } from "node:fs";
import type { Data, VaultEvent } from "../src/types";

const FIX = new URL("../../../fixtures/acme-vault/", import.meta.url);
export const readFix = (name: string) => readFileSync(new URL(name, FIX), "utf8");
export const acmeEvents = (): VaultEvent[] =>
  readFix("events.jsonl").trim().split("\n").map((l) => JSON.parse(l));

let n = 1000;
/** Unhashed test event. Upper-case types are OCF objects/transactions. */
export function ev(type: string, data: Data, opts: { ts?: string; id?: string } = {}): VaultEvent {
  n++;
  const ocf = type === type.toUpperCase();
  return {
    seq: n,
    id: opts.id ?? `evt_t${String(n).padStart(9, "0")}`, // padded so ids sort as strings (property test makes 100k+)
    ts: opts.ts ?? "2026-10-07T10:00:00Z",
    kind: ocf ? "ocf" : "app",
    type,
    data: ocf ? { object_type: type, ...data } : data,
    meta: { source: "test" },
    prev: "",
    hash: "",
  };
}
```
`test/golden.test.ts`:
```ts
import { expect, test } from "vitest";
import { captableCsv } from "../src/index";
import { acmeEvents, readFix } from "./helpers";

// M0: fails on purpose until the engine exists (flipped to `test` in Task 9).
test.fails("acme vault reproduces captable.expected.csv byte for byte", () => {
  expect(captableCsv(acmeEvents(), "2026-10-07")).toBe(readFix("captable.expected.csv"));
});
```
`test/purity.test.ts`:
```ts
import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";

const SRC = new URL("../src/", import.meta.url);

test("core src has no Node or I/O imports", () => {
  const files = readdirSync(SRC, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".ts"));
  const offenders = files.filter((f) => /from "node:|require\(/.test(readFileSync(new URL(f, SRC), "utf8")));
  expect(offenders).toEqual([]);
});
```

- [ ] **Step 5: CI workflow** `.github/workflows/ci.yml`:
```yaml
name: ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm i --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm licenses:check
```
(`licenses:check` is added in Task 2. The Tauri build matrix moves to M3.)

- [ ] **Step 6: Verify**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all pass. The golden test is reported as an expected failure, and the purity test passes. Run `pnpm biome check --write .` first if formatting complains.

- [ ] **Step 7: Commit**
```bash
git add -A && git commit -m "M0: pnpm monorepo, core package, CI, golden test failing on purpose"
```

---

### Task 2: Licensing, README, contributing (M0)

**Files:**
- Create: `LICENSE`, `CLA.md`, `CCLA.md`, `CONTRIBUTING.md`, `THIRD_PARTY_LICENSES.md`, `scripts/check-licenses.mjs`
- Move: `README.md` → `docs/handoff-README.md`. Create a new `README.md`.
- Modify: `CLAUDE.md` (Commands section)

- [ ] **Step 1: AGPL text.** Run `curl -sL https://www.gnu.org/licenses/agpl-3.0.txt -o LICENSE` and check that `head -3 LICENSE` shows "GNU AFFERO GENERAL PUBLIC LICENSE / Version 3".

- [ ] **Step 2: CLA texts.**
  - Fetch `https://www.apache.org/licenses/icla.txt` → `CLA.md` and `https://www.apache.org/licenses/cla-corporate.txt` → `CCLA.md`.
  - In both, replace "The Apache Software Foundation" / "the Foundation" with "Mads Schmidt Petersen" / "the Maintainer".
  - Replace the mailing and fax submission instructions with "Sign by commenting on your first pull request, as prompted by CLA Assistant."
  - Prepend: `> **Draft. To be reviewed by a lawyer before launch.** Based on the Apache Software Foundation Individual (ICLA v2.2) / Corporate CLA.`
  - Keep the grant clauses (copyright license, patent license, relicensing) unchanged.

- [ ] **Step 3: License checker** `scripts/check-licenses.mjs`:
```js
// Checks prod dependency licenses against an allow-list and keeps THIRD_PARTY_LICENSES.md current.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const ALLOWED = new Set([
  "MIT", "ISC", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "0BSD", "MPL-2.0",
  "AGPL-3.0-only", "AGPL-3.0-or-later", "LGPL-3.0-only", "LGPL-3.0-or-later", "MIT OR Apache-2.0",
]);
const data = JSON.parse(execFileSync("pnpm", ["licenses", "list", "--prod", "--json", "-r"], { encoding: "utf8" }));
const lines = ["# Third-party licenses", "", "Generated by `pnpm licenses:gen` (production dependencies).", "",
  "Vendored data: OCF 1.2.0 JSON schemas, Open Cap Table Coalition, OCF Schema and Documentation License (packages/core/src/ocf/OCF-LICENSE.md).", ""];
for (const lic of Object.keys(data).sort())
  for (const p of [...data[lic]].sort((a, b) => a.name.localeCompare(b.name)))
    lines.push(`- ${p.name} ${p.versions.join(", ")}: ${lic}`);
const out = `${lines.join("\n")}\n`;
if (process.argv.includes("--write")) writeFileSync("THIRD_PARTY_LICENSES.md", out);
else if (readFileSync("THIRD_PARTY_LICENSES.md", "utf8") !== out) {
  console.error("THIRD_PARTY_LICENSES.md is stale. Run: pnpm licenses:gen");
  process.exit(1);
}
const bad = Object.keys(data).filter((l) => !ALLOWED.has(l));
if (bad.length) {
  console.error("Licenses not on the allow-list:", bad.join(", "));
  process.exit(1);
}
```
Run `pnpm licenses:gen`. With no prod deps yet the file contains only the header. If `pnpm licenses list --json` prints a different shape (check `versions`), adjust the loop to it.

- [ ] **Step 4: Docs.**
  - Run `git mv README.md docs/handoff-README.md`.
  - The new `README.md` contains: the one-liner from `docs/00`, the disclaimer (exact text from `docs/00`), commands (`pnpm i`, `pnpm test`, `pnpm typecheck`, `pnpm lint`), the repo layout, a license note (AGPL-3.0, CLA on first PR), and a "To do outside the code" list:
    - Pulley exports before Dec 8
    - Apple/Windows signing certificates
    - install CLA Assistant on MKBSP/capfolder pointing at CLA.md
    - trademark search
    - register capfolder.com
  - `CONTRIBUTING.md`: build commands, "the golden tests in fixtures/ gate CI; never edit expected outputs to make a test pass", and "your first PR asks you to sign the CLA".
  - In `CLAUDE.md` Commands, mark `dev:desktop` (M3), `dev:web` (M8) and `dev:relay` (M5) as "(added in Mx)".

- [ ] **Step 5: Verify + commit.** Run `pnpm licenses:check && pnpm lint`, expect both to pass, then:
```bash
git add -A && git commit -m "M0: AGPL license, draft CLA/CCLA, contributing, license check, README"
```

---

### Task 3: Hash chain (verify the existing fixture)

**Files:**
- Create: `packages/core/src/chain.ts`, `packages/core/test/chain.test.ts`
- Modify: `packages/core/src/index.ts` (export chain)

**Interfaces:**
- Produces: `GENESIS: string`, `sha256Hex(s: string): Promise<string>`, `hashEvent(e: VaultEvent | Omit<VaultEvent,"hash">): Promise<string>`, `type ChainResult = {ok:true; events: VaultEvent[]} | {ok:false; line:number; reason:string}`, `verifyChain(text: string): Promise<ChainResult>`, `canonicalLine(e: VaultEvent): string`.

- [ ] **Step 1: Add dependency.** Run `pnpm --filter @capfolder/core add -E canonicalize@5.1.0`.

- [ ] **Step 2: Failing tests** `test/chain.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { canonicalLine, verifyChain } from "../src/chain";
import { readFix } from "./helpers";

const text = readFix("events.jsonl");
const lines = text.trim().split("\n");

describe("verifyChain", () => {
  test("acme chain verifies", async () => {
    const r = await verifyChain(text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.events).toHaveLength(lines.length);
  });

  test("lines are canonical JSON", async () => {
    const r = await verifyChain(text);
    if (!r.ok) throw new Error("chain broken");
    expect(r.events.map(canonicalLine)).toEqual(lines);
  });

  test.each(lines.map((_, i) => i))("tampering with line %i fails at that line", async (i) => {
    const e = JSON.parse(lines[i]!);
    e.ts = e.ts.replace("2026", "2025");
    const tampered = lines.map((l, j) => (j === i ? JSON.stringify(e) : l)).join("\n");
    const r = await verifyChain(`${tampered}\n`);
    expect(r).toEqual({ ok: false, line: i + 1, reason: "hash does not match the line's content" });
  });

  test("a removed line breaks the chain at the next line", async () => {
    const r = await verifyChain(`${lines.filter((_, j) => j !== 4).join("\n")}\n`);
    expect(r).toMatchObject({ ok: false, line: 5, reason: "prev does not match the previous line's hash" });
  });

  test("garbage line is reported", async () => {
    const r = await verifyChain(`${lines[0]}\n{not json\n`);
    expect(r).toEqual({ ok: false, line: 2, reason: "not valid JSON" });
  });

  test("empty log is valid", async () => {
    expect(await verifyChain("")).toEqual({ ok: true, events: [] });
  });
});
```
Run: `pnpm --filter @capfolder/core test chain` → FAIL (module missing).

- [ ] **Step 3: Implement** `src/chain.ts`:
```ts
import canonicalize from "canonicalize";
import type { VaultEvent } from "./types";

export const GENESIS = "0".repeat(64);

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function canonicalLine(e: VaultEvent): string {
  return canonicalize(e)!;
}

export async function hashEvent(e: VaultEvent | Omit<VaultEvent, "hash">): Promise<string> {
  const { hash: _ignored, ...rest } = e as VaultEvent;
  return sha256Hex(canonicalize(rest)!);
}

export type ChainResult = { ok: true; events: VaultEvent[] } | { ok: false; line: number; reason: string };

export async function verifyChain(text: string): Promise<ChainResult> {
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const events: VaultEvent[] = [];
  let prev = GENESIS;
  for (let i = 0; i < lines.length; i++) {
    let e: VaultEvent;
    try {
      e = JSON.parse(lines[i]!);
    } catch {
      return { ok: false, line: i + 1, reason: "not valid JSON" };
    }
    // ponytail: an array prev (merge event, docs/12) is accepted if it contains the previous hash; real fork merge is F-35.
    const prevs = Array.isArray(e.prev) ? e.prev : [e.prev];
    if (!prevs.includes(prev)) return { ok: false, line: i + 1, reason: "prev does not match the previous line's hash" };
    if ((await hashEvent(e)) !== e.hash) return { ok: false, line: i + 1, reason: "hash does not match the line's content" };
    prev = e.hash;
    events.push(e);
  }
  return { ok: true, events };
}
```
If `import canonicalize from "canonicalize"` is not callable (CJS interop), use `import { canonicalize } from "canonicalize"`. Check the package's `exports`/types.

- [ ] **Step 4: Run.** `pnpm --filter @capfolder/core test chain` → PASS. If "acme chain verifies" fails, the fixture's hashing differs from JCS: stop and report. Do not change the fixture yet.

- [ ] **Step 5:** Add `export * from "./chain";` to `index.ts`, then commit: `git add -A && git commit -m "core: hash chain verify with per-line tamper detection"`.

---

### Task 4: Vendored OCF 1.2.0 schemas + validator

**Files:**
- Create: `packages/core/scripts/vendor-ocf.sh`, `packages/core/src/ocf/schemas-1.2.0.json` (generated), `packages/core/src/ocf/OCF-LICENSE.md` (copied), `packages/core/src/ocf/SOURCE.md`, `packages/core/src/ocf/validate.ts`, `packages/core/test/ocf.test.ts`

**Interfaces:**
- Produces: `validateOcf(obj: unknown): string[]`. It returns `[]` when valid, else readable errors, and dispatches on `object_type` (objects) or `file_type` (OCF files).

- [ ] **Step 1: Dependencies.** Run `pnpm --filter @capfolder/core add -E ajv@8.20.0 ajv-formats@3.0.1`.

- [ ] **Step 2: Vendor script** `scripts/vendor-ocf.sh` (chmod +x):
```sh
#!/usr/bin/env sh
# Rebuilds src/ocf/schemas-1.2.0.json from the Open Cap Table Coalition repo at a pinned tag.
set -eu
TAG=v1.2.0
TMP=$(mktemp -d)
curl -sL "https://github.com/Open-Cap-Table-Coalition/Open-Cap-Format-OCF/archive/refs/tags/$TAG.tar.gz" | tar xz -C "$TMP"
ROOT="$TMP/Open-Cap-Format-OCF-${TAG#v}"
OUT="$(cd "$(dirname "$0")/../src/ocf" && pwd)"
find "$ROOT/schema" -name '*.schema.json' | sort | xargs jq -s '.' > "$OUT/schemas-1.2.0.json"
cp "$ROOT/LICENSE.md" "$OUT/OCF-LICENSE.md"
echo "$(jq length "$OUT/schemas-1.2.0.json") schemas written"
```
Run: `mkdir -p packages/core/src/ocf && packages/core/scripts/vendor-ocf.sh` → expect `168 schemas written`.
`src/ocf/SOURCE.md`: source URL, tag `v1.2.0`, commit `9f987b4`, the license name, "regenerate with scripts/vendor-ocf.sh; never hand-edit".

- [ ] **Step 3: Failing tests** `test/ocf.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { validateOcf } from "../src/ocf/validate";

describe("validateOcf", () => {
  test("valid stakeholder passes", () => {
    expect(validateOcf({ object_type: "STAKEHOLDER", id: "sh_1", name: { legal_name: "Ana" }, stakeholder_type: "INDIVIDUAL" })).toEqual([]);
  });
  test("missing required field is reported", () => {
    const errs = validateOcf({ object_type: "STAKEHOLDER", id: "sh_1", stakeholder_type: "INDIVIDUAL" });
    expect(errs.join(" ")).toMatch(/name/);
  });
  test("unknown property is rejected", () => {
    const errs = validateOcf({ object_type: "STAKEHOLDER", id: "sh_1", name: { legal_name: "A" }, stakeholder_type: "INDIVIDUAL", shoe_size: 9 });
    expect(errs.length).toBeGreaterThan(0);
  });
  test("unknown object_type", () => {
    expect(validateOcf({ object_type: "NOPE" })).toEqual(["Unknown OCF object_type or file_type: NOPE"]);
  });
  test("OCF file schemas dispatch on file_type", () => {
    expect(validateOcf({ file_type: "OCF_STAKEHOLDERS_FILE", items: [] })).toEqual([]);
  });
});
```

- [ ] **Step 4: Implement** `src/ocf/validate.ts`:
```ts
import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import schemas from "./schemas-1.2.0.json" with { type: "json" };

type SchemaDoc = { $id: string; properties?: { object_type?: { const?: string }; file_type?: { const?: string } } };

let validators: Map<string, ValidateFunction> | undefined;

function init(): Map<string, ValidateFunction> {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const docs = schemas as SchemaDoc[];
  for (const s of docs) ajv.addSchema(s);
  const map = new Map<string, ValidateFunction>();
  for (const s of docs) {
    if (s.$id.includes("/primitives/")) continue;
    const key = s.properties?.object_type?.const ?? s.properties?.file_type?.const;
    if (key) map.set(key, ajv.getSchema(s.$id)!);
  }
  return map;
}

export function validateOcf(obj: unknown): string[] {
  validators ??= init();
  const o = obj as { object_type?: unknown; file_type?: unknown };
  const key = o?.object_type ?? o?.file_type;
  const v = typeof key === "string" ? validators.get(key) : undefined;
  if (!v) return [`Unknown OCF object_type or file_type: ${String(key)}`];
  if (v(obj)) return [];
  return (v.errors ?? []).map((e) => `${e.instancePath || "(root)"} ${e.message}`);
}
```
If `new Ajv` throws "not a constructor" under vitest, use `import { Ajv } from "ajv"`, and likewise `addFormats.default`. If TS rejects `with { type: "json" }`, drop the attribute (resolveJsonModule covers it).

- [ ] **Step 5: Run.** Expect PASS. Then `pnpm licenses:gen && pnpm licenses:check`.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "core: vendor OCF 1.2.0 schemas, ajv validator"`

---

### Task 5: Make the Acme fixture schema-valid, then rehash

**Files:**
- Create: `packages/core/scripts/rehash-fixture.mjs`
- Modify: `fixtures/acme-vault/events.jsonl`, `fixtures/README.md`
- Modify: `packages/core/test/ocf.test.ts` (add the fixture test)

- [ ] **Step 1: Failing test.** Append to `test/ocf.test.ts`:
```ts
import { acmeEvents } from "./helpers";

test("every OCF payload in the acme fixture is schema-valid", () => {
  const bad = acmeEvents()
    .filter((e) => e.kind === "ocf")
    .map((e) => ({ id: e.id, errors: validateOcf(e.data) }))
    .filter((r) => r.errors.length);
  expect(bad).toEqual([]);
});
```
Run → FAIL. VESTING_TERMS and the 3 SAFEs have placeholder strings. Note any *other* failures (for example, a field 1.2.0 doesn't allow): fix them in Step 3 too, keeping the computed numbers unchanged.

- [ ] **Step 2: Rehash script** `packages/core/scripts/rehash-fixture.mjs`:
```js
// Recomputes prev/hash for every line of a FIXTURE events.jsonl. Never run on a real vault.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import canonicalize from "canonicalize";

const file = process.argv[2];
let prev = "0".repeat(64);
const out = readFileSync(file, "utf8").trim().split("\n").map((l) => {
  const { hash: _h, ...e } = JSON.parse(l);
  e.prev = prev;
  prev = createHash("sha256").update(canonicalize(e)).digest("hex");
  return canonicalize({ ...e, hash: prev });
});
writeFileSync(file, `${out.join("\n")}\n`);
```

- [ ] **Step 3: Patch the payloads** with jq, from the repo root:
```bash
F=fixtures/acme-vault/events.jsonl
jq -c '
def safe($cap; $disc): [{
  trigger_id: (.data.security_id + ".TRIG.1"), type: "AUTOMATIC_ON_CONDITION",
  trigger_condition: "Equity financing, liquidity event or dissolution event, as defined in the SAFE",
  conversion_right: { type: "CONVERTIBLE_CONVERSION_RIGHT", converts_to_future_round: true,
    conversion_mechanism: ({ type: "SAFE_CONVERSION", conversion_mfn: false, conversion_timing: "POST_MONEY",
      conversion_valuation_cap: { amount: $cap, currency: "USD" } } + (if $disc then { conversion_discount: $disc } else {} end)) } }];
if .type == "VESTING_TERMS" then
  .data.vesting_conditions = [
    { id: "vesting-start", quantity: "0", trigger: { type: "VESTING_START_DATE" }, next_condition_ids: ["cliff"] },
    { id: "cliff", description: "25% at 1 year", portion: { numerator: "12", denominator: "48" },
      trigger: { type: "VESTING_SCHEDULE_RELATIVE", relative_to_condition_id: "vesting-start",
        period: { type: "MONTHS", length: 12, occurrences: 1, day_of_month: "VESTING_START_DAY_OR_LAST_DAY_OF_MONTH" } },
      next_condition_ids: ["monthly"] },
    { id: "monthly", description: "1/48 each month thereafter", portion: { numerator: "1", denominator: "48" },
      trigger: { type: "VESTING_SCHEDULE_RELATIVE", relative_to_condition_id: "cliff",
        period: { type: "MONTHS", length: 1, occurrences: 36, day_of_month: "VESTING_START_DAY_OR_LAST_DAY_OF_MONTH" } },
      next_condition_ids: [] } ]
elif .type == "TX_VESTING_START" then .data.vesting_condition_id = "vesting-start"
elif .data.security_id == "SAFE-1" then .data.conversion_triggers = safe("10000000"; null)
elif .data.security_id == "SAFE-2" then .data.conversion_triggers = safe("8000000"; "0.20")
elif .data.security_id == "SAFE-3" then .data.conversion_triggers = safe("10000000"; null)
else . end' "$F" > "$F.tmp" && mv "$F.tmp" "$F"
(cd packages/core && node scripts/rehash-fixture.mjs ../../fixtures/acme-vault/events.jsonl)
```

- [ ] **Step 4: Run all tests.** `pnpm test` → the fixture validity, chain and canonical-line tests all PASS. `git diff --stat fixtures/acme-vault/captable.expected.csv` must be empty.

- [ ] **Step 5:** Add to `fixtures/README.md` under "OCF payloads": "2026-10-09: placeholders replaced with schema-valid OCF 1.2.0 structures (official 4yr/1yr-cliff vesting sample, SAFE_CONVERSION mechanisms); hashes regenerated with `packages/core/scripts/rehash-fixture.mjs`. Expected numbers unchanged." Then commit: `git add -A && git commit -m "fixtures: schema-valid OCF payloads for acme, rehashed"`

---

### Task 6: Exact numbers and calendar dates

**Files:**
- Create: `packages/core/src/num.ts`, `packages/core/src/dates.ts`, `packages/core/test/num.test.ts`, `packages/core/test/dates.test.ts`

**Interfaces:**
- Produces (num.ts):
  - `parseDec(s): {v: bigint; scale: number}`
  - `toInt(s): bigint` (throws on a fractional part)
  - `decFraction(a, b): [bigint, bigint]` (a/b as integers)
  - `subDec(a, b): string`
  - `fmtInt(n): string`
  - `ratioFixed(num, den, decimals): string` (half-up)
  - `largestRemainder(values: bigint[], decimals): string[]` (percent strings summing to exactly 100)
- Produces (dates.ts):
  - `MAX_DATE = "9999-12-31"`
  - `datePart(ts): string`
  - `addMonths(start, months, dayRule): string`

- [ ] **Step 1: Failing tests** `test/num.test.ts`:
```ts
import { expect, test } from "vitest";
import { decFraction, fmtInt, largestRemainder, parseDec, ratioFixed, subDec, toInt } from "../src/num";

test("parseDec / toInt", () => {
  expect(parseDec("0.20")).toEqual({ v: 20n, scale: 2 });
  expect(toInt("4000000")).toBe(4000000n);
  expect(toInt("40000.00")).toBe(40000n);
  expect(() => toInt("1.5")).toThrow('Expected a whole number, got "1.5"');
  expect(() => parseDec("abc")).toThrow('Not a number: "abc"');
});
test("decFraction aligns scales", () => {
  expect(decFraction("150000", "8000000")).toEqual([150000n, 8000000n]);
  expect(decFraction("0.5", "2")).toEqual([5n, 20n]);
});
test("subDec", () => {
  expect(subDec("250000", "100000")).toBe("150000");
  expect(subDec("250000.50", "0.5")).toBe("250000.00");
});
test("fmtInt", () => expect(fmtInt(4000000n)).toBe("4,000,000"));
test("ratioFixed rounds half up", () => {
  expect(ratioFixed(150000n * 100n, 8000000n, 2)).toBe("1.88"); // 1.875
  expect(ratioFixed(500000n * 100n, 10000000n, 2)).toBe("5.00");
  expect(ratioFixed(1n, 3n, 2)).toBe("0.33");
});
test("largestRemainder sums to 100.00", () => {
  expect(largestRemainder([4000000n, 3000000n, 40000n, 40000n, 920000n], 2)).toEqual(["50.00", "37.50", "0.50", "0.50", "11.50"]);
  const thirds = largestRemainder([1n, 1n, 1n], 2);
  expect(thirds).toEqual(["33.34", "33.33", "33.33"]);
  expect(largestRemainder([0n, 0n], 2)).toEqual(["0.00", "0.00"]);
});
```
`test/dates.test.ts`:
```ts
import { expect, test } from "vitest";
import { addMonths, datePart } from "../src/dates";

const START_DAY = "VESTING_START_DAY_OR_LAST_DAY_OF_MONTH";
test("same day of month", () => expect(addMonths("2025-10-07", 12, START_DAY)).toBe("2026-10-07"));
test("31st falls back to last day", () => {
  expect(addMonths("2024-01-31", 1, START_DAY)).toBe("2024-02-29");
  expect(addMonths("2023-01-31", 1, START_DAY)).toBe("2023-02-28");
  expect(addMonths("2024-01-31", 2, START_DAY)).toBe("2024-03-31"); // anchored to start, no drift
});
test("fixed day rules", () => {
  expect(addMonths("2024-01-31", 1, "15")).toBe("2024-02-15");
  expect(addMonths("2024-01-10", 1, "30_OR_LAST_DAY_OF_MONTH")).toBe("2024-02-29");
});
test("year rollover", () => expect(addMonths("2025-11-30", 3, START_DAY)).toBe("2026-02-28"));
test("datePart", () => expect(datePart("2026-10-07T09:00:00Z")).toBe("2026-10-07"));
```
Run → FAIL.

- [ ] **Step 2: Implement** `src/num.ts`:
```ts
const DEC = /^([+-]?)(\d+)(?:\.(\d{1,10}))?$/;

export function parseDec(s: string): { v: bigint; scale: number } {
  const m = DEC.exec(String(s));
  if (!m) throw new Error(`Not a number: "${s}"`);
  const frac = m[3] ?? "";
  return { v: BigInt(m[2]! + frac) * (m[1] === "-" ? -1n : 1n), scale: frac.length };
}

export function toInt(s: string): bigint {
  const { v, scale } = parseDec(s);
  const d = 10n ** BigInt(scale);
  if (v % d !== 0n) throw new Error(`Expected a whole number, got "${s}"`);
  return v / d;
}

/** a ÷ b as an integer fraction [num, den]. */
export function decFraction(a: string, b: string): [bigint, bigint] {
  const x = parseDec(a);
  const y = parseDec(b);
  return [x.v * 10n ** BigInt(y.scale), y.v * 10n ** BigInt(x.scale)];
}

function fixed(units: bigint, decimals: number): string {
  const d = 10n ** BigInt(decimals);
  const neg = units < 0n;
  const u = neg ? -units : units;
  const s = `${neg ? "-" : ""}${u / d}`;
  return decimals ? `${s}.${(u % d).toString().padStart(decimals, "0")}` : s;
}

export function subDec(a: string, b: string): string {
  const x = parseDec(a);
  const y = parseDec(b);
  const scale = Math.max(x.scale, y.scale);
  return fixed(x.v * 10n ** BigInt(scale - x.scale) - y.v * 10n ** BigInt(scale - y.scale), scale);
}

export const fmtInt = (n: bigint): string => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** num ÷ den to `decimals` places, rounded half up. Non-negative inputs. */
export function ratioFixed(num: bigint, den: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  return fixed((num * scale * 2n + den) / (2n * den), decimals);
}

/** Each value as a percent of the sum, to `decimals` places, summing to exactly 100. Ties go to earlier rows. */
export function largestRemainder(values: bigint[], decimals: number): string[] {
  const total = values.reduce((a, b) => a + b, 0n);
  if (total === 0n) return values.map(() => fixed(0n, decimals));
  const units = 100n * 10n ** BigInt(decimals);
  const floors = values.map((v) => (v * units) / total);
  let left = units - floors.reduce((a, b) => a + b, 0n);
  const order = values.map((v, i) => ({ i, r: (v * units) % total }));
  order.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (const { i } of order) {
    if (left <= 0n) break;
    floors[i]! += 1n;
    left -= 1n;
  }
  return floors.map((f) => fixed(f, decimals));
}
```
`src/dates.ts`:
```ts
// Calendar dates as "YYYY-MM-DD" strings. ISO strings compare correctly with < and >.
export const MAX_DATE = "9999-12-31";
export const datePart = (ts: string): string => ts.slice(0, 10);

const pad = (n: number) => String(n).padStart(2, "0");
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** start + months, using an OCF VestingDayOfMonth rule, anchored to start (never chained). */
export function addMonths(start: string, months: number, dayRule: string): string {
  const [y, m, d] = start.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const want = dayRule === "VESTING_START_DAY_OR_LAST_DAY_OF_MONTH" ? d : Number.parseInt(dayRule, 10);
  return `${ny}-${pad(nm)}-${pad(Math.min(want, daysIn(ny, nm)))}`;
}
```
- [ ] **Step 3: Run** → PASS. **Step 4: Commit** `git add -A && git commit -m "core: bigint decimal math, largest-remainder, calendar month math"`

---

### Task 7: Vesting (option A: evaluate OCF vesting conditions)

**Files:**
- Create: `packages/core/src/vesting.ts`, `packages/core/test/vesting.test.ts`

**Interfaces:**
- Consumes: `toInt`, `decFraction`, `fmtInt` (num.ts), `addMonths` (dates.ts), `Data`.
- Produces:
  - `interface VestingResult { vested: bigint | null; math: string; unknownReason?: string }`
  - `vestedAt(total: bigint, terms: Data, start: string, at: string): VestingResult`
  - `startConditionId(terms: Data): string | undefined`

- [ ] **Step 1: Failing tests** `test/vesting.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { vestedAt } from "../src/vesting";
import { acmeEvents } from "./helpers";

const terms = acmeEvents().find((e) => e.type === "VESTING_TERMS")!.data;

describe("4y / 1y cliff / monthly", () => {
  test("Mads: 36 of 48 months", () => {
    expect(vestedAt(4000000n, terms, "2023-10-07", "2026-10-07")).toEqual({
      vested: 3000000n, math: "3,000,000 = floor(4,000,000 × 36/48), as of 2026-10-07",
    });
  });
  test("Lisa: cliff day is inclusive", () => expect(vestedAt(40000n, terms, "2025-10-07", "2026-10-07").vested).toBe(10000n));
  test("day before cliff is 0", () => expect(vestedAt(40000n, terms, "2025-10-07", "2026-10-06").vested).toBe(0n));
  test("João before cliff", () => expect(vestedAt(40000n, terms, "2026-03-02", "2026-10-07").vested).toBe(0n));
  test("cumulative floor: month 13 then 14", () => {
    expect(vestedAt(40000n, terms, "2025-10-07", "2026-11-07").vested).toBe(10833n);
    expect(vestedAt(40000n, terms, "2025-10-07", "2026-12-07").vested).toBe(11666n);
  });
  test("fully vested at 48 months, never more", () => {
    expect(vestedAt(40000n, terms, "2025-10-07", "2029-10-07").vested).toBe(40000n);
    expect(vestedAt(40000n, terms, "2025-10-07", "2040-01-01").vested).toBe(40000n);
  });
  test("start on the 31st vests on the last day of short months", () => {
    expect(vestedAt(48n, terms, "2024-01-31", "2025-01-30").vested).toBe(0n);
    expect(vestedAt(48n, terms, "2024-01-31", "2025-01-31").vested).toBe(12n);
    expect(vestedAt(48n, terms, "2024-01-31", "2025-02-28").vested).toBe(13n);
  });
  test("before the start date", () => expect(vestedAt(40000n, terms, "2025-10-07", "2025-01-01").vested).toBe(0n));
});

describe("unsupported shapes are 'unknown', never guessed", () => {
  test("event trigger", () => {
    const t = { allocation_type: "CUMULATIVE_ROUND_DOWN", vesting_conditions: [
      { id: "s", trigger: { type: "VESTING_START_DATE" }, quantity: "0", next_condition_ids: ["e"] },
      { id: "e", trigger: { type: "VESTING_EVENT" }, portion: { numerator: "1", denominator: "1" }, next_condition_ids: [] }] };
    const r = vestedAt(100n, t, "2025-01-01", "2026-01-01");
    expect(r.vested).toBeNull();
    expect(r.unknownReason).toMatch(/only month-based relative schedules/);
  });
  test("front-loaded allocation", () => {
    expect(vestedAt(100n, { ...terms, allocation_type: "FRONT_LOADED" }, "2025-01-01", "2026-01-01").vested).toBeNull();
  });
  test("CUMULATIVE_ROUNDING rounds instead of floors", () => {
    expect(vestedAt(40000n, { ...terms, allocation_type: "CUMULATIVE_ROUNDING" }, "2025-10-07", "2026-11-07").vested).toBe(10833n);
    expect(vestedAt(100n, { ...terms, allocation_type: "CUMULATIVE_ROUNDING" }, "2025-10-07", "2026-11-07").vested).toBe(27n); // 27.08
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement** `src/vesting.ts`:
```ts
import { addMonths } from "./dates";
import { decFraction, fmtInt, toInt } from "./num";
import type { Data } from "./types";

export interface VestingResult {
  vested: bigint | null;
  math: string;
  unknownReason?: string;
}

interface Step {
  offsetMonths: number;
  dayRule: string;
  portion?: [bigint, bigint];
  quantity?: bigint;
}

const SUPPORTED_ALLOCATION = new Set(["CUMULATIVE_ROUND_DOWN", "CUMULATIVE_ROUNDING"]);
const START_DAY = "VESTING_START_DAY_OR_LAST_DAY_OF_MONTH";

export const startConditionId = (terms: Data): string | undefined =>
  (terms.vesting_conditions ?? []).find((c: Data) => c.trigger?.type === "VESTING_START_DATE")?.id;

function step(c: Data, offsetMonths: number, dayRule: string): Step {
  return c.portion
    ? { offsetMonths, dayRule, portion: decFraction(c.portion.numerator, c.portion.denominator) }
    : { offsetMonths, dayRule, quantity: toInt(c.quantity ?? "0") };
}

/** The supported subset: one start condition, then a linear chain of month-based relative schedules. */
function scheduleSteps(terms: Data): Step[] | string {
  if (!SUPPORTED_ALLOCATION.has(terms.allocation_type)) return `allocation ${terms.allocation_type} is not supported`;
  const conds: Data[] = terms.vesting_conditions ?? [];
  const byId = new Map(conds.map((c) => [c.id, c]));
  const starts = conds.filter((c) => c.trigger?.type === "VESTING_START_DATE");
  if (starts.length !== 1) return "needs exactly one VESTING_START_DATE condition";
  let c = starts[0]!;
  const steps = [step(c, 0, START_DAY)];
  const seen = new Set<string>([c.id]);
  let offset = 0;
  for (;;) {
    const next: string[] = c.next_condition_ids ?? [];
    if (next.length === 0) return steps;
    if (next.length > 1) return "branching vesting conditions are not supported";
    const n = byId.get(next[0]!);
    if (!n || seen.has(n.id)) return "broken vesting condition chain";
    const t = n.trigger;
    if (t?.type !== "VESTING_SCHEDULE_RELATIVE" || t.period?.type !== "MONTHS" || t.relative_to_condition_id !== c.id)
      return `condition ${n.id}: only month-based relative schedules are supported`;
    if (n.portion?.remainder) return "remainder portions are not supported";
    for (let j = 1; j <= t.period.occurrences; j++) steps.push(step(n, offset + t.period.length * j, t.period.day_of_month));
    offset += t.period.length * t.period.occurrences;
    seen.add(n.id);
    c = n;
  }
}

export function vestedAt(total: bigint, terms: Data, start: string, at: string): VestingResult {
  const steps = scheduleSteps(terms);
  if (typeof steps === "string") return { vested: null, math: `vesting unknown: ${steps}`, unknownReason: steps };
  let num = 0n;
  let den = 1n;
  let qty = 0n;
  for (const s of steps) {
    if (addMonths(start, s.offsetMonths, s.dayRule) > at) continue;
    if (s.portion) {
      const [n, d] = s.portion;
      if (num === 0n) [num, den] = [n, d];
      else if (d === den) num += n;
      else [num, den] = [num * d + n * den, den * d];
    } else qty += s.quantity!;
  }
  const round = terms.allocation_type === "CUMULATIVE_ROUNDING";
  let vested = (round ? 2n * total * num + den : total * num) / (round ? 2n * den : den) + qty;
  if (vested > total) vested = total;
  const how = `${round ? "round" : "floor"}(${fmtInt(total)} × ${num}/${den})${qty ? ` + ${fmtInt(qty)}` : ""}`;
  return { vested, math: `${fmtInt(vested)} = ${how}, as of ${at}` };
}
```
- [ ] **Step 3: Run** → PASS. If the "36/48" math string comes out as "0/1 …", check the first-portion branch: the start step has quantity 0, and its portion is undefined.
- [ ] **Step 4: Commit** `git add -A && git commit -m "core: evaluate OCF vesting conditions (start + monthly relative chain)"`

---

### Task 8: Reducer + cap table rows

**Files:**
- Modify: `packages/core/src/types.ts` (add `Security`, `Plan`, `Doc`, `State`, `Row`)
- Create: `packages/core/src/reduce.ts`, `packages/core/src/rows.ts`, `packages/core/test/reduce.test.ts`

**Interfaces:**
- Consumes: Tasks 6–7.
- Produces:
  - `liveEvents(events: VaultEvent[]): VaultEvent[]` (reversals dropped, corrections applied)
  - `reduce(events: VaultEvent[], asOf: string): State`
  - `securityVested(sec: Security, state: State, at: string): VestingResult & { unvested: bigint | null }`
  - `capTableRows(state: State): Row[]` (vesting as of `state.asOf`)

- [ ] **Step 1: Types.** Append to `src/types.ts`:
```ts
export interface Security {
  id: string;            // OCF security_id
  txId: string;          // OCF issuance transaction id
  kind: "stock" | "equity" | "convertible";
  stakeholderId: string;
  date: string;
  classId?: string;
  planId?: string;
  compensationType?: string;
  convertibleType?: string;
  originalQuantity: bigint;
  quantity: bigint;      // outstanding now (0 when fully consumed)
  exercised: bigint;
  amount?: string;       // convertibles: outstanding investment amount
  cap?: string;
  discount?: string;
  timing?: string;
  vestingTermsId?: string;
  vestingStart?: { date: string; conditionId: string };
  vestings?: { date: string; amount: string }[];
  stoppedAt?: string;    // vesting stops at a cancellation/repurchase date
  earlyExercisable: boolean;
  note?: string;         // e.g. "imported snapshot"
}

export interface Plan {
  data: Data;
  reserved: bigint;
  returned: bigint;
}

export interface Doc {
  data: Data;
  links: Set<string>;
  removed: boolean;
}

export interface State {
  asOf: string;
  issuer?: Data;
  stakeholders: Map<string, Data>;
  classes: Map<string, { data: Data; authorized: bigint }>;
  plans: Map<string, Plan>;
  vestingTerms: Map<string, Data>;
  securities: Map<string, Security>;
  docs: Map<string, Doc>;
  unknownEventTypes: string[];
  violations: string[];  // problems found while replaying (invariants 4, 5, bad references, bad numbers)
}

export interface Row {
  group: 0 | 1 | 2 | 3;  // 0 stock, 1 equity comp, 2 pool, 3 convertibles
  date: string;
  securityId: string;    // plan id for pool rows
  stakeholder: string;
  type: string;
  class: string;
  shares: bigint | null;
  vested: bigint | null;
  unvested: bigint | null;
  fdPercent: string;
  safeAmount: string;
  safeCap: string;
  safeDiscount: string;
  asConverted: string;
  docStatus: "signed" | "missing" | "";
  math: Record<string, string>;
}
```

- [ ] **Step 2: Failing tests** `test/reduce.test.ts` (Acme only. Edge cases are in Task 10):
```ts
import { expect, test } from "vitest";
import { reduce } from "../src/reduce";
import { capTableRows } from "../src/rows";
import { acmeEvents } from "./helpers";

const state = reduce(acmeEvents(), "2026-10-07");
const rows = capTableRows(state);

test("no violations or unknown types in acme", () => {
  expect(state.violations).toEqual([]);
  expect(state.unknownEventTypes).toEqual([]);
});
test("row order and core numbers", () => {
  expect(rows.map((r) => [r.stakeholder, r.type, r.shares, r.fdPercent, r.vested, r.unvested])).toEqual([
    ["Tim Apple", "common", 4000000n, "50.00", 3000000n, 1000000n],
    ["Ana Ribeiro", "common", 3000000n, "37.50", 2250000n, 750000n],
    ["Lisa Moreau", "option", 40000n, "0.50", 10000n, 30000n],
    ["João Silva", "option", 40000n, "0.50", 0n, 40000n],
    ["Option pool (available)", "pool", 920000n, "11.50", null, null],
    ["Y Combinator", "safe", null, "", null, null],
    ["Angel A", "safe", null, "", null, null],
    ["Fund X", "safe", null, "", null, null],
  ]);
});
test("SAFE columns", () => {
  expect(rows.slice(5).map((r) => [r.safeAmount, r.safeCap, r.safeDiscount, r.asConverted, r.docStatus])).toEqual([
    ["500000", "10000000", "", "5.00", "signed"],
    ["150000", "8000000", "0.20", "1.88", "signed"],
    ["250000", "10000000", "", "2.50", "missing"],
  ]);
});
test("every number shows its math", () => {
  expect(rows[0]!.math.vested).toBe("3,000,000 = floor(4,000,000 × 36/48), as of 2026-10-07");
  expect(rows[4]!.math.shares).toBe("920,000 = 1,000,000 reserved − 80,000 granted + 0 returned");
  expect(rows[0]!.math.fd_percent).toBe("4,000,000 ÷ 8,000,000 fully diluted (largest-remainder rounding)");
  expect(rows[6]!.math.as_converted).toBe("150,000 ÷ 8,000,000 post-money cap");
});
```
Run → FAIL.

- [ ] **Step 3: Implement** `src/reduce.ts`:
```ts
import { datePart } from "./dates";
import { fmtInt, parseDec, subDec, toInt } from "./num";
import type { Data, Security, State, VaultEvent } from "./types";
import { securityVested } from "./rows";

const APP_IGNORED = new Set([
  "vault_created", "stakeholder_alias", "note", "rebaseline", "schema_migrated",
  "envelope_sent", "envelope_signed", "envelope_voided", "doc_replaced",
]);

function setPath(obj: Data, path: string, value: unknown): void {
  const keys = path.split(".");
  let o: any = obj;
  for (const k of keys.slice(0, -1)) o = o[k];
  o[keys.at(-1)!] = value;
}

/** Drop reversed events and reversals, apply corrections (in file order) to copies of their targets. */
export function liveEvents(events: VaultEvent[]): VaultEvent[] {
  const reversed = new Set(events.filter((e) => e.type === "reversal").map((e) => e.data.target));
  const kept = events.filter((e) => e.type !== "reversal" && !reversed.has(e.id));
  const byId = new Map(kept.map((e) => [e.id, { ...e, data: structuredClone(e.data) }]));
  for (const e of kept) {
    if (e.type !== "correction") continue;
    const target = byId.get(e.data.target);
    if (target) setPath(target.data, e.data.field, e.data.new);
  }
  return [...byId.values()].filter((e) => e.type !== "correction");
}

const isTx = (e: VaultEvent) => e.kind === "ocf" && e.type.startsWith("TX_");
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function reduce(events: VaultEvent[], asOf: string): State {
  const s: State = {
    asOf, stakeholders: new Map(), classes: new Map(), plans: new Map(), vestingTerms: new Map(),
    securities: new Map(), docs: new Map(), unknownEventTypes: [], violations: [],
  };
  const live = liveEvents(events);
  const unknown = (t: string) => s.unknownEventTypes.includes(t) || s.unknownEventTypes.push(t);
  const qty = (e: VaultEvent, field: string): bigint | undefined => {
    try {
      const q = toInt(e.data[field]);
      if (q <= 0n) throw new Error(`${field} must be greater than 0`);
      return q;
    } catch (err) {
      s.violations.push(`${e.type} ${e.data.id}: ${(err as Error).message}`);
      return undefined;
    }
  };

  // 1. Definitions (no date): always present, except plans approved after asOf.
  for (const e of live) {
    if (e.kind !== "ocf" || isTx(e)) continue;
    const d = e.data;
    switch (e.type) {
      case "ISSUER": s.issuer = d; break;
      case "STAKEHOLDER": s.stakeholders.set(d.id, d); break;
      case "STOCK_CLASS": s.classes.set(d.id, { data: d, authorized: toInt(d.initial_shares_authorized) }); break;
      case "STOCK_PLAN":
        if (!d.board_approval_date || d.board_approval_date <= asOf)
          s.plans.set(d.id, { data: d, reserved: toInt(d.initial_shares_reserved), returned: 0n });
        break;
      case "VESTING_TERMS": s.vestingTerms.set(d.id, d); break;
      case "VALUATION": case "STOCK_LEGEND_TEMPLATE": case "DOCUMENT": break;
      default: unknown(e.type);
    }
  }

  // 2. Transactions up to asOf, in deterministic order (never by seq).
  const txs = live.filter((e) => isTx(e) && e.data.date <= asOf)
    .sort((a, b) => cmp(a.data.date, b.data.date) || cmp(a.ts, b.ts) || cmp(a.id, b.id));
  const sec = (e: VaultEvent): Security | undefined => {
    const x = s.securities.get(e.data.security_id);
    if (!x) s.violations.push(`${e.type} ${e.data.id} refers to unknown security ${e.data.security_id}`);
    return x;
  };
  const consume = (e: VaultEvent, x: Security, q: bigint, stopsVesting: boolean) => {
    if (q > x.quantity) {
      s.violations.push(`${e.type} ${e.data.id}: ${fmtInt(q)} is more than the ${fmtInt(x.quantity)} outstanding on ${x.id}`);
      return;
    }
    // Strict OCF: with balance_security_id the remainder is re-issued as a new security, so the source closes.
    x.quantity = e.data.balance_security_id ? 0n : x.quantity - q;
    if (stopsVesting) x.stoppedAt = e.data.date;
  };

  for (const e of txs) {
    const d = e.data;
    switch (e.type) {
      case "TX_STOCK_ISSUANCE":
      case "TX_EQUITY_COMPENSATION_ISSUANCE": {
        const q = qty(e, "quantity");
        if (q === undefined) break;
        const stock = e.type === "TX_STOCK_ISSUANCE";
        s.securities.set(d.security_id, {
          id: d.security_id, txId: d.id, kind: stock ? "stock" : "equity", stakeholderId: d.stakeholder_id, date: d.date,
          classId: d.stock_class_id, planId: d.stock_plan_id, compensationType: d.compensation_type,
          originalQuantity: q, quantity: q, exercised: 0n, vestingTermsId: d.vesting_terms_id, vestings: d.vestings,
          earlyExercisable: d.early_exercisable === true, note: e.meta?.note,
        });
        break;
      }
      case "TX_CONVERTIBLE_ISSUANCE": {
        const mech = (d.conversion_triggers ?? [])
          .map((t: Data) => t.conversion_right?.conversion_mechanism)
          .find((m: Data | undefined) => m?.type === "SAFE_CONVERSION");
        s.securities.set(d.security_id, {
          id: d.security_id, txId: d.id, kind: "convertible", stakeholderId: d.stakeholder_id, date: d.date,
          convertibleType: d.convertible_type, originalQuantity: 0n, quantity: 0n, exercised: 0n,
          amount: d.investment_amount.amount, cap: mech?.conversion_valuation_cap?.amount,
          discount: mech?.conversion_discount, timing: mech?.conversion_timing, earlyExercisable: false, note: e.meta?.note,
        });
        break;
      }
      case "TX_VESTING_START": {
        const x = sec(e);
        if (x) x.vestingStart = { date: d.date, conditionId: d.vesting_condition_id };
        break;
      }
      case "TX_STOCK_CANCELLATION":
      case "TX_EQUITY_COMPENSATION_CANCELLATION":
      case "TX_STOCK_REPURCHASE": {
        const x = sec(e);
        const q = d.quantity === undefined && x ? x.quantity : qty(e, "quantity");
        if (x && q !== undefined) consume(e, x, q, true);
        break;
      }
      case "TX_EQUITY_COMPENSATION_EXERCISE": {
        const x = sec(e);
        const q = qty(e, "quantity");
        if (!x || q === undefined) break;
        const v = securityVested(x, s, d.date);
        if (!x.earlyExercisable && v.vested !== null && q > v.vested)
          s.violations.push(`Exercise ${d.id}: ${fmtInt(q)} is more than the ${fmtInt(v.vested)} vested on ${d.date}`);
        else {
          consume(e, x, q, false);
          x.exercised += q;
        }
        break;
      }
      case "TX_CONVERTIBLE_TRANSFER": {
        const x = sec(e);
        if (!x) break;
        const left = subDec(x.amount!, d.amount.amount);
        if (parseDec(left).v < 0n) s.violations.push(`Transfer ${d.id}: ${d.amount.amount} is more than the ${x.amount} outstanding on ${x.id}`);
        else x.amount = d.balance_security_id ? "0" : left;
        break;
      }
      case "TX_STOCK_PLAN_POOL_ADJUSTMENT": {
        const p = s.plans.get(d.stock_plan_id);
        const q = qty(e, "shares_reserved");
        if (p && q !== undefined) p.reserved = q; // OCF: the new total, not a delta
        break;
      }
      case "TX_STOCK_PLAN_RETURN_TO_POOL": {
        const p = s.plans.get(d.stock_plan_id);
        const q = qty(e, "quantity");
        if (p && q !== undefined) p.returned += q;
        break;
      }
      case "TX_STOCK_CLASS_AUTHORIZED_SHARES_ADJUSTMENT": {
        const c = s.classes.get(d.stock_class_id);
        const q = qty(e, "new_shares_authorized");
        if (c && q !== undefined) c.authorized = q;
        break;
      }
      default: unknown(e.type);
    }
  }

  // 3. App events up to asOf.
  const apps = live.filter((e) => e.kind === "app" && datePart(e.ts) <= asOf)
    .sort((a, b) => cmp(a.ts, b.ts) || cmp(a.id, b.id));
  for (const e of apps) {
    const d = e.data;
    const doc = s.docs.get(d.doc_id);
    switch (e.type) {
      case "doc_added": s.docs.set(d.doc_id, { data: d, links: new Set(), removed: false }); break;
      case "doc_linked": doc?.links.add(d.target); break;
      case "doc_unlinked": doc?.links.delete(d.target); break;
      case "doc_removed": if (doc) doc.removed = true; break;
      default: if (!APP_IGNORED.has(e.type)) unknown(e.type);
    }
  }
  return s;
}
```
Before writing this, check the transaction names used here against `object_type` consts in the vendored schemas: `jq -r '.[].properties.object_type.const // empty' src/ocf/schemas-1.2.0.json | sort`. Fix any name that differs. TX_STOCK_CLASS_AUTHORIZED_SHARES_ADJUSTMENT in particular is unverified.

`src/rows.ts`:
```ts
import { decFraction, fmtInt, largestRemainder, parseDec, ratioFixed } from "./num";
import type { Row, Security, State } from "./types";
import { startConditionId, vestedAt, type VestingResult } from "./vesting";

/** Vested of what is still outstanding, as of `at`. Vesting is measured on the original grant and stops at stoppedAt. */
export function securityVested(x: Security, s: State, at: string): VestingResult & { unvested: bigint | null } {
  const t = x.stoppedAt && x.stoppedAt < at ? x.stoppedAt : at;
  let r: VestingResult;
  if (x.vestings?.length) {
    const sum = x.vestings.filter((v) => v.date <= t).reduce((a, v) => a + BigInt(v.amount), 0n);
    r = { vested: sum, math: `${fmtInt(sum)} = sum of explicit vesting dates up to ${t}` };
  } else if (x.vestingTermsId) {
    const terms = s.vestingTerms.get(x.vestingTermsId);
    if (!terms) r = { vested: null, math: "vesting unknown: vesting terms not found", unknownReason: "terms not found" };
    else if (!x.vestingStart) r = { vested: 0n, math: "0: vesting has not started (no vesting start recorded)" };
    else if (x.vestingStart.conditionId !== startConditionId(terms))
      r = { vested: null, math: "vesting unknown: starts at a non-start condition", unknownReason: "non-start condition" };
    else r = vestedAt(x.originalQuantity, terms, x.vestingStart.date, t);
  } else r = { vested: x.originalQuantity, math: `${fmtInt(x.originalQuantity)}: no vesting schedule, fully vested` };
  if (r.vested === null) return { ...r, unvested: null };
  let v = r.vested - x.exercised;
  if (v < 0n) v = 0n;
  if (v > x.quantity) v = x.quantity;
  return { ...r, vested: v, unvested: x.quantity - v };
}

const name = (s: State, id: string) => s.stakeholders.get(id)?.name?.legal_name ?? id;
const className = (s: State, id?: string) => (id ? (s.classes.get(id)?.data.name ?? id) : "");
const docStatus = (s: State, x: Security): "signed" | "missing" =>
  [...s.docs.values()].some((d) => !d.removed && (d.links.has(x.id) || d.links.has(x.txId))) ? "signed" : "missing";

export function capTableRows(s: State): Row[] {
  const rows: Row[] = [];
  const blank = { fdPercent: "", safeAmount: "", safeCap: "", safeDiscount: "", asConverted: "" };
  for (const x of s.securities.values()) {
    if (x.kind === "convertible") {
      if (!x.amount || parseDec(x.amount).v === 0n) continue;
      const post = x.timing === "POST_MONEY" && x.cap;
      const [n, d] = post ? decFraction(x.amount, x.cap!) : [0n, 1n];
      rows.push({ ...blank, group: 3, date: x.date, securityId: x.id, stakeholder: name(s, x.stakeholderId),
        type: (x.convertibleType ?? "convertible").toLowerCase(), class: "", shares: null, vested: null, unvested: null,
        safeAmount: x.amount, safeCap: x.cap ?? "", safeDiscount: x.discount ?? "",
        asConverted: post ? ratioFixed(n * 100n, d, 2) : "", docStatus: docStatus(s, x),
        math: { as_converted: post ? `${fmtInt(BigInt(x.amount.split(".")[0]!))} ÷ ${fmtInt(BigInt(x.cap!.split(".")[0]!))} post-money cap` : "converts at next round" } });
      continue;
    }
    if (x.quantity === 0n) continue;
    const v = securityVested(x, s, s.asOf);
    const isOption = x.kind === "equity";
    const classId = x.classId ?? (x.planId ? s.plans.get(x.planId)?.data.stock_class_ids?.[0] : undefined);
    const type = isOption
      ? (x.compensationType?.startsWith("OPTION") ? "option" : (x.compensationType ?? "equity").toLowerCase())
      : (s.classes.get(x.classId!)?.data.class_type ?? "common").toLowerCase();
    rows.push({ ...blank, group: isOption ? 1 : 0, date: x.date, securityId: x.id, stakeholder: name(s, x.stakeholderId),
      type, class: className(s, classId), shares: x.quantity, vested: v.vested, unvested: v.unvested,
      docStatus: docStatus(s, x), math: { vested: v.math } });
  }
  for (const [id, p] of s.plans) {
    const granted = [...s.securities.values()].filter((x) => x.planId === id).reduce((a, x) => a + x.originalQuantity, 0n);
    const available = p.reserved - granted + p.returned;
    rows.push({ ...blank, group: 2, date: p.data.board_approval_date ?? "", securityId: id,
      stakeholder: s.plans.size === 1 ? "Option pool (available)" : `Option pool: ${p.data.plan_name} (available)`,
      type: "pool", class: className(s, p.data.stock_class_ids?.[0]), shares: available, vested: null, unvested: null,
      docStatus: "", math: { shares: `${fmtInt(available)} = ${fmtInt(p.reserved)} reserved − ${fmtInt(granted)} granted + ${fmtInt(p.returned)} returned` } });
  }
  rows.sort((a, b) => a.group - b.group || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || (a.securityId < b.securityId ? -1 : 1));
  const fdRows = rows.filter((r) => r.group <= 2);
  const fd = fdRows.reduce((a, r) => a + r.shares!, 0n);
  largestRemainder(fdRows.map((r) => r.shares!), 2).forEach((pct, i) => {
    const r = fdRows[i]!;
    r.fdPercent = pct;
    r.math.fd_percent = `${fmtInt(r.shares!)} ÷ ${fmtInt(fd)} fully diluted (largest-remainder rounding)`;
  });
  return rows;
}
```
The pool row can come out negative here. That is caught by invariant 2 in Task 11. `rows.ts` does not import `reduce.ts`, so there is no import cycle.

- [ ] **Step 4: Run** `pnpm --filter @capfolder/core test reduce` → PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "core: reducer and cap table rows with show-the-math"`

---

### Task 9: captable.csv writer (golden test passes)

**Files:**
- Create: `packages/core/src/captable-csv.ts`, `packages/core/test/captable-csv.test.ts`
- Modify: `packages/core/src/index.ts` (replace the stub), `packages/core/test/golden.test.ts` (`test.fails` → `test`)

**Interfaces:**
- Produces: `toCaptableCsv(rows: Row[]): string`, `captableCsv(events: VaultEvent[], asOf: string): string`

- [ ] **Step 1: Flip the golden test.** Change `test.fails(` to `test(` in `golden.test.ts` and delete the M0 comment. Then add `test/captable-csv.test.ts`:
```ts
import { expect, test } from "vitest";
import { toCaptableCsv } from "../src/captable-csv";
import type { Row } from "../src/types";

const row = (over: Partial<Row>): Row => ({
  group: 0, date: "2021-01-01", securityId: "CS-9", stakeholder: "X", type: "common", class: "Common",
  shares: 1n, vested: 1n, unvested: 0n, fdPercent: "100.00", safeAmount: "", safeCap: "", safeDiscount: "",
  asConverted: "", docStatus: "missing", math: {}, ...over,
});

test("quotes commas and quotes (RFC 4180)", () => {
  expect(toCaptableCsv([row({ stakeholder: 'Fund "X", L.P.' })]).split("\n")[1]).toBe(
    '"Fund ""X"", L.P.",common,Common,1,100.00,1,0,,,,,missing');
});
test("neutralises spreadsheet formulas in text cells", () => {
  expect(toCaptableCsv([row({ stakeholder: "=HYPERLINK(\"x\")" })]).split("\n")[1]!.startsWith("\"'=HYPERLINK")).toBe(true);
  expect(toCaptableCsv([row({ stakeholder: "@evil" })]).split("\n")[1]!.startsWith("'@evil")).toBe(true);
});
test("LF line endings with trailing newline", () => {
  const out = toCaptableCsv([row({})]);
  expect(out.endsWith("\n")).toBe(true);
  expect(out.includes("\r")).toBe(false);
});
```
Run → golden + csv tests FAIL.

- [ ] **Step 2: Implement** `src/captable-csv.ts`:
```ts
import { reduce } from "./reduce";
import { capTableRows } from "./rows";
import type { Row, VaultEvent } from "./types";

const HEADER =
  "stakeholder,type,class,shares,fd_percent,vested,unvested,safe_amount,safe_cap,safe_discount,as_converted_percent,doc_status";

const text = (v: string) => (/^[=+\-@]/.test(v) ? `'${v}` : v); // stop spreadsheet formula execution
const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
const n = (v: bigint | null) => (v === null ? "" : v.toString());

export function toCaptableCsv(rows: Row[]): string {
  const lines = rows.map((r) =>
    [text(r.stakeholder), r.type, text(r.class), n(r.shares), r.fdPercent, n(r.vested), n(r.unvested),
      r.safeAmount, r.safeCap, r.safeDiscount, r.asConverted, r.docStatus].map(cell).join(","));
  return `${[HEADER, ...lines].join("\n")}\n`;
}

export const captableCsv = (events: VaultEvent[], asOf: string): string =>
  toCaptableCsv(capTableRows(reduce(events, asOf)));
```
`src/index.ts`: remove the stub and export `./captable-csv`, `./reduce`, `./rows`, `./vesting`, `./num`, `./dates`, `./ocf/validate`.

- [ ] **Step 3: Run** `pnpm test` → all PASS, including **golden byte-for-byte**. If it fails, diff with:
`node -e` is not needed. Add `console.log(JSON.stringify(out))` temporarily, compare against the expected file, and fix the engine. **Never edit `captable.expected.csv`.**
- [ ] **Step 4: Commit** `git add -A && git commit -m "core: captable.csv writer; acme golden test passes byte for byte"`

---

### Task 10: Changes over time: edge-case vaults

**Files:**
- Create: `packages/core/test/edge-cases.test.ts`
- Modify: `reduce.ts` / `rows.ts` only if a test exposes a bug

**Interfaces:** consumes `reduce`, `capTableRows`, the test helper `ev`, `acmeEvents`.

- [ ] **Step 1: Tests** `test/edge-cases.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { reduce } from "../src/reduce";
import { capTableRows } from "../src/rows";
import type { VaultEvent } from "../src/types";
import { acmeEvents, ev } from "./helpers";

const base = acmeEvents();
const rows = (extra: VaultEvent[], asOf: string) => capTableRows(reduce([...base, ...extra], asOf));
const find = (r: ReturnType<typeof rows>, who: string) => r.find((x) => x.stakeholder === who);
const pool = (r: ReturnType<typeof rows>) => find(r, "Option pool (available)")!.shares;

describe("termination (F-22)", () => {
  test("before the cliff: everything returns to the pool", () => {
    const r = rows([
      ev("TX_EQUITY_COMPENSATION_CANCELLATION", { id: "c1", date: "2026-06-01", security_id: "OPT-1", quantity: "40000", reason_text: "left" }),
      ev("TX_STOCK_PLAN_RETURN_TO_POOL", { id: "r1", date: "2026-06-01", stock_plan_id: "plan_2025", quantity: "40000" }),
    ], "2026-10-07");
    expect(find(r, "Lisa Moreau")).toBeUndefined();
    expect(pool(r)).toBe(960000n);
    expect(r.filter((x) => x.group <= 2).map((x) => x.fdPercent)).toContain("12.00");
  });
  test("after the cliff: vested is frozen at the last day", () => {
    const r = rows([
      ev("TX_EQUITY_COMPENSATION_CANCELLATION", { id: "c1", date: "2026-11-07", security_id: "OPT-1", quantity: "29167", reason_text: "left" }),
      ev("TX_STOCK_PLAN_RETURN_TO_POOL", { id: "r1", date: "2026-11-07", stock_plan_id: "plan_2025", quantity: "29167" }),
    ], "2027-10-07");
    expect(find(r, "Lisa Moreau")).toMatchObject({ shares: 10833n, vested: 10833n, unvested: 0n });
  });
  test("cancelling more than outstanding is a violation", () => {
    const s = reduce([...base, ev("TX_EQUITY_COMPENSATION_CANCELLATION", { id: "c1", date: "2026-06-01", security_id: "OPT-1", quantity: "50000" })], "2026-10-07");
    expect(s.violations[0]).toMatch(/50,000 is more than the 40,000 outstanding on OPT-1/);
  });
});

describe("exercise then repurchase (F-23, F-24)", () => {
  const exercise = [
    ev("TX_EQUITY_COMPENSATION_EXERCISE", { id: "x1", date: "2026-11-01", security_id: "OPT-1", quantity: "10000", resulting_security_ids: ["CS-3"] }),
    ev("TX_STOCK_ISSUANCE", { id: "i3", date: "2026-11-01", security_id: "CS-3", stakeholder_id: "sh_lisa", stock_class_id: "sc_common", quantity: "10000", share_price: { amount: "0.12", currency: "USD" }, stock_legend_ids: [], security_law_exemptions: [] }),
  ];
  test("exercise converts options to common", () => {
    const r = rows(exercise, "2026-11-02");
    expect(r.filter((x) => x.stakeholder === "Lisa Moreau").map((x) => [x.type, x.shares, x.vested])).toEqual([
      ["common", 10000n, 10000n], ["option", 30000n, 0n]]);
  });
  test("then a full repurchase removes the shares", () => {
    const r = rows([...exercise, ev("TX_STOCK_REPURCHASE", { id: "p1", date: "2026-12-01", security_id: "CS-3", quantity: "10000", price: { amount: "0.12", currency: "USD" } })], "2026-12-02");
    expect(r.filter((x) => x.stakeholder === "Lisa Moreau").map((x) => x.type)).toEqual(["option"]);
  });
  test("exercising more than vested is a violation", () => {
    const s = reduce([...base, ev("TX_EQUITY_COMPENSATION_EXERCISE", { id: "x1", date: "2026-11-01", security_id: "OPT-1", quantity: "20000" })], "2026-11-02");
    expect(s.violations[0]).toMatch(/20,000 is more than the 10,000 vested/);
  });
});

describe("founder repurchase of unvested (F-24)", () => {
  test("Mads leaves at month 36: unvested 1,000,000 repurchased", () => {
    const r = rows([ev("TX_STOCK_REPURCHASE", { id: "p1", date: "2026-10-07", security_id: "CS-1", quantity: "1000000", price: { amount: "0.00001", currency: "USD" } })], "2027-10-07");
    expect(find(r, "Tim Apple")).toMatchObject({ shares: 3000000n, vested: 3000000n, unvested: 0n });
  });
});

describe("pool increase (F-25)", () => {
  test("shares_reserved is the new total", () => {
    expect(pool(rows([ev("TX_STOCK_PLAN_POOL_ADJUSTMENT", { id: "a1", date: "2026-10-01", stock_plan_id: "plan_2025", shares_reserved: "1500000" })], "2026-10-07"))).toBe(1420000n);
  });
});

describe("partial SAFE transfer (F-20)", () => {
  test("Fund X moves 100k to an SPV", () => {
    const r = rows([
      ev("STAKEHOLDER", { id: "sh_spv", name: { legal_name: "Fund X SPV I" }, stakeholder_type: "INSTITUTION" }),
      ev("TX_CONVERTIBLE_TRANSFER", { id: "t1", date: "2026-10-01", security_id: "SAFE-3", amount: { amount: "100000", currency: "USD" }, resulting_security_ids: ["SAFE-4"] }),
      ev("TX_CONVERTIBLE_ISSUANCE", { ...base.find((e) => e.data.security_id === "SAFE-3")!.data, id: "tx_safe_spv", security_id: "SAFE-4", custom_id: "SAFE-4", stakeholder_id: "sh_spv", date: "2026-10-01", investment_amount: { amount: "100000", currency: "USD" } }),
    ], "2026-10-07");
    expect(r.filter((x) => x.group === 3).map((x) => [x.stakeholder, x.safeAmount, x.asConverted])).toEqual([
      ["Y Combinator", "500000", "5.00"], ["Angel A", "150000", "1.88"], ["Fund X", "150000", "1.50"], ["Fund X SPV I", "100000", "1.00"]]);
  });
});

describe("correction and reversal (F-18)", () => {
  test("correction changes the cap, history keeps both", () => {
    const fix = ev("correction", { target: "evt_0017", field: "conversion_triggers.0.conversion_right.conversion_mechanism.conversion_valuation_cap.amount", old: "8000000", new: "9000000", reason: "typo" });
    expect(find(rows([fix], "2026-10-07"), "Angel A")!.asConverted).toBe("1.67");
    expect(base.find((e) => e.id === "evt_0017")!.data.conversion_triggers[0].conversion_right.conversion_mechanism.conversion_valuation_cap.amount).toBe("8000000");
  });
  test("reversal removes the row", () => {
    expect(find(rows([ev("reversal", { target: "evt_0018", reason: "duplicate" })], "2026-10-07"), "Fund X")).toBeUndefined();
  });
});

describe("as-of replay", () => {
  test("before anything was issued: no rows", () => expect(rows([], "2021-09-13")).toEqual([]));
  test("2023-01-01: founders and YC only, no pool before plan approval", () => {
    expect(rows([], "2023-01-01").map((x) => x.stakeholder)).toEqual(["Tim Apple", "Ana Ribeiro", "Y Combinator"]);
  });
  test("every as-of between events has FD summing to 100.00", () => {
    for (const d of ["2021-09-14", "2022-01-10", "2023-02-20", "2023-03-14", "2025-09-30", "2025-10-07", "2026-03-02", "2026-10-07"]) {
      const fd = rows([], d).filter((x) => x.group <= 2);
      const sum = fd.reduce((a, x) => a + Math.round(Number(x.fdPercent) * 100), 0);
      if (fd.length) expect(sum).toBe(10000);
    }
  });
});

describe("bad numbers", () => {
  test("negative and fractional quantities are violations, not math", () => {
    const s = reduce([...base,
      ev("TX_STOCK_ISSUANCE", { id: "n1", date: "2026-01-01", security_id: "CS-8", stakeholder_id: "sh_ana", stock_class_id: "sc_common", quantity: "-5", share_price: { amount: "1", currency: "USD" }, stock_legend_ids: [] }),
      ev("TX_STOCK_ISSUANCE", { id: "n2", date: "2026-01-01", security_id: "CS-9", stakeholder_id: "sh_ana", stock_class_id: "sc_common", quantity: "1.5", share_price: { amount: "1", currency: "USD" }, stock_legend_ids: [] }),
    ], "2026-10-07");
    expect(s.violations).toEqual([
      "TX_STOCK_ISSUANCE n1: quantity must be greater than 0",
      'TX_STOCK_ISSUANCE n2: Expected a whole number, got "1.5"',
    ]);
  });
});
```
(The FD-sum check uses `Number` only inside the test, to add up display strings.)
- [ ] **Step 2: Run.** Fix the engine until everything passes. Expected traps:
  - The Lisa exercise case: vested 10,000 at 2026-11-01, so exercising 10,000 leaves vested 0 on the options.
  - `liveEvents` must clone the data so `base` stays unmutated.
- [ ] **Step 3: Commit** `git add -A && git commit -m "core: edge-case vaults (termination, exercise, repurchase, pool, transfer, correction, as-of)"`

---

### Task 11: Invariants, gaps, appendEvent

**Files:**
- Create: `packages/core/src/invariants.ts`, `packages/core/src/gaps.ts`, `packages/core/src/append.ts`, `packages/core/test/invariants.test.ts`, `packages/core/test/gaps.test.ts`, `packages/core/test/append.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces:
  - `checkInvariants(s: State): string[]`
  - `interface Gap { kind: string; target: string; text: string; severity: "red" | "amber" }`
  - `computeGaps(s: State): Gap[]`
  - `interface AppendCtx { now(): Date; newId(): string; deviceId: string }`
  - `defaultCtx(deviceId: string): AppendCtx`
  - `appendEvent(log: string, draft: EventDraft, ctx: AppendCtx): Promise<{ok:true; event: VaultEvent; line: string} | {ok:false; errors: string[]}>`. The caller appends `line + "\n"`.

- [ ] **Step 1: Dependency.** Run `pnpm --filter @capfolder/core add -E ulid@3.0.2`.

- [ ] **Step 2: Failing tests.**

`test/invariants.test.ts`:
```ts
import { expect, test } from "vitest";
import { checkInvariants } from "../src/invariants";
import { reduce } from "../src/reduce";
import { acmeEvents, ev } from "./helpers";

const base = acmeEvents();
const check = (...extra: ReturnType<typeof ev>[]) => checkInvariants(reduce([...base, ...extra], "9999-12-31"));

test("acme holds every invariant", () => expect(check()).toEqual([]));
test("1: issued over authorized", () => {
  expect(check(ev("TX_STOCK_ISSUANCE", { id: "n1", date: "2026-01-01", security_id: "CS-9", stakeholder_id: "sh_ana", stock_class_id: "sc_common", quantity: "4000000", share_price: { amount: "1", currency: "USD" }, stock_legend_ids: [] })))
    .toEqual(["Issued would exceed authorized for Common (11,000,000 > 10,000,000)"]);
});
test("2: pool negative", () => {
  expect(check(ev("TX_STOCK_PLAN_POOL_ADJUSTMENT", { id: "a1", date: "2026-10-01", stock_plan_id: "plan_2025", shares_reserved: "50000" })))
    .toEqual(["Pool 2025 Equity Incentive Plan would go negative (-30,000 available)"]);
});
test("7: doc linked to nothing", () => {
  expect(check(ev("doc_linked", { doc_id: "doc_yc_safe", target: "SAFE-99" }))).toEqual(["Document doc_yc_safe is linked to SAFE-99, which doesn't exist"]);
});
test("4/5 come from the reducer", () => {
  expect(check(ev("TX_EQUITY_COMPENSATION_CANCELLATION", { id: "c1", date: "2026-06-01", security_id: "OPT-1", quantity: "50000" }))[0]).toMatch(/more than the 40,000 outstanding/);
});
```
`test/gaps.test.ts`:
```ts
import { expect, test } from "vitest";
import { computeGaps } from "../src/gaps";
import { reduce } from "../src/reduce";
import { acmeEvents, ev } from "./helpers";

const gaps = computeGaps(reduce(acmeEvents(), "2026-10-07"));
const targets = (kind: string) => gaps.filter((g) => g.kind === kind).map((g) => g.target).sort();

test("acme gaps", () => {
  expect(targets("no_signed_doc")).toEqual(["CS-1", "CS-2", "OPT-2", "SAFE-3"]);
  expect(targets("no_ip_assignment")).toEqual(["sh_ana", "sh_joao", "sh_lisa", "sh_mads"]);
  expect(targets("no_board_consent")).toEqual(["OPT-1", "OPT-2"]);
  expect(targets("no_plan_documents")).toEqual(["plan_2025"]);
  expect(gaps.find((g) => g.target === "SAFE-3")).toMatchObject({ severity: "red", text: "No signed document for Fund X's SAFE" });
});
test("83(b) within 30 days of a vesting stock issuance", () => {
  const extra = [
    ev("TX_STOCK_ISSUANCE", { id: "i9", date: "2026-10-01", security_id: "CS-9", stakeholder_id: "sh_ana", stock_class_id: "sc_common", quantity: "1000", share_price: { amount: "0.01", currency: "USD" }, stock_legend_ids: [], vesting_terms_id: "vt_4y1c_monthly" }),
    ev("TX_VESTING_START", { id: "v9", date: "2026-10-01", security_id: "CS-9", vesting_condition_id: "vesting-start" }),
  ];
  const g = computeGaps(reduce([...acmeEvents(), ...extra], "2026-10-07"));
  expect(g.find((x) => x.kind === "missing_83b")).toMatchObject({ target: "CS-9", text: "File Ana Ribeiro's 83(b) by 2026-10-31" });
});
```
`test/append.test.ts`:
```ts
import { expect, test } from "vitest";
import { appendEvent, type AppendCtx } from "../src/append";
import { verifyChain } from "../src/chain";
import { ev, readFix } from "./helpers";

const log = readFix("events.jsonl");
const ctx: AppendCtx = { now: () => new Date("2026-10-09T12:00:00.123Z"), newId: () => "evt_TEST", deviceId: "dev_test" };
const stakeholder = { kind: "ocf" as const, type: "STAKEHOLDER", data: { object_type: "STAKEHOLDER", id: "sh_new", name: { legal_name: "New Person" }, stakeholder_type: "INDIVIDUAL" } };

test("appends a valid event and the chain still verifies", async () => {
  const r = await appendEvent(log, stakeholder, ctx);
  if (!r.ok) throw new Error(r.errors.join("; "));
  expect(r.event).toMatchObject({ seq: 30, id: "evt_TEST", ts: "2026-10-09T12:00:00Z", meta: { source: "app", device_id: "dev_test" } });
  expect((await verifyChain(`${log}${r.line}\n`)).ok).toBe(true);
});
test("rejects schema-invalid OCF", async () => {
  const r = await appendEvent(log, { ...stakeholder, data: { object_type: "STAKEHOLDER", id: "x" } }, ctx);
  expect(r.ok).toBe(false);
});
test("rejects a broken chain", async () => {
  const r = await appendEvent(log.replace("Acme Inc.", "Acme Corp."), stakeholder, ctx);
  expect(r).toEqual({ ok: false, errors: ["The record is broken at line 1: hash does not match the line's content"] });
});
test("rejects a new invariant violation", async () => {
  const r = await appendEvent(log, { kind: "ocf", type: "TX_STOCK_ISSUANCE", data: ev("TX_STOCK_ISSUANCE", { id: "n1", date: "2026-01-01", security_id: "CS-9", stakeholder_id: "sh_ana", stock_class_id: "sc_common", quantity: "4000000", share_price: { amount: "1", currency: "USD" }, stock_legend_ids: [] }).data }, ctx);
  expect(r).toEqual({ ok: false, errors: ["Issued would exceed authorized for Common (11,000,000 > 10,000,000)"] });
});
test("an existing violation does not block unrelated appends", async () => {
  const bad = await appendEvent(log, { kind: "app", type: "doc_linked", data: { doc_id: "doc_yc_safe", target: "SAFE-99" } }, { ...ctx, newId: () => "evt_BAD" });
  // write the bad line directly, simulating an imported vault that is already broken
  if (bad.ok) throw new Error("expected rejection");
  const { hashEvent } = await import("../src/chain");
  const { default: canonicalize } = await import("canonicalize");
  const last = JSON.parse(log.trim().split("\n").at(-1)!);
  const raw = { seq: 30, id: "evt_BAD", ts: "2026-10-09T00:00:00Z", kind: "app", type: "doc_linked", data: { doc_id: "doc_yc_safe", target: "SAFE-99" }, meta: { source: "test" }, prev: last.hash };
  const broken = `${log}${canonicalize({ ...raw, hash: await hashEvent(raw as never) })}\n`;
  const r = await appendEvent(broken, stakeholder, ctx);
  expect(r.ok).toBe(true);
});
test("rejects a correction that makes the target schema-invalid", async () => {
  const r = await appendEvent(log, { kind: "app", type: "correction", data: { target: "evt_0012", field: "quantity", old: "4000000", new: "abc", reason: "x" } }, ctx);
  expect(r.ok).toBe(false);
});
```
Run → FAIL.

- [ ] **Step 3: Implement** `src/invariants.ts`:
```ts
import { fmtInt } from "./num";
import { capTableRows, securityVested } from "./rows";
import type { State } from "./types";

export function checkInvariants(s: State): string[] {
  const out = [...s.violations]; // 4 (exercise ≤ vested), 5 (≤ balance), bad numbers, unknown references
  for (const [id, c] of s.classes) {
    const issued = [...s.securities.values()].filter((x) => x.kind === "stock" && x.classId === id).reduce((a, x) => a + x.quantity, 0n);
    if (issued > c.authorized) out.push(`Issued would exceed authorized for ${c.data.name} (${fmtInt(issued)} > ${fmtInt(c.authorized)})`);
  }
  const rows = capTableRows(s);
  for (const r of rows.filter((x) => x.group === 2 && x.shares! < 0n))
    out.push(`Pool ${s.plans.get(r.securityId)!.data.plan_name} would go negative (${fmtInt(r.shares!)} available)`);
  for (const x of s.securities.values()) {
    const v = securityVested(x, s, s.asOf);
    if (v.vested !== null && v.vested > x.originalQuantity) out.push(`${x.id}: vested ${fmtInt(v.vested)} exceeds granted ${fmtInt(x.originalQuantity)}`);
  }
  const fd = rows.filter((r) => r.group <= 2);
  const sum = fd.reduce((a, r) => a + BigInt(r.fdPercent.replace(".", "")), 0n);
  // Skipped when a pool is negative: invariant 2 already reports that, and percentages of a negative row are meaningless.
  if (fd.every((r) => r.shares! >= 0n) && fd.some((r) => r.shares! > 0n) && sum !== 10000n) out.push(`Fully diluted percentages sum to ${sum} basis points, not 100.00%`);
  const ids = new Set<string>([...s.stakeholders.keys(), ...s.plans.keys(), s.issuer?.id,
    ...[...s.securities.values()].flatMap((x) => [x.id, x.txId])].filter(Boolean) as string[]);
  for (const [docId, d] of s.docs) for (const t of d.links) if (!ids.has(t)) out.push(`Document ${docId} is linked to ${t}, which doesn't exist`);
  return out;
}
```
`src/gaps.ts`:
```ts
import { parseDec } from "./num";
import { securityVested } from "./rows";
import type { Security, State } from "./types";

export interface Gap { kind: string; target: string; text: string; severity: "red" | "amber" }

// doc_type values used for gap checks (docs/03): 83b, ciiaa, board_consent, plus any doc linked to a plan id.
export function computeGaps(s: State): Gap[] {
  const gaps: Gap[] = [];
  const name = (id: string) => s.stakeholders.get(id)?.name?.legal_name ?? id;
  const linked = (target: string, type?: string) =>
    [...s.docs.values()].some((d) => !d.removed && d.links.has(target) && (!type || d.data.doc_type === type));
  const label = (x: Security) => (x.kind === "convertible" ? (x.convertibleType ?? "convertible") : x.kind === "equity" ? "grant" : "shares");
  const open = [...s.securities.values()].filter((x) => (x.kind === "convertible" ? parseDec(x.amount!).v > 0n : x.quantity > 0n));
  const plus30 = (d: string) =>
    new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + 30)).toISOString().slice(0, 10);
  const people = new Set<string>();
  for (const x of open) {
    if (!linked(x.id) && !linked(x.txId))
      gaps.push({ kind: "no_signed_doc", target: x.id, severity: "red", text: `No signed document for ${name(x.stakeholderId)}'s ${label(x)}` });
    if (x.kind === "equity" && !linked(x.id, "board_consent") && !linked(x.txId, "board_consent"))
      gaps.push({ kind: "no_board_consent", target: x.id, severity: "amber", text: `No board consent for ${name(x.stakeholderId)}'s grant` });
    // 83(b) is due 30 days after issuance; flag only while the deadline hasn't passed (a missed one is lawyer work).
    if (x.kind === "stock" && (x.vestingTermsId || x.vestings?.length) && plus30(x.date) >= s.asOf && !linked(x.id, "83b"))
      gaps.push({ kind: "missing_83b", target: x.id, severity: "amber", text: `File ${name(x.stakeholderId)}'s 83(b) by ${plus30(x.date)}` });
    if (x.kind !== "convertible" && s.stakeholders.get(x.stakeholderId)?.stakeholder_type === "INDIVIDUAL") people.add(x.stakeholderId);
    const v = securityVested(x, s, s.asOf);
    if (x.kind !== "convertible" && v.unknownReason)
      gaps.push({ kind: "vesting_unknown", target: x.id, severity: "amber", text: `Vesting unknown for ${name(x.stakeholderId)}: ${v.unknownReason}` });
    if (x.note === "imported snapshot")
      gaps.push({ kind: "imported_snapshot", target: x.id, severity: "amber", text: `History before import not available for ${name(x.stakeholderId)}` });
  }
  for (const p of people) if (!linked(p, "ciiaa"))
    gaps.push({ kind: "no_ip_assignment", target: p, severity: "amber", text: `No IP assignment for ${name(p)}` });
  for (const [id, p] of s.plans) if (!linked(id))
    gaps.push({ kind: "no_plan_documents", target: id, severity: "amber", text: `No plan document or approvals for ${p.data.plan_name}` });
  return gaps;
}
```
Envelope staleness waits for M5.

`src/append.ts`:
```ts
import canonicalize from "canonicalize";
import { ulid } from "ulid";
import { GENESIS, hashEvent, verifyChain } from "./chain";
import { MAX_DATE } from "./dates";
import { checkInvariants } from "./invariants";
import { validateOcf } from "./ocf/validate";
import { liveEvents, reduce } from "./reduce";
import type { EventDraft, VaultEvent } from "./types";

export interface AppendCtx { now(): Date; newId(): string; deviceId: string }
export const defaultCtx = (deviceId: string): AppendCtx => ({ now: () => new Date(), newId: () => `evt_${ulid()}`, deviceId });

export type AppendResult = { ok: true; event: VaultEvent; line: string } | { ok: false; errors: string[] };

export async function appendEvent(log: string, draft: EventDraft, ctx: AppendCtx): Promise<AppendResult> {
  const chain = await verifyChain(log);
  if (!chain.ok) return { ok: false, errors: [`The record is broken at line ${chain.line}: ${chain.reason}`] };
  const events = chain.events;
  const last = events.at(-1);
  const base = {
    seq: (last?.seq ?? 0) + 1, id: ctx.newId(), ts: ctx.now().toISOString().replace(/\.\d{3}Z$/, "Z"),
    kind: draft.kind, type: draft.type, data: draft.data,
    meta: { source: "app", device_id: ctx.deviceId, ...draft.meta }, prev: last?.hash ?? GENESIS,
  };
  const event: VaultEvent = { ...base, hash: await hashEvent(base) };
  const next = [...events, event];

  const schemaErrors =
    draft.kind === "ocf" ? validateOcf(draft.data)
    : draft.type === "correction" ? validateOcf(liveEvents(next).find((e) => e.id === draft.data.target)?.data ?? {})
    : [];
  if (schemaErrors.length) return { ok: false, errors: schemaErrors };

  // Block only violations this event introduces, so an already-broken import can still be fixed.
  const before = new Set(checkInvariants(reduce(events, MAX_DATE)));
  const added = checkInvariants(reduce(next, MAX_DATE)).filter((v) => !before.has(v));
  if (added.length) return { ok: false, errors: added };
  return { ok: true, event, line: canonicalize(event)! };
}
```
`index.ts`: export `./invariants`, `./gaps`, `./append`.

- [ ] **Step 4: Run** `pnpm test` → PASS. The "existing violation" test hand-builds a bad line. If that test is awkward, extract a tiny `writeRaw` helper into `test/helpers.ts`.
- [ ] **Step 5: Commit** `git add -A && git commit -m "core: invariants, gaps, appendEvent (validate + new-violation check)"`

---

### Task 12: Property test (10k random valid sequences)

**Files:**
- Create: `packages/core/test/invariants.property.test.ts`

- [ ] **Step 1: Dependency.** Run `pnpm --filter @capfolder/core add -D -E fast-check@4.10.2`.
- [ ] **Step 2: Test:**
```ts
import fc from "fast-check";
import { expect, test } from "vitest";
import { checkInvariants } from "../src/invariants";
import { reduce } from "../src/reduce";
import { capTableRows, securityVested } from "../src/rows";
import type { VaultEvent } from "../src/types";
import { acmeEvents, ev } from "./helpers";

const defs = acmeEvents().filter((e) => e.kind === "ocf" && !e.type.startsWith("TX_")); // issuer, class 10M, people, terms, plan 1M
const OPS = ["stock", "grant", "terminate", "exercise", "poolUp", "safe"] as const;
const iso = (day: number) => new Date(Date.UTC(2021, 0, 1 + day)).toISOString().slice(0, 10);

function build(ops: { op: (typeof OPS)[number]; pct: number; gap: number }[]): VaultEvent[] {
  const events = [...defs];
  let day = 0;
  let k = 0;
  for (const { op, pct, gap } of ops) {
    day += gap;
    const date = iso(day);
    const s = reduce(events, date);
    const p = BigInt(pct);
    const id = `p${k++}`;
    const holder = ["sh_mads", "sh_ana", "sh_lisa", "sh_joao"][pct % 4]!;
    const opts = [...s.securities.values()].filter((x) => x.kind === "equity" && x.quantity > 0n);
    const pick = opts[pct % Math.max(opts.length, 1)];
    if (op === "stock") {
      const issued = [...s.securities.values()].filter((x) => x.kind === "stock").reduce((a, x) => a + x.quantity, 0n);
      const q = ((10000000n - issued) * p) / 100n;
      if (q > 0n) events.push(ev("TX_STOCK_ISSUANCE", { id, date, security_id: `S-${id}`, stakeholder_id: holder, stock_class_id: "sc_common", quantity: `${q}`, share_price: { amount: "0.01", currency: "USD" }, stock_legend_ids: [] }));
    } else if (op === "grant") {
      const avail = capTableRows(s).find((r) => r.group === 2)?.shares ?? 0n;
      const q = (avail * p) / 100n;
      if (q > 0n) events.push(
        ev("TX_EQUITY_COMPENSATION_ISSUANCE", { id, date, security_id: `O-${id}`, stakeholder_id: holder, stock_plan_id: "plan_2025", stock_class_id: "sc_common", compensation_type: "OPTION_ISO", exercise_price: { amount: "0.1", currency: "USD" }, quantity: `${q}`, expiration_date: "2040-01-01", termination_exercise_windows: [], vesting_terms_id: "vt_4y1c_monthly" }),
        ev("TX_VESTING_START", { id: `${id}v`, date, security_id: `O-${id}`, vesting_condition_id: "vesting-start" }));
    } else if (op === "terminate" && pick) {
      const v = securityVested(pick, s, date);
      const unvested = v.unvested ?? 0n;
      if (unvested > 0n) events.push(
        ev("TX_EQUITY_COMPENSATION_CANCELLATION", { id, date, security_id: pick.id, quantity: `${unvested}`, reason_text: "left" }),
        ev("TX_STOCK_PLAN_RETURN_TO_POOL", { id: `${id}r`, date, stock_plan_id: "plan_2025", quantity: `${unvested}` }));
    } else if (op === "exercise" && pick) {
      const q = ((securityVested(pick, s, date).vested ?? 0n) * p) / 100n;
      if (q > 0n) events.push(ev("TX_EQUITY_COMPENSATION_EXERCISE", { id, date, security_id: pick.id, quantity: `${q}` }));
    } else if (op === "poolUp") {
      const plan = s.plans.get("plan_2025");
      if (plan) events.push(ev("TX_STOCK_PLAN_POOL_ADJUSTMENT", { id, date, stock_plan_id: "plan_2025", shares_reserved: `${plan.reserved + p * 1000n}` }));
    } else if (op === "safe") {
      events.push(ev("TX_CONVERTIBLE_ISSUANCE", { ...acmeEvents().find((e) => e.data.security_id === "SAFE-1")!.data, id, date, security_id: `F-${id}`, investment_amount: { amount: `${p * 10000n}`, currency: "USD" } }));
    }
  }
  return events;
}

test("invariants hold for 10k random valid event sequences", () => {
  fc.assert(
    fc.property(
      fc.array(fc.record({ op: fc.constantFrom(...OPS), pct: fc.integer({ min: 1, max: 100 }), gap: fc.integer({ min: 0, max: 200 }) }), { maxLength: 20 }),
      fc.integer({ min: 0, max: 8000 }),
      (ops, asOfDay) => {
        const events = build(ops);
        for (const asOf of [iso(asOfDay), "9999-12-31"]) expect(checkInvariants(reduce(events, asOf))).toEqual([]);
      },
    ),
    { numRuns: 10_000 },
  );
}, 300_000);
```
The plan's `board_approval_date` is 2025-09-30, so grants before then find no pool row and are skipped. That is intended: ops dated before the plan just no-op.

- [ ] **Step 3: Run** `pnpm --filter @capfolder/core test property`. Expect PASS in well under 5 minutes. On a counterexample, fast-check prints the minimal ops. Fix the engine, not the generator, unless the generator produced an invalid sequence (for example, an exercise above vested because of rounding). If it's slow (>2 min), lower `maxLength` to 15 and record that in the test.
- [ ] **Step 4: Commit** `git add -A && git commit -m "core: property test, invariants hold over 10k random sequences"`

---

### Task 13: OCF export

**Files:**
- Create: `packages/core/src/ocf-export.ts`, `packages/core/test/ocf-export.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `toOcfExport(events: VaultEvent[], opts: { asOf: string; generatedAt: string }): Record<string, string>` (file name → JSON text)

- [ ] **Step 1: Dependency.** Run `pnpm --filter @capfolder/core add -E js-md5@0.9.2`, then `pnpm licenses:gen`.
- [ ] **Step 2: Failing test** `test/ocf-export.test.ts`:
```ts
import { expect, test } from "vitest";
import { toOcfExport } from "../src/ocf-export";
import { validateOcf } from "../src/ocf/validate";
import { acmeEvents, ev } from "./helpers";

const files = toOcfExport(acmeEvents(), { asOf: "2026-10-07", generatedAt: "2026-10-07T12:00:00Z" });

test("writes the manifest and the object files", () => {
  expect(Object.keys(files).sort()).toEqual([
    "Manifest.ocf.json", "Stakeholders.ocf.json", "StockClasses.ocf.json", "StockLegends.ocf.json",
    "StockPlans.ocf.json", "Transactions.ocf.json", "Valuations.ocf.json", "VestingTerms.ocf.json"]);
});
test("every file validates against OCF 1.2.0", () => {
  for (const [name, text] of Object.entries(files)) expect([name, validateOcf(JSON.parse(text))]).toEqual([name, []]);
});
test("manifest md5s match file contents", async () => {
  const { md5 } = await import("js-md5");
  const m = JSON.parse(files["Manifest.ocf.json"]!);
  expect(m.stakeholders_files[0]).toEqual({ filepath: "./Stakeholders.ocf.json", md5: md5(files["Stakeholders.ocf.json"]!) });
});
test("reversed transactions are left out, corrections applied", () => {
  const out = toOcfExport([...acmeEvents(), ev("reversal", { target: "evt_0018", reason: "dup" })], { asOf: "2026-10-07", generatedAt: "2026-10-07T12:00:00Z" });
  expect(out["Transactions.ocf.json"]).not.toContain("tx_safe_fundx");
});
```
- [ ] **Step 3: Implement** `src/ocf-export.ts`:
```ts
import { md5 } from "js-md5";
import { liveEvents } from "./reduce";
import type { Data, VaultEvent } from "./types";

const FILES: [name: string, fileType: string, manifestKey: string, match: (t: string) => boolean][] = [
  ["Stakeholders.ocf.json", "OCF_STAKEHOLDERS_FILE", "stakeholders_files", (t) => t === "STAKEHOLDER"],
  ["StockClasses.ocf.json", "OCF_STOCK_CLASSES_FILE", "stock_classes_files", (t) => t === "STOCK_CLASS"],
  ["StockPlans.ocf.json", "OCF_STOCK_PLANS_FILE", "stock_plans_files", (t) => t === "STOCK_PLAN"],
  ["VestingTerms.ocf.json", "OCF_VESTING_TERMS_FILE", "vesting_terms_files", (t) => t === "VESTING_TERMS"],
  ["Valuations.ocf.json", "OCF_VALUATIONS_FILE", "valuations_files", (t) => t === "VALUATION"],
  ["StockLegends.ocf.json", "OCF_STOCK_LEGEND_TEMPLATES_FILE", "stock_legend_templates_files", (t) => t === "STOCK_LEGEND_TEMPLATE"],
  ["Transactions.ocf.json", "OCF_TRANSACTIONS_FILE", "transactions_files", (t) => t.startsWith("TX_")],
];
const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;

// ponytail: DOCUMENT objects need an md5 of the file bytes; they're exported once doc_added carries md5 (M3 files them).
export function toOcfExport(events: VaultEvent[], opts: { asOf: string; generatedAt: string }): Record<string, string> {
  const live = liveEvents(events).filter((e) => e.kind === "ocf" && (!e.type.startsWith("TX_") || e.data.date <= opts.asOf));
  const latest = new Map<string, Data>(); // later STAKEHOLDER etc. with the same id replace earlier ones
  for (const e of live) latest.set(e.data.id, e.data);
  const objects = [...latest.values()];
  const out: Record<string, string> = {};
  const manifest: Data = {
    ocf_version: "1.2.0", file_type: "OCF_MANIFEST_FILE", issuer: objects.find((o) => o.object_type === "ISSUER"),
    as_of: opts.asOf, generated_at: opts.generatedAt,
  };
  for (const [name, fileType, key, match] of FILES) {
    out[name] = json({ file_type: fileType, items: objects.filter((o) => match(o.object_type)) });
    manifest[key] = [{ filepath: `./${name}`, md5: md5(out[name]) }];
  }
  out["Manifest.ocf.json"] = json(manifest);
  return out;
}
```
If the manifest schema rejects `issuer` carrying `object_type`, check `files/OCFManifestFile.schema.json` and strip it accordingly.
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `git add -A && git commit -m "core: OCF 1.2.0 export (manifest + files, md5)"`

---

### Task 14: Record decisions, final verification

**Files:**
- Modify: `docs/03-data-model.md`, `docs/superpowers/specs/2026-10-09-m0-m1-core-engine-design.md`, `docs/09-build-plan.md` (tick M0/M1 acceptance)

- [ ] **Step 1: Add a "Decisions where OCF is silent (M1)" section to `docs/03-data-model.md`:**
  - **captable.csv row order:** stock, then equity compensation, then pool rows, then convertibles. Within a group: issue date, then security id. Zero-balance rows are hidden.
  - **as-of:** transactions filter by `date`. Definitions (stakeholders, classes, terms) are always present. A stock plan appears only from its `board_approval_date`. App events filter by the `ts` date.
  - **Consuming transactions** (cancellation, repurchase, exercise, transfer): without `balance_security_id` they reduce the source security. With it, the source closes and the remainder must be issued as its own security (strict OCF).
  - **Vesting stops** at the date of any cancellation or repurchase on that security. Vested is measured on the original quantity, minus exercised, capped at outstanding.
  - **Pool:** available = `shares_reserved` (latest adjustment is the new total) − granted (original quantities) + returned (`TX_STOCK_PLAN_RETURN_TO_POOL`). A cancellation without a return-to-pool retires the shares.
  - **Supported vesting subset:** start + linear month-based relative chain, allocation `CUMULATIVE_ROUND_DOWN` / `CUMULATIVE_ROUNDING`, or explicit `vestings[]`. Anything else is "vesting unknown". Acceleration is recorded, not computed.
  - **Corrections:** `{target, field (dot path, numeric array indices), old, new, reason}`, applied in file order. Reversals of reversals are ignored.
  - **Gap doc types:** `83b`, `ciiaa`, `board_consent`. Plan documents are any doc linked to the plan id.
  - **Invariants on append** block only violations that the new event introduces.
  - **Number formats:** money and percentages are kept as their OCF strings. `as_converted_percent` is half-up to 2 decimals, and `fd_percent` uses largest-remainder.
  - **CSV safety:** text cells starting with `= + - @` are prefixed with `'`.
- [ ] **Step 2: Spec correction.** In the spec's Reducer step 2, replace "OCF objects … unless created after asOf by ts" with the as-of rule above.
- [ ] **Step 3: Full verification.**
Run: `pnpm i --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm licenses:check`
Expected:
  - all green;
  - the golden test passes;
  - 29 tamper cases pass;
  - the property test passes;
  - `git status` is clean after commit.
- [ ] **Step 4: Commit** `git add -A && git commit -m "docs: record M1 data-model decisions; M0+M1 done"`. **Do not push.** Tell Mads the branch is ready for him to push to MKBSP/capfolder.

---

## Verification (end to end)
1. `pnpm test`: the Acme golden test reproduces `captable.expected.csv` byte for byte; chain tamper tests fail at the right line; edge-case vaults; 10k property runs.
2. `pnpm typecheck && pnpm lint && pnpm licenses:check`: green, which is what CI runs.
3. Manual sanity check:
   ```bash
   cd packages/core && npx vitest run golden
   ```
   Then check one number by hand: Lisa at 2026-11-07 → 10,833 (`floor(40,000 × 13/48)`).
4. After Mads pushes: the GitHub Actions `ci` run is green on `main`.
