import { useState } from "react";
import { MainHeader } from "../components/Header";
import { ComingSoon, ErrorList, Field } from "../components/ui";
import type { Settings as S } from "../settings";
import { useApp } from "../state";

export function Settings() {
  const app = useApp();
  const { settings, platform } = app;
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[] | null>(null);
  return (
    <>
      <MainHeader />
      <main className="medium stack">
        <section className="card stack">
          <h2>App lock</h2>
          <p className="muted small">
            {settings.lock === "password" ? "Locked with an app password." : "No lock."} This locks the app,
            not the files.
          </p>
          <div className="grid2">
            <Field label="New app password">
              <input className="inp" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
            </Field>
            <Field label="Again">
              <input className="inp" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
            </Field>
          </div>
          <div className="row wrap">
            <button
              type="button"
              className="btn primary"
              onClick={async () => {
                if (pw.length < 4) return setErrors(["Choose a password with at least 4 characters."]);
                if (pw !== pw2) return setErrors(["The passwords don't match."]);
                try {
                  await platform.lock.set(pw);
                } catch (e) {
                  return setErrors([
                    `Couldn't save the password in the keychain: ${(e as Error).message ?? e}`,
                  ]);
                }
                await app.setSettings({ ...settings, lock: "password" });
                setPw("");
                setPw2("");
                setErrors(null);
                setMsg("Password saved.");
              }}
            >
              {settings.lock === "password" ? "Change password" : "Turn on password lock"}
            </button>
            {settings.lock === "password" ? (
              <button
                type="button"
                className="btn danger"
                onClick={async () => {
                  try {
                    await platform.lock.clear();
                  } catch (e) {
                    return setErrors([`Couldn't remove the keychain item: ${(e as Error).message ?? e}`]);
                  }
                  await app.setSettings({ ...settings, lock: "none" });
                  setMsg("Lock removed.");
                }}
              >
                Remove lock
              </button>
            ) : null}
          </div>
          {settings.lock === "password" ? (
            <Field label="Lock after">
              <select
                className="inp"
                value={settings.idleMinutes}
                onChange={(e) =>
                  app.setSettings({ ...settings, idleMinutes: Number(e.target.value) as S["idleMinutes"] })
                }
              >
                <option value={15}>15 minutes idle</option>
                <option value={5}>5 minutes idle</option>
                <option value={60}>1 hour idle</option>
                <option value={0}>Only when I quit</option>
              </select>
            </Field>
          ) : null}
          <div className="soon small">Touch ID / Windows Hello arrives in M7.</div>
          <ErrorList errors={errors} />
          {msg ? <div className="banner green small">{msg}</div> : null}
        </section>
        <section className="card stack">
          <h2>Company folder</h2>
          <p className="mono small">{app.vault?.root}</p>
          <div className="row wrap">
            <button
              type="button"
              className="btn"
              onClick={() => app.vault && platform.reveal(`${app.vault.root}/events.jsonl`)}
            >
              Show in Finder
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                app.setVault(null);
                app.go({ name: "welcome" });
              }}
            >
              Open another company
            </button>
          </div>
        </section>
        <section className="card stack">
          <h2>Privacy</h2>
          <label className="row small">
            <input
              type="checkbox"
              checked={settings.telemetry}
              onChange={(e) => app.setSettings({ ...settings, telemetry: e.target.checked })}
            />
            Send anonymous usage counts (no company data)
          </label>
        </section>
        <section className="card stack">
          <h2>AI</h2>
          <ComingSoon milestone="M4">
            Bring your own AI (Ollama, LM Studio, Claude Code, Codex, an API key) to sort documents.
          </ComingSoon>
        </section>
        <section className="card stack">
          <h2>Signing relay</h2>
          <ComingSoon milestone="M5">relay.capfolder.com, or your own self-hosted relay.</ComingSoon>
        </section>
        <section className="card stack">
          <h2>Updates</h2>
          <ComingSoon milestone="M7">Signed app updates and a signed rules pack.</ComingSoon>
        </section>
      </main>
    </>
  );
}
