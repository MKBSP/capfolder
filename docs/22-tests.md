# 22 · Tests: what we have, what each one guards, and why

Written 2026-11-06. 89 vitest files (core 41, desktop 32, capfolder 8, vault 4, relay 3, website 1) plus two script checks. CI runs `pnpm lint`, `pnpm typecheck` and `pnpm test`; the golden tests gate every release (CLAUDE.md: "the math must be right").

## How to run
| Command | What it does |
|---|---|
| `pnpm test` | `vitest run` in every package |
| `pnpm --filter <name> test` | one package: `@capfolder/core`, `@capfolder/vault`, `capfolder`, `@capfolder/desktop`, `@capfolder/relay`, `@capfolder/website` |
| `pnpm --filter @capfolder/core exec vitest run test/scenario` | one file or folder |
| `pnpm lint` / `pnpm typecheck` | Biome over the repo / `tsc --noEmit` per package |
| `pnpm help:check` | lists help and feature pages whose app files changed since they were last checked (`scripts/help-check.mjs`) |
| `pnpm licenses:check` | prod dependency licenses against the allow-list (`scripts/check-licenses.mjs`) |
| `SIGNING_E2E=1` (desktop), `RELAY_CONTRACT=1` (relay) | opt-in runs against a real relay, Documenso and Mailpit; skipped by default |

## Kinds of test
- **Golden:** replay a hand-checked fixture and compare byte for byte. `fixtures/acme-vault` (29 hash-chained events, `captable.expected.csv` as of 2026-10-07) and `fixtures/acme-docs` (18 messy documents, `expected.json`). If a golden test fails, the engine changed meaning; fix the engine or re-check the fixture by hand, never "update the expected file" blindly.
- **Property-based (fast-check):** random inputs, a rule that must always hold. Two files: invariants over random event histories, and scenario math over random founders, pools, SAFEs and rounds.
- **MCP in-memory:** the capfolder package tests start the real MCP server on an `InMemoryTransport` and call tools as a client would.
- **jsdom React:** desktop screens render with Testing Library; the platform (fs, keychain, relay) is a fake in `src/test/acme.ts`.
- **Packaging and docs consistency:** `packaging.test.ts`, `site.test.ts` and `help-check.mjs` fail when copies drift (skill vs plugin vs GEMINI.md), when the site shows an unbuilt feature, or when a help page is behind the app.
- **Review regressions:** files named `review-*.test.ts` and `hardening.test.ts`, plus blocks marked "from the final review" inside other files. Each test there failed first against a bug a reviewer found; keep that habit (TDD) for every fix.

## packages/core (`@capfolder/core`)
| File | What it captures | Why |
|---|---|---|
| golden.test.ts | Replaying `fixtures/acme-vault` reproduces `captable.expected.csv` exactly | The one test that pins the reducer's meaning |
| invariants.property.test.ts | Random valid event sequences never break docs/03 invariants 1–7 | Consistency across histories nobody wrote by hand |
| invariants.test.ts | Each invariant is detected (issued over authorized, negative pool, …); acme holds all | Keeps the checker honest |
| purity.test.ts | `src/` has no Node or I/O imports | Core runs in the browser, the webview and Node |
| src/ocf/validate-noeval.test.ts | OCF validation works without `eval` | The desktop CSP has no `unsafe-eval` |
| append.test.ts, chain.test.ts | `appendEvent`, lines written outside it, hash-chain verification | The record is append-only and tamper-evident |
| reduce.test.ts, builders.test.ts, ocf.test.ts, ocf-export.test.ts | Reducer, every draft builder yields schema-valid OCF, validation, OCF export round trip | Bad events never get written; interop with other tools |
| captable-csv.test.ts | RFC 4180 quoting, formula neutralisation, LF endings | A vault opened in a spreadsheet can't run formulas |
| export.test.ts, export-overview.test.ts, full-captable.test.ts | Sheets, xlsx, lawyer package, Overview tab with charts, Pulley/Carta-shaped workbook | F-29 exports stay complete |
| import.test.ts, review-m2.test.ts, tieout.test.ts | File reading, `buildImport`, same email with different spelling is flagged never merged, number formats from other writers, compare-with-Pulley totals | F-07 import safety and reconciliation |
| dates.test.ts, num.test.ts, totals.test.ts | Date parsing, exact bigint decimals, percentages that sum to exactly 100.00 | Every number in the UI is exact |
| vesting.test.ts, schedule.test.ts, vesting-dashboard.test.ts | 4y/1y cliff/monthly, unsupported shapes are "unknown" never guessed, pool totals, FMV, graph points | Vesting math and the Vesting screen |
| edge-cases.test.ts, transfer-merge.test.ts, promises.test.ts | Termination, exercise then repurchase, founder repurchase; transfers and merging duplicates; pre-incorporation promises | F-20 to F-24 and the not-yet-incorporated path |
| gaps.test.ts, drafts.test.ts, signature-page.test.ts, form.test.ts, sort.test.ts, review-m4.test.ts | Missing-document gaps (83(b) within 30 days), unsigned drafts never count as proof, signature-page detection, form fill round trip, acme-docs golden classify and extract, never file against the wrong row | F-09 document sorting and the gaps list |
| hardening.test.ts, review-m6.test.ts | Duplicate security ids, schema-valid numbers that would crash the reducer, negative money; `fromOcfExport` returns errors and never throws | Final-review regressions: untrusted vaults never throw |
| scenario-start.test.ts | Empty start builds founders, pool by shares or percent, a SAFE as a holding; zero shares is an error; the change column | F-39: recordable steps go through the real engine |
| scenario-round.test.ts | Hand-checked goldens (2026-11-06): one SAFE 1,111,111 shares, stacked SAFEs, discount-only price 0.675, sells 20% with and without top-up, post = pre + new; review regressions: impossible pool target, round on nothing, cap-and-discount re-solved, two SAFEs from one holder merge, pre-money SAFE refused, inconsistent money refused | The YC post-money SAFE math and the option-pool shuffle, exact |
| scenario-exit.test.ts | Pool cancelled, proceeds sum to the exit value, an outstanding SAFE is an error | Take-home numbers add up |
| scenario-benchmarks.test.ts | Every default has a source and year; the default path; pre-seed cap by amount | Defaults are data with sources, never advice |
| scenario-run.test.ts, scenario.property.test.ts | The first question end to end (two founders, $500K at $2M, default path, $200M exit); sweeps; recordable after projection refused; errors as text; property: percents sum to 100, founders never go up, a SAFE at cap holds amount ÷ cap | `runScenario` never throws and the story is consistent |

