import { useState } from "react";
import { ErrorList, Logo, Stepper } from "../components/ui";
import { DISCLAIMER } from "../copy";
import { baseName } from "../fs/types";
import type { Settings } from "../settings";
import { addRecent } from "../settings";
import { useApp } from "../state";
import { openVault } from "../vault";

/** Welcome.html (F-02 + F-03). */
export function Welcome() {
  const app = useApp();
  const { settings, platform } = app;
  const [lock, setLock] = useState<"password" | "none">("password");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [idle, setIdle] = useState<Settings["idleMinutes"]>(15);
  const [telemetry, setTelemetry] = useState(settings.telemetry);
  const [errors, setErrors] = useState<string[] | null>(null);

  async function open(root: string) {
    try {
      const v = await openVault(platform.fs, root, app.ctx);
      const name = baseName(v.root);
      await app.setSettings({
        ...settings,
        recentVaults: addRecent(settings.recentVaults, { name, root: v.root }),
      });
      app.setVault(v);
      app.go({ name: "home" });
    } catch (e) {
      setErrors([(e as Error).message]);
    }
  }

  async function next() {
    if (lock === "password") {
      if (pw.length < 4) return setErrors(["Choose a password with at least 4 characters."]);
      if (pw !== pw2) return setErrors(["The passwords don't match."]);
      try {
        await platform.lock.set(pw);
      } catch (e) {
        return setErrors([`Couldn't save the password in the keychain: ${(e as Error).message ?? e}`]);
      }
    }
    await app.setSettings({ ...settings, lock, idleMinutes: idle, telemetry });
    app.go({ name: "email" });
  }

  return (
    <main className="narrow">
      <Stepper current={1} />
      <div className="stack">
        <Logo size={40} />
        <h1>Welcome to Capfolder</h1>
        <p className="muted">Your cap table will live in a folder on this computer. No account needed.</p>
        {settings.recentVaults.length ? (
          <div className="row wrap">
            {settings.recentVaults.map((r) => (
              <button type="button" key={r.root} className="btn" onClick={() => open(r.root)}>
                Open {r.name}
              </button>
            ))}
          </div>
        ) : null}
        <h2 style={{ marginTop: 24 }}>Lock the app when it opens?</h2>
        <div className="opt off" aria-disabled="true">
          <input type="radio" name="lock" disabled />
          <span>
            <b>Touch ID or your Mac password</b> <span className="chip">Coming soon (M7)</span>
          </span>
        </div>
        <label className={`opt ${lock === "password" ? "on" : ""}`}>
          <input
            type="radio"
            name="lock"
            checked={lock === "password"}
            onChange={() => setLock("password")}
          />
          <span>
            <b>A separate app password</b>
            <span className="meta" style={{ display: "block" }}>
              Stored in your keychain
            </span>
          </span>
        </label>
        {lock === "password" ? (
          <div className="grid2">
            <label>
              <span className="lbl">App password</span>
              <input className="inp" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
            </label>
            <label>
              <span className="lbl">Again</span>
              <input className="inp" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
            </label>
          </div>
        ) : null}
        <label className={`opt ${lock === "none" ? "on" : ""}`}>
          <input type="radio" name="lock" checked={lock === "none"} onChange={() => setLock("none")} />
          <b>No lock</b>
        </label>
        {lock === "password" ? (
          <>
            <label>
              <span className="lbl">Lock after</span>
              <select
                className="inp"
                value={idle}
                onChange={(e) => setIdle(Number(e.target.value) as Settings["idleMinutes"])}
              >
                <option value={15}>15 minutes idle</option>
                <option value={5}>5 minutes idle</option>
                <option value={60}>1 hour idle</option>
                <option value={0}>Only when I quit</option>
              </select>
            </label>
            <div className="banner">
              This locks the app, not the files. Your folder stays readable so it can never be locked away
              from you. File encryption is coming later as an option.
            </div>
          </>
        ) : null}
        <label className="row" style={{ alignItems: "flex-start" }}>
          <input type="checkbox" checked={telemetry} onChange={(e) => setTelemetry(e.target.checked)} />
          <span>
            Send anonymous usage counts (no company data).{" "}
            <span className="meta">
              Only an install id, app version, OS and three yes/no flags (docs/11).
            </span>
          </span>
        </label>
        <div className="banner small">{DISCLAIMER}</div>
        <ErrorList errors={errors} />
        <div className="row spread">
          <button
            type="button"
            className="btn link"
            onClick={async () => {
              const root = await platform.pickFolder("Open an existing Capfolder folder");
              if (root) await open(root);
            }}
          >
            Open existing folder
          </button>
          <button type="button" className="btn primary" onClick={next}>
            Continue
          </button>
        </div>
      </div>
    </main>
  );
}
