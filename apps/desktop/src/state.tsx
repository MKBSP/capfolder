// App-wide state: settings, the open vault, the as-of date and navigation. Screens read core-derived views from here.
import { type AppendCtx, builders, type EventDraft, MAX_DATE, reduce, type State } from "@capfolder/core";
import { createContext, type ReactNode, useContext, useMemo, useState } from "react";
import { todayIso } from "./fmt";
import type { Platform } from "./platform";
import type { Settings } from "./settings";
import { appendToVault, type Vault } from "./vault";

export type Route =
  | { name: "welcome" | "email" | "create" | "start" | "wizard" | "home" | "people" | "documents" }
  | { name: "newSafe" | "newGrant" | "newShares" | "pool" | "newPerson" | "signatures" | "settings" }
  | { name: "person"; id: string }
  | { name: "comingSoon"; title: string; milestone: string; text?: string };

export interface App {
  platform: Platform;
  settings: Settings;
  setSettings(s: Settings): Promise<void>;
  vault: Vault | null;
  setVault(v: Vault | null): void;
  asOf: string;
  setAsOf(d: string): void;
  /** State as of the chosen date (what the screens show). */
  state: State | null;
  /** State with every event, for picking new ids and form defaults. */
  latest: State | null;
  ctx: AppendCtx;
  /** Append drafts to the vault. Returns null on success, or the plain-language errors. */
  run(drafts: EventDraft[]): Promise<string[] | null>;
  route: Route;
  go(r: Route): void;
}

const Ctx = createContext<App | null>(null);
export const useApp = (): App => {
  const a = useContext(Ctx);
  if (!a) throw new Error("useApp outside <AppProvider>");
  return a;
};

export function AppProvider(p: {
  platform: Platform;
  settings: Settings;
  saveSettings(s: Settings): Promise<void>;
  initialVault: Vault | null;
  initialRoute: Route;
  children: ReactNode;
}) {
  const settings = p.settings; // owned by <App>, so the lock gate and screens never disagree
  const [vault, setVault] = useState(p.initialVault);
  const [asOf, setAsOf] = useState(todayIso());
  const [route, go] = useState<Route>(p.initialRoute);
  const ctx: AppendCtx = useMemo(
    () => ({ now: () => new Date(), newId: () => builders.newId("evt"), deviceId: settings.deviceId }),
    [settings.deviceId],
  );
  const state = useMemo(() => (vault ? reduce(vault.events, asOf) : null), [vault, asOf]);
  const latest = useMemo(() => (vault ? reduce(vault.events, MAX_DATE) : null), [vault]);
  const app: App = {
    platform: p.platform,
    settings,
    setSettings: p.saveSettings,
    vault,
    setVault,
    asOf,
    setAsOf,
    state,
    latest,
    ctx,
    async run(drafts) {
      if (!vault) return ["Open or create a company folder first."];
      const r = await appendToVault(p.platform.fs, vault, drafts, ctx);
      if (!r.ok) return r.errors;
      setVault(r.vault);
      return null;
    },
    route,
    go(r) {
      go(r);
      window.scrollTo?.(0, 0);
    },
  };
  return <Ctx.Provider value={app}>{p.children}</Ctx.Provider>;
}
