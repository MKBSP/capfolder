import { appendFile, lstat, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import type { Fs } from "./types";

const missing = (e: unknown) => (e as { code?: string }).code === "ENOENT";

/** Fs on node:fs/promises, for the agent (MCP server) and tests. Not exported from the index: the app bundle stays free of node:. */
export class NodeFs implements Fs {
  readText = (p: string) => readFile(p, "utf8");
  writeText = (p: string, t: string) => writeFile(p, t);
  appendText = (p: string, t: string) => appendFile(p, t);
  readBytes = async (p: string) => new Uint8Array(await readFile(p));
  writeBytes = (p: string, b: Uint8Array) => writeFile(p, b);
  exists = (p: string) =>
    lstat(p).then(
      () => true,
      () => false,
    );
  mkdir = async (p: string) => {
    await mkdir(p, { recursive: true });
  };
  list = (p: string) => readdir(p);
  rename = (a: string, b: string) => rename(a, b);
  isSymlink = (p: string) =>
    lstat(p).then(
      (s) => s.isSymbolicLink(),
      () => false,
    );
  remove = (p: string) => rm(p, { force: true });
  mtime = (p: string) =>
    lstat(p).then(
      (s) => s.mtimeMs,
      (e) => {
        if (missing(e)) return null;
        throw e;
      },
    );
  async createExclusive(p: string, text: string) {
    try {
      await writeFile(p, text, { flag: "wx" });
      return true;
    } catch (e) {
      if ((e as { code?: string }).code === "EEXIST") return false;
      throw e;
    }
  }
}
