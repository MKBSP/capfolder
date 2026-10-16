import { useCallback, useEffect, useRef, useState } from "react";
import { ChatShell } from "./components/AskAi";
import { Background } from "./components/Background";
import { useIdle } from "./idle";
import { type Platform, tauriPlatform } from "./platform";
import { Screen } from "./screens";
import { Unlock } from "./screens/Unlock";
import { loadSettings, type Settings, saveSettings } from "./settings";
import { AppProvider, type Route } from "./state";
import { openVault, type Vault } from "./vault";

type Boot = { vault: Vault | null; route: Route; dataDir: string };

/** Boot: settings → (lock) → last vault → Home, else first run. */
export function App({ platform = tauriPlatform }: { platform?: Platform }) {
  const [boot, setBoot] = useState<Boot | null>(null);
  // Settings live here (one source of truth) so the lock gate always sees the current lock choice.
  const [settings, setSettings] = useState<Settings | null>(null);
  const current = useRef<Settings | null>(null);
  current.current ??= settings;
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const dataDir = await platform.appDataDir();
      let settings = await loadSettings(platform.fs, dataDir);
      // The keychain item is gone (e.g. removed per "Forgot it?"): there's nothing to unlock with, so drop the lock.
      if (settings.lock === "password" && !(await platform.lock.isSet().catch(() => true))) {
        settings = { ...settings, lock: "none" };
        await saveSettings(platform.fs, dataDir, settings);
      }
      setLocked(settings.lock === "password");
      const last = settings.recentVaults[0];
      let vault: Vault | null = null;
      if (last) {
        const ctx = { now: () => new Date(), newId: () => "", deviceId: settings.deviceId };
        vault = await openVault(platform.fs, last.root, ctx).catch(() => null);
      }
      setSettings(settings);
      setBoot({ vault, route: vault ? { name: "home" } : { name: "welcome" }, dataDir });
    })().catch((e) => setError(String(e)));
  }, [platform]);

  const lockNow = useCallback(() => {
    if (settings?.lock === "password") setLocked(true);
  }, [settings]);
  useIdle(settings?.lock === "password" ? settings.idleMinutes : 0, lockNow);

  if (error)
    return (
      <main className="narrow">
        <div className="errors">{error}</div>
      </main>
    );
  if (!boot || !settings) return <main className="narrow">Capfolder</main>;
  // The provider stays mounted while locked, so the open vault and the current screen survive an idle lock.
  return (
    <AppProvider
      platform={platform}
      settings={settings}
      saveSettings={async (s) => {
        const next = typeof s === "function" ? s(current.current!) : s;
        current.current = next;
        setSettings(next);
        await saveSettings(platform.fs, boot.dataDir, next);
      }}
      initialVault={boot.vault}
      initialRoute={boot.route}
    >
      {locked ? (
        <Unlock verify={(p) => platform.lock.verify(p)} onUnlock={() => setLocked(false)} />
      ) : (
        <>
          <Background />
          <ChatShell>
            <Screen />
          </ChatShell>
        </>
      )}
    </AppProvider>
  );
}