## packages/vault (`@capfolder/vault`)
| File | What it captures | Why |
|---|---|---|
| src/vault.test.ts | `createVault`, append, `openVault`; write calls recorded, the next save still works | F-31: the on-disk record behaves |
| src/fs/node.test.ts, src/lock.test.ts, src/registry.test.ts | Node fs adapter, the folder lock, the companies registry | Real-disk semantics, no concurrent writers, known companies |

## packages/capfolder (npm `capfolder`: MCP server, install, skill)
| File | What it captures | Why |
|---|---|---|
| src/golden.test.ts | Each business event maps to tool calls that rebuild the acme fixture, checked against it | The write tools can reproduce the golden vault |
| src/tools/read.test.ts, write.test.ts | Read tools over acme, `switch_company` writes only the registry; preview then confirm with the id, pre-incorporation tools (CAP-61) | Read tools never touch the record; nothing records without a yes |
| src/tools/plans.test.ts | `run_scenario` renders one table per step with sources and "not advice"; the zod input converts to JSON Schema; default path before a trailing exit; a failing sweep row says why; an empty folder is no company | The shared tool behaves the same in MCP and Ask AI |
| src/preview.test.ts, src/context.test.ts, src/install.test.ts | Previews are single use and refused for a changed folder or another company; the device id is random and kept; install per client | Stale confirms never record; stable identity; setup |
| src/packaging.test.ts | Manifests pin the version, the skill has every question and the disclaimer and never says "MCP server", plugin copy and GEMINI.md identical, release never becomes GitHub Latest, .mcpb built before publish | Release and copy consistency gate |

## apps/desktop (`@capfolder/desktop`, jsdom)
| File | What it captures | Why |
|---|---|---|
| src/chat.test.ts | Ask AI loop with the provider mocked: tools run over acme, drafts, cloud-docs toggle, `run_scenario` never writes | docs/18 rules hold |
| src/components/AskAi.test.tsx, Tour.test.tsx, connect-ai.test.tsx, settings.test.ts, screens/Settings.test.tsx | Panel stays open across screens, the tour, Connect AI, sorting AI vs Ask AI fallback and Advanced overrides | AI setup and the "not connected" bug |
| src/docread.test.ts, pdfverify.test.ts, e2e-signing.test.ts (opt-in) | PDF and text reading, matches-what-you-sent check, real relay + Documenso + Mailpit end to end | Documents are read right; the sealed PDF passes our check |
| src/fs/tauri.test.ts, review-fixes.test.tsx, updates.test.tsx | Dangling symlinks, concurrent saves, read-only means no file changes, app lock, signed updates and rules pack (F-38) | Safety stories |
| src/onboarding.test.ts, checklist.test.ts, wizard.test.ts, screens/Wizard.test.tsx, Questions.test.tsx, Promises.test.tsx, Sample.test.tsx | New company flow, checklist, setup wizard and its branching, promises before incorporation, the sample company can't be saved | F-01/F-02 and docs/19 onboarding |
| src/screens/Home, Person, Vesting, Documents, Export, Forms, Import, Signing, Sort, Region (.test.tsx) | Each screen's numbers and actions; Signing with a fake relay (interrupted filing, relay switch, YC templates); Sort over acme-docs; Forms incl. the CAP-47 half-typed amount | Every screen matches its story; review regressions stay fixed |
| src/App.test.tsx, ping.test.tsx, registry.test.tsx | Boot, usage ping, company list | Shell behaviour |

## apps/relay (`@capfolder/relay`)
| File | What it captures | Why |
|---|---|---|
| test/app.test.ts | Auth codes (F-04), the founder gets no signer URL on envelopes they don't sign, plan limits (free 5 a month, Pro unlimited) | Signing safety and limits |
| test/contract.test.ts (opt-in), test/dashboard.test.ts | Contract against a real Documenso; the admin dashboard | Detects Documenso API drift |

## apps/website (`@capfolder/website`)
| File | What it captures | Why |
|---|---|---|
| site.test.ts | ~40 checks over the built site: no placeholders or unbuilt features, CSP and analytics proxy, SEO, JSON-LD, sitemap, compare/learn/blog/guide pages, the download form, pricing copy, every help page listed in `help/pages.json`, the homepage rules (page F, 2026-11-04) | The site never promises what the app doesn't do; build first, it reads `dist` |

## Rules for new tests
- A bug fix starts with a test that fails on the bug (TDD); name the issue or review in the test name ("CAP-47", "from the final review").
- Numbers in tests are hand-checked and say so in a comment, with the date.
- Sample names only: Tim Apple, Steve Jobs, Steve Wozniak, Bill Gates, Acme.
- A new screen gets a jsdom test and a help page entry; a new tool gets an in-memory MCP test; a new export gets a golden.
