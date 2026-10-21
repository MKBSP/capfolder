import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MainHeader } from "../components/Header";
import { ErrorList, Modal } from "../components/ui";
import { uploadWire, wireDoc } from "../components/WireInstructions";
import { day } from "../fmt";
import { type Envelope, type EnvelopeStatus, envelopes, RelayError, relayClient, relayFor } from "../signing";
import { useApp } from "../state";
import { DOC_FOLDER, fileSigned, voidEnvelope } from "../vault";

const ago = (ts: string) => {
  const days = Math.floor((Date.now() - Date.parse(ts)) / 864e5);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
};

/** Signing.html (F-16, F-17, F-36): what's out for signature, what came back, and the founder's turn. */
export function Signatures(p: { sent?: { titles: string[]; emails: string[]; warning?: string } }) {
  const app = useApp();
  const all = useMemo(() => (app.vault ? envelopes(app.vault.events) : []), [app.vault]);
  const open = all.filter((e) => e.state === "open");
  const done = all.filter((e) => e.state === "signed").reverse();
  const [status, setStatus] = useState<Record<string, EnvelopeStatus>>({});
  const [notes, setNotes] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [offline, setOffline] = useState<string | null>(null);
  const [cancel, setCancel] = useState<Envelope | null>(null);
  const [wire, setWire] = useState<Envelope | null>(null);
  const filing = useRef(new Set<string>());
  const me = app.settings.email;

  // The timer and buttons always see the newest vault and settings (a stale copy would re-file or 404).
  const latest = useRef(app);
  latest.current = app;
  const running = useRef(false);
  const again = useRef(false);
  const refresh = useCallback(async () => {
    if (running.current) {
      again.current = true; // one loop at a time; a click meanwhile runs once more right after
      return;
    }
    running.current = true;
    try {
      do {
        again.current = false;
        await refreshOnce();
      } while (again.current);
    } finally {
      running.current = false;
    }
  }, []);
  const refreshOnce = async () => {
    const app = latest.current;
    if (!app.vault) return;
    setOffline(null);
    let vault = app.vault;
    for (const env of envelopes(vault.events).filter((e) => e.state === "open")) {
      let client: ReturnType<typeof clientFor>;
      let s: EnvelopeStatus;
      try {
        client = clientFor(env);
        s = await client.status(env.id);
      } catch (e) {
        if (e instanceof RelayError && e.status === 0) {
          setOffline(e.message); // offline: nothing else will answer either
          return;
        }
        setNotes((x) => ({
          ...x,
          [env.id]: {
            ok: false,
            text:
              e instanceof RelayError && e.status === 404
                ? "The relay no longer has this document (expired or deleted). Cancel it here, then send it again if it's still needed."
                : (e as Error).message,
          },
        }));
        continue;
      }
      setStatus((x) => ({ ...x, [env.id]: s }));
      if (s.status !== "completed" || filing.current.has(env.id)) continue;
      filing.current.add(env.id);
      try {
        const signed = await client.signedPdf(env.id);
        const r = await fileSigned(app.platform.fs, vault, app.ctx, env, signed, s.receipt);
        if (!r.ok) {
          setNotes((x) => ({ ...x, [env.id]: { ok: false, text: r.errors.join(" ") } }));
          continue;
        }
        vault = r.vault;
        latest.current.setVault(vault);
        if (r.warning) {
          setNotes((x) => ({ ...x, [env.id]: { ok: false, text: r.warning! } }));
          await client.remove(env.id).catch(() => {});
          continue;
        }
        await client.remove(env.id).catch(() => {}); // the relay also purges anything older than 30 days
        setNotes((x) => ({
          ...x,
          [env.id]: {
            ok: true,
            text: `Signed and filed in docs/${DOC_FOLDER[env.docType] ?? "company"}/. The relay copy is deleted.`,
          },
        }));
      } catch (e) {
        setNotes((x) => ({ ...x, [env.id]: { ok: false, text: (e as Error).message } }));
      } finally {
        filing.current.delete(env.id);
      }
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh on open and every minute, not on every render
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, []);

  const waitingFor = (env: Envelope) => {
    const s = status[env.id];
    if (!s) return "Checking…";
    if (s.status === "expired") return "Expired after 30 days. Cancel it and send again.";
    if (s.status === "rejected")
      return `${s.signers.find((x) => x.status === "rejected")?.name ?? "A signer"} declined to sign`;
    if (s.status === "cancelled") return "Cancelled on the relay";
    const next = s.signers.find((x) => x.status !== "signed");
    if (!next) return "Everyone signed · filing…";
    return next.email === me ? "Your turn" : `Waiting for ${next.name}`;
  };
  const myTurn = (env: Envelope) => {
    const s = status[env.id];
    return s?.status === "pending" && s.signers.find((x) => x.status !== "signed")?.email === me;
  };
  const act = async (env: Envelope, f: () => Promise<unknown>, okText?: string) => {
    try {
      await f();
      if (okText) setNotes((x) => ({ ...x, [env.id]: { ok: true, text: okText } }));
    } catch (e) {
      setNotes((x) => ({ ...x, [env.id]: { ok: false, text: (e as Error).message } }));
    }
  };
  /** Each envelope is checked on the relay it was sent through, if this computer knows that relay. */
  const clientFor = (env: Envelope) => {
    const r = relayFor(latest.current.settings, env);
    if (!r)
      throw new RelayError(
        `Sent through ${env.relay}, which isn't set up on this computer (Settings → Signing).`,
        -1,
      );
    return relayClient(latest.current.platform, r);
  };

  return (
    <>
      <MainHeader>
        <button type="button" className="btn" onClick={refresh}>
          Refresh
        </button>
      </MainHeader>
      <main className="medium stack">
        <h1 style={{ margin: 0 }}>Signatures</h1>
        {p.sent ? (
          <div className="banner green" role="status">
            Sent {p.sent.titles.map((t) => `“${t}”`).join(" and ")}.{" "}
            {p.sent.emails.length
              ? `Emailed ${p.sent.emails.join(", ")} from signing@capfolder.com (check spam if it hasn't arrived in a few minutes).`
              : "It's your turn to sign below."}{" "}
            It stays listed here until everyone has signed.
          </div>
        ) : null}
        {p.sent?.warning ? <div className="banner amber">{p.sent.warning}</div> : null}
        <div className="banner purple">
          In the cloud right now: <b>{open.length}</b> document{open.length === 1 ? "" : "s"} waiting for
          signatures. Everything else is only on this computer.{" "}
          <span className="meta">Relay: {app.settings.relayUrl.replace(/^https?:\/\//, "")}</span>
        </div>
        {offline ? <div className="banner amber">{offline}</div> : null}
        <section className="card stack">
          <h2 style={{ margin: 0 }}>Waiting</h2>
          {open.length === 0 ? <p className="muted">Nothing waiting for signatures.</p> : null}
          {open.map((env) => {
            const s = status[env.id];
            const note = notes[env.id];
            return (
              <div
                key={env.id}
                data-focus={env.id}
                className="stack"
                style={{ borderTop: "1px solid var(--row-divider)", paddingTop: 10 }}
              >
                <div className="row spread wrap">
                  <b>{env.title}</b>
                  <span className={`chip ${myTurn(env) ? "amber" : ""}`}>{waitingFor(env)}</span>
                </div>
                <div className="meta">
                  Sent {ago(env.sentAt)}
                  {s
                    ? ` · ${s.signers
                        .map(
                          (x) =>
                            `${x.name}: ${x.status === "signed" ? `signed${x.signedAt ? ` ${day(x.signedAt.slice(0, 10))}` : ""}` : x.status}`,
                        )
                        .join(" · ")}`
                    : ""}
                </div>
                {note ? <div className={`banner small ${note.ok ? "green" : "red"}`}>{note.text}</div> : null}
                <div className="row wrap">
                  {myTurn(env) ? (
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() =>
                        act(env, async () => app.platform.openUrl(await clientFor(env).signingUrl(env.id)))
                      }
                    >
                      Sign now
                    </button>
                  ) : null}
                  {s?.status === "pending" ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        act(
                          env,
                          () => clientFor(env).remind(env.id),
                          "Reminder sent to whoever is next to sign.",
                        )
                      }
                    >
                      Send reminder
                    </button>
                  ) : null}
                  <button type="button" className="btn danger" onClick={() => setCancel(env)}>
                    Cancel &amp; delete from relay
                  </button>
                </div>
              </div>
            );
          })}
        </section>
        {done.length ? (
          <section className="card stack">
            <h2 style={{ margin: 0 }}>Done · back in your folder</h2>
            {done.map((env) => (
              <div key={env.id} data-focus={env.id} className="row spread wrap">
                <span>{env.title}</span>
                <span className="row wrap">
                  <span className="meta">
                    Signed {env.closedAt ? day(env.closedAt.slice(0, 10)) : ""} · relay copy deleted
                  </span>
                  {env.docType === "safe" && env.wireSentAt ? (
                    <span className="chip green">Wire instructions sent</span>
                  ) : env.docType === "safe" && env.receipt ? (
                    <button type="button" className="btn primary" onClick={() => setWire(env)}>
                      Send wire instructions
                    </button>
                  ) : null}
                </span>
              </div>
            ))}
            {done.map((env) =>
              notes[env.id]?.ok ? (
                <div key={`${env.id}-note`} className="banner green small">
                  {notes[env.id]!.text}
                </div>
              ) : null,
            )}
          </section>
        ) : null}
      </main>
      {wire ? <WireDialog env={wire} onClose={() => setWire(null)} /> : null}
      {cancel ? (
        <CancelDialog env={cancel} status={status[cancel.id]} onClose={() => setCancel(null)} />
      ) : null}
    </>
  );
}

