import { MemoryFs } from "../fs/memory";
import type { Platform } from "../platform";

/** A Platform for UI tests: memory files, a fake keychain, scripted dialogs. */
export function fakePlatform(
  opts: {
    password?: string;
    pickFolder?: string;
    pickFile?: { path: string; name: string };
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
  const platform: Platform = {
    fs,
    appDataDir: async () => "/appdata",
    homeDir: async () => "/home/me",
    documentDir: async () => "/home/me/Documents",
    pickFolder: async () => opts.pickFolder ?? null,
    pickFile: async () => opts.pickFile ?? null,
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
  return { platform, fs, saved, savedBytes, opened };
}
