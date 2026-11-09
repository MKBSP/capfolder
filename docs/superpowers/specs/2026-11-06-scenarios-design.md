# Scenarios: play with the numbers before anything is real (design)

Date: 2026-11-06 · Linear: CAP-63 (scenarios from your AI), CAP-65 (cofounder split calculator), CAP-64 (lead magnets); needs CAP-49 item 6 for the day a real priced round is recorded · Decided with Mads on 2026-11-05 and 2026-11-06.

## Why

Capfolder now aims at founders from first idea to first raise (`apps/website/PRODUCT.md`). The app handles a founder who has a company. A founder who is still tinkering hits two walls:

1. **No what-if math.** Nothing in core, the desktop app or the MCP tools answers "what happens if". The engine records what happened; a SAFE just says "converts at next round".
2. **Everything needs a folder first.** You name a company and pick a path before you see a single number.

What those founders actually ask (Mads, 2026-11-06, and the forum research of the same day, ranked by how often it recurs):

- "Two cofounders, we raise at a $2M valuation, then a normal run of rounds. What do I take home when the company is worth $200M?"
- "How much should I raise my pre-seed at?" and "An investor offers $50K now. What should I value the company at?"
- "How much of the company am I selling with this SAFE? What if I stack three SAFEs at different caps?"
- "How much will I own after seed, A and B?" and "the VC wants a 15% pool in the pre-money, what does that do?"
- "If we sell for $X, how much do the founders get?" and "can the investors get everything and we get nothing?"
- "How do we split equity between cofounders?" (the most asked question of all, but it is advice; see non-goals)

The last one is why the website calculator (CAP-65) exists: it is the door through which these founders find Capfolder.

## Goals

1. A founder with no company and no folder gets a cap table story, numbers and all, in under a minute: in the app, from their AI, or on the website.
2. **One piece of math, three fronts.** The scenario engine lives in `packages/core`, is pure, and runs in the browser, in Node and in the Tauri webview. The app, the MCP tools, Ask AI and the website all call the same function.
3. A **default path** ("a normal run of rounds") so one number in gives a whole story out. Every default is editable and names its source.
4. **Save what is real.** The part of a scenario that already happened (founders, pool, a SAFE) becomes the founder's cap table through the normal preview → yes flow. The projections (future rounds, the exit) never touch `events.jsonl`.
5. The math is exact, tested like the rest of the engine, and every number can show how it was worked out.

## Non-goals (v1)

- Liquidation preferences, participating preferred, seniority stacks. v1 says plainly that the exit split is "before liquidation preferences, which can change this a lot", and v2 adds a 1x non-participating preference per priced round (the research shows "can founders get nothing" is a top question, so v2 is not far).
- Convertible notes with interest, pro-rata rights, secondaries, down-round anti-dilution, multiple preferred classes with different terms.
- Currency conversion, taxes, runway or burn math ("how much should I raise" is answered as dilution per valuation, not as months of runway).
- A weighted "fair split" score from roles, hours and capital. See "Left to Mads".

## Anti-goals

- **It recommends a number.** Never "raise at $3M". Always "at $3M you keep X%; typical pre-seed caps were $7.5M to $10M in 2025 (Carta)". Sources shown, "should" never said. The product rule (CLAUDE.md: never claim legal, tax or financial advice) applies to valuation advice too.
- **Math outside the engine.** The AI, the website page and the screens display results; they never add up shares themselves.
- **False precision.** Projections round to whole shares at each step and show percentages to one decimal with "about" in prose. Internally the math is exact.
- **A scenario that silently becomes the record.** Saving is explicit, step by step, through the existing previews.

## Constraints

- The folder is the source of truth; projections are not events. Written into `docs/03-data-model.md` as a decision: *a scenario is derived state, never stored in the vault; what the founder saves is the recordable steps, as ordinary events.*
- OCF stays the model for everything saved. A real priced round, when it happens, is recorded with `TX_STOCK_ISSUANCE` for the preferred shares, `TX_CONVERTIBLE_CONVERSION` for each SAFE and `TX_STOCK_PLAN_POOL_ADJUSTMENT` for the top-up. The reducer handles none of these conversions today (CAP-49 item 6). The scenario engine does not need them, and this design does not build them; "Save as my cap table" refuses to save a priced round step and says it is recorded in the app when the round actually closes.
- `packages/core` has no Node imports and must stay that way (the website bundles it for the browser).
- No new dependency for the math. `fast-check` is already a dev dependency and is used for the property tests.
- Every screen change updates its help page (`apps/website/help/pages.json`).

## The model

A **scenario** is a starting point plus an ordered list of steps.

**Starting point**, one of:
- *empty*: no company. The founders are named inside the first step. This is the website and the "no folder" app path.
- *the open company*: the reduced `State` as of today. The desktop app and the MCP tools use this when a company is open.

**Steps**, two kinds:

