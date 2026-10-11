// Everything that needs the Tauri runtime, behind one object, so screens can be tested with a fake.
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { appDataDir, documentDir, homeDir } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { browserOcr, type Ocr } from "./docread";
import { tauriFs } from "./fs/tauri";
import type { Fs } from "./fs/types";

export interface Platform {
  fs: Fs;
  appDataDir(): Promise<string>;
  homeDir(): Promise<string>;
  documentDir(): Promise<string>;
  pickFolder(title: string): Promise<string | null>;
  pickFile(title: string, extensions?: string[]): Promise<{ path: string; name: string } | null>;
  pickFiles(title: string): Promise<{ path: string; name: string }[]>;
  /** Local OCR for scans and photos (F-09). */
  ocr: Ocr;
  saveText(defaultName: string, text: string): Promise<string | null>;
  saveBytes(defaultName: string, bytes: Uint8Array): Promise<string | null>;
  reveal(path: string): Promise<void>;
  /** Network calls: the signing relay, and a local AI (Ollama / LM Studio on localhost) if the founder connects one. */
  fetch(url: string, init?: RequestInit): Promise<Response>;
  /** Opens a link in the founder's browser (Documenso's signing page). */
  openUrl(url: string): Promise<void>;
  /** F-10: a request to Ollama/LM Studio on this computer (through Rust: those servers don't allow the app's origin). */
  localAi(
    port: number,
    method: "GET" | "POST",
    path: string,
    body?: string,
    timeoutMs?: number,
  ): Promise<{ status: number; body: string }>;
  /** F-38: signed app updates from GitHub Releases. */
  updater: {
    version(): Promise<string>;
    check(): Promise<AppUpdate | null>;
    relaunch(): Promise<void>;
  };
  lock: {
    set(password: string): Promise<void>;
    verify(password: string): Promise<boolean>;
    isSet(): Promise<boolean>;
    clear(): Promise<void>;
  };
}

export interface AppUpdate {
  version: string;
  notes: string;
  download(): Promise<void>;
  /** On Windows the installer takes over and the app quits, so call this only when the founder chose to restart. */
  install(): Promise<void>;
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
  pickFiles: async (title) => {
    const r = await open({
      multiple: true,
      title,
      filters: [{ name: "Documents", extensions: ["pdf", "png", "jpg", "jpeg"] }],
    });
    return (Array.isArray(r) ? r : r ? [r] : []).map((p) => ({
      path: p,
      name: p.split(/[\\/]/).at(-1) ?? p,
    }));
  },
  ocr: browserOcr,
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
  fetch: (url, init) => window.fetch(url, init),
  openUrl: (url) => openUrl(url),
  localAi: (port, method, path, body, timeoutMs = 120_000) =>
    invoke("local_ai", { port, method, path, body: body ?? null, timeoutMs }),
  updater: {
    version: () => getVersion(),
    check: async () => {
      const u = await check();
      return u
        ? {
            version: u.version,
            notes: u.body ?? "",
            download: () => u.download(),
            install: () => u.install(),
          }
        : null;
    },
    relaunch: () => relaunch(),
  },
  lock: {
    set: (password) => invoke("lock_set", { password }),
    verify: (password) => invoke<boolean>("lock_verify", { password }),
    isSet: () => invoke<boolean>("lock_is_set"),
    clear: () => invoke("lock_clear"),
  },
};
