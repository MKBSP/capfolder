import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const text = (p: string) => readFileSync(root + p, "utf8");
const json = (p: string) => JSON.parse(text(p));
const { version } = json("packages/capfolder/package.json");
const pinned = `capfolder@${version}`;
const DISCLAIMER =
  "Capfolder is software, not a law firm. It does not give legal, tax or financial advice. Templates come from public sources such as Y Combinator and are provided as is. Have a lawyer review your documents.";

describe("manifests", () => {
  test("all parse and pin the package version", () => {
    const mcp = json("plugin/.mcp.json").mcpServers.capfolder;
    expect([mcp.command, ...mcp.args]).toEqual(["npx", "-y", pinned, "mcp"]);
    const gem = json("gemini-extension.json");
    expect(gem.name).toBe("capfolder");
    expect(gem.contextFileName).toBe("GEMINI.md");
    expect([gem.mcpServers.capfolder.command, ...gem.mcpServers.capfolder.args]).toEqual([
      "npx",
      "-y",
      pinned,
      "mcp",
    ]);
    const mcpb = json("packages/capfolder/mcpb/manifest.json");
    expect(mcpb.version).toBe(version);
    expect(mcpb.server.type).toBe("node");
    expect(mcpb.server.entry_point).toBe("dist/cli.js");
    expect(mcpb.server.mcp_config).toEqual({
      command: "node",
      args: ["${__dirname}/dist/cli.js", "mcp"],
    });
    expect(json("plugin/.claude-plugin/plugin.json").name).toBe("capfolder");
    expect(json("plugin/.claude-plugin/plugin.json").version).toBe(version);
  });

  test("marketplace points at the plugin", () => {
    const m = json(".claude-plugin/marketplace.json");
    expect(m.name).toBe("capfolder");
    expect(m.plugins).toEqual([expect.objectContaining({ name: "capfolder", source: "./plugin" })]);
  });
});

describe("skill", () => {
  const skill = text("skills/capfolder/SKILL.md");
  test("has every question, in order, and the disclaimer", () => {
    const parts = [
      "Do you already have a company?",
      "Where should the folder live?",
      "call `create_company` with the name",
      "Pro is coming. You're on Free, which has everything here.",
      "set_setup_answers",
      "Do you have documents already?",
      "Signing from chat is next; for now use the app or ask me again soon",
      "Want to see it on screen?",
      "https://capfolder.com/#download",
      "Do you want others to see their own documents or vesting?",
    ];
    const at = parts.map((p) => skill.indexOf(p));
    expect(at.map((i, k) => (i < 0 ? parts[k] : null)).filter(Boolean)).toEqual([]);
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(skill).toContain(DISCLAIMER);
    expect(skill).toContain("https://capfolder.com/guides/before-you-found/");
  });
  test("never says MCP server", () => {
    expect(skill).not.toMatch(/MCP server/i);
  });
  test("the plugin's copy is identical", () => {
    expect(text("plugin/skills/capfolder/SKILL.md")).toBe(skill);
  });
  test("GEMINI.md carries the skill", () => {
    expect(text("GEMINI.md")).toContain(skill.replace(/^---[\s\S]*?---\n/, "").trim());
  });
});
