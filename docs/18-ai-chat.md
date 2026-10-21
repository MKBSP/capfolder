# 18 · AI chat (plan, decided 2026-10-16)

## Decisions (Mads)
- **Where:** a prominent "✦ Ask AI" button in the top bar (and ⌘K) opens a **collapsible side panel** on the right, like Gemini in Gmail: the same button (or Esc / ×) closes it and the screen takes the full width again. While open it stays open across screens and knows what screen/person/document you're on.
- **Which AIs:** local (Ollama, LM Studio: default, private, free) **plus cloud API keys** (Claude, OpenAI, Gemini). Keys live in the OS keychain, never in the vault.
- **Powers:** **answer + propose.** Answers cite their source (holding, event, document path). Actions come back as a **draft card** (new grant, new SAFE, vesting settings, attach a template) that the founder confirms. Nothing reaches `events.jsonl` without a click (CLAUDE.md rule).

## How it works
- The AI gets **tools, not files**: read-only tools over the reduced cap table (holdings, people, vesting as of a date, documents list, a document's text) and "propose" tools that return validated drafts (same builders the forms use). Mirrors the MCP tools in `docs/06`.
- **Privacy:** cloud providers get structured cap-table data. Document text goes to a cloud provider only when Settings → AI → "Let cloud AI read documents" is on (the existing setting in `docs/06`). Local models get everything.
- Document text is always wrapped as data (prompt-injection rule in `docs/06`); drafts must validate or are dropped.
- Small local models (e.g. gemma 4B) get the read tools only and a "for drafting, connect a bigger model" note when tool calls fail.

## First version (scope)
1. Button + panel + provider settings (local + Claude/OpenAI/Gemini keys).
2. Read tools; answers with source links.
3. Propose tools: grant, SAFE, person, vesting schedule. Draft card → opens the existing form prefilled → founder saves.
4. Template match for a proposed grant/SAFE: name the template from the marketplace, or say "No template for this; have a lawyer draft it." (dev plan item 11).

## Later
- Doc → settings: drop a vesting plan / ESOP and the chat proposes the matching OCF settings (dev plan item 11).
- Chat history per company (kept in app data, not the vault).
- AI included for Pro (hosted model, no setup).

## Status (2026-10-16): first version built
- Header "✦ Ask AI" button, ⌘K/Ctrl+K, Esc and × toggle a right side panel (`components/AskAi.tsx`); open/closed is kept in app settings. It stays open across screens and shows "Looking at: …".
- Settings → AI → Ask AI: Claude / OpenAI / Gemini with your own API key (kept in the OS keychain via `ai_key_set`/`ai_key_get`, never in settings.json), or Ollama / LM Studio on this computer. "Let cloud AI read documents" is off by default.
- `chat.ts`: two wire formats (Anthropic messages; OpenAI-style chat completions for OpenAI, Gemini's OpenAI endpoint, Ollama and LM Studio). Read tools: cap_table (as of a date), people, whats_missing, documents, document_text (filed documents only; local models, or cloud with the toggle on). Propose tools: grant, SAFE, person, vesting schedule, option pool; each draft is checked by building the real events (nothing written) and opens the usual form prefilled (`route.prefill`).
- Templates on drafts: YC SAFE by terms (`ycSafeFor`), Cooley GO grant notice / plan; acceleration or no matching YC SAFE → amber "No template… have a lawyer draft it".
- A local model that refuses tools gets a one-shot cap-table summary and a "connect a bigger model" note.
- Not yet: chat history is in memory per company (lost on restart); streaming answers; doc → plan settings are proposed but only the pool size/name reach the form.

## "What needs my attention?" + Take me there (built 2026-10-21)
- **The list:** at most 3 items, the most urgent first.
  - **Where they come from:** Capfolder's own data, never the AI's guess (`attention()` in `chat.ts`). Signed SAFEs still waiting for wire instructions come first, then documents waiting for signatures, then What's missing gaps grouped by kind (red before amber).
  - **The rest:** counted in a note that points to What's missing.
- **No AI needed:** the question is answered locally, so it also works with no AI connected. The panel shows a "What needs my attention?" button.
- **Take me there:**
  - opens the screen (Cap table, the person, or Signatures);
  - pulses the row there for about 2 seconds, held still when the computer asks for reduced motion;
  - rows carry `data-focus` (holding/plan id on the Cap table, envelope id on Signatures).
- **Safety:** `safeGoto` whitelists the screens and only accepts a person, holding, plan or envelope that exists. The AI never navigates by itself: only a click moves you.
- **Not yet:** the AI model can't return its own Take me there links (a `go_to` tool); its answers keep their source buttons.
- **Not yet:** option-deadline items, which wait on the option-deadlines feature.
