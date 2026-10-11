import { useEffect, useRef, useState } from "react";
import type { AppUpdate } from "../platform";
import { cachedRules, fetchRules } from "../rules";
import { useApp } from "../state";
import { Modal } from "./ui";

const HOUR = 3600e3;

/**
 * F-38, while the app is open: the rules pack (cached at start, then checked daily) and app updates (on open and
 * every 6 hours, per Settings → Updates). Automatic only downloads; installing waits for "Restart now".
 */
export function Background() {
  const app = useApp();
  const latest = useRef(app);
  latest.current = app;
  const [update, setUpdate] = useState<{ u: AppUpdate; ready: boolean } | null>(null);
  const [notes, setNotes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: start once; the timers read the latest settings
  useEffect(() => {
    const { platform } = latest.current;
    let version = "0.0.0";
    const rules = async () => {
      const a = latest.current;
      const next = await fetchRules(platform, a.rules, version);
      if (next) a.setRules(next);
    };
    const updates = async () => {
      const mode = latest.current.settings.updates;
      if (mode === "off") return;
      try {
        const u = await platform.updater.check();
        if (!u) return;
        if (mode === "auto") {
          await u.download();
          setUpdate({ u, ready: true });
        } else setUpdate({ u, ready: false });
      } catch {
        // offline or GitHub unreachable: try again later
      }
    };
    (async () => {
      version = await platform.updater.version().catch(() => "0.0.0");
      const cached = await cachedRules(platform, version);
      if (cached !== latest.current.rules) latest.current.setRules(cached);
      await Promise.all([rules(), updates()]);
    })();
    const daily = setInterval(rules, 24 * HOUR);
    const sixHourly = setInterval(updates, 6 * HOUR);
    return () => {
      clearInterval(daily);
      clearInterval(sixHourly);
    };
  }, []);

  if (!update) return null;
  const { u, ready } = update;
  return (
    <div
      className="banner purple row spread wrap"
      role="status"
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        maxWidth: 520,
        zIndex: 50,
        boxShadow: "0 4px 16px rgba(0,0,0,.12)",
      }}
    >
      <span>
        Capfolder {u.version} is {ready ? "downloaded" : "available"}.{" "}
        {u.notes ? (
          <button type="button" className="btn link small" onClick={() => setNotes(true)}>
            What changed
          </button>
        ) : null}
        {error ? <span className="meta"> {error}</span> : null}
      </span>
      <span className="row">
        <button type="button" className="btn small" onClick={() => setUpdate(null)}>
          Later
        </button>
        <button
          type="button"
          className="btn primary small"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              if (!ready) await u.download();
              await u.install();
              await app.platform.updater.relaunch();
            } catch (e) {
              setError(`The update didn't install (${(e as Error).message ?? e}). Your data is unchanged.`);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Updating…" : ready ? "Restart now" : "Update now"}
        </button>
      </span>
      {notes ? (
        <Modal open onClose={() => setNotes(false)} title={`What's new in ${u.version}`}>
          <p className="small" style={{ whiteSpace: "pre-wrap" }}>
            {u.notes}
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
