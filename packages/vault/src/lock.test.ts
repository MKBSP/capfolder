import { mkdtemp, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MemoryFs } from "./fs/memory";
import { NodeFs } from "./fs/node";
import { withFileLock } from "./vault";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "capfolder-lock-"));
});
afterEach(() => rm(dir, { recursive: true, force: true }));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("two NodeFs instances run one after the other", async () => {
  const log: string[] = [];
  const run = (fs: NodeFs, name: string) =>
    withFileLock(fs, dir, async () => {
      log.push(`${name}:start`);
      await sleep(150);
      log.push(`${name}:end`);
    });
  await Promise.all([run(new NodeFs(), "a"), run(new NodeFs(), "b")]);
  expect(log[0]!.endsWith(":start")).toBe(true);
  expect(log[1]).toBe(`${log[0]!.split(":")[0]}:end`);
});

test("a lock file 31 s old is taken over and gone afterwards", async () => {
  const fs = new NodeFs();
  expect(await fs.createExclusive(`${dir}/.capfolder.lock`, "dead")).toBe(true);
  const old = new Date(Date.now() - 31_000);
  await utimes(`${dir}/.capfolder.lock`, old, old);
  let ran = false;
  await withFileLock(fs, dir, async () => {
    ran = true;
  });
  expect(ran).toBe(true);
  expect(await fs.exists(`${dir}/.capfolder.lock`)).toBe(false);
});

test("the lock is removed even when work throws", async () => {
  const fs = new NodeFs();
  await expect(
    withFileLock(fs, dir, async () => {
      throw new Error("boom");
    }),
  ).rejects.toThrow("boom");
  expect(await fs.exists(`${dir}/.capfolder.lock`)).toBe(false);
});

test("gives up with a plain message when the lock stays fresh", async () => {
  const fs = new NodeFs();
  await fs.createExclusive(`${dir}/.capfolder.lock`, "other");
  await expect(withFileLock(fs, dir, async () => 1, { waitMs: 120 })).rejects.toThrow(
    "Another Capfolder window is saving. Try again.",
  );
  expect(await fs.exists(`${dir}/.capfolder.lock`)).toBe(true); // not ours: left alone
});

test("a lock that can't be created falls back to the in-process lock, warning once", async () => {
  class NoLockFs extends MemoryFs {
    async createExclusive(): Promise<boolean> {
      throw new Error("permission denied");
    }
  }
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const fs = new NoLockFs();
  expect(await withFileLock(fs, "/v", async () => "a")).toBe("a");
  expect(await withFileLock(fs, "/v", async () => "b")).toBe("b");
  expect(warn).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});

test("MemoryFs: createExclusive, remove, mtime", async () => {
  const fs = new MemoryFs();
  expect(await fs.mtime("/l")).toBeNull();
  expect(await fs.createExclusive("/l", "x")).toBe(true);
  expect(await fs.createExclusive("/l", "y")).toBe(false);
  expect(await fs.mtime("/l")).not.toBeNull();
  await fs.remove("/l");
  expect(await fs.exists("/l")).toBe(false);
});

test("a stale lock that can't be removed doesn't block saving: work runs under the in-process lock, warning once", async () => {
  class StuckFs extends MemoryFs {
    removes = 0;
    async remove(): Promise<void> {
      this.removes++;
      throw new Error("locked");
    }
  }
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const fs = new StuckFs();
  await fs.createExclusive("/v/.capfolder.lock", "dead");
  let t = Date.now() + 60_000; // the lock is 60 s old; each clock read moves time on
  const now = () => (t += 10);
  expect(await withFileLock(fs, "/v", async () => 1, { waitMs: 100, now })).toBe(1);
  expect(await withFileLock(fs, "/v", async () => 2, { waitMs: 100, now })).toBe(2);
  expect(fs.removes).toBe(2); // one takeover attempt per save, no hot loop
  expect(warn).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});

test("a lock that can't be released after the work doesn't throw out of withFileLock", async () => {
  class NoRemoveFs extends MemoryFs {
    async remove(): Promise<void> {
      throw new Error("locked");
    }
  }
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  expect(await withFileLock(new NoRemoveFs(), "/v", async () => "done")).toBe("done");
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});

test("a lock that stays held never hot-loops: it waits between tries", async () => {
  class CountFs extends MemoryFs {
    tries = 0;
    async createExclusive(p: string, text: string): Promise<boolean> {
      this.tries++;
      return super.createExclusive(p, text);
    }
    async remove(): Promise<void> {} // "removes" but the stale lock stays
  }
  const fs = new CountFs();
  await fs.createExclusive("/v/.capfolder.lock", "dead");
  fs.tries = 0;
  const now = () => Date.now() + 60_000; // the lock always looks 60 s old
  await expect(withFileLock(fs, "/v", async () => 1, { waitMs: 200, now })).rejects.toThrow(
    "Another Capfolder window is saving. Try again.",
  );
  expect(fs.tries).toBeLessThan(10);
});
