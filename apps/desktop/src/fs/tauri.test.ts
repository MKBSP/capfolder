import { expect, test, vi } from "vitest";

// a dangling link: exists() follows it (false), lstat() sees the link itself
vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: async () => false,
  lstat: async (p: string) => {
    if (p === "/v/missing") throw new Error("No such file");
    return { isSymlink: true };
  },
}));
const { tauriFs } = await import("./tauri");

test("isSymlink sees a dangling link; a missing path is false", async () => {
  expect(await tauriFs.isSymlink("/v/AGENTS.md")).toBe(true);
  expect(await tauriFs.isSymlink("/v/missing")).toBe(false);
});
