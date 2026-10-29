# Agentic Capfolder: the "use it from your AI" journey (design)

Date: 2026-10-29 · Linear project: Agentic Capfolder (M1–M4, CAP-46, CAP-50 to CAP-58) · Builds on `docs/21-agentic.md`, which stays the technical reference (tools, preview → confirm, risks). This document decides the **user journey** and the **v1 scope**.

## Why
Founders already live in their AI. Page E promises "run your cap table and fundraise from Claude, ChatGPT, Gemini, Ollama, Grok or your own AI". Today only the desktop app exists. This project makes the promise true, one honest step at a time.

## Two doors on the website
1. **Download the app.** Today's flow, unchanged. Afterwards, Settings → AI gets **"Connect your AI"**. It shows the same install commands as door 2, pointed at the folder the app already uses.
2. **Use it from your AI.** The founder picks their AI and runs one command. The AI installs Capfolder's engine, asks the setup questions in chat and creates the folder. The desktop app is optional and offered at the end.

Both doors create and open **the same plain-file folder**. A founder can start in chat and open the app later, or the other way round. (Mads, 2026-10-29)

## Which AIs, when
| | v1 (local, command or file) | Later (needs our hosted connection, CAP-58) |
|---|---|---|
| Claude Code | ✅ plugin from our own marketplace | Official listings, once the hosted connection exists: the Claude connectors directory and the ChatGPT app directory. Both need an online server, OAuth, a test account and a review. |
| Codex | ✅ one command | |
| Gemini CLI | ✅ one command; listed in the Gemini extensions gallery by tagging the repo | |
| Claude Desktop | ✅ `.mcpb` file, double-click | |
| ChatGPT, claude.ai in the browser | ❌ shown as **"Coming"** | ✅ |

Mads (2026-10-29): v1 is the command route only. ChatGPT and claude.ai wait for the hosted connection. That ties in with the developer certificates (code signing), which come later anyway.

## The journey (founder, door 2)
1. **Website:** "Use it from your AI" → pick the AI (tabs) → copy one command, or download the `.mcpb` for Claude Desktop.
2. **Install:** the command adds the Capfolder plugin/extension. Nothing else to set up by hand. Node 22+ is needed for Codex and Gemini CLI (their users already have it). Claude Code and Claude Desktop run it for them.
3. The founder types **"Set up my cap table."** The Capfolder skill takes over and asks, one question at a time:
   1. **"Do you already have a company?"**
      - **Yes:** company name, country/state, and incorporation date.
      - **No:** the planned name. The incorporation date stays empty, and What's missing lists it. *(our call)*
   2. **"Where should the folder live?"** Default `~/Documents/Capfolder/<Company>`. The AI creates it: `capfolder.json`, `events.jsonl`, `AGENTS.md`, `docs/`.
   3. **"Do you have a Capfolder Pro account?"** In v1 this is one line: "Pro is coming. You're on Free, which has everything here." No login. *(Pro isn't built.)*
   4. **The three setup questions** from the app: SAFEs? Option pool? Priced round? They decide which steps follow.
   5. **Founders and vesting:** the AI proposes shares and vesting and shows a preview of the cap table. **Nothing is written until the founder says yes.**
   6. **"Do you have documents already?"** The founder points to PDFs. The AI proposes what each one proves, and files them after a yes.
   7. **Email for signatures (M2):** the AI logs in to the relay with an email code, so it can send SAFEs and grants for signature (5 a month on Free). In M1 the AI says signing comes next and skips this step.
   8. **"Want to see it on screen?"** The AI offers the desktop app download link. It opens the same folder.
   9. **"Do you want others to see their own documents or vesting?" (M3):** "Share with Steve" creates a read-only invite scoped to Steve. Steve installs Capfolder in his own AI and connects with it. In M1 and M2 the AI says this is coming and skips it.
4. **After setup:** the founder keeps asking. "What's missing?", "Issue a $50k SAFE to Bill Gates at an $8M cap", "How much has Steve vested?". Every change goes preview → yes.

## Stakeholder access and Free vs Pro (Mads, 2026-10-29)
- **Free:** stakeholders reach their documents only while the founder's laptop is on and online. When it's off, they see "Acme's folder is offline".
- **Pro:** an encrypted copy online, so stakeholders always have access, plus a web app for stakeholders. Later, stakeholder access may become Pro-only.
- Every chat AI connection (Claude, ChatGPT, Gemini…) is on Free and Pro alike (decision on CAP-58).

## Milestones (as in Linear)
- **M1 · Founder in chat (local):** steps 1–6 and 8. Read tools, write tools with preview → confirm, install paths for the four v1 AIs, website tabs updated. CAP-46, CAP-49, CAP-50, CAP-51, CAP-52.
- **M2 · Signing and email from chat:** step 7. Send, track and collect; chase after 3 days; stakeholder emails. CAP-53, CAP-54, CAP-55.
- **M3 · Team and diligence:** step 9 (laptop-on stakeholder access through the relay), someone leaves, encrypted export for lawyers (SMS for the password later). CAP-56, CAP-57. Blocked by the security review (CAP-37).
- **M4 · Beyond the laptop (Pro):** the hosted connection for ChatGPT and claude.ai, official directory listings, Pro sync, backup and the stakeholder web app. CAP-58, CAP-16.

## Goals (v1 = M1)
- From a fresh laptop with Claude Code, "Set up my cap table" gets a founder to a correct cap table in under 10 minutes.
- Setting up the golden `fixtures/acme-vault` entirely by chat reproduces `captable.expected.csv` exactly.
- The app opens a folder the agent made, and the agent works on a folder the app made, with no conversion.

## Non-goals (v1)
- ChatGPT and claude.ai in the browser, and official directory listings that need a hosted server.
- Signing, stakeholder access, Pro, logins.
- An agent-only feature the app doesn't have.

## Anti-goals (a failure even if it works)
- The AI writes anything without the founder's yes, or does any math itself instead of the engine.
- The website shows an install path that doesn't work yet (page E's ChatGPT tab must say "Coming").
- Selling it as "an MCP server". The pitch is "Run your cap table from your AI".
- Text that sounds like legal advice.

