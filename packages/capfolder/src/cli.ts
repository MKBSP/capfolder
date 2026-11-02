import { homedir } from "node:os";
import { resolve } from "node:path";
import { builders, defaultCtx } from "@capfolder/core";
import { resolveFolder } from "@capfolder/vault";
import { NodeFs } from "@capfolder/vault/src/fs/node";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { agentDeviceId } from "./context";
import { install, realRun } from "./install";
import { createServer, VERSION } from "./server";

const USAGE = `Usage:
  capfolder mcp [--vault <folder>]   connect Claude to your cap table
  capfolder install                  add Capfolder to Claude Code, Codex, Gemini CLI and Cursor
  capfolder --version
`;

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "--version" || cmd === "-v") console.log(VERSION);
else if (cmd === "install") {
  for (const r of await install({ home: homedir(), run: realRun })) {
    const label = { added: "added", already: "already set up", "not found": "not found" }[r.status];
    console.log(`${r.client}: ${label}`);
    if (r.message) console.log(`  ${r.message}`);
  }
  console.log('Ask your AI: "Set up my cap table."');
} else if (cmd === "mcp") {
  const home = homedir();
  const i = rest.indexOf("--vault");
  const folder = i >= 0 ? rest[i + 1] : undefined;
  if (i >= 0 && !folder) {
    console.error("--vault needs a folder.");
    process.exit(1);
  }
  const vault = folder ? resolve(resolveFolder(folder, home)) : undefined;
  const fs = new NodeFs();
  const ctx = {
    ...defaultCtx(await agentDeviceId(fs, home).catch(() => builders.newId("dev"))),
    source: "agent",
  };
  const server = createServer({ fs, home, vault, ctx });
  await server.connect(new StdioServerTransport());
} else {
  console.error(USAGE);
  process.exit(cmd ? 1 : 0);
}
