# M4 · Document sorting (F-09, F-10, F-26) — design

Goal (docs/09): drop a folder of PDFs/scans, ≥80% auto-filed correctly, the rest in "Needs you", **0 filed against the wrong row**.
Mockups: `design/app/ImportReview.html` (review one), `Documents.html`, `AiConnect.html`.

## Pipeline (one file)
```
bytes → sha256 (duplicate? skip) → text (PDF.js text layer; empty → OCR with tesseract.js, local)
      → classify: rules → kNN over confirmed docs → AI (if connected) → else "Needs you"
      → extract fields (regex per type; AI fills gaps if connected)
      → match to a cap-table row → contradiction check → auto-file (rules/kNN only) | Needs you | skip (not equity)
```

## Core (pure, `packages/core/src/sort/`)
- `classify(text)` → `{ type, by: "rule", rule } | null`. Rules are phrase sets per type, title phrases weighted in the first 600 chars, ordered so a grant notice that mentions the plan is still a grant. Types = the existing `DOC_TYPES` plus `not_equity` (invoice/receipt words and no equity words).
- `extract(type, text)` → fields with page-independent regexes. YC SAFE: investor, purchase amount, date, post-money cap, discount (YC's "Discount Rate" is 100 − discount), company. Grant notice: optionee, shares, exercise price, grant date. SPA: purchaser, shares, price. 83(b): taxpayer, shares, transfer date. CIIAA: employee. Board consent / plan / certificate / bylaws: date, company. A field that is present but unparsable is `"unreadable"`.
- `nearest(tokens, corpus)` → type when ≥4 of the 5 nearest confirmed docs agree (cosine over term counts, sim ≥ 0.35). `ponytail:` bag of words, not embeddings; switch to `embed()` when a local model is connected.
- `matchDoc(type, fields, state)` → `{ targets[], suggestion?, reasons[], problems[] }`.
  - SAFE → convertibles; grant → equity; SPA / 83(b) → stock; CIIAA → individual person; plan → plan; consent → plan named in it + grants whose holder and share count appear in it; certificate / bylaws → company (name must match the issuer).
  - Auto only when exactly one row matches on the number (amount or shares, exact), the name matches exactly after normalizing or through an alias, the date is within ±3 days when both are known, and no other extracted field contradicts the row (cap, discount, strike).
  - A number match with a different name gives a **suggestion**, never a link. A row that already has a document of that type is a problem (a second copy is never auto-filed).
- Aliases: `stakeholder_alias` app event `{ stakeholder_id, alias }` (the reducer already accepts the type); reduce collects `state.aliases` (normalized name → id). Confirming in review with "Remember" writes one.

## Desktop
- `docread.ts`: `readText(bytes, name)` → `{ text, ocr }`. PDFs: text layer; pages with almost no text are rendered with PDF.js and OCR'd. Images: OCR. tesseract.js worker, core and `eng` data are bundled (served from the app, never a CDN). CSP gains `'wasm-unsafe-eval'`.
- `ai.ts` (F-10): local providers only in M4 — Ollama (`/api/tags`, `/api/chat` with JSON format) and LM Studio (`/v1/models`, `/v1/chat/completions`). `classifyAndExtract(text)` asks for one JSON object; the answer is validated (type in the list, numbers parse) or dropped. The document text is sent as data. **AI never files anything** (CLAUDE.md: no AI output in the log without a click): a document typed or filled by AI always lands in Needs you with the AI's proposal prefilled and labelled.
- Settings → AI: detects both, choose a model, "Use AI when sorting documents". CLIs (Claude Code, Codex, Gemini), API keys, MCP and chat stay "Coming soon" (they need the shell plugin and the cloud privacy toggle).
- `sorting.json` in app data: the kNN corpus (`sha256`, type, term counts) of confirmed docs. Never in the vault (it's per-device learning).
- **Sort screen** (route `sort`): pick files or a folder (folder walks pdf/png/jpg/jpeg, skipping `docs/` of the open vault). Each file is shown live: Filed → `docs/<type>/…` (linked), Needs you, Duplicate (skipped), Not equity (skipped, not copied). Summary at the end.
- **Review** (ImportReview.html): one at a time. Text on the left, then the proposed type, fields (each "matches X" / "differs from cap table" / "unreadable"), proposed holding (pick any), "Remember: '<name>' is <holder>", buttons Confirm & file / Not an equity document / Skip. Unmatched SAFE: "Add to cap table" opens New SAFE prefilled. "How this was sorted" lists the steps actually taken.
- Filing reuses `attachDocument` with `fields` and `flags` (`sorted:rule|knn|ai|founder`, `ocr`). Original name kept; the original file is never touched.
- Entry points: Documents → "Add documents" goes to Sort (single-file Attach stays for "Attach" on one checklist row); StartChoice "I only have documents" goes to Sort.

## Not in M4 (recorded in docs/15)
Signature detection (drafts look like signed docs), terms diff against the YC template (needs the template), drag-and-drop onto the window (Tauri fs scope for dropped paths), CLI/API AI providers, MCP server, chat panel, F-28 replace/rename.

## Tests
- Core golden: `fixtures/acme-docs/*.txt` (synthetic Acme folder: YC SAFE, Angel A's own paper, Fund X as "Fund X Ventures I, L.P.", grant notices, SPAs, 83(b), CIIAAs, board consent, plan, certificate, bylaws, a receipt, a conflicting SAFE) → ≥80% auto, 0 wrong, the rest Needs you with the right suggestion.
- Unit: rules order, YC discount rate, unreadable fields, ±3 days, alias match, existing-doc problem, kNN 4-of-5.
- Desktop: Sort screen end to end with real pdf-lib PDFs and the fake platform; review confirm writes alias + doc; AI validation rejects bad JSON; OCR on a PNG in Node (tesseract.js with the bundled data).
