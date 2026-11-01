import { expect, test, vi } from "vitest";

// a dangling link: exists() follows it (false), lstat() sees the link itself
vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: async (p: string) => p === "/v/.capfolder.lock",
  writeTextFile: async (_p: string, _t: string, o: { createNew?: boolean }) => {
    if (o.createNew !== true) throw new Error("must be createNew");
  },
  lstat: async (p: string) => {
    if (p === "/v/missing") throw new Error("No such file");
    return { isSymlink: true, mtime: new Date(5000) };
  },
}));
const invoke = vi.fn(async (_cmd: string, _args: unknown) => undefined);
vi.mock("@tauri-apps/api/core", () => ({ invoke: (cmd: string, args: unknown) => invoke(cmd, args) }));
const { tauriFs } = await import("./tauri");

test("isSymlink sees a dangling link; a missing path is false", async () => {
  expect(await tauriFs.isSymlink("/v/AGENTS.md")).toBe(true);
  expect(await tauriFs.isSymlink("/v/missing")).toBe(false);
});

test("createExclusive is false when the file exists, true when created with createNew", async () => {
  expect(await tauriFs.createExclusive("/v/.capfolder.lock", "x")).toBe(false);
  expect(await tauriFs.createExclusive("/v/new.lock", "x")).toBe(true);
});

test("mtime comes from lstat; a missing path is null", async () => {
  expect(await tauriFs.mtime("/v/.capfolder.lock")).toBe(5000);
  expect(await tauriFs.mtime("/v/missing")).toBeNull();
});

test("remove only releases the vault lock, through the release_vault_lock command", async () => {
  await tauriFs.remove("/v/.capfolder.lock");
  expect(invoke).toHaveBeenCalledWith("release_vault_lock", { root: "/v" });
  // the message is read directly: under jsdom, rejects.toThrow(string) reads a cross-realm Error's message as ""
  const e = await tauriFs.remove("/v/events.jsonl").then(
    () => null,
    (x: Error) => x.message,
  );
  expect(e).toBe("remove not supported");
  expect(invoke).toHaveBeenCalledTimes(1);
});
