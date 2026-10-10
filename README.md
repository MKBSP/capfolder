# Capfolder

Your cap table, in a folder you own. Issue SAFEs and options, track vesting, collect signatures. Open source, local-first.

> Capfolder is software, not a law firm. It does not give legal, tax or financial advice. Templates come from public sources such as Y Combinator and are provided as is. Have a lawyer review your documents.

## Status
M0 (repo + CI) and M1 (core engine) are done. Next: M2 import. Status, to do, known limits and future ideas: `docs/15-status-and-todo.md`. History: `CHANGELOG.md`.

## Docs
- Requirements: `docs/00-overview.md`, `docs/02-user-stories.md`
- Architecture: `docs/01-architecture.md`, `docs/03-data-model.md`
- Plans: `docs/09-build-plan.md`, `docs/superpowers/specs/`, `docs/superpowers/plans/`
- Future: `docs/12-cloud-later.md`, `docs/15-status-and-todo.md`

## Commands
```
pnpm i            # on Apple Silicon with an x64 Node, use: pnpm i --force
pnpm test         # unit + golden tests
pnpm typecheck
pnpm lint
```

## Layout
```
packages/core/    OCF event log, hash chain, reducer, vesting, invariants, exports (pure TypeScript)
fixtures/         golden vaults + expected outputs (they gate CI)
docs/             product spec, data model, build plan (start with docs/00-overview.md)
design/           clickable HTML mockups (open design/index.html)
brand/            logo and favicon
```

## License
AGPL-3.0 (see `LICENSE`). Contributions need a CLA (`CLA.md`, `CCLA.md` for companies); CLA Assistant asks on your first pull request. Third-party licenses: `THIRD_PARTY_LICENSES.md`.

## To do outside the code
- Get the pilot company's Pulley exports and every signed PDF before Dec 8, 2026.
- Apple Developer ID and a Windows code-signing certificate (needed for M7).
- Install CLA Assistant on MKBSP/capfolder, pointing at `CLA.md`.
- Have a lawyer review `CLA.md` / `CCLA.md`.
- Register capfolder.com and run a trademark search (USPTO, EUIPO).
