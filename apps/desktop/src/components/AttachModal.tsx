import { useEffect, useState } from "react";
import { todayIso } from "../fmt";
import { useApp } from "../state";
import { attachDocument } from "../vault";
import { DateInput } from "./DateInput";
import { ErrorList, Field, Modal } from "./ui";

export const DOC_TYPES: { value: string; label: string }[] = [
  { value: "safe", label: "SAFE" },
  { value: "option_grant", label: "Option grant" },
  { value: "spa", label: "Stock purchase agreement" },
  { value: "ciiaa", label: "IP assignment (CIIAA)" },
  { value: "83b", label: "83(b) election" },
  { value: "board_consent", label: "Board consent" },
  { value: "plan", label: "Equity incentive plan" },
  { value: "company_certificate", label: "Certificate of incorporation" },
  { value: "company_bylaws", label: "Bylaws" },
  { value: "other", label: "Other" },
];

/** F-26: pick a file → it's copied into docs/, hashed, and linked to a holding, person or plan. */
export function AttachModal(p: { open: boolean; onClose(): void; target?: string; docType?: string }) {
  const app = useApp();
  const s = app.latest;
  const [file, setFile] = useState<{ path: string; name: string } | null>(null);
  const [docType, setDocType] = useState(p.docType ?? "");
  const [target, setTarget] = useState(p.target ?? "");
  const [date, setDate] = useState(todayIso());
  const [errors, setErrors] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!p.open) return;
    setFile(null);
    setErrors(null);
    setTarget(p.target ?? "");
    const sec = p.target ? s?.securities.get(p.target) : undefined;
    setDocType(
      p.docType ??
        (sec?.kind === "convertible"
          ? "safe"
          : sec?.kind === "equity"
            ? "option_grant"
            : sec
              ? "spa"
              : "other"),
    );
    setDate(sec?.date ?? todayIso());
  }, [p.open, p.target, p.docType, s]);
  if (!s) return null;

  const name = (id: string) => s.stakeholders.get(id)?.name?.legal_name ?? id;
  const targets = [
    ...[...s.securities.values()].map((x) => ({
      id: x.id,
      label: `${name(x.stakeholderId)} · ${x.id}`,
      person: name(x.stakeholderId),
    })),
    ...[...s.stakeholders.keys()].map((id) => ({ id, label: `${name(id)} (person)`, person: name(id) })),
    ...[...s.plans.entries()].map(([id, pl]) => ({
      id,
      label: `${pl.data.plan_name} (plan)`,
      person: "company",
    })),
  ];
  const picked = targets.find((t) => t.id === target);

  async function save() {
    if (!file) return setErrors(["Choose a file first."]);
    if (!app.vault) return;
    setBusy(true);
    try {
      const bytes = await app.platform.fs.readBytes(file.path);
      const r = await attachDocument(app.platform.fs, app.vault, app.ctx, {
        originalName: file.name,
        bytes,
        docType,
        date,
        person: picked?.person ?? "company",
        target: target || undefined,
      });
      if (r.ok === "duplicate") return setErrors(["This file is already in your folder (same content)."]);
      if (!r.ok) return setErrors(r.errors);
      app.setVault(r.vault);
      p.onClose();
    } catch (e) {
      setErrors([(e as Error).message]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={p.open} onClose={p.onClose} title="Attach a document">
      <div className="stack">
        <div className="row">
          <button
            type="button"
            className="btn"
            onClick={async () => {
              const f = await app.platform.pickFile("Choose a signed document");
              if (f) setFile(f);
            }}
          >
            Choose file…
          </button>
          <span className="mono small">{file?.name ?? "No file chosen"}</span>
        </div>
        <Field label="What is it?">
          <select className="inp" value={docType} onChange={(e) => setDocType(e.target.value)}>
            {DOC_TYPES.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Proof for">
          <select className="inp" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Company document (not linked)</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Signed on">
          <DateInput value={date} onChange={setDate} />
        </Field>
        <p className="meta">
          The file is copied into your folder. The original stays where it is. Nothing is uploaded.
        </p>
        <ErrorList errors={errors} />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={p.onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={save} disabled={busy}>
            Attach
          </button>
        </div>
      </div>
    </Modal>
  );
}
