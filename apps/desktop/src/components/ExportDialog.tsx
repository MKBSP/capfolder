import { useState } from "react";
import { useApp } from "../state";
import { type ExportFormat, exportFile } from "../vault";
import { DateInput } from "./DateInput";
import { ErrorList, Field, Modal } from "./ui";

const FORMATS: { id: ExportFormat; label: string; note: string }[] = [
  {
    id: "xlsx",
    label: "Excel (.xlsx), full cap table",
    note: "Summary, ownership, a ledger per share class and option plan, convertibles and voting, like a Pulley or Carta export.",
  },
  { id: "csv", label: "CSV (.csv)", note: "Every holding on one row, with all its ledger columns." },
  { id: "ocf", label: "OCF (.zip)", note: "Open Cap Table Format, for lawyers and other cap table tools." },
];

/** F-29: export the cap table as of a date. */
export function ExportDialog(p: { open: boolean; onClose(): void; onSaved(path: string): void }) {
  const app = useApp();
  const [asOf, setAsOf] = useState(app.asOf);
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [errors, setErrors] = useState<string[] | null>(null);
  if (!app.vault) return null;
  const vault = app.vault;

  async function save() {
    setErrors(null);
    if (!asOf) return setErrors(["Pick a date."]);
    const f = exportFile(vault, asOf, format, app.ctx);
    if ("error" in f) return setErrors([f.error]);
    const path =
      typeof f.data === "string"
        ? await app.platform.saveText(f.name, f.data)
        : await app.platform.saveBytes(f.name, f.data);
    if (path) p.onSaved(path);
  }

  return (
    <Modal open={p.open} onClose={p.onClose} title="Export">
      <div className="stack">
        <Field label="As of">
          <DateInput value={asOf} onChange={setAsOf} />
        </Field>
        <div className="stack" role="radiogroup" aria-label="Format">
          {FORMATS.map((f) => (
            <label key={f.id} className={`opt ${format === f.id ? "on" : ""}`}>
              <input type="radio" name="format" checked={format === f.id} onChange={() => setFormat(f.id)} />
              <span>
                <b>{f.label}</b>
                <span className="meta" style={{ display: "block" }}>
                  {f.note}
                </span>
              </span>
            </label>
          ))}
        </div>
        <ErrorList errors={errors} />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={p.onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={save}>
            Save…
          </button>
        </div>
      </div>
    </Modal>
  );
}
