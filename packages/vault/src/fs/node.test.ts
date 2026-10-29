import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { NodeFs } from "./node";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "capfolder-nodefs-"));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

test("round-trip: write, read, append, exists, list, rename, mkdir recursive, bytes, symlink", async () => {
  const fs = new NodeFs();
  await fs.mkdir(`${dir}/a/b`);
  expect(await fs.exists(`${dir}/a/b`)).toBe(true);
  await fs.writeText(`${dir}/a/b/x.txt`, "hi");
  await fs.appendText(`${dir}/a/b/x.txt`, " there");
  expect(await fs.readText(`${dir}/a/b/x.txt`)).toBe("hi there");
  await fs.writeBytes(`${dir}/a/y.bin`, new Uint8Array([1, 2, 3]));
  expect([...(await fs.readBytes(`${dir}/a/y.bin`))]).toEqual([1, 2, 3]);
  expect((await fs.list(`${dir}/a`)).sort()).toEqual(["b", "y.bin"]);
  await fs.rename(`${dir}/a/y.bin`, `${dir}/z.bin`);
  expect(await fs.exists(`${dir}/a/y.bin`)).toBe(false);
  expect(await fs.exists(`${dir}/z.bin`)).toBe(true);
  expect(await fs.isSymlink(`${dir}/z.bin`)).toBe(false);
  expect(await fs.isSymlink(`${dir}/nope`)).toBe(false);
});

test("createExclusive: true once, then false; remove and mtime", async () => {
  const fs = new NodeFs();
  expect(await fs.mtime(`${dir}/l`)).toBeNull();
  expect(await fs.createExclusive(`${dir}/l`, "1")).toBe(true);
  expect(await fs.createExclusive(`${dir}/l`, "2")).toBe(false);
  expect(await fs.readText(`${dir}/l`)).toBe("1");
  expect(Math.abs((await fs.mtime(`${dir}/l`))! - Date.now())).toBeLessThan(5000);
  await fs.remove(`${dir}/l`);
  expect(await fs.exists(`${dir}/l`)).toBe(false);
});
