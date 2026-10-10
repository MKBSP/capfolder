import { appendEvents, capTableRows, MAX_DATE, percentOf, type Row, reduce } from "@capfolder/core";
import { useEffect, useMemo, useState } from "react";
import { ErrorList, Field, Stepper } from "../components/ui";
import { day, shares as fmtShares, todayIso, usd } from "../fmt";
import { useApp } from "../state";
import { type FounderInput, type SafeInput, type WizardInput, wizardDrafts } from "../wizard";

const plus30 = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, dd + 30)).toISOString().slice(0, 10);
};
const within30 = (d: string) => d && plus30(d) >= todayIso();
const digits = (s: string) => s.replace(/[,\s$]/g, "");

/** F-08: one short question per screen, the cap table builds on the right as they answer. */
export function Wizard() {
  const app = useApp();
  const formation = (app.latest?.issuer?.formation_date as string) ?? todayIso();
  const [step, setStep] = useState(0);
  const [w, setW] = useState<WizardInput>({
    authorized: "10,000,000",
    par: "0.00001",
    founders: [
      { name: "", email: "", shares: "", issueDate: formation, vesting: true, vestingStart: formation },
    ],
    pool: null,
    safes: [],
  });
  const [preview, setPreview] = useState<Row[]>([]);
  const [errors, setErrors] = useState<string[] | null>(null);
  const drafts = useMemo(() => (app.latest ? wizardDrafts(app.latest, w) : []), [app.latest, w]);

  useEffect(() => {
    if (!app.vault) return;
    const vault = app.vault;
    let current = true; // a later keystroke's preview must win over an earlier, slower one
    appendEvents(vault.log, drafts, app.ctx).then((r) => {
      if (!current) return;
      if (!r.ok) return setErrors(r.errors);
      setErrors(null);
      setPreview(capTableRows(reduce([...vault.events, ...r.events], MAX_DATE)));
    });
    return () => {
      current = false;
    };
  }, [drafts, app.vault, app.ctx]);

  const setFounder = (i: number, f: Partial<FounderInput>) =>
    setW({ ...w, founders: w.founders.map((x, j) => (j === i ? { ...x, ...f } : x)) });
  const setSafe = (i: number, s: Partial<SafeInput>) =>
    setW({ ...w, safes: w.safes.map((x, j) => (j === i ? { ...x, ...s } : x)) });
  const pctOfAuthorized = (q: string) => {
    const a = digits(w.authorized);
    const n = digits(q);
    if (!/^\d+$/.test(a) || !/^\d+$/.test(n) || BigInt(a) === 0n || BigInt(n) === 0n) return "";
    return `${fmtShares(BigInt(n))} shares = ${percentOf(BigInt(n), BigInt(a))}% of authorized`;
  };

  async function finish() {
    const errs = await app.run(drafts);
    if (errs) return setErrors(errs);
    app.go({ name: "home" });
  }

  const steps = [
    <div key="shares" className="stack">
      <h1>How many shares can the company issue?</h1>
      <p className="muted">From your certificate of incorporation: authorized shares and par value.</p>
      <div className="grid2">
        <Field label="Authorized shares">
          <input
            className="inp num"
            value={w.authorized}
            onChange={(e) => setW({ ...w, authorized: e.target.value })}
          />
        </Field>
        <Field label="Par value (USD)">
          <input className="inp num" value={w.par} onChange={(e) => setW({ ...w, par: e.target.value })} />
        </Field>
      </div>
    </div>,
    <div key="founders" className="stack">
      <h1>Who are the founders?</h1>
      {w.founders.map((f, i) => (
        <div key={i} className="card stack">
          <div className="grid2">
            <Field label="Name">
              <input
                className="inp"
                value={f.name}
                onChange={(e) => setFounder(i, { name: e.target.value })}
              />
            </Field>
            <Field label="Email">
              <input
                className="inp"
                type="email"
                value={f.email}
                onChange={(e) => setFounder(i, { email: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid2">
            <Field label="Shares" hint={pctOfAuthorized(f.shares)}>
              <input
                className="inp num"
                value={f.shares}
                onChange={(e) => setFounder(i, { shares: e.target.value })}
              />
            </Field>
            <Field label="Issued on">
              <input
                className="inp"
                type="date"
                value={f.issueDate}
                onChange={(e) => setFounder(i, { issueDate: e.target.value })}
              />
            </Field>
          </div>
          <div className="row wrap">
            <button
              type="button"
              className={`chip ${f.vesting ? "green" : ""}`}
              onClick={() => setFounder(i, { vesting: true })}
            >
              4 years · 1-year cliff · monthly
            </button>
            <button
              type="button"
              className={`chip ${!f.vesting ? "green" : ""}`}
              onClick={() => setFounder(i, { vesting: false })}
            >
              No vesting
            </button>
            {f.vesting ? (
              <label className="row small">
                Vesting starts
                <input
                  className="inp"
                  style={{ width: 170 }}
                  type="date"
                  value={f.vestingStart}
                  onChange={(e) => setFounder(i, { vestingStart: e.target.value })}
                />
              </label>
            ) : (
              <span className="meta">Investors usually ask for founder vesting.</span>
            )}
          </div>
          {f.vesting && within30(f.issueDate) ? (
            <div className="banner amber">
              File your 83(b) within 30 days of {day(f.issueDate)}: by {day(plus30(f.issueDate))}.
            </div>
          ) : null}
          {w.founders.length > 1 ? (
            <button
              type="button"
              className="btn link danger small"
              onClick={() => setW({ ...w, founders: w.founders.filter((_, j) => j !== i) })}
            >
              Remove
            </button>
          ) : null}
        </div>
      ))}
      <button
        type="button"
        className="btn"
        onClick={() =>
          setW({
            ...w,
            founders: [
              ...w.founders,
              {
                name: "",
                email: "",
                shares: "",
                issueDate: formation,
                vesting: true,
                vestingStart: formation,
              },
            ],
          })
        }
      >
        Add another founder
      </button>
    </div>,
    <div key="pool" className="stack">
      <h1>Is there an option pool?</h1>
      <p className="muted">Optional. You can add it later with + New → Option pool.</p>
      {w.pool ? (
        <div className="card stack">
          <div className="grid2">
            <Field label="Pool size (shares)" hint={pctOfAuthorized(w.pool.size)}>
              <input
                className="inp num"
                value={w.pool.size}
                onChange={(e) => setW({ ...w, pool: { ...w.pool!, size: e.target.value } })}
              />
            </Field>
            <Field label="Board approved on">
              <input
                className="inp"
                type="date"
                value={w.pool.approved}
                onChange={(e) => setW({ ...w, pool: { ...w.pool!, approved: e.target.value } })}
              />
            </Field>
          </div>
          <Field label="Plan name">
            <input
              className="inp"
              value={w.pool.name}
              onChange={(e) => setW({ ...w, pool: { ...w.pool!, name: e.target.value } })}
            />
          </Field>
          <button type="button" className="btn link small" onClick={() => setW({ ...w, pool: null })}>
            No pool for now
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn"
          onClick={() =>
            setW({
              ...w,
              pool: {
                size: "1,000,000",
                name: `${formation.slice(0, 4)} Equity Incentive Plan`,
                approved: formation,
              },
            })
          }
        >
          Add an option pool
        </button>
      )}
    </div>,
    <div key="safes" className="stack">
      <h1>Any SAFEs already signed?</h1>
      <p className="muted">Optional. Attach the signed PDFs afterwards from the cap table.</p>
      {w.safes.map((s, i) => (
        <div key={i} className="card stack">
          <Field label="Investor">
            <input
              className="inp"
              value={s.investor}
              onChange={(e) => setSafe(i, { investor: e.target.value })}
            />
          </Field>
          <div className="grid2">
            <Field label="Amount (USD)">
              <input
                className="inp num"
                value={s.amount}
                onChange={(e) => setSafe(i, { amount: e.target.value })}
              />
            </Field>
            <Field label="Valuation cap (USD)">
              <input
                className="inp num"
                value={s.cap}
                onChange={(e) => setSafe(i, { cap: e.target.value })}
              />
            </Field>
            <Field label="Discount (optional)">
              <input
                className="inp num"
                placeholder="e.g. 20%"
                value={s.discount}
                onChange={(e) => setSafe(i, { discount: e.target.value.replace("%", "") })}
              />
            </Field>
            <Field label="Date">
              <input
                className="inp"
                type="date"
                value={s.date}
                onChange={(e) => setSafe(i, { date: e.target.value })}
              />
            </Field>
          </div>
          <label className="row small">
            <input type="checkbox" checked={s.mfn} onChange={(e) => setSafe(i, { mfn: e.target.checked })} />{" "}
            Most favored nation (MFN)
          </label>
        </div>
      ))}
      <button
        type="button"
        className="btn"
        onClick={() =>
          setW({
            ...w,
            safes: [
              ...w.safes,
              { investor: "", amount: "", cap: "", discount: "", mfn: false, date: todayIso() },
            ],
          })
        }
      >
        Add a SAFE
      </button>
    </div>,
  ];

  return (
    <main className="page" style={{ display: "flex", gap: 32, alignItems: "flex-start", paddingTop: 40 }}>
      <section style={{ flex: "1 1 560px", maxWidth: 640 }}>
        <Stepper current={4} />
        <div className="meta" style={{ marginBottom: 8 }}>
          Start from zero · {step + 1} of {steps.length}
        </div>
        {steps[step]}
        <div style={{ marginTop: 16 }}>
          <ErrorList errors={errors} />
        </div>
        <div className="row spread" style={{ marginTop: 20 }}>
          <button type="button" className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}>
            Back
          </button>
          {step < steps.length - 1 ? (
            <button type="button" className="btn primary" onClick={() => setStep(step + 1)}>
              Next
            </button>
          ) : (
            <button type="button" className="btn primary" onClick={finish} disabled={!!errors}>
              Save cap table
            </button>
          )}
        </div>
      </section>
      <aside
        className="card"
        style={{ flex: "0 1 380px", position: "sticky", top: 24 }}
        aria-label="Live cap table"
      >
        <h2>Your cap table</h2>
        {preview.length ? (
          <table className="tbl small">
            <tbody>
              {preview.map((r) => (
                <tr key={r.securityId}>
                  <td className="td">{r.stakeholder}</td>
                  <td className="td num right">{r.group === 3 ? usd(r.safeAmount) : fmtShares(r.shares)}</td>
                  <td className="td num right">
                    {r.group === 3 ? (r.asConverted ? `≈${r.asConverted}%` : "") : `${r.fdPercent}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="meta">Fills in as you answer.</p>
        )}
      </aside>
    </main>
  );
}
