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
  // The default AI, for every AI action (F-10 sorting, document summaries, docs/18 Ask AI). Cloud keys live in the OS
  // keychain (platform.aiKey), never here.
  ai: { provider: "" | AiProvider; model: string; sortWithAi: boolean };
  aiFor: Partial<Record<AiAction, AiPick>>; // Settings → AI → Advanced: an action that doesn't use the default
  chat: {
    cloudDocs: boolean; // cloud AI may read document text (off: cap-table data only)
    open: boolean; // the Ask AI side panel
  };
  ping: { installId: string; firstRunSent: boolean; last: string }; // docs/11, only used while telemetry is on
  updates: "auto" | "ask" | "off"; // F-38: auto downloads in the background; installing always waits for a restart
}

export type AiProvider = "ollama" | "lmstudio" | "anthropic" | "openai" | "gemini";
export type AiPick = { provider: AiProvider; model: string };
export type AiAction = "sort" | "summary" | "chat";

/** The AI an action uses: its Advanced choice, else the default. Null when no AI is connected. */
export const aiFor = (s: Settings, action: AiAction): AiPick | null =>
  s.aiFor?.[action] ?? (s.ai.provider ? { provider: s.ai.provider, model: s.ai.model } : null);

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
  aiFor: {},
  chat: { cloudDocs: false, open: false },
  updates: "auto",
  ping: { installId: "", firstRunSent: false, last: "" },
});

export async function loadSettings(fs: Fs, dir: string): Promise<Settings> {
  const path = join(dir, "settings.json");
  try {
    if (await fs.exists(path)) return migrate({ ...defaults(), ...JSON.parse(await fs.readText(path)) });
  } catch {
    // unreadable settings: start from defaults rather than locking the founder out
  }
  const s = defaults();
  await saveSettings(fs, dir, s);
  return s;
}

/** Before one default AI, Ask AI had its own provider in `chat`: it becomes the default, or an override if both differ. */
function migrate(s: Settings & { chat: Settings["chat"] & { provider?: string; model?: string } }): Settings {
  const { provider, model, ...chat } = s.chat;
  const next: Settings = { ...s, chat, aiFor: s.aiFor ?? {} };
  if (provider) {
    const pick = { provider: provider as AiProvider, model: model ?? "" };
    if (!s.ai.provider) next.ai = { ...s.ai, ...pick };
    else if (s.ai.provider !== provider || s.ai.model !== pick.model)
      next.aiFor = { chat: pick, ...next.aiFor };
  }
  return next;
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
