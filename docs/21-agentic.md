# 21 · Agentic Capfolder (design draft, for Mads to review)

Status: **draft, nothing built.** Linear: CAP-46. Mads decides when to build, after the website and content work.

## The idea in one paragraph
Capfolder with no app window. A founder installs the Capfolder plugin in Claude Code or Claude Desktop and types "set up my cap table". Claude installs the small Capfolder backend and walks them through it:
- pick a folder and name the company;
- add cofounders and their vesting;
- sort the documents they already have;
- issue a SAFE from the YC template;
- send it for signature through our relay, with the same 5 free requests a month.

The folder is the same plain-file folder the desktop app uses, so a founder can switch between the app and the agent at any time. Later, a cofounder or employee installs the same plugin and sees only their own documents, served from the founder's laptop.

Pitch: **"The first cap table you run by talking to Claude."** Never "an MCP server"; that's how it works, not what we sell.

## The founder's first 10 minutes
1. In Claude Code: `/plugin marketplace add MKBSP/capfolder`, then `/plugin install capfolder@capfolder`. In Claude Desktop: open the Capfolder extension file (`.mcpb`).
2. "Set up my cap table." The skill asks where the folder goes and the company name, then creates the folder: `capfolder.json`, `events.jsonl`, `AGENTS.md`, `docs/`.
3. Claude asks the three setup questions (SAFEs? option pool? priced round?), the same as the app's onboarding.
4. "Who are the founders?" Claude proposes the shares and vesting, shows a preview of the cap table, and **the founder says yes before anything is written.**
5. "Do you have documents already?" Claude reads the PDFs the founder points to, proposes which row each one proves, and files them after a yes.
6. "Issue a $50k SAFE to Bill Gates at an $8M cap." Claude fills the YC post-money SAFE, saves the draft PDF in `drafts/`, and shows what changed.
7. "Send it." Claude logs in to the relay (email code), sends the envelope, and reports who has signed. When it's done, Claude files the signed PDF and records it.

## Architecture
Everything new lives in one sub-project, `agent/`. It reuses the engine instead of copying it.

```
agent/
  mcp/        @capfolder/mcp: Node MCP server (stdio), the "lightweight backend"
  plugin/     Claude Code plugin: skill (SKILL.md) + .mcp.json pointing at npx @capfolder/mcp
  desktop/    Claude Desktop extension (.mcpb) built from mcp/
```

- **Engine:** `packages/core` already runs in plain TypeScript (OCF, event log, vesting, gaps, CSV and OCF export, pdf-lib). It gets published to npm as `@capfolder/core` with a build step. Today it's private and ships as TS source.
- **Vault and signing code:** the desktop app's `vault.ts`, `signing.ts`, `templates.ts` and `onboarding.ts` talk to the disk through a `Platform` interface (`apps/desktop/src/fs/`). Today there are two implementations: Tauri and in-memory. We add a third, **Node `fs`**, and move these files into a shared package. Then the agent and the app write the folder with the same code, which keeps the hash chain and the invariants identical.
- **Install:** `npx -y @capfolder/mcp --vault <folder>`. "Claude installs the backend" means the plugin's `.mcp.json` runs that command, so there's nothing to set up by hand. Node 22+ is needed (Claude Code users have it; the Desktop extension bundles its own).
- **The rules file:** the vault already gets an `AGENTS.md`. The agent version reads it, and it stays the contract for any other AI.

## Tools (MCP)
**Read (no confirmation):**
- `get_cap_table(as_of?)`, `list_people()`, `get_person(id)`
- `get_vesting(id)`, `get_gaps()` (What's missing)
- `list_documents()`, `read_document(path)`
- `signature_status()`

**Write: two steps, always.** Each write tool takes `confirm: false` first and returns a preview: the exact events and the cap table after. Only a second call with `confirm: true` and the same preview id writes anything. The skill tells Claude to show the preview and wait for the founder's yes. Where the client supports MCP elicitation, the server asks the founder directly, so even a misbehaving agent can't skip the yes.
- `create_company(folder, name, …)`
- `add_person`, `issue_shares`, `add_grant`, `add_safe`
- `file_document(path, proves)`
- `draft_safe(investor, amount, cap, discount?, mfn?, pro_rata?)` writes `drafts/…pdf` only
- `relay_login(email)` / `relay_verify(code)`
- `send_for_signature(draft, signers)`, which counts against the 5 a month
- `collect_signed()`: fetch, verify, file and record

**Never as tools:** editing or deleting events, moving files in `docs/`, legal answers. Those are the same rules as `AGENTS.md`.

## Stakeholders reading their own documents (phase 3)
- **Founder:** "Share with Steve." This creates an invite scoped to Steve's own shares, grants, SAFEs and signed PDFs: read-only, revocable, and logged.
- **Steve:** installs the same plugin and runs "connect to Acme" with the invite. His agent reaches the founder's laptop through our relay as a tunnel. The relay forwards encrypted requests and stores nothing.
- **The founder approves** each new device once.
- **Free:** laptop to laptop only. If the founder's laptop is asleep, Steve sees "Acme's folder is offline".
- **Pro ($50/month):** an encrypted copy synced to our servers, so Steve can read it any time, plus sync between the founder's own computers.
- **To research before building** (from `docs/15`):
  - MCP authorization (OAuth 2.1) for remote servers, and which clients support it;
  - the tunnel design and its abuse limits;
  - per-person scoping;
  - prompt injection through documents.

## Phases
1. **Founder, local only.** Node platform, `@capfolder/mcp` with the read tools and the write tools with previews, the plugin skill for setup. No network. The test: set up the golden `fixtures/acme-vault` entirely by chat and reproduce `captable.expected.csv` exactly.
2. **Signing.** Relay login and send/collect from the agent, with the same relay, limits and verification as the app.
3. **Stakeholder access** through the relay tunnel (free, laptop on).
4. **Pro:** sync and the encrypted backup, which keeps stakeholder access working when the laptop is off.

## Risks
- **The math must stay right.** Every write goes through the same engine and golden tests as the app. The agent never computes the cap table itself; it reads `captable.csv`.
- **AI proposes, founder confirms** (CLAUDE.md). The two-step write tools plus elicitation enforce it in the server, not only in the prompt.
- **Prompt injection through PDFs:** document text is returned as data. No tool can be triggered by text inside a document, because every write needs the founder's yes.
- **Supply chain:** we publish to npm with provenance, pin versions in the plugin, and give the Desktop extension a checksum.
- **Not legal advice:** the skill repeats the app's disclaimer, and only the YC templates are used unmodified.

## Questions for Mads
1. Is phase 1 (local only, no relay) enough to announce, or do we wait for signing (phase 2)?
2. Claude Code only at first, or Claude Desktop at the same time? Desktop reaches non-technical founders, but packaging the extension is extra work.
3. The npm name `@capfolder/mcp`: OK, or is `capfolder` (one CLI with an `mcp` subcommand, as `docs/06` sketched) better?
4. Stakeholder access needs the relay to become a tunnel. That makes the security review (CAP-37) a blocker for phase 3. OK?
