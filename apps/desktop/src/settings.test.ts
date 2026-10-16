import { expect, test } from "vitest";
import { backupStatus, suggestedFolders } from "./backup";
import { MemoryFs } from "./fs/memory";
import { addRecent, aiFor, loadSettings, saveSettings } from "./settings";

test("defaults, then round trip", async () => {
  const fs = new MemoryFs();
  const s = await loadSettings(fs, "/app");
  expect(s).toMatchObject({ lock: "none", idleMinutes: 15, telemetry: true, recentVaults: [] });
  expect(s.deviceId).toMatch(/^dev_/);
  await saveSettings(fs, "/app", { ...s, lock: "password" });
  expect((await loadSettings(fs, "/app")).lock).toBe("password");
  expect((await loadSettings(fs, "/app")).deviceId).toBe(s.deviceId);
});
test("a broken settings file falls back to defaults", async () => {
  const fs = new MemoryFs();
  fs.writeSync("/app/settings.json", "{nope");
  expect((await loadSettings(fs, "/app")).lock).toBe("none");
});
test("recent vaults: newest first, no duplicates, max 5", () => {
  let r: { name: string; root: string }[] = [];
  for (const n of ["a", "b", "c", "d", "e", "f", "b"]) r = addRecent(r, { name: n, root: `/v/${n}` });
  expect(r.map((x) => x.name)).toEqual(["b", "f", "e", "d", "c"]);
});
test("backup detection by path", async () => {
  const fs = new MemoryFs();
  const no = async () => false;
  expect(await backupStatus("/Users/me/Library/Mobile Documents/com~apple~CloudDocs/Acme", no)).toEqual({
    backedUp: true,
    by: "iCloud Drive",
  });
  expect(await backupStatus("/Users/me/Dropbox/Acme", no)).toEqual({ backedUp: true, by: "Dropbox" });
  expect(await backupStatus("/Users/me/Library/CloudStorage/GoogleDrive-me@x.com/My Drive/Acme", no)).toEqual(
    { backedUp: true, by: "Google Drive" },
  );
  expect(await backupStatus("/Users/me/Library/CloudStorage/OneDrive-Personal/Acme", no)).toEqual({
    backedUp: true,
    by: "OneDrive",
  });
  fs.mkdirSync("/Users/me/code/.git");
  expect(await backupStatus("/Users/me/code/Acme", (p) => fs.exists(p))).toEqual({
    backedUp: true,
    by: "git",
  });
  expect(await backupStatus("/Users/me/Documents/Acme", (p) => fs.exists(p))).toEqual({ backedUp: false });
});
test("suggested synced folders that exist", async () => {
  const fs = new MemoryFs();
  fs.mkdirSync("/Users/me/Library/Mobile Documents/com~apple~CloudDocs");
  fs.mkdirSync("/Users/me/Dropbox");
  expect(await suggestedFolders("/Users/me", (p) => fs.exists(p))).toEqual([
    { name: "iCloud Drive", path: "/Users/me/Library/Mobile Documents/com~apple~CloudDocs" },
    { name: "Dropbox", path: "/Users/me/Dropbox" },
  ]);
});

test("saves land in the order they were made, even when a write is slow", async () => {
  const fs = new MemoryFs();
  const s = await loadSettings(fs, "/app");
  const write = fs.writeText.bind(fs);
  let first = true;
  fs.writeText = async (p, t) => {
    if (first) {
      first = false;
      await new Promise((r) => setTimeout(r, 30)); // the ping's save, still writing
    }
    return write(p, t);
  };
  await Promise.all([
    saveSettings(fs, "/app", { ...s, telemetry: true }),
    saveSettings(fs, "/app", { ...s, telemetry: false }), // the founder's toggle, a moment later
  ]);
  expect((await loadSettings(fs, "/app")).telemetry).toBe(false);
});

test("one default AI: settings from before Ask AI use the sorting AI everywhere; a different chat AI stays as an override", async () => {
  const old = (ai: object, chat: object) => {
    const fs = new MemoryFs();
    fs.writeSync(
      "/app/settings.json",
      JSON.stringify({ ai: { sortWithAi: true, ...ai }, chat: { cloudDocs: false, open: true, ...chat } }),
    );
    return loadSettings(fs, "/app");
  };
  const lm = { provider: "lmstudio", model: "google/gemma-4-e4b" };
  // only the sorting AI was set: Ask AI uses it too (it used to say "not connected")
  let s = await old(lm, { provider: "", model: "" });
  for (const a of ["sort", "summary", "chat"] as const) expect(aiFor(s, a)).toEqual(lm);
  expect(s.chat).toEqual({ cloudDocs: false, open: true });
  // only a chat AI: it becomes the default
  s = await old({ provider: "", model: "" }, { provider: "anthropic", model: "claude-sonnet-5-5" });
  expect(aiFor(s, "sort")).toEqual({ provider: "anthropic", model: "claude-sonnet-5-5" });
  // both, different: sorting keeps the default, Ask AI keeps its own (Advanced)
  s = await old(lm, { provider: "openai", model: "gpt-5" });
  expect(aiFor(s, "sort")).toEqual(lm);
  expect(aiFor(s, "chat")).toEqual({ provider: "openai", model: "gpt-5" });
  // nothing connected
  s = await old({ provider: "", model: "" }, { provider: "", model: "" });
  expect(aiFor(s, "chat")).toBeNull();
});
