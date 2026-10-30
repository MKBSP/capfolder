import { spawn } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import pkg from "../package.json" with { type: "json" };

export type InstallResult = {
  client: string;
  status: "added" | "already" | "not found";
  message?: string;
};
type Run = (cmd: string, args: string[]) => Promise<number>;

const SPEC = `capfolder@${pkg.version}`;
const ENTRY = { command: "npx", args: ["-y", SPEC, "mcp"] };
const TOML_HEADER = "[mcp_servers.capfolder]";
const TOML_BLOCK = `${TOML_HEADER}\ncommand = "npx"\nargs = ["-y", "${SPEC}", "mcp"]\n`;

/** Real runner: no shell, args as an array; exit code, or 1 if the command can't start. */
export const realRun: Run = (cmd, args) =>
  new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: "ignore" });
    p.on("error", () => resolve(1));
    p.on("close", (code) => resolve(code ?? 1));
  });

const read = (p: string) => readFile(p, "utf8").catch(() => undefined);
const write = async (p: string, s: string) => {
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, s);
};
const has = (dir: string) =>
  stat(dir).then(
    () => true,
    () => false,
  );

async function mergeJson(home: string, client: string, dir: string, file: string): Promise<InstallResult> {
  if (!(await has(join(home, dir)))) return { client, status: "not found" };
  const path = join(home, dir, file);
  const shown = `~/${dir}/${file}`;
  const text = await read(path);
  let json: { mcpServers?: Record<string, unknown> } = {};
  if (text !== undefined) {
    try {
      json = JSON.parse(text);
      if (typeof json !== "object" || json === null || Array.isArray(json)) throw new Error();
    } catch {
      const snippet = JSON.stringify({ mcpServers: { capfolder: ENTRY } });
      return {
        client,
        status: "not found",
        message: `Couldn't read ${shown}; add Capfolder by hand: ${snippet}`,
      };
    }
  }
  if (json.mcpServers?.capfolder) return { client, status: "already" };
  json.mcpServers = { ...json.mcpServers, capfolder: ENTRY };
  await write(path, `${JSON.stringify(json, null, 2)}\n`);
  return { client, status: "added" };
}

const clients: Record<string, (home: string, run: Run) => Promise<InstallResult>> = {
  async claude(_home, run) {
    const client = "Claude Code";
    if ((await run("claude", ["--version"])) !== 0) return { client, status: "not found" };
    if ((await run("claude", ["mcp", "get", "capfolder"])) === 0) return { client, status: "already" };
    const args = ["mcp", "add", "--scope", "user", "capfolder", "--", "npx", "-y", SPEC, "mcp"];
    if ((await run("claude", args)) === 0) return { client, status: "added" };
    return {
      client,
      status: "not found",
      message: `Couldn't run claude; add Capfolder by hand: claude ${args.join(" ")}`,
    };
  },
  async codex(home, run) {
    const client = "Codex";
    const path = join(home, ".codex", "config.toml");
    if (!(await has(join(home, ".codex"))) && (await run("codex", ["--version"])) !== 0) {
      return { client, status: "not found" };
    }
    const text = (await read(path)) ?? "";
    if (/^\s*\[mcp_servers\.capfolder\]/m.test(text)) return { client, status: "already" };
    const sep = text === "" || text.endsWith("\n\n") ? "" : text.endsWith("\n") ? "\n" : "\n\n";
    await write(path, text + sep + TOML_BLOCK);
    return { client, status: "added" };
  },
  gemini: (home) => mergeJson(home, "Gemini CLI", ".gemini", "settings.json"),
  cursor: (home) => mergeJson(home, "Cursor", ".cursor", "mcp.json"),
};

export async function install(opts: { home: string; which?: string[]; run: Run }): Promise<InstallResult[]> {
  const out: InstallResult[] = [];
  for (const [key, fn] of Object.entries(clients)) {
    if (!opts.which || opts.which.includes(key)) out.push(await fn(opts.home, opts.run));
  }
  return out;
}