## Constraints
- The engine and the folder rules are shared with the app: `packages/core`, plus the vault/signing code moved behind a Node `fs` platform (see docs/21 "Architecture"). One hash chain, one set of invariants, the same golden tests.
- The rules in `CLAUDE.md` apply: OCF, append-only events, AI proposes and the founder confirms, not legal advice, offline except signing.
- AGPL-3.0. Dependencies must have compatible licences.

## Our calls (Mads can overrule)
- **One npm package, `capfolder`.** `npx -y capfolder mcp` runs the server, and `npx capfolder install` sets up whichever AI it finds. The Codex command becomes `codex mcp add capfolder -- npx -y capfolder mcp`. This replaces `@capfolder/mcp` in docs/21 and on page E.
- **Website tabs:** Claude Code, Claude Desktop, Codex, Gemini CLI, Desktop app; ChatGPT shown as "Coming". The skills.sh and `npx capfolder install` tabs are kept.
- **No company yet:** we still create the folder (step 3.1).
- **Folder default:** `~/Documents/Capfolder/<Company>`.
- **Claude Desktop:** we ship the `.mcpb` from GitHub Releases. Directory listing comes later.
- **How the server finds the folder:** `~/.capfolder/companies.json` lists every company folder with a `current` entry. `create_company` adds to it. The app adds every folder it opens to the same list, so door 1 needs no path in its command. With more than one company, the AI asks which one at the start ("switch to Acme" changes `current`). A `--vault <folder>` flag still overrides this.
- **The founder's yes:** where the client supports MCP elicitation, the server asks the founder directly. Elsewhere (e.g. Codex, Gemini CLI), the AI shows the preview and calls again with `confirm: true` and the preview id after the founder says yes. Both are allowed. The preview id expires after 10 minutes, and it stops working if the folder changes in between.
- **App and agent open at the same time:** M1 adds a cross-process lock file (`.capfolder.lock`, created exclusively, removed after each append), used by both the app and the agent. This prevents a forked hash chain.
- **Website tabs in v1 (page E only; the live homepage changes when a variant is chosen):**
  - Shown: Claude Code, Claude Desktop, Codex, Gemini CLI, `npx capfolder install` (covers Claude Code, Codex, Gemini CLI and Cursor; Cursor is just a JSON file, so it's included) and Desktop app.
  - ChatGPT shows "Coming".
  - The skills.sh tab comes off until the skill can install the engine itself.
- **The golden check:** a scripted CI test drives the MCP tools (no LLM) to rebuild `fixtures/acme-vault` and must match `captable.expected.csv` exactly. M1 needs write tools for every event type the fixture uses. A real Claude Code session runs by hand before each release.
- **"Connect your AI" in the app is part of M1:** a Settings → AI section with the same copyable commands as the website. The app doesn't bundle or launch the server. It replaces the old toggle in `design/app/AiConnect.html`.
- **npm name:** `capfolder` is free on npm. The private root workspace gets renamed so it doesn't clash.

## Left to the builder
The tool signatures (docs/21 lists them), how the skill words each question, packaging details for `.mcpb` and the Gemini extension manifest, and the npm publish setup (provenance, pinned versions).
