import { homedir } from "node:os";
import { resolve } from "node:path";
import { defaultCtx } from "@capfolder/core";
import { resolveFolder } from "@capfolder/vault";
import { NodeFs } from "@capfolder/vault/src/fs/node";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer, VERSION } from "./server";

const INSTALL = `To use Capfolder from Claude Code, run:

  claude mcp add capfolder -- npx -y capfolder mcp

To use it from Claude Desktop, add this to claude_desktop_config.json under "mcpServers":

  "capfolder": { "command": "npx", "args": ["-y", "capfolder", "mcp"] }

Then ask Claude: "Show my cap table".
`;
const USAGE = `Usage:
  capfolder mcp [--vault <folder>]   connect Claude to your cap table
  capfolder install                  how to add Capfolder to Claude
  capfolder --version
`;

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "--version" || cmd === "-v") console.log(VERSION);
else if (cmd === "install") console.log(INSTALL);
else if (cmd === "mcp") {
  const home = homedir();
  const i = rest.indexOf("--vault");
  const folder = i >= 0 ? rest[i + 1] : undefined;
  if (i >= 0 && !folder) {
    console.error("--vault needs a folder.");
    process.exit(1);
  }
  const vault = folder ? resolve(resolveFolder(folder, home)) : undefined;
  const server = createServer({ fs: new NodeFs(), home, vault, ctx: defaultCtx("agent") });
  await server.connect(new StdioServerTransport());
} else {
  console.error(USAGE);
  process.exit(cmd ? 1 : 0);
}
