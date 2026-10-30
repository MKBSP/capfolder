# capfolder

Run your [Capfolder](https://capfolder.com) cap table from Claude and other AI assistants. Your AI asks the setup questions in chat and keeps your cap table in a plain folder on your laptop. The Capfolder desktop app opens the same folder.

## Install

Pick your AI:

- **Claude Code:** `/plugin marketplace add MKBSP/capfolder`, then `/plugin install capfolder@capfolder`
- **Codex:** `codex mcp add capfolder -- npx -y capfolder mcp`
- **Gemini CLI:** `gemini extensions install https://github.com/MKBSP/capfolder`
- **Claude Desktop:** download `capfolder.mcpb` from the [latest capfolder release](https://github.com/MKBSP/capfolder/releases) and double-click it

Or run `npx capfolder install` to set up whichever of Claude Code, Codex, Gemini CLI and Cursor it finds. Needs Node 22 or later.

Then ask your AI: "Set up my cap table."

## AI proposes, you confirm

Your AI can read your cap table at any time. Before it changes anything, it shows you what will change, and it only writes after you say yes.

## Disclaimer

Capfolder is software, not a law firm. It does not give legal, tax or financial advice. Templates come from public sources such as Y Combinator and are provided as is. Have a lawyer review your documents.

## License

AGPL-3.0-only. See LICENSE. Bundled third-party code is listed in THIRD_PARTY_NOTICES.md.
