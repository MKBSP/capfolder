import { computeGaps } from "@capfolder/core";
import { useState } from "react";
import { type CheckItem, checklist } from "../checklist";
import { AttachModal } from "../components/AttachModal";
import { MainHeader } from "../components/Header";
import { LawyerDialog } from "../components/LawyerDialog";
import { SendDialog } from "../components/SendDialog";
import { ErrorList, Field, Modal } from "../components/ui";
import { useApp } from "../state";
import { SERIES_SEED, TEMPLATE_LINKS } from "../templates";
import { removeDocument, renameDocument, replaceDocument } from "../vault";

/** Documents.html (F-26, F-27): the due-diligence checklist, attach and remove. */
export function Documents() {
  const app = useApp();
  const s = app.state;
  const [attach, setAttach] = useState<{ target?: string; docType?: string } | null>(null);
  const [remove, setRemove] = useState<CheckItem | null>(null);
  const [rename, setRename] = useState<string | null>(null);
  const [replace, setReplace] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [sending, setSending] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  if (!s) return null;
  const c = checklist(s, computeGaps(s));
  const missing = c.total - c.done;
  const all = [...s.docs.entries()]
    .filter(([, d]) => !d.removed)
    .sort(([, a], [, b]) => String(a.data.path).localeCompare(String(b.data.path)));
  return (
    <>
      <MainHeader>
        <button type="button" className="btn" onClick={() => app.go({ name: "sort" })}>
          Add documents
        </button>
        <button type="button" className="btn" onClick={() => setSending(true)}>
          Send for signature
        </button>
        <button type="button" className="btn primary" onClick={() => setSharing(true)}>
          Share with lawyer (.zip)
        </button>
      </MainHeader>
      {sending ? (
        <SendDialog
          defaults={{ title: "", signers: [], docType: "other", person: "company" }}
          onClose={() => setSending(false)}
          onSent={(sent) => app.go({ name: "signatures", sent })}
        />
      ) : null}
      {sharing ? (
        <LawyerDialog
          open
          onClose={() => setSharing(false)}
          onSaved={(path) => {
            setSharing(false);
            setSaved(path);
          }}
        />
      ) : null}
      {app.route.name === "documents" && app.route.imported ? (
        <div className="banner green" style={{ margin: "12px 24px 0" }}>
          Imported. Reports don't include signed documents: attach them below so each holding shows its
          paperwork.
        </div>
      ) : null}
      {saved ? (
        <div className="banner green" style={{ margin: "12px 24px 0" }}>
          Saved <span className="mono">{saved}</span>{" "}
          <button type="button" className="btn link small" onClick={() => app.platform.reveal(saved)}>
            Show in folder
          </button>
        </div>
      ) : null}
      <main className="wide" style={{ paddingTop: 24 }}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="row spread">
            <div>
              <div className="meta">Due-diligence ready</div>
              <div className="num" style={{ fontSize: 28 }}>
                {c.done} / {c.total}
              </div>
            </div>
            <span className="bar" style={{ width: 240 }}>
              <span style={{ width: `${c.total ? Math.round((c.done / c.total) * 100) : 0}%` }} />
            </span>
          </div>
          <p className="muted small" style={{ margin: "8px 0 0" }}>
            {missing
              ? `${missing} document${missing > 1 ? "s" : ""} missing. Fix them before an investor asks.`
              : "Everything is on file."}
          </p>
        </div>
        <div className="stack">
          {c.groups
            .filter((g) => g.items.length)
            .map((g) => {
              const done = g.items.filter((i) => i.ok).length;
              return (
                <section key={g.title} className="card">
                  <div className="row spread" style={{ marginBottom: 8 }}>
                    <h2 style={{ margin: 0 }}>{g.title}</h2>
                    <span className={`chip ${done === g.items.length ? "green" : "amber"}`}>
                      {done}/{g.items.length}
                    </span>
                  </div>
                  {g.items.map((i) => (
                    <div
                      key={i.label}
                      className="row"
                      style={{ padding: "8px 0", borderTop: "1px solid var(--row-divider)" }}
                    >
                      <span
                        style={{
                          width: 18,
                          color: i.ok ? "var(--green-600)" : "var(--amber-text)",
                          fontWeight: 600,
                        }}
                      >
                        {i.ok ? "✓" : "!"}
                      </span>
                      <span className="grow">
                        {i.label}
                        {!i.ok && i.note ? (
                          <span className="meta" style={{ display: "block" }}>
                            {i.note}
                          </span>
                        ) : null}
                      </span>
                      {i.ok ? (
                        <>
                          <span className="mono meta">{i.path}</span>
                          <button
                            type="button"
                            className="btn link small danger"
                            onClick={() => setRemove(i)}
                          >
                            Remove
                          </button>
                        </>
                      ) : (
                        <>
                          {TEMPLATE_LINKS[i.docType] ? (
                            <button
                              type="button"
                              className="btn link small"
                              title="Opens a free template in your browser"
                              onClick={() => app.platform.openUrl(TEMPLATE_LINKS[i.docType]!)}
                            >
                              Get a template
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="btn small"
                            onClick={() => setAttach({ target: i.target, docType: i.docType })}
                          >
                            Attach
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </section>
              );
            })}
        </div>
        <Templates />
        {all.length ? (
          <section className="card" aria-label="All documents" style={{ marginTop: 16 }}>
            <h2 style={{ marginTop: 0 }}>All documents</h2>
            {all.map(([id, d]) => (
              <div
                key={id}
                className="row"
                style={{ padding: "8px 0", borderTop: "1px solid var(--row-divider)" }}
              >
                <span className="grow mono small">{String(d.data.path)}</span>
                {d.data.flags?.includes?.("draft") ? (
                  <span className="chip amber" title="Filed as an unsigned draft: it doesn't count as proof">
                    draft
                  </span>
                ) : null}
                <button type="button" className="btn link small" onClick={() => setRename(id)}>
                  Rename…
                </button>
                <button type="button" className="btn link small" onClick={() => setReplace(id)}>
                  Replace…
                </button>
              </div>
            ))}
          </section>
        ) : null}
      </main>
      {rename ? <RenameDialog docId={rename} onClose={() => setRename(null)} /> : null}
      {replace ? <ReplaceDialog docId={replace} onClose={() => setReplace(null)} /> : null}
      <AttachModal
        open={!!attach}
        target={attach?.target}
        docType={attach?.docType}
        onClose={() => setAttach(null)}
      />
      {remove ? <RemoveDialog item={remove} onClose={() => setRemove(null)} /> : null}
    </>
  );
}

/** Starting points for a priced round: Series Seed (public domain) copied into drafts/ to fill in. */
function Templates() {
  const app = useApp();
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!app.vault) return null;
  const root = app.vault.root;
  return (
    <section className="card" aria-label="Templates" style={{ marginTop: 16 }}>
      <h2 style={{ marginTop: 0 }}>Templates</h2>
      <p className="small">
        <b>Series Seed</b>: a standard set for a priced seed round (term sheet, investment agreement,
        charter), public domain, by Fenwick &amp; West. Copied into your folder as text to fill in; have a
        lawyer review it. SAFEs use Y Combinator's template (New → SAFE).
      </p>
      <div className="row">
        <button
          type="button"
          className="btn small"
          onClick={async () => {
            setError(null);
            try {
              await app.platform.fs.mkdir(`${root}/drafts/series-seed`);
              for (const [name, text] of Object.entries(SERIES_SEED))
                await app.platform.fs.writeText(`${root}/drafts/series-seed/${name}`, text);
              setDone(`Copied ${Object.keys(SERIES_SEED).length} files to drafts/series-seed.`);
            } catch (e) {
              setError(`Couldn't copy the templates: ${(e as Error).message ?? e}`);
            }
          }}
        >
          Copy Series Seed to drafts/
        </button>
        {done ? (
          <button
            type="button"
            className="btn link small"
            onClick={() => app.platform.reveal(`${root}/drafts/series-seed`)}
          >
            {done} Show
          </button>
        ) : null}
      </div>
      {error ? <ErrorList errors={[error]} /> : null}
    </section>
  );
}

function RemoveDialog({ item, onClose }: { item: CheckItem; onClose(): void }) {
  const app = useApp();
  const [errors, setErrors] = useState<string[] | null>(null);
  const holding = item.target ? app.latest?.securities.get(item.target) : undefined;
  const otherProof = holding
    ? [...(app.latest?.docs.entries() ?? [])].some(
        ([id, d]) =>
          id !== item.docId && !d.removed && (d.links.has(holding.id) || d.links.has(holding.txId)),
      )
    : true;
  return (
    <Modal open onClose={onClose} title="Remove document">
      <div className="stack">
        <p className="small mono">{item.path}</p>
        {holding && !otherProof ? (
          <div className="banner amber">
            This is the only signed document for {item.label}. Removing it will show a gap.
          </div>
        ) : null}
        <p className="meta">
          The file moves to docs/_removed/. Capfolder never deletes it; you can empty that folder yourself.
        </p>
        <ErrorList errors={errors} />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary danger"
            onClick={async () => {
              if (!app.vault || !item.docId) return;
              const r = await removeDocument(app.platform.fs, app.vault, app.ctx, item.docId);
              if (!r.ok) return setErrors(r.errors);
              app.setVault(r.vault);
              onClose();
            }}
          >
            Remove
          </button>
        </div>
      </div>
    </Modal>
  );
}

function RenameDialog({ docId, onClose }: { docId: string; onClose(): void }) {
  const app = useApp();
  const path = String(app.latest?.docs.get(docId)?.data.path ?? "");
  const file = path.split("/").at(-1) ?? "";
  const ext = /\.[a-z0-9]+$/i.exec(file)?.[0] ?? "";
  const [name, setName] = useState(file.slice(0, file.length - ext.length));
  const [errors, setErrors] = useState<string[] | null>(null);
  return (
    <Modal open onClose={onClose} title="Rename document">
      <div className="stack">
        <Field
          label="File name"
          hint={`Stays in ${path.slice(0, path.lastIndexOf("/") + 1)}, as ${ext || "is"}.`}
        >
          <input className="inp" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <ErrorList errors={errors} />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={async () => {
              if (!app.vault) return;
              const r = await renameDocument(app.platform.fs, app.vault, app.ctx, docId, name);
              if (!r.ok) return setErrors(r.errors);
              app.setVault(r.vault);
              onClose();
            }}
          >
            Rename
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ReplaceDialog({ docId, onClose }: { docId: string; onClose(): void }) {
  const app = useApp();
  const path = String(app.latest?.docs.get(docId)?.data.path ?? "");
  const [file, setFile] = useState<{ path: string; name: string } | null>(null);
  const [errors, setErrors] = useState<string[] | null>(null);
  return (
    <Modal open onClose={onClose} title="Replace document">
      <div className="stack">
        <p className="small">
          A better copy (the signed one, a cleaner scan) takes the place of{" "}
          <span className="mono">{path}</span>, with the same links. The old file moves to docs/_removed/.
        </p>
        <div className="row">
          <button
            type="button"
            className="btn"
            onClick={async () => setFile(await app.platform.pickFile("Choose the new copy"))}
          >
            Choose file…
          </button>
          {file ? <span className="mono small">{file.name}</span> : null}
        </div>
        <ErrorList errors={errors} />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!file}
            onClick={async () => {
              if (!app.vault || !file) return;
              const bytes = await app.platform.fs.readBytes(file.path);
              const r = await replaceDocument(app.platform.fs, app.vault, app.ctx, docId, {
                originalName: file.name,
                bytes,
              });
              if (!r.ok) return setErrors(r.errors);
              app.setVault(r.vault);
              onClose();
            }}
          >
            Replace
          </button>
        </div>
      </div>
    </Modal>
  );
}
