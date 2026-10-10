import { useCallback, useEffect, useState } from "react";
import { useIdle } from "./idle";
import { type Platform, tauriPlatform } from "./platform";
import { Screen } from "./screens";
import { Unlock } from "./screens/Unlock";
import { loadSettings, type Settings, saveSettings } from "./settings";
import { AppProvider, type Route } from "./state";
import { openVault, type Vault } from "./vault";

type Boot = { settings: Settings; vault: Vault | null; route: Route; dataDir: string };

/** Boot: settings → (lock) → last vault → Home, else first run. */
export function App({ platform = tauriPlatform }: { platform?: Platform }) {
  const [boot, setBoot] = useState<Boot | null>(null);
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
      setBoot({ settings, vault, route: vault ? { name: "home" } : { name: "welcome" }, dataDir });
    })().catch((e) => setError(String(e)));
  }, [platform]);

  const lockNow = useCallback(() => {
    if (boot?.settings.lock === "password") setLocked(true);
  }, [boot]);
  useIdle(boot?.settings.idleMinutes ?? 0, lockNow);

  if (error)
    return (
      <main className="narrow">
        <div className="errors">{error}</div>
      </main>
    );
  if (!boot) return <main className="narrow">Capfolder</main>;
  if (locked) return <Unlock verify={(p) => platform.lock.verify(p)} onUnlock={() => setLocked(false)} />;
  return (
    <AppProvider
      platform={platform}
      settings={boot.settings}
      saveSettings={(s) => saveSettings(platform.fs, boot.dataDir, s)}
      initialVault={boot.vault}
      initialRoute={boot.route}
    >
      <Screen />
    </AppProvider>
  );
}
