import { computeGaps } from "@capfolder/core";
import { useState } from "react";
import { type CheckItem, checklist } from "../checklist";
import { AttachModal } from "../components/AttachModal";
import { MainHeader } from "../components/Header";
import { ErrorList, Modal } from "../components/ui";
import { useApp } from "../state";
import { removeDocument } from "../vault";

/** Documents.html (F-26, F-27): the due-diligence checklist, attach and remove. */
export function Documents() {
  const app = useApp();
  const s = app.state;
  const [attach, setAttach] = useState<{ target?: string; docType?: string } | null>(null);
  const [remove, setRemove] = useState<CheckItem | null>(null);
  if (!s) return null;
  const c = checklist(s, computeGaps(s));
  const missing = c.total - c.done;
  return (
    <>
      <MainHeader>
        <button type="button" className="btn" onClick={() => setAttach({})}>
          Add documents
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={() =>
            app.go({
              name: "comingSoon",
              title: "Share with lawyer",
              milestone: "M6",
              text: "A .zip with the cap table, every signed PDF, events.jsonl and the What's missing list.",
            })
          }
        >
          Share with lawyer (.zip)
        </button>
      </MainHeader>
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
                        <button
                          type="button"
                          className="btn small"
                          onClick={() => setAttach({ target: i.target, docType: i.docType })}
                        >
                          Attach
                        </button>
                      )}
                    </div>
                  ))}
                </section>
              );
            })}
        </div>
      </main>
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