function CancelDialog(p: { env: Envelope; status?: EnvelopeStatus; onClose(): void }) {
  const app = useApp();
  const [errors, setErrors] = useState<string[] | null>(null);
  const signed = p.status?.signers.filter((x) => x.status === "signed") ?? [];
  return (
    <Modal open onClose={p.onClose} title="Cancel document">
      <div className="stack">
        <p className="small" style={{ margin: 0 }}>
          The signing links stop working and the relay deletes its copy. Your draft stays in docs/_voided/.
        </p>
        {signed.length ? (
          <div className="banner amber">
            {signed.map((x) => x.name).join(" and ")} already signed. Cancel anyway?
          </div>
        ) : null}
        <ErrorList errors={errors} />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={p.onClose}>
            Keep it
          </button>
          <button
            type="button"
            className="btn primary danger"
            onClick={async () => {
              if (!app.vault) return;
              try {
                const r = relayFor(app.settings, p.env);
                if (r) await relayClient(app.platform, r).remove(p.env.id);
              } catch (e) {
                // already gone on the relay (expired/purged) is fine; anything else stops here
                if (!/not found/i.test((e as Error).message)) return setErrors([(e as Error).message]);
              }
              const r = await voidEnvelope(
                app.platform.fs,
                app.vault,
                app.ctx,
                p.env,
                "Cancelled by the founder",
              );
              if (!r.ok) return setErrors(r.errors);
              app.setVault(r.vault);
              p.onClose();
            }}
          >
            Cancel the document
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** After everyone signed a SAFE: the investor gets the signed copy and where to send the money. */
function WireDialog(p: { env: Envelope; onClose(): void }) {
  const app = useApp();
  const [errors, setErrors] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const docs = [...(app.latest?.docs.entries() ?? [])].filter(([, d]) => !d.removed);
  const wire = wireDoc(app);
  const signed = docs.find(([id]) => id === p.env.docId)?.[1];
  const to = p.env.signers.filter((x) => x.email !== app.settings.email);
  const names = to.map((x) => x.name).join(" and ");
  const upload = async () => {
    setErrors(null);
    const e = await uploadWire(app);
    if (e) setErrors([e]);
  };

  async function send() {
    if (!app.vault || !wire || !signed || !p.env.receipt) return;
    setErrors(null);
    setBusy(true);
    try {
      const r = relayFor(app.settings, p.env);
      if (!r) return setErrors([`Sent through ${p.env.relay}, which isn't set up on this computer.`]);
      const read = (rel: string) => app.platform.fs.readBytes(`${app.vault!.root}/${rel}`);
      await relayClient(app.platform, r).wire(
        {
          envelope_id: p.env.id,
          receipt: p.env.receipt,
          title: p.env.title,
          company: (app.latest?.issuer?.legal_name as string) ?? "The company",
          signers: p.env.signers,
        },
        await read(signed.data.path),
        await read(wire[1].data.path),
      );
      const errs = await app.run([
        {
          kind: "app",
          type: "wire_sent",
          data: { envelope_id: p.env.id, doc_id: wire[0], to: to.map((x) => x.email) },
        },
      ]);
      if (errs) return setErrors([`Sent, but couldn't record it: ${errs.join(" ")}`]);
      p.onClose();
    } catch (e) {
      setErrors([`Nothing was sent: ${(e as Error).message ?? e}`]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={p.onClose} title="Send wire instructions">
      <div className="stack">
        {!wire ? (
          <>
            <p className="small" style={{ margin: 0 }}>
              Upload your wire instructions first: the PDF from your bank with the account details. It's kept
              in docs/company/ for the next investor.
            </p>
            <div className="row">
              <button type="button" className="btn" onClick={upload}>
                Choose PDF…
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="small" style={{ margin: 0 }}>
              Emails {names} the fully signed “{p.env.title}” and your wire instructions (
              {String(wire[1].data.original_name ?? wire[1].data.path)}) from signing@capfolder.com. Replies
              go to {app.settings.email}.
            </p>
            <div className="banner amber small">
              The email asks them to confirm the bank details with you by phone before wiring. Fake wire
              instructions are the most common startup fraud.
            </div>
            <button
              type="button"
              className="btn link small"
              onClick={upload}
              style={{ alignSelf: "flex-start" }}
            >
              Use different wire instructions…
            </button>
          </>
        )}
        {!signed ? (
          <div className="banner red small">The signed copy isn't in your folder any more.</div>
        ) : null}
        <ErrorList errors={errors} />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={p.onClose}>
            Cancel
          </button>
          {wire ? (
            <button type="button" className="btn primary" disabled={busy || !signed} onClick={send}>
              {busy ? "Sending…" : `Send to ${names}`}
            </button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
