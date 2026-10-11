import { useEffect, useRef, useState } from "react";
import { maybePing } from "../ping";
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
  const [notes, setNotes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Drag and drop anywhere on the window: with a company open, the files go to sorting
  useEffect(
    () =>
      latest.current.platform.onDrop((paths) => {
        if (latest.current.vault && paths.length) latest.current.go({ name: "sort", dropped: paths });
      }),
    [],
  );

  // The install ping (docs/11): one at a time, at start, daily, and right after the terms are accepted on Welcome
  const pinging = useRef(false);
  const pingNow = useRef(async () => {
    if (pinging.current) return;
    pinging.current = true;
    try {
      const a = latest.current;
      const version = await a.platform.updater.version().catch(() => "0.0.0");
      const next = await maybePing(a.platform, a.settings, a.vault, version);
      if (next) await latest.current.setSettings((prev) => ({ ...prev, ping: next.ping }));
    } finally {
      pinging.current = false;
    }
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-check whenever consent or the toggle changes
  useEffect(() => {
    pingNow.current();
  }, [app.settings.termsAccepted, app.settings.telemetry]);

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
        if (!u || latest.current.update?.u.version === u.version) return; // already offered: no second download
        if (mode === "auto") {
          await u.download();
          latest.current.setUpdate({ u, ready: true });
        } else latest.current.setUpdate({ u, ready: false });
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
    const daily = setInterval(() => {
      rules();
      pingNow.current();
    }, 24 * HOUR);
    const sixHourly = setInterval(updates, 6 * HOUR);
    return () => {
      clearInterval(daily);
      clearInterval(sixHourly);
    };
  }, []);

  if (!app.update) return null;
  const { u, ready } = app.update;
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
        <button type="button" className="btn small" onClick={() => app.setUpdate(null)}>
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
