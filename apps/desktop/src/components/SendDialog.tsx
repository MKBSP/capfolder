import type { EventDraft, SignField, SignSpot } from "@capfolder/core";
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

/** A filled-in form (YC's SAFE) made when sending, so it carries the founder's name and title. */
export interface SendTemplate {
  label: string;
  title?: string; // envelope title, when it differs from the dialog's (side letters)
  build(signer: {
    name: string;
    title: string;
  }): Promise<{ pdf: Uint8Array; signaturePage?: number; by: SignSpot[] }>;
}

type Pdf = { name: string; bytes: Uint8Array };

/** F-11/F-16: pick the PDF, check the signers (you sign last), send. Asks for the email first if it isn't verified. */
export function SendDialog(p: {
  defaults: SendDefaults;
  template?: SendTemplate; // offered first; the founder can still upload their own
  noTemplate?: string; // why there's no template for these terms
  sideLetter?: SendTemplate; // a ready side letter, offered next to uploading one
  onClose(): void;
  onSent(sent: { titles: string[]; emails: string[]; warning?: string }): void;
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
  const [file, setFile] = useState<Pdf | null>(null);
  const [own, setOwn] = useState(!p.template);
  const [myTitle, setMyTitle] = useState("CEO");
  const [side, setSide] = useState(false);
  const [sideOwn, setSideOwn] = useState(!p.sideLetter);
  const [sideFile, setSideFile] = useState<Pdf | null>(null);
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
    if (own && !file) errs.push("Choose the PDF to send.");
    if (side && sideOwn && !sideFile) errs.push("Choose the side letter PDF.");
    const signer = { name: (myName || founder).trim(), title: myTitle.trim() };
    if (!own && !signer.name) errs.push("Enter your name: it goes on the company's signature block.");
    if (!title.trim()) errs.push("Give the document a title.");
    if (!all.length) errs.push("Add at least one signer.");
    if (all.some((s) => !s.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email)))
      errs.push("Every signer needs a name and an email.");
    if (new Set(all.map((s) => s.email)).size !== all.length) errs.push("Each signer needs their own email.");
    if (errs.length) return setErrors(errs);
    if (!app.vault) return;
    setBusy(true);
    try {
      const client = relayClient(app.platform, app.settings);
      // One investor and you last: sign on the form's own By: lines (company block first, then the investor's).
      type Placed = { fields: SignField[]; originalPages: number };
      const place = (b: { pdf: Uint8Array; signaturePage?: number; by: SignSpot[] }) => ({
        pdf: b.pdf,
        placed:
          b.signaturePage && b.by.length === 2 && all.length === 2 && meLast
            ? ({
                fields: [
                  { signer: 0, ...b.by[1]! },
                  { signer: 1, ...b.by[0]! },
                ],
                originalPages: b.signaturePage - 1,
              } as Placed)
            : undefined,
      });
      const one = async (
        vault: NonNullable<typeof app.vault>,
        d: { pdf: Uint8Array; placed?: Placed; title: string; docType: string; main: boolean },
      ) =>
        sendForSignature(app.platform.fs, vault, app.ctx, client, {
          pdf: d.pdf,
          title: d.title,
          signers: all,
          docType: d.docType,
          person: p.defaults.person,
          target: p.defaults.target,
          onSigned: d.main ? p.defaults.onSigned : undefined, // the side letter adds nothing to the cap table
          relayUrl: app.settings.relayUrl,
          placed: d.placed,
        });
      const doc = own ? { pdf: file!.bytes } : place(await p.template!.build(signer));
      const r = await one(app.vault, { ...doc, title: title.trim(), docType, main: true });
      if (!r.ok) return setErrors(r.errors);
      app.setVault(r.vault);
      if ((meLast || !own) && !founder && myName.trim() !== app.settings.signerName)
        await app.setSettings((s) => ({ ...s, signerName: myName.trim() }));
      const titles = [title.trim()];
      let warning: string | undefined;
      if (side) {
        const sideTitle = (sideOwn ? undefined : p.sideLetter?.title) ?? `Side letter · ${p.defaults.person}`;
        try {
          const sideDoc = sideOwn ? { pdf: sideFile!.bytes } : place(await p.sideLetter!.build(signer));
          const s2 = await one(r.vault, {
            ...sideDoc,
            title: sideTitle,
            docType: "side_letter",
            main: false,
          });
          if (s2.ok) {
            app.setVault(s2.vault);
            titles.push(sideTitle);
          } else
            warning = `The side letter wasn't sent: ${s2.errors.join(" ")} Send it on its own from Documents.`;
        } catch (e) {
          warning = `The side letter wasn't sent: ${(e as Error).message ?? e}`;
        }
      }
      p.onSent({ titles, emails: all.map((s) => s.email).filter((e) => e !== app.settings.email), warning });
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
          <div className="stack" role="radiogroup" aria-label="Document">
            {p.template ? (
              <label className="row small">
                <input type="radio" name="send-doc" checked={!own} onChange={() => setOwn(false)} />
                <span>{p.template.label}, filled in from this form</span>
              </label>
            ) : null}
            <label className="row small">
              <input type="radio" name="send-doc" checked={own} onChange={() => setOwn(true)} />
              <span>Your own PDF</span>
            </label>
            {p.noTemplate && !p.template ? (
              <p className="meta" style={{ margin: 0 }}>
                {p.noTemplate}
              </p>
            ) : null}
            {own ? (
              <PickPdf label="Choose PDF…" file={file} onPick={setFile} onError={(e) => setErrors([e])} />
            ) : null}
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
            {(meLast || !own) && !founder ? (
              <Field label="Your name, as it should appear">
                <input className="inp" value={myName} onChange={(e) => setMyName(e.target.value)} />
              </Field>
            ) : null}
            {!own ? (
              <Field label="Your title">
                <input className="inp" value={myTitle} onChange={(e) => setMyTitle(e.target.value)} />
              </Field>
            ) : null}
          </div>
          <div className="stack">
            <label className="row small">
              <input type="checkbox" checked={side} onChange={(e) => setSide(e.target.checked)} />
              <span>Add a side letter</span>
            </label>
            {side ? (
              <div className="stack" style={{ paddingLeft: 24 }}>
                <p className="meta" style={{ margin: 0 }}>
                  Sent as its own document, right after this one: the same people sign it separately.
                </p>
                {p.sideLetter ? (
                  <label className="row small">
                    <input
                      type="radio"
                      name="side-doc"
                      checked={!sideOwn}
                      onChange={() => setSideOwn(false)}
                    />
                    <span>{p.sideLetter.label}</span>
                  </label>
                ) : null}
                <label className="row small">
                  <input type="radio" name="side-doc" checked={sideOwn} onChange={() => setSideOwn(true)} />
                  <span>Upload a side letter</span>
                </label>
                {sideOwn ? (
                  <PickPdf
                    label="Choose side letter PDF…"
                    file={sideFile}
                    onPick={setSideFile}
                    onError={(e) => setErrors([e])}
                  />
                ) : null}
              </div>
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

/** A "Choose PDF…" button and the chosen file's name, cut short if it's long. */
export function PickPdf(p: {
  label: string;
  file: Pdf | null;
  onPick(f: Pdf): void;
  onError(e: string): void;
}) {
  const app = useApp();
  return (
    <div className="row">
      <button
        type="button"
        className="btn"
        onClick={async () => {
          const f = await app.platform.pickFile("Choose a PDF", ["pdf"]);
          if (!f) return;
          try {
            p.onPick({ name: f.name, bytes: await app.platform.fs.readBytes(f.path) });
          } catch (e) {
            p.onError(`Couldn't read ${f.name}: ${(e as Error).message ?? e}`);
          }
        }}
      >
        {p.label}
      </button>
      <span className="small muted clip grow" title={p.file?.name}>
        {p.file ? p.file.name : "No file yet"}
      </span>
    </div>
  );
}
