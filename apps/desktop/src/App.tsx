import { useCallback, useEffect, useState } from "react";
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
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const dataDir = await platform.appDataDir();
      const settings = await loadSettings(platform.fs, dataDir);
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
  if (locked) return <Unlock verify={(p) => platform.lock.verify(p)} onUnlock={() => setLocked(false)} />;
  return (
    <AppProvider
      platform={platform}
      settings={settings}
      saveSettings={async (s) => {
        setSettings(s);
        await saveSettings(platform.fs, boot.dataDir, s);
      }}
      initialVault={boot.vault}
      initialRoute={boot.route}
    >
      <Screen />
    </AppProvider>
  );
}