| Kind | Steps | Exists today | Saved? |
|---|---|---|---|
| Recordable | founders' shares with vesting (or promises before incorporation), option pool, SAFE (amount, cap, discount, MFN), option grant, 409A | yes: `builders.*`, previewed by `appendEvents` | yes, through the normal preview → yes |
| Projection | priced round (new money and a pre- or post-money valuation, **or** just "sells X%"; pool top-up target; SAFEs convert), exit (company value) | no: new, pure math over `State` | never |

A scenario may hold any number of projection steps in a row (seed, A, B, exit). Recordable steps after a projection step are refused: "record the round first".

**Result:** one table per step: holder, shares, fully diluted %, and the change from the step before. The exit step adds proceeds per holder. Every number carries a `math` entry (the formula with the real numbers), the same way `Row.math` does today.

**Two shapes of round.** A round given as new money plus a valuation has a price. A round given only as "sells X%" (the default path is written this way: seed 20%, A 18%) has no price: the new investors get X% of the post-money fully diluted count, the pool top-up is applied first, and SAFEs with a cap convert on the post-money cap method as usual (the math text says "assuming the round prices above the cap"). A discount-only or uncapped SAFE cannot be sized without a price, so a "sells X%" round refuses with "give this round a valuation" when such a SAFE is outstanding. Builder check, 2026-11-06.

**Sweeps** (for "how much should I raise at"): `runScenario` takes an optional `sweep: { step, field, values }` and returns one result per value, so a caller gets the side-by-side in one call and the AI doesn't make fifteen. v1 shows sweeps in the MCP/Ask AI tool and on the website page (a cap sweep is the point of questions 2 and 3); the desktop screen gets them later.

**The unissued pool at an exit** is dropped from the denominator: unissued options are cancelled when a company is sold, so the proceeds go to the people who hold shares and granted options. The result says so. (Fully diluted % elsewhere keeps including the pool, as `docs/03` defines it.)

## The math (v1)

All arithmetic in bigint fractions (`num.ts`), rounding to whole shares only when a step issues shares, the way a real round does. Order inside a **priced round** step:

1. **Company capitalization before the round**, as the YC post-money SAFE defines it (`templates/yc/safe-cap.json`, "Company Capitalization"): all issued shares, all converting securities, all issued and promised options, and the unissued pool **before** any top-up made for this round.
2. **SAFEs convert.** For a post-money SAFE with a cap, the investor's share of that capitalization is exactly `amount ÷ cap`. With several SAFEs, capitalization `C` solves `C = S ÷ (1 − Σ amountᵢ/capᵢ)` where `S` is everything in step 1 except the SAFEs; SAFE *i* gets `C × amountᵢ/capᵢ` shares. A discount-only SAFE converts at `round price × (1 − discount)`. A SAFE with both takes whichever gives more shares. An uncapped, undiscounted SAFE converts at the round price. MFN is ignored in projections (it only matters when later SAFEs have better terms; v1 notes it in the math text).
3. **Pool top-up** to the target unissued pool as a share of the post-money fully diluted count, in the pre-money (the usual term sheet; the research calls this the "option pool shuffle" question). The founder can set the target to the current pool to skip it.
4. **Round price** = pre-money valuation ÷ (shares after 2 and 3). A post-money valuation input is converted: pre = post − new money.
5. **New shares** = new money ÷ round price, rounded down. The investor holds them as one row ("Seed investors").

An **exit** step: proceeds per holder = their share of everything held (shares and granted options; the unissued pool is cancelled, see above) × exit value, with options counted as exercised and their strike ignored (`ponytail:` simplification, named in the result text; v2 nets the strike and adds preferences). The result says "before liquidation preferences".

Tests the builder must write before the math: a golden scenario JSON per case with hand-checked expected tables (one SAFE, three stacked SAFEs at different caps, discount-only, cap and discount, pool top-up in the pre-money, a full default path to exit), plus property tests: every table's percentages sum to 100.0; a founder's share never goes up through a round; a single post-money SAFE at cap `K` with amount `A` holds exactly `A/K` of the capitalization before the round.

## The default path

The "normal situation" is a data file in core (`scenario/benchmarks.ts`), each entry with its source and year, and it is what the engine fills in when the founder gives only a few numbers. From the research (Carta reports, 2024 to 2025; the builder re-checks the figures and the links before shipping):

| Step | Default | Source |
|---|---|---|
| Cofounder split | equal | Carta 2025: 44 to 46% of two-founder teams split 50/50, median 51/49 |
| Pre-seed SAFE | post-money cap $7.5M under $250K raised, $10M up to $1M, $12M to $15M up to $2.5M; sells 10 to 15% | Carta State of Pre-Seed, Q2 2025 |
| Option pool | 10% at pre-seed/seed, topped up to about 12% at seed | Carta 2025/2026 |
| Seed | 20% dilution | Carta 2024 to 2025 medians |
| Series A | 18% | same |
| Series B | 14% | same |
| Series C | 10% | same |
| First hire | about 1.5% | Carta |
| Advisor | 0.25% at pre-seed, 0.15% at seed | Carta, 47K grants |

