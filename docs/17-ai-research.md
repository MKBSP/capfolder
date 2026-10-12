# AI and MCP for cap tables: research (2026-10-12)

## What others ship
- **Carta**: a hosted MCP server (`mcp.app.carta.com/mcp`, OAuth). It reads cap tables, grants, convertibles, waterfalls and 409As. Carta says it is read-only. https://mcp.so/servers/carta
- **Ledgy**: a read-only MCP (Claude, ChatGPT, Cursor, Codex) and a Ledgy Agent that writes. The agent offboards, drafts transactions and sends documents for signing, and every action needs human approval. A separate "via Agent" audit log records those actions. https://ledgy.com/ai-equity-management
- **AngelList Link** (July 2026): fund data inside Claude and ChatGPT, read-only. **Mantle Clerk**: an assistant.
- Pulley, Cake, Eqvista and Capbase: no public AI or MCP found.
- **Pattern:** read-only MCP, writes the user approves, and an audit trail.
- **OCF:** no MCP server or AI tooling exists. Capfolder would be the first.

## Plan for Capfolder (fits "AI proposes, the founder confirms")
1. **AGENTS.md in every vault, plus a CLAUDE.md that imports it.** It covers the folder layout, OCF, and "never edit events.jsonl, write proposals". Claude Code, Cowork, Codex and Cursor then work with it immediately.
2. **A small stdio MCP server** (the MCP SDK is already on our list).
   - Read tools: `get_captable`, `list_events`, `search_docs`, `model_dilution`. The math runs in our engine, not in the LLM.
   - One write tool, `propose_event`. It validates and writes to `proposals/`. The founder confirms in the app, and only then is the event appended.

## The three founder tasks
- **"Prepare 3 SAFEs, explain MFN first."**
  - Needs: the unmodified YC templates (the MFN version has no cap or discount), investor names and amounts, and deterministic stacking math.
  - Output: drafts plus proposals, never filed automatically.
- **"Chase my investor."**
  - Needs: the contact and the signature status.
  - It drafts only. The founder sends.
- **"ESOP exercise window after someone leaves."**
  - Needs: full-text search of the plan and of the individual grant (the grant can override the plan), and the termination date and reason.
  - Always quote the clause and the page.

## Risks
- Invented legal or tax answers: keep the disclaimer and always cite the source.
- Cloud LLMs read the PDFs: offer Ollama, and say what leaves the machine.
- Prompt injection from PDFs: treat document text as data, and require a confirmation before any send or write.
- SAFE conversion math is a known way LLMs fail: compute it in code.
