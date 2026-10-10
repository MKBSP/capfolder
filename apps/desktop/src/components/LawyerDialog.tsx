import { capTableRows, type LawyerScope } from "@capfolder/core";
import { useState } from "react";
import { day } from "../fmt";
import { useApp } from "../state";
import { lawyerZip } from "../vault";
import { ErrorList, Field, Modal } from "./ui";

/** F-30: build the lawyer zip (everything, or one person's papers). Nothing is uploaded. */
export function LawyerDialog(p: { open: boolean; onClose(): void; onSaved(path: string): void }) {
  const app = useApp();
  const [kind, setKind] = useState<"all" | "person">("all");
  const [person, setPerson] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[] | null>(null);
  const s = app.state;
  if (!app.vault || !s) return null;
  const vault = app.vault;
  const holders = new Set(capTableRows(s).map((r) => s.securities.get(r.securityId)?.stakeholderId));
  const people = [...s.stakeholders.values()].filter((x) => holders.has(x.id));

  async function build() {
    setErrors(null);
    if (kind === "person" && !person) return setErrors(["Pick a person."]);
    const scope: LawyerScope = kind === "all" ? { kind: "all" } : { kind: "person", stakeholderId: person };
    setBusy(true);
    try {
      const z = await lawyerZip(app.platform.fs, vault, app.asOf, scope, app.ctx);
      const path = await app.platform.saveBytes(z.name, z.data);
      if (path) p.onSaved(path);
    } catch (e) {
      setErrors([`Couldn't build the zip: ${(e as Error).message ?? e}`]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={p.open} onClose={p.onClose} title="Share with lawyer">
      <div className="stack">
        <p className="muted small" style={{ margin: 0 }}>
          A .zip as of {day(app.asOf)}: the cap table (.xlsx, .pdf, .csv), every attached document, the full
          record (events.jsonl and OCF) and the What's missing list. You send it however you like; nothing is
          uploaded.
        </p>
        <label className={`opt ${kind === "all" ? "on" : ""}`}>
          <input type="radio" name="scope" checked={kind === "all"} onChange={() => setKind("all")} />
          <b>Everything</b>
        </label>
        <label className={`opt ${kind === "person" ? "on" : ""}`}>
          <input type="radio" name="scope" checked={kind === "person"} onChange={() => setKind("person")} />
          <span>
            <b>One person</b>
            <span className="meta" style={{ display: "block" }}>
              Only their holdings, documents and gaps. No full cap table or record.
            </span>
          </span>
        </label>
        {kind === "person" ? (
          <Field label="Person">
            <select className="inp" value={person} onChange={(e) => setPerson(e.target.value)}>
              <option value="">Choose…</option>
              {people.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name?.legal_name ?? x.id}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <ErrorList errors={errors} />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={p.onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={build} disabled={busy}>
            {busy ? "Building…" : "Build zip…"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
