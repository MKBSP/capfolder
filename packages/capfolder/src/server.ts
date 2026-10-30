import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import pkg from "../package.json" with { type: "json" };
import type { ServerOpts } from "./context";
import { registerReadTools } from "./tools/read";

export const VERSION = pkg.version;

export function createServer(opts: ServerOpts): McpServer {
  const server = new McpServer({ name: "capfolder", version: VERSION });
  registerReadTools(server, { ...opts }); // a copy: switch_company changes it
  return server;
}
