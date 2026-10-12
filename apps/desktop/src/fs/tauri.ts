import * as tfs from "@tauri-apps/plugin-fs";
import type { Fs } from "./types";

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
};
