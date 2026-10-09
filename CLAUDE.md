# CLAUDE.md — Capfolder

You are building **Capfolder**: an open-source (AGPL-3.0), local-first cap table app. It replaces Pulley, which shuts down on Dec 8, 2026.

The company's cap table lives in a **folder of plain files** on the founder's computer. Only unsigned documents ever touch a server (the signing relay), and only until they're signed.

## Read first, in this order
1. `docs/00-overview.md`: what we're building and the decisions already made
2. `docs/02-user-stories.md`: 38 founder stories (F-01 to F-38) with flows. **This is the spec.**
3. `docs/01-architecture.md`: repo layout, stack, components
4. `docs/03-data-model.md`: vault folder, event log, OCF mapping, invariants, vesting math
5. The topic you're working on: `04-import.md`, `05-signing.md`, `06-ai.md`, `07-updates-and-rules-pack.md`, `08-design-system.md`
6. `docs/09-build-plan.md`: milestones and acceptance tests. Work in this order.
   `docs/11-metrics.md`: what launch tracks. `docs/12-cloud-later.md`: **do not build**, but follow its "rules the MVP must already follow".
7. `design/`: open `design/index.html` in a browser. Every screen is plain HTML. Match the layout and copy.
8. `fixtures/acme-vault/`: golden test vault. The engine must reproduce `captable.expected.csv` exactly.

## Non-negotiable rules
- **The folder is the source of truth.** `events.jsonl` is append-only and hash-chained. Never rewrite or delete a line. Fixes are new events (correction, reversal).
- **Use OCF (Open Cap Table Format)** for the data model. Don't invent cap-table concepts OCF already defines. If OCF is silent, write down the decision in `docs/03-data-model.md`.
- **Prefer existing open-source code over writing our own**: OCF schemas, Documenso, PDF.js, pdf-lib, tesseract.js, exceljs, the MCP SDK, Tauri plugins. Check the license is compatible with AGPL-3.0 before adding a dependency.
- **The math must be right.** The golden tests in `fixtures/` gate CI. Every number in the UI can explain itself ("show the math").
- **AI proposes, the founder confirms.** No AI output is written to the event log without an explicit user click.
- **Never claim legal advice.** The disclaimer text is in `docs/00-overview.md`. YC SAFE templates are used unmodified. Every other document is "attach your own".
- **Everything works offline** except sending and receiving signatures.
- Keep the UI as simple as the mockups: the cap table is the home screen, plain language, any action one click away.

## Commands (to create in M0)
```
pnpm i
pnpm test          # unit + golden tests
pnpm dev:desktop   # tauri dev
pnpm dev:web       # website
pnpm dev:relay     # relay api + documenso via docker compose
```

## Marked items
`[verify]` means a detail is not yet confirmed (an API flag, an endpoint name, an export column). Check the official docs or real files before relying on it, then remove the marker.
