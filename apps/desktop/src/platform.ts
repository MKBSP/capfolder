// Everything that needs the Tauri runtime, behind one object, so screens can be tested with a fake.
import { invoke } from "@tauri-apps/api/core";
import { appDataDir, documentDir, homeDir } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { tauriFs } from "./fs/tauri";
import type { Fs } from "./fs/types";

export interface Platform {
  fs: Fs;
  appDataDir(): Promise<string>;
  homeDir(): Promise<string>;
  documentDir(): Promise<string>;
  pickFolder(title: string): Promise<string | null>;
  pickFile(title: string, extensions?: string[]): Promise<{ path: string; name: string } | null>;
  saveText(defaultName: string, text: string): Promise<string | null>;
  saveBytes(defaultName: string, bytes: Uint8Array): Promise<string | null>;
  reveal(path: string): Promise<void>;
  lock: {
    set(password: string): Promise<void>;
    verify(password: string): Promise<boolean>;
    isSet(): Promise<boolean>;
    clear(): Promise<void>;
  };
}

const strip = (p: string) => p.replace(/[\\/]$/, "");

export const tauriPlatform: Platform = {
  fs: tauriFs,
  appDataDir: async () => strip(await appDataDir()),
  homeDir: async () => strip(await homeDir()),
  documentDir: async () => strip(await documentDir()),
  pickFolder: async (title) => {
    // recursive: the picked folder AND everything under it joins the fs scope (a vault has docs/<type>/ subfolders)
    const r = await open({ directory: true, multiple: false, recursive: true, title });
    return typeof r === "string" ? r : null;
  },
  pickFile: async (title, extensions) => {
    const r = await open({
      multiple: false,
      title,
      filters: [
        extensions
          ? { name: "Exports", extensions }
          : { name: "Documents", extensions: ["pdf", "png", "jpg", "jpeg"] },
      ],
    });
    return typeof r === "string" ? { path: r, name: r.split(/[\\/]/).at(-1) ?? r } : null;
  },
  saveText: async (defaultName, text) => {
    const path = await save({ defaultPath: defaultName });
    if (!path) return null;
    await tauriFs.writeText(path, text);
    return path;
  },
  saveBytes: async (defaultName, bytes) => {
    const path = await save({ defaultPath: defaultName });
    if (!path) return null;
    await tauriFs.writeBytes(path, bytes);
    return path;
  },
  reveal: (path) => revealItemInDir(path),
  lock: {
    set: (password) => invoke("lock_set", { password }),
    verify: (password) => invoke<boolean>("lock_verify", { password }),
    isSet: () => invoke<boolean>("lock_is_set"),
    clear: () => invoke("lock_clear"),
  },
};
