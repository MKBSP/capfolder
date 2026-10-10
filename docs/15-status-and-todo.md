# 15 · Status, to do, missing things, future ideas

Updated 2026-10-10. Milestones and acceptance tests: `docs/09-build-plan.md`. History: `CHANGELOG.md`.

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
| M2 Import (Pulley/Carta/Cake/OCF) | Next. Blocked on real Pulley exports for the golden test |
| M3 Desktop shell (Tauri) | Not started. Also adds the Tauri build matrix to CI |
| M4 Document sorting · M5 Signing · M6 Export · M7 Updates · M8 Website + launch | Not started |

Target: launch before **Nov 30, 2026**. Pulley shuts down Dec 8.

## To do (outside the code, owner: Mads)
- [ ] Get the pilot company's Pulley exports + every signed PDF **before Dec 8, 2026** (M2 test data).
- [ ] Install CLA Assistant on `MKBSP/capfolder`, pointing at `CLA.md`.
- [ ] Lawyer review of `CLA.md` / `CCLA.md` (incl. explicit "relicense" wording, docs/13).
- [ ] Register capfolder.com; trademark search (USPTO, EUIPO).
- [ ] Apple Developer ID + Windows code-signing certificate (M7).
- [ ] Publish Tally form `rjxQjR` only when real download links exist (`integrations/tally.md`).

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
