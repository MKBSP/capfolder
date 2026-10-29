import type { Fs } from "@capfolder/vault";
import * as tfs from "@tauri-apps/plugin-fs";

/** Real file access through @tauri-apps/plugin-fs (scoped in src-tauri/capabilities). */
export const tauriFs: Fs = {
  readText: (p) => tfs.readTextFile(p),
  writeText: (p, t) => tfs.writeTextFile(p, t),
  appendText: (p, t) => tfs.writeTextFile(p, t, { append: true }),
  readBytes: (p) => tfs.readFile(p),
  writeBytes: (p, b) => tfs.writeFile(p, b),
  exists: (p) => tfs.exists(p),
  mkdir: (p) => tfs.mkdir(p, { recursive: true }),
  list: async (p) => (await tfs.readDir(p)).map((e) => e.name),
  rename: (a, b) => tfs.rename(a, b),
  // lstat, not exists: exists follows the link, so a dangling one would read as "no file"
  isSymlink: (p) =>
    tfs.lstat(p).then(
      (s) => s.isSymlink,
      () => false,
    ),
  // createNew: fails if the path exists in any form. The plugin's error text isn't a stable API, so
  // existence is checked first (false) and any later throw is a real failure the caller falls back on.
  createExclusive: async (p, t) => {
    if (await tfs.exists(p)) return false;
    try {
      await tfs.writeTextFile(p, t, { createNew: true });
      return true;
    } catch (e) {
      if (await tfs.exists(p)) return false; // lost a race to another writer
      throw e;
    }
  },
  remove: (p) => tfs.remove(p),
  // lstat (already permitted), not stat; a missing path is null
  mtime: (p) =>
    tfs.lstat(p).then(
      (s) => s.mtime?.getTime() ?? null,
      () => null,
    ),
};
