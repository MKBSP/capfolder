import { builders as b, capTableRows, type EventDraft } from "@capfolder/core";
import { useMemo, useState } from "react";
import { DateInput } from "../components/DateInput";
import { CrumbHeader } from "../components/Header";
import { ErrorList, Field } from "../components/ui";
import { useDryRun } from "../dryrun";
import { num, shares, todayIso } from "../fmt";
import { useApp } from "../state";

const digits = num; // the founder's decimal mark (Settings → Your country)

/** F-13 (create the pool) and F-25 (increase it: OCF records the new total). */
export function Pool() {
  const app = useApp();
  const latest = app.latest;
  const plans = latest ? [...latest.plans.entries()] : [];
  const classId = latest ? [...latest.classes.keys()][0] : undefined;
  const [planIdNew] = useState(() => b.newId("plan")); // stable: a new id each render made the preview loop
  const creating = plans.length === 0;
  const [planId, setPlanId] = useState(plans[0]?.[0] ?? "");
  const [size, setSize] = useState("");
  const [name, setName] = useState(`${todayIso().slice(0, 4)} Equity Incentive Plan`);
  const [date, setDate] = useState(todayIso());
  const [errors, setErrors] = useState<string[] | null>(null);
  const current = latest?.plans.get(planId)?.reserved;

  const drafts = useMemo<EventDraft[] | null>(() => {
    if (!latest || !digits(size)) return null;
    if (!/^\d+$/.test(digits(size))) return null;
    if (creating)
      return classId
        ? [b.stockPlan({ id: planIdNew, name, reserved: digits(size), boardApprovalDate: date, classId })]
        : null;
    return [b.poolAdjustment({ planId, newTotal: digits(size), date })];
  }, [latest, size, name, date, planId, creating, classId, planIdNew]);
  const dry = useDryRun(drafts);
  const after =
    dry && !dry.errors
      ? capTableRows(dry.state).find((r) => r.group === 2 && (creating || r.securityId === planId))?.shares
      : null;

  async function save() {
    if (!drafts) return setErrors(["Enter the pool size as a whole number of shares."]);
    if (!creating && current !== undefined && BigInt(digits(size)) <= current)
      return setErrors([`The new total must be more than the current ${shares(current)} reserved.`]);
    const errs = await app.run(drafts);
    if (errs) return setErrors(errs);
    app.go({ name: "home" });
  }

  return (
    <>
      <CrumbHeader title={creating ? "Option pool" : "Increase option pool"} />
      <main className="medium">
        <section className="card stack">
          {!classId ? (
            <div className="banner amber">Set up authorized shares first (Start from zero).</div>
          ) : null}
          {creating ? (
            <Field label="Plan name">
              <input className="inp" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          ) : plans.length > 1 ? (
            <Field label="Plan">
              <select className="inp" value={planId} onChange={(e) => setPlanId(e.target.value)}>
                {plans.map(([id, p]) => (
                  <option key={id} value={id}>
                    {p.data.plan_name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <div className="grid2">
            <Field
              label={creating ? "Pool size (shares)" : "New total reserved"}
              hint={!creating && current !== undefined ? `Now ${shares(current)} reserved.` : undefined}
            >
              <input
                className="inp num"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder="1,000,000"
              />
            </Field>
            <Field label="Board approved on">
              <DateInput value={date} onChange={setDate} />
            </Field>
          </div>
          {after !== null && after !== undefined ? (
            <div className="banner">
              Pool available after this: <span className="num">{shares(after)}</span>
            </div>
          ) : null}
          <ErrorList errors={errors ?? dry?.errors ?? null} />
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn primary" onClick={save}>
              {creating ? "Create pool" : "Increase pool"}
            </button>
          </div>
          <p className="meta">
            The plan and the board and stockholder consents: attach your signed copies from Documents.
          </p>
        </section>
      </main>
    </>
  );
}