Each default is a step the founder can change or delete. The page and the tool show the source next to the default, never as a recommendation.

## Where it runs

**Core** (`packages/core/src/scenario/`): `runScenario(start, steps): ScenarioResult`, the benchmarks file, the types. Pure; no I/O.

**MCP and Ask AI, one definition.** Today `apps/desktop/src/chat.ts` (Ask AI) and `packages/capfolder/src/tools/write.ts` (MCP) each define their own tools. Mads (2026-11-05): unify on the capfolder package. The split: `packages/capfolder/src/tools/plans.ts` holds the pure parts of a tool (the zod input schema, the description, and the function that builds the result); `write.ts` keeps the MCP registration, the preview store and the Node file I/O; `chat.ts` imports the same plans and turns the zod schema into the JSON schema its providers want (`z.toJSONSchema`, zod 4). **In this ticket** `plans.ts` is created with `run_scenario` only, defined once as a read-only tool (nothing is written, so no preview id) and registered in both places. Ask AI keeps its documented rule for saving (docs/18: a draft card opens the form prefilled, the founder saves): the scenario's recordable steps come back as draft cards. From the MCP side, saving uses the existing write tools (`promise_shares`, `issue_shares`, `create_option_pool`, `add_safe`), each with its preview → yes. Moving the existing `propose_*` tools onto `plans.ts` is the follow-up ticket "Ask AI runs on the capfolder tool definitions", not this one (builder check, 2026-11-06: it is a refactor of 800 lines with Node closures and would double the work). The skill (`skills/capfolder/SKILL.md`) gets a "play with the numbers" section: run the scenario, show the table, say the sources, offer to save the real part.

**Desktop:** a "Try a scenario" screen. Reachable from Welcome with no folder open (start: empty) and from the cap table with a company open (start: the company). Steps down the left, the table on the right, like the Vesting screen; a "Save as my cap table" button that opens Create company with the founders prefilled and then walks the recordable steps through their existing forms. A help page entry in `pages.json`. Routing and the empty-start state are left to the builder.

**Website** (`/tools/cofounder-split/`, CAP-65): a static page that bundles `@capfolder/core` with the website's existing vite. Inputs: founders and their split (prefilled equal, with the Carta benchmark shown), optional first SAFE (amount and cap), then the default path and an exit value. Output: each founder's share after each step and at the exit, with "show the math", the sources, and one CTA: "Start your cap table with this split" (download the app; later a deep link that prefills Create company). No email gate. The page follows the sub-page template and the site tests' rules (title, description, OG tags, JSON-LD).

Order of work: core → MCP/Ask AI tool (ships fastest, as a capfolder package release) → desktop screen → website page.

Status (2026-11-09): core, the tool and the desktop screen are built (plans 1 and 2, `docs/superpowers/plans/`). The website page (plan 3, CAP-65) is parked by Mads; the "suggested split" question under "Left to Mads" is still open.

## Answering the three questions

1. *"Two cofounders, raise at $2M, normal rounds, $200M exit."* Start empty; founders 50/50 (the founder can change it); a pre-seed SAFE at a $2M post-money cap for the amount the founder names (the AI asks; the page has a field); the default path; an exit at $200M. One table per step and the take-home line.
2. *"How much should I raise my pre-seed at?"* A sweep over the cap ($1M to $15M) for the amount they want: the investor's share, the founders' share after the default path, and their take-home at the exit they name, with the Carta benchmark row marked. No recommendation.
3. *"$50K now, what valuation?"* The same sweep with the amount fixed at $50K.

## Left to the builder

- Types and naming inside `scenario/`; how `ScenarioResult` carries `math`.
- Rounding rules at each step (whole shares; document the choice in the math text).
- The desktop screen's layout, routing and the empty-start state; which existing components to reuse.
- How the website page bundles core (vite entry, output path, cache busting via `bust.mjs`).
- The exact wording of the "before liquidation preferences" and "not advice" lines; the disclaimer from `docs/00-overview.md` applies.
- Re-checking every benchmark figure and link before it ships.

## Left to Mads

1. **The split calculator's "suggested split".** CAP-65 mentions inputs like roles, time commitment and capital. A weighted score is advice-shaped and arguable. This design ships the benchmark split with the founders setting their own numbers. Add the weighted suggestion, clearly labelled "a starting point for the conversation", or leave it out?
2. **Liquidation preferences in v1 or v2?** Leaving them out keeps v1 small; the exit numbers are then optimistic for anyone who has raised preferred. The result says so.

## Open `[verify]`

- `[verify]` the Carta figures and links in the benchmarks table against the reports themselves (the research read them through search snippets; Carta's pages block fetching).
- `[verify]` `z.toJSONSchema` output is accepted by the Anthropic, OpenAI-style and Gemini tool formats `chat.ts` sends; if not, a small adapter in `chat.ts`.
