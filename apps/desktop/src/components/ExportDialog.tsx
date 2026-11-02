import { type ExportFormat, exportFile } from "@capfolder/vault";
import { useState } from "react";
import { useApp } from "../state";
import { DateInput } from "./DateInput";
import { ErrorList, Field, Modal } from "./ui";

const FORMATS: { id: ExportFormat; label: string; note: string }[] = [
  {
    id: "xlsx",
    label: "Excel (.xlsx), full cap table",
    note: "An overview with charts, then summary, ownership, a ledger per share class and option plan, convertibles and voting, like a Pulley or Carta export, plus vesting by month and missing documents.",
  },
  { id: "csv", label: "CSV (.csv)", note: "Every holding on one row, with all its ledger columns." },
  { id: "ocf", label: "OCF (.zip)", note: "Open Cap Table Format, for lawyers and other cap table tools." },
];

/** F-29: export the cap table as of a date. */
export function ExportDialog(p: { open: boolean; onClose(): void; onSaved(path: string): void }) {
  const app = useApp();
  const [asOf, setAsOf] = useState(app.asOf);
  // Not incorporated yet (CAP-61): only the promised split, as CSV, as it stands today.
  const promising = !app.latest?.issuer;
  const formats = promising
    ? [
        {
          id: "csv" as const,
          label: "Promised split (CSV)",
          note: "Promised — not legal until the company exists.",
        },
      ]
    : FORMATS;
  const [format, setFormat] = useState<ExportFormat>(promising ? "csv" : "xlsx");
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
        {promising ? null : (
          <Field label="As of">
            <DateInput value={asOf} onChange={setAsOf} />
          </Field>
        )}
        <div className="stack" role="radiogroup" aria-label="Format">
          {formats.map((f) => (
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
