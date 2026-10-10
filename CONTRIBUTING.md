# Contributing to Capfolder

## Build and test
```
pnpm i
pnpm test && pnpm typecheck && pnpm lint
```

## Rules
- The golden tests in `fixtures/` gate CI. Never edit an expected output to make a test pass; fix the engine.
- `events.jsonl` is append-only. Fixes are new events (correction, reversal), never edits.
- Use the Open Cap Table Format (OCF) for anything OCF defines. Record decisions where OCF is silent in `docs/03-data-model.md`.
- New dependencies must have an AGPL-compatible license (`pnpm licenses:check`).
- Read `CLAUDE.md` for the full list of non-negotiable rules.

## CLA
Your first pull request asks you to sign the Contributor License Agreement (`CLA.md`) through CLA Assistant. Contributing for a company? See `CCLA.md`.
