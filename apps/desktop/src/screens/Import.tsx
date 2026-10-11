import {
  buildImport,
  detectImport,
  type EventDraft,
  FIELDS,
  type Field as FieldId,
  guessHeaderRow,
  guessMapping,
  ocfImportDrafts,
  previewDrafts,
  type Row,
  reconcile,
} from "@capfolder/core";
import { useMemo, useState } from "react";
import { DateInput } from "../components/DateInput";
import { CrumbHeader } from "../components/Header";
import { ErrorList, Field, StatCard } from "../components/ui";
import { formatConfig, money, shares, todayIso } from "../fmt";
import { SOURCES, type SourceId } from "../importRules";
import { useApp } from "../state";
import { importIntoVault } from "../vault";

type Sheets = { name: string; rows: string[][]; date1904?: boolean }[];
type Loaded = { fileName: string; bytes: Uint8Array };

/** F-07: pick the source, choose the file, match columns (spreadsheets), check totals, save. */
export function Import() {
  const app = useApp();
  const [source, setSource] = useState<SourceId>("pulley");
  const [file, setFile] = useState<Loaded | null>(null);
  const [step, setStep] = useState<"source" | "map" | "review">("source");
  const [errors, setErrors] = useState<string[] | null>(null);
  const [ocf, setOcf] = useState<EventDraft[] | null>(null);
  const [sheets, setSheets] = useState<Sheets>([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<(FieldId | null)[]>([]);
  const src = SOURCES.find((s) => s.id === source)!;

  async function choose() {
    setErrors(null);
    const f = await app.platform.pickFile(`Choose your ${src.label} export`, [...src.extensions, "json"]);
    if (!f) return;
    let bytes: Uint8Array;
    try {
      bytes = await app.platform.fs.readBytes(f.path);
    } catch (e) {
      return setErrors([`Couldn't read ${f.name}: ${(e as Error).message ?? e}`]);
    }
    const d = detectImport(f.name, bytes);
    if (d.kind === "error") return setErrors([d.error]);
    setFile({ fileName: f.name, bytes });
    if (d.kind === "ocf") {
      const r = ocfImportDrafts(d.files, app.latest?.issuer?.id);
      if ("errors" in r) return setErrors(r.errors);
      setOcf(r.drafts);
      setStep("review");
      return;
    }
    const first = Math.max(
      0,
      d.sheets.findIndex((s) => s.rows.length > 1),
    );
    pickSheet(d.sheets, first);
    setOcf(null);
    setStep("map");
  }

  function pickSheet(all: Sheets, i: number) {
    setSheets(all);
    setSheetIdx(i);
    const rows = all[i]?.rows ?? [];
    const h = guessHeaderRow(rows);
    setHeaderRow(h);
    setMapping(guessMapping(rows[h] ?? []));
  }

  const rows = sheets[sheetIdx]?.rows ?? [];
  const header = rows[headerRow] ?? [];

  return (
    <>
      <CrumbHeader title="Import" />
      <main className="wide" style={{ paddingTop: 24 }}>
        <div className="row small muted" style={{ marginBottom: 12 }}>
          {["Source", "Columns", "Check and save"].map((t, i) => {
            const on = ["source", "map", "review"].indexOf(step) === i;
            return (
              <span key={t} className={`chip ${on ? "green" : ""}`}>
                {i + 1} · {t}
              </span>
            );
          })}
        </div>

        {step === "source" ? (
          <section className="card stack">
            <h1 style={{ margin: 0 }}>Where is your cap table now?</h1>
            <div className="stack" role="radiogroup" aria-label="Source">
              {SOURCES.map((s) => (
                <label key={s.id} className={`opt ${source === s.id ? "on" : ""}`}>
                  <input
                    type="radio"
                    name="source"
                    checked={source === s.id}
                    onChange={() => setSource(s.id)}
                  />
                  <b>{s.label}</b>
                </label>
              ))}
            </div>
            <ol className="small" style={{ margin: 0, paddingLeft: 20 }}>
              {(app.rules.export_guides[source]?.steps ?? src.steps).map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <ErrorList errors={errors} />
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn primary" onClick={choose}>
                Choose file…
              </button>
            </div>
          </section>
        ) : null}

        {step === "map" ? (
          <section className="card stack">
            <h1 style={{ margin: 0 }}>Match the columns</h1>
            <p className="muted small" style={{ margin: 0 }}>
              {file?.fileName}. Pick what each column holds; leave the rest as “Ignore”.
            </p>
            <div className="grid2">
              {sheets.length > 1 ? (
                <Field label="Sheet">
                  <select
                    className="inp"
                    value={sheetIdx}
                    onChange={(e) => pickSheet(sheets, Number(e.target.value))}
                  >
                    {sheets.map((s, i) => (
                      <option key={s.name} value={i}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
              <Field label="Column names are in row">
                <select
                  className="inp"
                  value={headerRow}
                  onChange={(e) => {
                    const h = Number(e.target.value);
                    setHeaderRow(h);
                    setMapping(guessMapping(rows[h] ?? []));
                  }}
                >
                  {rows.slice(0, 20).map((r, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
                    <option key={i} value={i}>
                      {i + 1}: {r.filter(Boolean).slice(0, 3).join(", ").slice(0, 60)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="th">Column</th>
                    <th className="th">Holds</th>
                    <th className="th">First rows</th>
                  </tr>
                </thead>
                <tbody>
                  {header.map((h, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: columns are positional
                    <tr key={i}>
                      <td className="td">{h || <span className="muted">(no name)</span>}</td>
                      <td className="td">
                        <select
                          className="inp"
                          aria-label={`Column: ${h}`}
                          value={mapping[i] ?? ""}
                          onChange={(e) => {
                            const next = [...mapping];
                            const f = (e.target.value || null) as FieldId | null;
                            for (let j = 0; j < next.length; j++) if (f && next[j] === f) next[j] = null;
                            next[i] = f;
                            setMapping(next);
                          }}
                        >
                          <option value="">Ignore</option>
                          {FIELDS.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="td muted small">
                        {rows
                          .slice(headerRow + 1, headerRow + 4)
                          .map((r) => r[i] ?? "")
                          .filter(Boolean)
                          .join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ErrorList errors={errors} />
            <div className="row spread">
              <button type="button" className="btn" onClick={() => setStep("source")}>
                Back
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  const enough =
                    mapping.includes("name") &&
                    (mapping.includes("shares") || mapping.includes("safeAmount"));
                  if (!enough)
                    return setErrors(["Match at least the Name column, and Shares or SAFE amount."]);
                  setErrors(null);
                  setStep("review");
                }}
              >
                Continue
              </button>
            </div>
          </section>
        ) : null}

        {step === "review" && file ? (
          ocf ? (
            <OcfReview drafts={ocf} file={file} onBack={() => setStep("source")} />
          ) : (
            <SheetReview
              file={file}
              header={header}
              body={rows.slice(headerRow + 1)}
              firstRow={headerRow + 2}
              mapping={mapping}
              date1904={!!sheets[sheetIdx]?.date1904}
              onBack={() => setStep("map")}
            />
          )
        ) : null}
      </main>
    </>
  );
}

function Preview({ rows }: { rows: Row[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="tbl">
        <thead>
          <tr>
            <th className="th">Name</th>
            <th className="th">Type</th>
            <th className="th right">Shares</th>
            <th className="th right">%</th>
            <th className="th right">SAFE</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.securityId}>
              <td className="td">{r.stakeholder}</td>
              <td className="td muted">{r.type}</td>
              <td className="td num right">{r.shares === null ? "" : shares(r.shares)}</td>
              <td className="td num right">{r.fdPercent}</td>
              <td className="td num right">{r.safeAmount ? money(r.safeAmount) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function useSave(file: Loaded) {
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[] | null>(null);
  async function save(drafts: EventDraft[], note?: string) {
    if (!app.vault) return;
    setBusy(true);
    setErrors(null);
    try {
      const r = await importIntoVault(app.platform.fs, app.vault, { drafts, ...file, note }, app.ctx);
      if (!r.ok) return setErrors(r.errors);
      app.setVault(r.vault);
      app.go({ name: "documents", imported: true });
    } finally {
      setBusy(false);
    }
  }
  return { busy, errors, save };
}

function OcfReview(p: { drafts: EventDraft[]; file: Loaded; onBack(): void }) {
  const { busy, errors, save } = useSave(p.file);
  const pv = useMemo(() => previewDrafts(p.drafts, todayIso()), [p.drafts]);
  const people = p.drafts.filter((d) => d.type === "STAKEHOLDER").length;
  return (
    <section className="card stack">
      <h1 style={{ margin: 0 }}>Check and save</h1>
      <p className="muted small" style={{ margin: 0 }}>
        {p.file.fileName}: an OCF export, {p.drafts.length} records with their full history. Every record
        passed the OCF schema check.
      </p>
      <div className="stats">
        <StatCard label="Fully diluted" value={shares(pv.totals.fullyDiluted)} />
        <StatCard label="Stakeholders" value={String(people)} />
        <StatCard label="SAFEs outstanding" value={money(pv.totals.safeAmount)} />
      </div>
      <ErrorList errors={pv.violations.length ? pv.violations : errors} />
      <Preview rows={pv.rows} />
      <div className="row spread">
        <button type="button" className="btn" onClick={p.onBack}>
          Back
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={busy || pv.violations.length > 0}
          onClick={() => save(p.drafts)}
        >
          Save to the cap table
        </button>
      </div>
    </section>
  );
}

function SheetReview(p: {
  file: Loaded;
  header: string[];
  body: string[][];
  firstRow: number;
  mapping: (FieldId | null)[];
  date1904: boolean;
  onBack(): void;
}) {
  const { busy, errors, save } = useSave(p.file);
  const { currency } = useApp();
  const [preferred, setPreferred] = useState<Record<string, boolean>>({});
  const [expectedSafe, setExpectedSafe] = useState("");
  const [exportDate, setExportDate] = useState(todayIso());
  const [authorized, setAuthorized] = useState<Record<string, string>>({});
  const [pool, setPool] = useState("");
  const [expected, setExpected] = useState("");
  const [accept, setAccept] = useState(false);
  const [note, setNote] = useState("");
  const r = useMemo(
    () =>
      buildImport({
        header: p.header,
        rows: p.body,
        mapping: p.mapping,
        firstRow: p.firstRow,
        exportDate: exportDate || todayIso(),
        authorized: Object.fromEntries(Object.entries(authorized).filter(([, v]) => v.trim())),
        poolReserved: pool.trim() || undefined,
        preferred,
        date1904: p.date1904,
        currency,
        decimalMark: formatConfig().decimalMark,
      }),
    [p.header, p.body, p.mapping, p.firstRow, exportDate, authorized, pool, preferred, p.date1904, currency],
  );
  const rec = reconcile(r.summary, expected, expectedSafe);
  // The old tool's total is always required; a mismatch needs an explicit note.
  const canSave =
    !busy && r.issues.length === 0 && expected.trim() !== "" && (rec.ok || (accept && note.trim() !== ""));
  return (
    <section className="card stack">
      <h1 style={{ margin: 0 }}>Check and save</h1>
      <div className="stats">
        <StatCard label="Fully diluted" value={shares(r.summary.fullyDiluted)} />
        <StatCard label="Stakeholders" value={String(r.summary.stakeholders)} />
        <StatCard label="SAFEs outstanding" value={money(r.summary.safeTotal)} />
      </div>
      {r.issues.length ? (
        <div className="banner amber">
          <b>Fix these in the file (or the column matching) first:</b>
          <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
            {r.issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="grid2">
        <Field label="Export date" hint="Used for rows without an issue date (marked “imported snapshot”).">
          <DateInput value={exportDate} onChange={setExportDate} />
        </Field>
        {r.optionsGranted > 0n || r.poolAvailable > 0n ? (
          <Field
            label="Option pool, total reserved"
            hint={`Granted ${shares(r.optionsGranted)} + available ${shares(r.poolAvailable)} in the file.`}
          >
            <input
              className="inp num"
              placeholder={shares(r.optionsGranted + r.poolAvailable)}
              value={pool}
              onChange={(e) => setPool(e.target.value)}
            />
          </Field>
        ) : null}
        {r.classes.map((c) => (
          <div key={c.name}>
            <Field label={`Authorized shares: ${c.name}`} hint="From the certificate of incorporation.">
              <input
                className="inp num"
                placeholder={shares(r.defaultAuthorized[c.name] ?? c.issued)}
                value={authorized[c.name] ?? ""}
                onChange={(e) => setAuthorized({ ...authorized, [c.name]: e.target.value })}
              />
            </Field>
            <label className="row small" style={{ marginTop: 6 }}>
              <input
                type="checkbox"
                checked={c.preferred}
                onChange={(e) => setPreferred({ ...preferred, [c.name]: e.target.checked })}
              />
              <span>{c.name} is preferred stock</span>
            </label>
          </div>
        ))}
      </div>
      <div className="grid2">
        <Field label="Fully diluted in your old tool" hint="Totals must match to the share before saving.">
          <input className="inp num" value={expected} onChange={(e) => setExpected(e.target.value)} />
        </Field>
        {r.summary.safeTotal !== "0" ? (
          <Field label="SAFE total in your old tool (optional)" hint="Checked to the cent when given.">
            <input
              className="inp num"
              value={expectedSafe}
              onChange={(e) => setExpectedSafe(e.target.value)}
            />
          </Field>
        ) : null}
      </div>
      {expected.trim() ? <div className={`banner ${rec.ok ? "green" : "amber"}`}>{rec.text}</div> : null}
      {expected.trim() && !rec.ok ? (
        <>
          <label className="row">
            <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
            <span>Accept with a note (it's saved in the record)</span>
          </label>
          {accept ? (
            <Field label="Note">
              <textarea className="inp" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          ) : null}
        </>
      ) : null}
      <Preview rows={r.rows} />
      <ErrorList errors={errors} />
      <div className="row spread">
        <button type="button" className="btn" onClick={p.onBack}>
          Back
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={!canSave}
          onClick={() => save(r.drafts, rec.ok ? undefined : `${note.trim()} (${rec.text})`)}
        >
          Save to the cap table
        </button>
      </div>
    </section>
  );
}
