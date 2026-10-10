# 15 · Status, to do, missing things, future ideas

Updated 2026-10-10 (after M3). Milestones and acceptance tests: `docs/09-build-plan.md`. History: `CHANGELOG.md`.

## Where the docs are
| Topic | File |
|---|---|
| Requirements (product, decisions, scope) | `docs/00-overview.md`, `docs/02-user-stories.md` (F-01…F-38, the spec) |
| Architecture | `docs/01-architecture.md`, data model `docs/03-data-model.md` |
| Plans | `docs/09-build-plan.md` (milestones), `docs/superpowers/specs/` (design specs), `docs/superpowers/plans/` (implementation plans) |
| Topic specs | import `04`, signing `05`, AI `06`, updates `07`, design system `08` |
| Research, metrics, licensing, brand | `10`, `11`, `13`, `14` |
| Future (do not build yet) | `docs/12-cloud-later.md`, plus "Future ideas" below |

## Status
| Milestone | State |
|---|---|
| M0 Repo + CI | Done 2026-10-10 |
| M1 Core engine | Done 2026-10-10 |
| M3 Desktop shell (Tauri) | Done 2026-10-10 (built before M2, see below) |
| M6 Export (xlsx, lawyer zip) | Next |
| M2 Import | After M6: OCF + generic spreadsheet first; Pulley/Carta/Cake when real files arrive (Mads is collecting testers' exports and template docs) |
| M5 Signing · M4 Document sorting · M7 Updates · M8 Website + launch | Not started |

Order changed 2026-10-10 so the full product can be tested sooner: M3 → M6 → M2 → M5 → M4 → M7 → M8.

Target: launch before **Nov 30, 2026**. Pulley shuts down Dec 8.

## To do (outside the code, owner: Mads)
- [ ] Get the pilot company's Pulley exports + every signed PDF **before Dec 8, 2026** (M2 test data).
- [ ] Install CLA Assistant on `MKBSP/capfolder`, pointing at `CLA.md`.
- [ ] Lawyer review of `CLA.md` / `CCLA.md` (incl. explicit "relicense" wording, docs/13).
- [ ] Register capfolder.com; trademark search (USPTO, EUIPO).
- [ ] Apple Developer ID + Windows code-signing certificate (M7).
- [ ] Publish Tally form `rjxQjR` only when real download links exist (`integrations/tally.md`).

## Missing in the desktop app (M3)
- Not built yet (shown as Coming soon): import (M2), document sorting/OCR (M4), AI and MCP (M4), signing and email verification (M5), xlsx and lawyer zip (M6), updates (M7), Touch ID / Windows Hello (M7).
- Not built, no placeholder: SAFE/share transfer (F-20), merge duplicate people (F-21), replace/rename a document (F-28), two-laptop forks (F-35), rebaseline after an outside edit (F-31), document generation from templates.
- Founder detection is a heuristic (common stock issued on the formation date or with vesting) until stakeholder roles exist.
- Options recorded without a strike are stored at $0 (with a 409A warning).
- Reset of a forgotten app password is manual (remove the "Capfolder" keychain item).
- File scope covers ~/Documents and dialog-picked folders; a vault elsewhere must be opened through the dialog once.

## Missing / known limits (engine)
- Hash chain catches accidental edits only; a rewrite with recomputed hashes is undetected. Needs signing/anchoring.
- `appendEvent` allows making an already-reported problem worse (e.g. a negative pool more negative); only new kinds of problems block.
- Chain doesn't check `seq` continuity or duplicate event ids (duplicates collapse when replayed).
- Exercising options whose vesting is "unknown" skips the exercise ≤ vested check.
- Vesting: only start + month-based relative chains or explicit `vestings[]`. No event triggers, absolute dates, acceleration math, front/back-loaded allocations.
- No SAFE conversion math at a priced round (by design for v1; founder records the result).
- OCF export leaves out `DOCUMENT` objects until documents carry an md5 (M3/M4).
- Fork merge (two devices, F-35) only accepts `prev` arrays structurally.
- Fresh install on an arm64 Mac with an x64 Node needs `pnpm i --force` (rolldown native binding).

## Open `[verify]` items in the docs
- Biometric unlock crate/plugin for Tauri desktop (`01`).
- Documenso enterprise-license features: API, embedded signing (`01`, `02`, `05`, `10`); how it exposes the signature certificate (`05`).
- Captable, Inc. maintenance status for vesting logic reference (`01`). M1 implemented vesting from OCF directly, so this is now low priority.
- Real export headers for Pulley, Carta, Cake (`04`).
- AI CLI flags and vendor terms (`02`, `06`).
- Tauri icon command (`14`).

## Future ideas (not in v1)
- Cloud tier ($50/mo): sync, roles, four-eyes approval (`docs/12`).
- Vault encryption (opt-in).
- Investor/employee logins to see their own holdings.
- Round modeling, waterfalls, 409A; SAFE conversion at a priced round.
- Non-US entity templates (PT Lda, DK ApS, UK Ltd).
- Signed/anchored event log (e.g. signed checkpoints) for real tamper evidence.
- Paid hosted relay; AI credits for people without their own AI.
