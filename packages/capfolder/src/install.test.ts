import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";
import pkg from "../package.json" with { type: "json" };
import { install } from "./install";

const spec = `capfolder@${pkg.version}`;
let home: string;
let calls: string[][];
const run = async (cmd: string, args: string[]) => {
  calls.push([cmd, ...args]);
  return args[1] === "get" ? 1 : 0; // capfolder not yet registered with claude
};
const none = async () => 1;
const read = (p: string) => readFile(join(home, p), "utf8");
const exists = (p: string) =>
  read(p).then(
    () => true,
    () => false,
  );

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "capfolder-install-"));
  calls = [];
});

describe("install", () => {
  test("Claude Code: runs claude mcp add pinned to this version", async () => {
    const r = await install({ home, which: ["claude"], run });
    expect(r).toEqual([{ client: "Claude Code", status: "added" }]);
    expect(calls).toContainEqual([
      "claude",
      "mcp",
      "add",
      "--scope",
      "user",
      "capfolder",
      "--",
      "npx",
      "-y",
      spec,
      "mcp",
    ]);
  });

  test("Claude Code: already registered is left alone", async () => {
    const r = await install({ home, which: ["claude"], run: async () => 0 });
    expect(r).toEqual([{ client: "Claude Code", status: "already" }]);
  });

  test("Gemini and Cursor: merge entry, keep existing keys", async () => {
    for (const d of [".gemini", ".cursor"]) await mkdir(join(home, d));
    await writeFile(
      join(home, ".gemini/settings.json"),
      '{"theme":"x","mcpServers":{"other":{"command":"o"}}}',
    );
    await writeFile(join(home, ".cursor/mcp.json"), "{}");
    const r = await install({ home, which: ["gemini", "cursor"], run: none });
    expect(r.map((x) => x.status)).toEqual(["added", "added"]);
    const g = JSON.parse(await read(".gemini/settings.json"));
    expect(g.theme).toBe("x");
    expect(g.mcpServers.other).toEqual({ command: "o" });
    expect(g.mcpServers.capfolder).toEqual({ command: "npx", args: ["-y", spec, "mcp"] });
    expect(JSON.parse(await read(".cursor/mcp.json")).mcpServers.capfolder.args).toEqual(["-y", spec, "mcp"]);
    expect((await read(".cursor/mcp.json")).endsWith("\n")).toBe(true);
    const again = await install({ home, which: ["gemini", "cursor"], run: none });
    expect(again.map((x) => x.status)).toEqual(["already", "already"]);
  });

  test("Cursor with dir but no file creates it", async () => {
    await mkdir(join(home, ".cursor"));
    await install({ home, which: ["cursor"], run: none });
    expect(JSON.parse(await read(".cursor/mcp.json")).mcpServers.capfolder.command).toBe("npx");
  });

  test("Codex: appends block once, keeps the rest", async () => {
    await mkdir(join(home, ".codex"));
    await writeFile(join(home, ".codex/config.toml"), 'model = "x"\n');
    const [a] = await install({ home, which: ["codex"], run: none });
    const [b] = await install({ home, which: ["codex"], run: none });
    expect([a?.status, b?.status]).toEqual(["added", "already"]);
    const t = await read(".codex/config.toml");
    expect(t.startsWith('model = "x"\n')).toBe(true);
    expect(t.match(/\[mcp_servers\.capfolder\]/g)).toHaveLength(1);
    expect(t).toContain(`args = ["-y", "${spec}", "mcp"]`);
    expect(t).toContain('command = "npx"');
    expect(t.endsWith("\n")).toBe(true);
  });

  test("Codex found via PATH creates config", async () => {
    const [r] = await install({ home, which: ["codex"], run });
    expect(r?.status).toBe("added");
    expect(await read(".codex/config.toml")).toContain("[mcp_servers.capfolder]");
  });

  test("missing client: not found, nothing written", async () => {
    const r = await install({ home, run: none });
    expect(r.map((x) => x.status)).toEqual(["not found", "not found", "not found", "not found"]);
    for (const f of [".gemini/settings.json", ".cursor/mcp.json", ".codex/config.toml"])
      expect(await exists(f)).toBe(false);
  });

  test("invalid JSON is not overwritten", async () => {
    await mkdir(join(home, ".gemini"));
    await writeFile(join(home, ".gemini/settings.json"), "{ nope");
    const [r] = await install({ home, which: ["gemini"], run: none });
    expect(r?.status).toBe("not found");
    expect(r?.message).toContain("Couldn't read ~/.gemini/settings.json; add Capfolder by hand: ");
    expect(await read(".gemini/settings.json")).toBe("{ nope");
  });
});
