import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import pkg from "../package.json" with { type: "json" };
import type { ServerOpts } from "./context";
import { registerReadTools } from "./tools/read";
import { registerWriteTools } from "./tools/write";

export const VERSION = pkg.version;

export function createServer(opts: ServerOpts): McpServer {
  const server = new McpServer({ name: "capfolder", version: VERSION });
  const o = { ...opts }; // a copy: switch_company and create_company change it
  registerReadTools(server, o);
  registerWriteTools(server, o);
  return server;
}
