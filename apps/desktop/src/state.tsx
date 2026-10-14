// App-wide state: settings, the open vault, the as-of date and navigation. Screens read core-derived views from here.
import { type AppendCtx, builders, type EventDraft, MAX_DATE, reduce, type State } from "@capfolder/core";
import { createContext, type ReactNode, useContext, useMemo, useRef, useState } from "react";
import { configureFormat, todayIso } from "./fmt";
import { baseName } from "./fs/types";
import type { AppUpdate, Platform } from "./platform";
import { regionOf } from "./regions";
import { BUNDLED_RULES, type RulesPack } from "./rules";
import { addRecent, type Settings } from "./settings";
import { appendToVault, openVault, type Vault } from "./vault";

export type Route =
  | { name: "welcome" | "email" | "create" | "start" | "wizard" | "home" | "people" | "import" }
  | { name: "documents"; imported?: boolean }
  | { name: "newSafe" | "newGrant" | "newShares" | "pool" | "newPerson" | "settings" }
  | { name: "signatures"; sent?: { titles: string[]; emails: string[]; warning?: string } }
  | { name: "sort"; dropped?: string[] }
  | { name: "person"; id: string }
  | { name: "comingSoon"; title: string; milestone: string; text?: string };

export interface App {
  platform: Platform;
  settings: Settings;
  /** A function gets the newest settings (not a render's copy), so background saves don't undo a toggle. */
  setSettings(s: Settings | ((prev: Settings) => Settings)): Promise<void>;
  vault: Vault | null;
  setVault(v: Vault | null): void;
  asOf: string;
  setAsOf(d: string): void;
  /** State as of the chosen date (what the screens show). */
  state: State | null;
  /** State with every event, for picking new ids and form defaults. */
  latest: State | null;
  ctx: AppendCtx;
  /** The company currency (capfolder.json), used for new money amounts. */
  currency: string;
  /** Append drafts to the vault. Returns null on success, or the plain-language errors. */
  run(drafts: EventDraft[]): Promise<string[] | null>;
  route: Route;
  go(r: Route): void;
  /** The rules pack in use (bundled, cached or freshly downloaded; swapped in without a restart). */
  rules: RulesPack;
  setRules(r: RulesPack): void;
  /** An app update found (and maybe downloaded); kept here so it survives the idle lock and Settings → Check now. */
  update: { u: AppUpdate; ready: boolean } | null;
  setUpdate(u: { u: AppUpdate; ready: boolean } | null): void;
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
  saveSettings(s: Settings | ((prev: Settings) => Settings)): Promise<void>;
  initialVault: Vault | null;
  initialRoute: Route;
  children: ReactNode;
}) {
  const settings = p.settings; // owned by <App>, so the lock gate and screens never disagree
  const [vault, setVaultState] = useState(p.initialVault);
  // Formatting follows the founder's country and the company currency; set before any child renders.
  const region = regionOf(settings.region);
  configureFormat({
    locale: region.locale,
    currency: (vault?.meta.currency as string | undefined) || "USD",
    monthFirst: region.code === "US",
  });
  // The newest vault and whether a save is in flight, readable from any closure (double-clicks, back-to-back saves).
  const latestVault = useRef(p.initialVault);
  const saving = useRef(false);
  const setVault = (v: Vault | null) => {
    latestVault.current = v;
    setVaultState(v);
  };
  const [asOf, setAsOf] = useState(todayIso());
  const [route, go] = useState<Route>(p.initialRoute);
  const [rules, setRules] = useState<RulesPack>(BUNDLED_RULES);
  const [update, setUpdate] = useState<App["update"]>(null);
  const ctx: AppendCtx = useMemo(
    () => ({ now: () => new Date(), newId: () => builders.newId("evt"), deviceId: settings.deviceId }),
    [settings.deviceId],
  );
  const state = useMemo(() => (vault ? reduce(vault.events, asOf) : null), [vault, asOf]);
  const latest = useMemo(() => (vault ? reduce(vault.events, MAX_DATE) : null), [vault]);
  const app: App = {
    currency: (vault?.meta.currency as string | undefined) || "USD",
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
      const current = latestVault.current;
      if (!current) return ["Open or create a company folder first."];
      if (saving.current) return ["Already saving. One moment."];
      // A date field holds "" while its text isn't a real date (DateInput); never save that.
      if (drafts.some((d) => d.data.date === "" || d.data.board_approval_date === ""))
        return ["Enter a valid date (for example 6 Oct 2026)."];
      saving.current = true;
      try {
        const r = await appendToVault(p.platform.fs, current, drafts, ctx);
        if (!r.ok) return r.errors;
        setVault(r.vault);
        return null;
      } finally {
        saving.current = false;
      }
    },
    rules,
    setRules,
    update,
    setUpdate,
    route,
    go(r) {
      go(r);
      window.scrollTo?.(0, 0);
    },
  };
  return <Ctx.Provider value={app}>{p.children}</Ctx.Provider>;
}

/** Opens a company folder, puts it first in the recent list, then shows its cap table. Throws a plain-language error. */
export async function openCompany(app: App, root: string) {
  const v = await openVault(app.platform.fs, root, app.ctx);
  await app.setSettings((s) => {
    const name = s.recentVaults.find((r) => r.root === v.root)?.name ?? baseName(v.root);
    return { ...s, recentVaults: addRecent(s.recentVaults, { name, root: v.root }) };
  });
  app.setVault(v);
  app.go({ name: "home" });
}
