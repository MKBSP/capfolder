// App settings live in the OS app-data folder, never in the vault (docs/01).
import { builders } from "@capfolder/core";
import { type Fs, join } from "./fs/types";
import { guessRegion } from "./regions";

export interface Settings {
  deviceId: string;
  lock: "password" | "none";
  idleMinutes: 0 | 5 | 15 | 60; // 0 = only when I quit
  telemetry: boolean; // the anonymous install ping (docs/11), disclosed in the terms; off in Settings → Privacy
  recentVaults: { name: string; root: string }[];
  termsAccepted: string; // TERMS_VERSION the founder accepted; "" = not yet
  region: string; // the founder's country (regions.ts): number format and how typed dates are read
  relayUrl: string; // signing relay (F-37: self-hosted relays welcome)
  email: string; // verified with the relay (F-04); "" = not yet
  signerName: string; // the founder's name on signature pages, when no cap table person has their email
  relayToken: string; // device token from the relay; "" = not verified
  relayTokens: Record<string, string>; // tokens for relays used before (F-37: old envelopes finish on their relay)
  ai: { provider: "" | "ollama" | "lmstudio"; model: string; sortWithAi: boolean }; // F-10, local models only
  ping: { installId: string; firstRunSent: boolean; last: string }; // docs/11, only used while telemetry is on
  updates: "auto" | "ask" | "off"; // F-38: auto downloads in the background; installing always waits for a restart
}

/** The device token for a relay: the current one, or one kept from before a switch. */
export const tokenFor = (s: Settings, relay: string) =>
  relay === s.relayUrl ? s.relayToken : (s.relayTokens?.[relay] ?? "");

export const DEFAULT_RELAY = "https://relay.capfolder.com";

const defaults = (): Settings => ({
  deviceId: builders.newId("dev"),
  lock: "none",
  idleMinutes: 15,
  telemetry: true,
  recentVaults: [],
  termsAccepted: "",
  region: guessRegion(),
  relayUrl: import.meta.env?.DEV ? "http://localhost:8787" : DEFAULT_RELAY,
  email: "",
  relayToken: "",
  relayTokens: {},
  signerName: "",
  ai: { provider: "", model: "", sortWithAi: false },
  updates: "auto",
  ping: { installId: "", firstRunSent: false, last: "" },
});

export async function loadSettings(fs: Fs, dir: string): Promise<Settings> {
  const path = join(dir, "settings.json");
  try {
    if (await fs.exists(path)) return { ...defaults(), ...JSON.parse(await fs.readText(path)) };
  } catch {
    // unreadable settings: start from defaults rather than locking the founder out
  }
  const s = defaults();
  await saveSettings(fs, dir, s);
  return s;
}

let writing: Promise<unknown> = Promise.resolve();
/** Writes one after another, so a slow earlier save can't land after (and undo) a later one. */
export function saveSettings(fs: Fs, dir: string, s: Settings): Promise<void> {
  const text = `${JSON.stringify(s, null, 2)}\n`;
  const next = writing.then(async () => {
    await fs.mkdir(dir);
    await fs.writeText(join(dir, "settings.json"), text);
  });
  writing = next.catch(() => {});
  return next;
}

export const addRecent = (list: Settings["recentVaults"], v: { name: string; root: string }) =>
  [v, ...list.filter((x) => x.root !== v.root)].slice(0, 5);
