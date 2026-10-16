import { builders as b } from "@capfolder/core";
import { useEffect, useState } from "react";
import { detect, PROVIDERS, type ProviderId } from "../ai";
import { CLOUD, isCloud } from "../chat";
import { EmailVerify } from "../components/EmailVerify";
import { MainHeader } from "../components/Header";
import { CompanyPlace, YourCountry } from "../components/RegionFields";
import { ComingSoon, ErrorList, Field } from "../components/ui";
import { WireInstructionsField } from "../components/WireInstructions";
import type { Settings as S } from "../settings";
import { relayClient } from "../signing";
import { useApp } from "../state";
import { setCompanyCurrency } from "../vault";

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
        <section className="card stack" aria-label="You">
          <h2>You</h2>
          <YourCountry
            value={settings.region}
            onChange={(region) => app.setSettings({ ...settings, region })}
          />
        </section>
        {app.vault && app.latest?.issuer ? <CompanySection /> : null}
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
        <AiSection />
        <SigningSection />
        <UpdatesSection />
      </main>
    </>
  );
}

/** The company's own details: legal name and incorporation (an ISSUER update), and the currency for new records. */
function CompanySection() {
  const app = useApp();
  const issuer = app.latest!.issuer!;
  const [name, setName] = useState(String(issuer.legal_name ?? ""));
  const [place, setPlace] = useState({
    country: String(issuer.country_of_formation ?? "US"),
    subdivision: String(issuer.country_subdivision_of_formation ?? ""),
    currency: app.currency,
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[] | null>(null);
  return (
    <section className="card stack" aria-label="Company">
      <h2>Company</h2>
      <Field label="Legal name">
        <input className="inp" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <CompanyPlace
        {...place}
        onChange={async (next) => {
          setPlace(next);
          setMsg(null);
          if (next.currency !== app.currency && app.vault)
            app.setVault(await setCompanyCurrency(app.platform.fs, app.vault, next.currency));
        }}
      />
      <p className="meta" style={{ margin: 0 }}>
        The currency applies to new records; amounts already recorded keep theirs.
      </p>
      <ErrorList errors={errors} />
      {msg ? <div className="banner green small">{msg}</div> : null}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button
          type="button"
          className="btn primary"
          onClick={async () => {
            if (!name.trim()) return setErrors(["Enter the company's legal name."]);
            const same =
              name.trim() === issuer.legal_name &&
              place.country === issuer.country_of_formation &&
              place.subdivision.trim() === (issuer.country_subdivision_of_formation ?? "");
            if (same) return setMsg("Saved.");
            const errs = await app.run([
              b.issuerUpdate({
                previous: issuer,
                name: name.trim(),
                country: place.country,
                subdivision: place.subdivision.trim(),
              }),
            ]);
            setErrors(errs);
            if (!errs) setMsg("Saved.");
          }}
        >
          Save company details
        </button>
      </div>
      <WireInstructionsField />
    </section>
  );
}

/** F-37: which relay, is it reachable, and the verified email it sends for. */
function SigningSection() {
  const app = useApp();
  const [url, setUrl] = useState(app.settings.relayUrl);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [changing, setChanging] = useState(false);
  return (
    <section className="card stack" aria-label="Signing">
      <h2>Signing relay</h2>
      <Field label="Relay address" hint="relay.capfolder.com, or your own (apps/relay in the repo).">
        <input className="inp" value={url} onChange={(e) => setUrl(e.target.value)} />
      </Field>
      <div className="row wrap">
        <button
          type="button"
          className="btn"
          onClick={async () => {
            const clean = url.trim().replace(/\/+$/, "");
            try {
              const h = await relayClient(app.platform, { relayUrl: clean, relayToken: "" }).health();
              if (h.service !== "capfolder-relay")
                throw new Error("That address answers, but it isn't a Capfolder relay.");
              const moved = clean !== app.settings.relayUrl;
              await app.setSettings({
                ...app.settings,
                relayUrl: clean,
                // keep the old relay's token so envelopes sent through it still finish there (F-37)
                ...(moved
                  ? {
                      relayToken: app.settings.relayTokens?.[clean] ?? "",
                      relayTokens: {
                        ...app.settings.relayTokens,
                        [app.settings.relayUrl]: app.settings.relayToken,
                      },
                    }
                  : {}),
              });
              setMsg({
                ok: true,
                text: moved ? "Connected. Verify your email with this relay below." : "Connected.",
              });
            } catch (e) {
              setMsg({ ok: false, text: (e as Error).message });
            }
          }}
        >
          Test and save
        </button>
      </div>
      {msg ? <div className={`banner small ${msg.ok ? "green" : "amber"}`}>{msg.text}</div> : null}
      {app.settings.relayToken && !changing ? (
        <div className="row spread wrap">
          <span className="small">Sending as {app.settings.email}</span>
          <button type="button" className="btn link small" onClick={() => setChanging(true)}>
            Change email
          </button>
        </div>
      ) : (
        <EmailVerify onVerified={() => setChanging(false)} action="Verify" />
      )}
    </section>
  );
}

/** AiConnect.html (F-10): a model on this computer helps sort documents the rules can't. It only proposes. */
function AiSection() {
  const app = useApp();
  const ai = app.settings.ai;
  const [found, setFound] = useState<Awaited<ReturnType<typeof detect>> | null>(null);
  const look = () => detect(app.platform).then(setFound);
  // biome-ignore lint/correctness/useExhaustiveDependencies: look once when Settings opens
  useEffect(() => {
    look();
  }, []);
  const save = (next: Partial<S["ai"]>) => app.setSettings({ ...app.settings, ai: { ...ai, ...next } });
  return (
    <section className="card stack" aria-label="AI">
      <h2>AI</h2>
      <p className="small muted" style={{ margin: 0 }}>
        Optional. A model on this computer reads documents the rules can't sort. It only fills in a proposal:
        you confirm every one, and nothing leaves this computer.
      </p>
      {(Object.keys(PROVIDERS) as ProviderId[]).map((id) => {
        const f = found?.find((x) => x.id === id);
        const models = f?.models ?? [];
        return (
          <div
            key={id}
            className="row wrap"
            style={{ borderTop: "1px solid var(--row-divider)", paddingTop: 8 }}
          >
            <b style={{ width: 90 }}>{PROVIDERS[id].label}</b>
            {!found ? (
              <span className="meta">Looking…</span>
            ) : f?.models === null ? (
              <span className="meta">
                Not running. Install it from {PROVIDERS[id].install}, start it, then look again.
              </span>
            ) : !models.length ? (
              <span className="meta">Running, but no model is downloaded yet.</span>
            ) : (
              <>
                <select
                  className="inp"
                  aria-label={`${PROVIDERS[id].label} model`}
                  style={{ width: "auto" }}
                  value={ai.provider === id ? ai.model : ""}
                  onChange={(e) =>
                    save({ provider: id, model: e.target.value, sortWithAi: !!e.target.value })
                  }
                >
                  <option value="">Choose a model…</option>
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                {ai.provider === id && ai.model ? <span className="chip green">in use</span> : null}
              </>
            )}
          </div>
        );
      })}
      <div className="row wrap">
        <button type="button" className="btn small" onClick={look}>
          Look again
        </button>
        <label className="row small">
          <input
            type="checkbox"
            disabled={!ai.provider || !ai.model}
            checked={ai.sortWithAi && !!ai.provider}
            onChange={(e) => save({ sortWithAi: e.target.checked })}
          />
          Use AI when sorting documents
        </label>
      </div>
      <AskAiSettings found={found} />
      <ComingSoon milestone="a later release">
        Claude Code, Codex and Gemini subscriptions, and the MCP server for Claude Desktop.
      </ComingSoon>
    </section>
  );
}

/** docs/18: which AI answers in the Ask AI panel. Cloud keys go to the OS keychain, never to settings.json. */
function AskAiSettings({ found }: { found: Awaited<ReturnType<typeof detect>> | null }) {
  const app = useApp();
  const c = app.settings.chat;
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const save = (next: Partial<S["chat"]>) => app.setSettings((s) => ({ ...s, chat: { ...s.chat, ...next } }));
  const local = found?.find((x) => x.id === c.provider)?.models ?? [];
  return (
    <div className="stack" style={{ borderTop: "1px solid var(--row-divider)", paddingTop: 12 }}>
      <b>Ask AI</b>
      <p className="small muted" style={{ margin: 0 }}>
        The ✦ Ask AI panel answers questions about your cap table and drafts grants and SAFEs for you to
        check. A cloud AI (your own API key) gives the best answers; a model on this computer keeps everything
        here.
      </p>
      <div className="row wrap">
        <Field label="Ask AI uses">
          <select
            className="inp"
            style={{ width: "auto" }}
            value={c.provider}
            onChange={(e) => {
              const p = e.target.value as S["chat"]["provider"];
              setMsg(null);
              save({
                provider: p,
                model: isCloud(p)
                  ? CLOUD[p].model
                  : p === app.settings.ai.provider
                    ? app.settings.ai.model
                    : "",
              });
            }}
          >
            <option value="">Not connected</option>
            {(Object.keys(CLOUD) as (keyof typeof CLOUD)[]).map((p) => (
              <option key={p} value={p}>
                {CLOUD[p].label} (API key)
              </option>
            ))}
            {(Object.keys(PROVIDERS) as ProviderId[]).map((p) => (
              <option key={p} value={p}>
                {PROVIDERS[p].label} (this computer)
              </option>
            ))}
          </select>
        </Field>
        {c.provider ? (
          <Field label="Model">
            {isCloud(c.provider) || !local.length ? (
              <input className="inp" value={c.model} onChange={(e) => save({ model: e.target.value })} />
            ) : (
              <select
                className="inp"
                style={{ width: "auto" }}
                value={c.model}
                onChange={(e) => save({ model: e.target.value })}
              >
                <option value="">Choose a model…</option>
                {local.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : null}
      </div>
      {isCloud(c.provider) ? (
        <>
          <div className="row wrap" style={{ alignItems: "flex-end" }}>
            <Field label={`${CLOUD[c.provider].label} API key`}>
              <input
                className="inp"
                type="password"
                autoComplete="off"
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
            </Field>
            <button
              type="button"
              className="btn"
              disabled={!key.trim()}
              onClick={async () => {
                if (!isCloud(c.provider)) return;
                try {
                  await app.platform.aiKey.set(c.provider, key);
                  setKey("");
                  setMsg("Key saved in your keychain.");
                } catch (e) {
                  setMsg(`Couldn't save the key: ${e instanceof Error ? e.message : String(e)}`);
                }
              }}
            >
              Save key
            </button>
            <button
              type="button"
              className="btn link small"
              onClick={() => isCloud(c.provider) && app.platform.openUrl(CLOUD[c.provider].keys)}
            >
              Get a key
            </button>
          </div>
          {msg ? <span className="small">{msg}</span> : null}
          <label className="row small">
            <input
              type="checkbox"
              checked={c.cloudDocs}
              onChange={(e) => save({ cloudDocs: e.target.checked })}
            />
            Let cloud AI read documents (off: it sees cap-table numbers and names only, never document text)
          </label>
        </>
      ) : null}
    </div>
  );
}

/** F-38: how app updates arrive, and which rules pack is in use. */
function UpdatesSection() {
  const app = useApp();
  const [version, setVersion] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: read the version once
  useEffect(() => {
    app.platform.updater.version().then(setVersion, () => {});
  }, []);
  return (
    <section className="card stack" aria-label="Updates">
      <h2>Updates</h2>
      <Field label="App updates" hint="Updates are signed. Installing always waits until you restart.">
        <select
          className="inp"
          value={app.settings.updates}
          onChange={(e) => app.setSettings({ ...app.settings, updates: e.target.value as S["updates"] })}
        >
          <option value="auto">Automatic: download in the background, ask to restart</option>
          <option value="ask">Ask me before downloading</option>
          <option value="off">Off: I'll check myself</option>
        </select>
      </Field>
      <div className="row wrap">
        <button
          type="button"
          className="btn small"
          onClick={async () => {
            setMsg("Checking…");
            try {
              const u = await app.platform.updater.check();
              setMsg(
                u
                  ? `Capfolder ${u.version} is available: see the bar at the bottom right.`
                  : "You have the latest version.",
              );
              if (u && app.update?.u.version !== u.version) app.setUpdate({ u, ready: false });
            } catch (e) {
              setMsg(`Couldn't check (${(e as Error).message ?? e}).`);
            }
          }}
        >
          Check now
        </button>
        <span className="meta">
          Version {version || "…"} · Rules {app.rules.version}
        </span>
      </div>
      {msg ? (
        <p className="small muted" style={{ margin: 0 }}>
          {msg}
        </p>
      ) : null}
    </section>
  );
}
