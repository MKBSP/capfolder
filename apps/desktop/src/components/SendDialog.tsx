import type { EventDraft } from "@capfolder/core";
import { useState } from "react";
import { relayClient } from "../signing";
import { useApp } from "../state";
import { DOC_FOLDER, sendForSignature } from "../vault";
import { EmailVerify } from "./EmailVerify";
import { ErrorList, Field, Modal } from "./ui";

export interface SendDefaults {
  title: string;
  signers: { name: string; email: string }[]; // everyone but the founder, in order
  docType: string;
  person: string; // for the filed name: docs/<type>/<date>_<person>_<type>.pdf
  target?: string; // the holding the signed copy is linked to
  onSigned?: EventDraft[]; // recorded once everyone has signed
}

const DOC_TYPES = Object.keys(DOC_FOLDER);

/** F-11/F-16: pick the PDF, check the signers (you sign last), send. Asks for the email first if it isn't verified. */
export function SendDialog(p: {
  defaults: SendDefaults;
  onClose(): void;
  onSent(sent: { title: string; emails: string[] }): void;
}) {
  const app = useApp();
  const founder = app.settings.email
    ? ([...(app.latest?.stakeholders.values() ?? [])].find(
        (s) => s.contact_info?.emails?.[0]?.email_address?.toLowerCase() === app.settings.email,
      )?.name?.legal_name ?? "")
    : "";
  const [title, setTitle] = useState(p.defaults.title);
  const [docType, setDocType] = useState(p.defaults.docType);
  const [signers, setSigners] = useState(
    p.defaults.signers.length ? p.defaults.signers : [{ name: "", email: "" }],
  );
  const [meLast, setMeLast] = useState(true);
  const [myName, setMyName] = useState(founder || app.settings.signerName);
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[] | null>(null);
  const verified = !!app.settings.relayToken && !!app.settings.email;

  async function send() {
    setErrors(null);
    const filled = signers.filter((s) => s.name.trim() || s.email.trim()); // an empty row is just unused
    const all = [...filled, ...(meLast ? [{ name: myName || founder, email: app.settings.email }] : [])].map(
      (s) => ({
        name: s.name.trim(),
        email: s.email.trim().toLowerCase(),
      }),
    );
    const errs: string[] = [];
    if (!file) errs.push("Choose the PDF to send.");
    if (!title.trim()) errs.push("Give the document a title.");
    if (!all.length) errs.push("Add at least one signer.");
    if (all.some((s) => !s.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email)))
      errs.push("Every signer needs a name and an email.");
    if (new Set(all.map((s) => s.email)).size !== all.length) errs.push("Each signer needs their own email.");
    if (errs.length) return setErrors(errs);
    if (!app.vault || !file) return;
    setBusy(true);
    try {
      const r = await sendForSignature(
        app.platform.fs,
        app.vault,
        app.ctx,
        relayClient(app.platform, app.settings),
        {
          pdf: file.bytes,
          title: title.trim(),
          signers: all,
          docType,
          person: p.defaults.person,
          target: p.defaults.target,
          onSigned: p.defaults.onSigned,
          relayUrl: app.settings.relayUrl,
        },
      );
      if (!r.ok) return setErrors(r.errors);
      app.setVault(r.vault);
      if (meLast && !founder && myName.trim() !== app.settings.signerName)
        await app.setSettings((s) => ({ ...s, signerName: myName.trim() }));
      p.onSent({
        title: title.trim(),
        emails: all.map((s) => s.email).filter((e) => e !== app.settings.email),
      });
    } catch (e) {
      setErrors([`Nothing was sent: ${(e as Error).message ?? e}`]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={p.onClose} title="Send for signature">
      {!verified ? (
        <div className="stack">
          <p className="small" style={{ margin: 0 }}>
            Signing requests go out through the signing relay. Verify your email once first.
          </p>
          <EmailVerify onVerified={() => setErrors(null)} action="Verify" />
        </div>
      ) : (
        <div className="stack">
          <Field label="Title">
            <input className="inp" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <div className="row">
            <button
              type="button"
              className="btn"
              onClick={async () => {
                const f = await app.platform.pickFile("Choose the PDF to send", ["pdf"]);
                if (!f) return;
                try {
                  setFile({ name: f.name, bytes: await app.platform.fs.readBytes(f.path) });
                } catch (e) {
                  setErrors([`Couldn't read ${f.name}: ${(e as Error).message ?? e}`]);
                }
              }}
            >
              Choose PDF…
            </button>
            <span className="small muted">{file ? file.name : "No file yet"}</span>
          </div>
          <Field label="What is it?">
            <select className="inp" value={docType} onChange={(e) => setDocType(e.target.value)}>
              {DOC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </Field>
          <div className="stack">
            <span className="lbl">Signers, in order</span>
            {signers.map((s, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
              <div key={i} className="grid2">
                <input
                  className="inp"
                  aria-label={`Signer ${i + 1} name`}
                  placeholder="Name"
                  value={s.name}
                  onChange={(e) =>
                    setSigners(signers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                  }
                />
                <input
                  className="inp"
                  aria-label={`Signer ${i + 1} email`}
                  placeholder="Email"
                  type="email"
                  value={s.email}
                  onChange={(e) =>
                    setSigners(signers.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))
                  }
                />
              </div>
            ))}
            <div className="row">
              <button
                type="button"
                className="btn link small"
                onClick={() => setSigners([...signers, { name: "", email: "" }])}
              >
                + Signer
              </button>
              {signers.length > 1 ? (
                <button
                  type="button"
                  className="btn link small"
                  onClick={() => setSigners(signers.slice(0, -1))}
                >
                  Remove last
                </button>
              ) : null}
            </div>
            <label className="row small">
              <input type="checkbox" checked={meLast} onChange={(e) => setMeLast(e.target.checked)} />
              <span>I sign last ({app.settings.email})</span>
            </label>
            {meLast && !founder ? (
              <Field label="Your name, as it should appear">
                <input className="inp" value={myName} onChange={(e) => setMyName(e.target.value)} />
              </Field>
            ) : null}
          </div>
          <p className="meta" style={{ margin: 0 }}>
            Capfolder adds a signature page and sends it through{" "}
            {app.settings.relayUrl.replace(/^https?:\/\//, "")}. The copy there is encrypted in transit and on
            disk and deleted once it's signed and filed; it isn't hidden from the relay's operator.
          </p>
          <ErrorList errors={errors} />
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={p.onClose}>
              Cancel
            </button>
            <button type="button" className="btn primary" disabled={busy} onClick={send}>
              {busy ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
