import { MemoryFs } from "../fs/memory";
import type { Platform } from "../platform";

/** A Platform for UI tests: memory files, a fake keychain, scripted dialogs. */
export function fakePlatform(
  opts: {
    password?: string;
    pickFolder?: string;
    pickFile?: { path: string; name: string };
    pickFiles?: { path: string; name: string }[];
    /** What OCR "reads" from an image or a scanned page. */
    ocrText?: string;
    /** What the updater finds; installs are recorded in `updates`. */
    update?: { version: string; notes: string } | null;
    /** Where relay calls go (see fakeRelay); without one the app is "offline". */
    relay?: { fetch(url: string, init?: RequestInit): Promise<Response> };
  } = {},
) {
  const fs = new MemoryFs();
  fs.mkdirSync("/home/me/Documents");
  fs.mkdirSync("/appdata");
  let password = opts.password;
  const saved: Record<string, string> = {};
  const savedBytes: Record<string, Uint8Array> = {};
  const opened: string[] = [];
  const updates: string[] = [];
  const platform: Platform = {
    fs,
    appDataDir: async () => "/appdata",
    homeDir: async () => "/home/me",
    documentDir: async () => "/home/me/Documents",
    pickFolder: async () => opts.pickFolder ?? null,
    pickFile: async () => opts.pickFile ?? null,
    pickFiles: async () => opts.pickFiles ?? [],
    ocr: { image: async () => opts.ocrText ?? "", pdfPage: async () => opts.ocrText ?? "" },
    saveText: async (name, text) => {
      saved[name] = text;
      return `/home/me/Downloads/${name}`;
    },
    saveBytes: async (name, bytes) => {
      savedBytes[name] = bytes;
      return `/home/me/Downloads/${name}`;
    },
    reveal: async () => {},
    fetch: (url, init) =>
      opts.relay ? opts.relay.fetch(url, init) : Promise.reject(new TypeError("Failed to fetch")),
    openUrl: async (url) => {
      opened.push(url);
    },
    localAi: async (port, method, path, body) => {
      if (!opts.relay) throw new Error("connection refused");
      const r = await opts.relay.fetch(`http://localhost:${port}${path}`, { method, body });
      return { status: r.status, body: await r.text() };
    },
    updater: {
      version: async () => "0.1.0",
      check: async () => {
        updates.push("check");
        const u = opts.update;
        return u
          ? {
              ...u,
              download: async () => void updates.push(`download ${u.version}`),
              install: async () => void updates.push(`install ${u.version}`),
            }
          : null;
      },
      relaunch: async () => void updates.push("relaunch"),
    },
    lock: {
      set: async (p) => {
        password = p;
      },
      verify: async (p) => p === password,
      isSet: async () => password !== undefined,
      clear: async () => {
        password = undefined;
      },
    },
  };
  return { platform, fs, saved, savedBytes, opened, updates };
}
