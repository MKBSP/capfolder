import { builders as b } from "@capfolder/core";
import { useEffect, useState } from "react";
import { aiLabel, CLOUD, detect, isCloud, PROVIDERS, type ProviderId } from "../ai";
import { EmailVerify } from "../components/EmailVerify";
import { MainHeader } from "../components/Header";
import { CompanyPlace, YourCountry } from "../components/RegionFields";
import { ComingSoon, ErrorList, Field } from "../components/ui";
import { WireInstructionsField } from "../components/WireInstructions";
import { type AiAction, type AiPick, type AiProvider, aiFor, type Settings as S } from "../settings";
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

type Found = Awaited<ReturnType<typeof detect>> | null;
const pickValue = (a: AiPick | null | undefined) =>
  a ? `${a.provider}|${isCloud(a.provider) ? "" : a.model}` : "";
const parsePick = (v: string): AiPick | null => {
  if (!v) return null;
  const [provider, model = ""] = v.split("|") as [AiProvider, string];
  return { provider, model: isCloud(provider) ? CLOUD[provider].model : model };
};
/** Every AI the founder can pick: each local model found, and each cloud AI (their own key). */
function AiOptions({ found }: { found: Found }) {
  return (
    <>
      {(found ?? []).flatMap((f) =>
        (f.models ?? []).map((m) => (
          <option key={`${f.id}|${m}`} value={`${f.id}|${m}`}>
            {PROVIDERS[f.id].label} · {m} (this computer)
          </option>
        )),
      )}
      {(Object.keys(CLOUD) as (keyof typeof CLOUD)[]).map((p) => (
        <option key={p} value={`${p}|`}>
          {CLOUD[p].label} (your API key)
        </option>
      ))}
    </>
  );
}
const ACTIONS: { id: AiAction; label: string }[] = [
  { id: "sort", label: "Sort documents" },
  { id: "summary", label: "Document summary" },
  { id: "chat", label: "Ask AI" },
];

/** AiConnect.html (F-10, docs/18): one AI in use for everything; Advanced picks another per action. It only proposes. */
function AiSection() {
  const app = useApp();
  const ai = app.settings.ai;
  const [found, setFound] = useState<Found>(null);
  const look = () => detect(app.platform).then(setFound);
  // biome-ignore lint/correctness/useExhaustiveDependencies: look once when Settings opens
  useEffect(() => {
    look();
  }, []);
  const set = (f: (s: S) => S) => app.setSettings(f);
  const current = ai.provider ? { provider: ai.provider, model: ai.model } : null;
  // a saved choice the detection didn't (yet) find still shows, so the picker never looks empty
  const known = (a: AiPick | null | undefined) =>
    !a || isCloud(a.provider) || !!found?.some((f) => f.id === a.provider && f.models?.includes(a.model));
  const extra = [current, ...Object.values(app.settings.aiFor ?? {})].filter(
    (a): a is AiPick => !!a && !known(a),
  );
  const options = (
    <>
      <AiOptions found={found} />
      {extra.map((a) => (
        <option key={pickValue(a)} value={pickValue(a)}>
          {aiLabel(a)}
        </option>
      ))}
    </>
  );
  const clouds = [current, ...Object.values(app.settings.aiFor ?? {})]
    .filter((a): a is AiPick => !!a && isCloud(a.provider))
    .map((a) => a.provider as keyof typeof CLOUD);
  return (
    <section className="card stack" aria-label="AI">
      <h2>AI</h2>
      <p className="small muted" style={{ margin: 0 }}>
        Optional. AI sorts documents the rules can't, sums up a document, and answers in ✦ Ask AI. It only
        proposes: you confirm everything. A model on this computer keeps everything here; a cloud AI (your own
        API key) gives the best answers.
      </p>
      <Field
        label="AI in use"
        hint="If you connect several, Capfolder uses this one for everything. Advanced lets an action use another."
      >
        <select
          className="inp"
          aria-label="AI in use"
          style={{ width: "auto" }}
          value={pickValue(current)}
          onChange={(e) => {
            const p = parsePick(e.target.value);
            set((s) => ({
              ...s,
              ai: p
                ? { ...s.ai, ...p, sortWithAi: s.ai.provider ? s.ai.sortWithAi : true }
                : { ...s.ai, provider: "", model: "" },
            }));
          }}
        >
          <option value="">None</option>
          {options}
        </select>
      </Field>
      <div className="small muted stack" style={{ gap: 2 }}>
        {(Object.keys(PROVIDERS) as ProviderId[]).map((id) => {
          const f = found?.find((x) => x.id === id);
          return (
            <span key={id}>
              <b>{PROVIDERS[id].label}</b>:{" "}
              {!found
                ? "looking…"
                : f?.models === null
                  ? `Not running. Install it from ${PROVIDERS[id].install}, start it, then look again.`
                  : !f?.models?.length
                    ? "running, but no model is downloaded yet."
                    : `${f.models.length} model${f.models.length === 1 ? "" : "s"} on this computer.`}
            </span>
          );
        })}
      </div>
      {clouds.map((p) => (
        <CloudKey key={p} provider={p} />
      ))}
      <div className="row wrap">
        <button type="button" className="btn small" onClick={look}>
          Look again
        </button>
        <label className="row small">
          <input
            type="checkbox"
            disabled={!aiFor(app.settings, "sort")}
            checked={app.settings.ai.sortWithAi && !!aiFor(app.settings, "sort")}
            onChange={(e) => set((s) => ({ ...s, ai: { ...s.ai, sortWithAi: e.target.checked } }))}
          />
          Use AI when sorting documents
        </label>
      </div>
      <label className="row small">
        <input
          type="checkbox"
          checked={app.settings.chat.cloudDocs}
          onChange={(e) => set((s) => ({ ...s, chat: { ...s.chat, cloudDocs: e.target.checked } }))}
        />
        Let cloud AI read documents (off: a cloud AI sees cap-table numbers and names only, never document
        text, and doesn't sort or sum up documents)
      </label>
      <details>
        <summary className="small">Advanced: a different AI per action</summary>
        <div className="row wrap" style={{ marginTop: 8 }}>
          {ACTIONS.map((x) => (
            <Field key={x.id} label={x.label}>
              <select
                className="inp"
                aria-label={x.label}
                style={{ width: "auto" }}
                value={pickValue(app.settings.aiFor?.[x.id])}
                onChange={(e) => {
                  const p = parsePick(e.target.value);
                  set((s) => {
                    const { [x.id]: _, ...rest } = s.aiFor ?? {};
                    return { ...s, aiFor: p ? { ...rest, [x.id]: p } : rest };
                  });
                }}
              >
                <option value="">Default{current ? ` (${aiLabel(current)})` : ""}</option>
                {options}
              </select>
            </Field>
          ))}
        </div>
      </details>
      <ComingSoon milestone="a later release">
        Claude Code, Codex and Gemini subscriptions, and the MCP server for Claude Desktop.
      </ComingSoon>
    </section>
  );
}

/** A cloud AI's key: saved to the OS keychain, never to settings.json. */
function CloudKey({ provider }: { provider: keyof typeof CLOUD }) {
  const app = useApp();
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="row wrap" style={{ alignItems: "flex-end" }}>
        <Field label={`${CLOUD[provider].label} API key`}>
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
            try {
              await app.platform.aiKey.set(provider, key);
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
          onClick={() => app.platform.openUrl(CLOUD[provider].keys)}
        >
          Get a key
        </button>
      </div>
      {msg ? <span className="small">{msg}</span> : null}
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
