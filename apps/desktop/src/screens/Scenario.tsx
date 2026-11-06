import { type Line, type Step, type StepResult, titleOf } from "@capfolder/core";
import { useMemo, useState } from "react";
import { CrumbHeader } from "../components/Header";
import { Field, Menu, ShowMath } from "../components/ui";
import { money, shares, todayIso, wholeInput, withCurrency } from "../fmt";
import {
  addStep,
  engineSteps,
  foundersReady,
  prefillOf,
  removeStep,
  STARTER_STEPS,
  setStep,
  TYPICAL,
  typicalRounds,
  useScenario,
} from "../scenario";
import { useApp } from "../state";
import { discountFraction } from "../wizard";

export const NOT_ADVICE = "Projections, not advice. Nothing is saved.";

/** F-39 "Try a scenario": steps on the left, the engine's table for the selected step on the right. */
export function Scenario() {
  const app = useApp();
  const company = app.vault?.events ?? null;
  const [steps, setSteps] = useState<Step[]>(() => (company ? [] : STARTER_STEPS));
  const [picked, setPicked] = useState<number | null>(null);
  const today = todayIso();
  const founders = steps.find((s) => s.kind === "founders");
  const ready = company ? true : foundersReady(engineSteps(steps)[0]);
  const { result } = useScenario(company, steps, today, ready);
  // the step results, with "Today" first when a company is open
  const shown: StepResult[] = useMemo(() => result?.steps ?? [], [result]);
  const current = picked !== null && picked < shown.length ? picked : shown.length - 1;
  const sel = current >= 0 ? shown[current] : undefined;
  const poolShares = (() => {
    const last = [...shown].reverse().find((s) => !s.error && s.step.kind !== "exit");
    return last?.lines.find((l) => l.kind === "pool")?.shares ?? null;
  })();

  const update = (i: number, step: Step) => setSteps(setStep(steps, i, step));
  const remove = (i: number) => {
    setSteps(removeStep(steps, i));
    setPicked(null);
  };

  return (
    <>
      <CrumbHeader title="Try a scenario" back={company ? { name: "home" } : { name: "welcome" }}>
        {!company && founders ? (
          <button
            type="button"
            className="btn primary"
            disabled={!ready}
            onClick={() => app.go({ name: "create", prefill: prefillOf(steps, poolShares) })}
          >
            Save as my cap table
          </button>
        ) : null}
      </CrumbHeader>
      <main className="page" style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
        <section className="stack" style={{ flex: "1 1 360px", maxWidth: 520 }}>
          <h1 style={{ margin: 0 }}>Try a scenario</h1>
          <p className="muted" style={{ margin: 0 }}>
            {company
              ? "Add a round or an exit to the cap table as it is today. To record a SAFE or a grant for real, use + New on the cap table."
              : "Founders, a pool, a SAFE, the usual rounds, an exit. One table per step, with the math."}
          </p>
          {steps.map((step, i) => (
            <StepCard
              key={`${i}-${step.kind}`}
              step={step}
              onChange={(s) => update(i, s)}
              onRemove={i === 0 && step.kind === "founders" ? undefined : () => remove(i)}
            />
          ))}
          <div className="row wrap" style={{ alignItems: "center" }}>
            <Menu
              label="+ Add step"
              items={[
                ...(company
                  ? []
                  : [
                      { label: "Option pool", onClick: () => setSteps(addStep(steps, "pool")) },
                      { label: "SAFE", onClick: () => setSteps(addStep(steps, "safe")) },
                    ]),
                { label: "Priced round", onClick: () => setSteps(addStep(steps, "round")) },
                { label: "Exit", onClick: () => setSteps(addStep(steps, "exit")) },
              ]}
            />
            <button type="button" className="btn" onClick={() => setSteps(typicalRounds(steps))}>
              Use the typical rounds
            </button>
          </div>
          <p className="meta" style={{ margin: 0 }}>
            {TYPICAL.map((b) => `${b.label.replace(/,.*$/, "")} ${b.value}%`).join(", ")}.{" "}
            {TYPICAL[0]!.source.replace(/,.*$/, "")}, {TYPICAL[0]!.year}.
          </p>
        </section>
        <section className="card" style={{ flex: "1 1 420px" }} aria-label="Result">
          {!shown.length ? (
            <p className="muted" style={{ margin: 0 }}>
              {company
                ? "Add a step to see its table."
                : "Name the founders and their shares to see the first table."}
            </p>
          ) : (
            <>
              <div className="row wrap" style={{ gap: 6, marginBottom: 12 }}>
                {shown.map((s, i) => (
                  <button
                    type="button"
                    key={`${i}-${s.title}`}
                    className={`btn small${i === current ? " primary" : ""}`}
                    aria-current={i === current ? "step" : undefined}
                    onClick={() => setPicked(i)}
                  >
                    {s.title}
                  </button>
                ))}
              </div>
              {sel ? <Result r={sel} /> : null}
            </>
          )}
        </section>
      </main>
    </>
  );
}

function Result({ r }: { r: StepResult }) {
  const exit = r.step.kind === "exit";
  return (
    <>
      <h2 style={{ marginTop: 0 }}>{r.title}</h2>
      {r.error ? (
        <div className="banner amber">{r.error}</div>
      ) : (
        <table className="tbl" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th className="th">Holder</th>
              <th className="th right">Shares</th>
              <th className="th right">{exit ? "% of proceeds" : "% fully diluted"}</th>
              <th className="th right">{exit ? "Proceeds" : "Change"}</th>
            </tr>
          </thead>
          <tbody>
            {r.lines.map((l) => (
              <Row key={`${l.holder}-${l.kind}`} l={l} exit={exit} />
            ))}
          </tbody>
        </table>
      )}
      {r.notes.map((n) => (
        <p key={n} className="meta" style={{ margin: "8px 0 0" }}>
          {n}
        </p>
      ))}
      <p className="meta" style={{ margin: "12px 0 0" }}>
        {NOT_ADVICE}
      </p>
    </>
  );
}

function Row({ l, exit }: { l: Line; exit: boolean }) {
  return (
    <tr>
      <td className="td">
        {l.holder}
        {l.kind === "safe" ? (
          <span className="meta"> · SAFE</span>
        ) : l.kind === "options" ? (
          <span className="meta"> · options</span>
        ) : null}
        <div>
          <ShowMath math={l.math} />
        </div>
      </td>
      <td className="td right num">{l.shares === null ? "" : shares(l.shares)}</td>
      <td className="td right num">{l.percent ? `${l.percent}%` : ""}</td>
      <td className="td right num">{exit ? money(l.proceeds ?? "0") : l.change}</td>
    </tr>
  );
}

function StepCard({
  step,
  onChange,
  onRemove,
}: {
  step: Step;
  onChange(s: Step): void;
  onRemove?: () => void;
}) {
  const head = (
    <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
      <b>{titleOf(step)}</b>
      {onRemove ? (
        <button type="button" className="btn link small" onClick={onRemove}>
          Remove
        </button>
      ) : null}
    </div>
  );
  switch (step.kind) {
    case "founders":
      return (
        <div className="card stack">
          {head}
          {step.founders.map((f, i) => (
            <div className="grid2" key={`${i}-${step.founders.length}`}>
              <Field label="Founder name">
                <input
                  className="inp"
                  value={f.name}
                  onChange={(e) =>
                    onChange({
                      ...step,
                      founders: step.founders.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                    })
                  }
                  placeholder={i === 0 ? "Steve Jobs" : "Steve Wozniak"}
                />
              </Field>
              <Field label="Shares">
                <input
                  className="inp num"
                  value={f.shares}
                  onChange={(e) =>
                    onChange({
                      ...step,
                      founders: step.founders.map((x, j) => (j === i ? { ...x, shares: e.target.value } : x)),
                    })
                  }
                  placeholder={wholeInput("5000000")}
                />
              </Field>
            </div>
          ))}
          <div className="row">
            <button
              type="button"
              className="btn small"
              onClick={() => onChange({ ...step, founders: [...step.founders, { name: "", shares: "" }] })}
            >
              + Add founder
            </button>
            {step.founders.length > 1 ? (
              <button
                type="button"
                className="btn link small"
                onClick={() => onChange({ ...step, founders: step.founders.slice(0, -1) })}
              >
                Remove last
              </button>
            ) : null}
          </div>
        </div>
      );
    case "pool":
      return (
        <div className="card stack">
          {head}
          {step.shares !== undefined ? (
            <Field
              label="Pool shares"
              hint={
                <button
                  type="button"
                  className="btn link small"
                  onClick={() => onChange({ kind: "pool", percent: "" })}
                >
                  by percent instead
                </button>
              }
            >
              <input
                className="inp num"
                value={step.shares}
                onChange={(e) => onChange({ kind: "pool", shares: e.target.value })}
                placeholder={wholeInput("1000000")}
              />
            </Field>
          ) : (
            <Field
              label="Pool, % of fully diluted"
              hint={
                <button
                  type="button"
                  className="btn link small"
                  onClick={() => onChange({ kind: "pool", shares: "" })}
                >
                  by shares instead
                </button>
              }
            >
              <input
                className="inp num"
                value={step.percent ?? ""}
                onChange={(e) => onChange({ kind: "pool", percent: e.target.value })}
                placeholder="10"
              />
            </Field>
          )}
        </div>
      );
    case "safe":
      return (
        <div className="card stack">
          {head}
          <Field label="Investor">
            <input
              className="inp"
              value={step.investor}
              onChange={(e) => onChange({ ...step, investor: e.target.value })}
              placeholder="Bill Gates"
            />
          </Field>
          <div className="grid2">
            <Field label={withCurrency("Amount")}>
              <input
                className="inp num"
                value={step.amount}
                onChange={(e) => onChange({ ...step, amount: e.target.value })}
                placeholder={wholeInput("500000")}
              />
            </Field>
            <Field label={withCurrency("Valuation cap")} tip="cap">
              <input
                className="inp num"
                value={step.cap ?? ""}
                onChange={(e) => onChange({ ...step, cap: e.target.value })}
                placeholder={wholeInput("2000000")}
              />
            </Field>
            <Field label="Discount % (optional)" tip="discount">
              <input
                className="inp num"
                value={step.discount ? String(Math.round(Number(step.discount) * 10000) / 100) : ""}
                onChange={(e) =>
                  onChange({ ...step, discount: discountFraction(e.target.value.replace("%", "")) })
                }
                placeholder="e.g. 20"
              />
            </Field>
          </div>
        </div>
      );
    case "round": {
      const byPercent = step.newMoney === undefined && step.preMoney === undefined;
      return (
        <div className="card stack">
          {head}
          <div className="grid2">
            <Field label="Round name">
              <input
                className="inp"
                value={step.name}
                onChange={(e) => onChange({ ...step, name: e.target.value })}
              />
            </Field>
            <Field label="Given as">
              <select
                className="inp"
                value={byPercent ? "percent" : "money"}
                onChange={(e) =>
                  onChange(
                    e.target.value === "percent"
                      ? { kind: "round", name: step.name, sells: "20", poolTarget: step.poolTarget }
                      : {
                          kind: "round",
                          name: step.name,
                          newMoney: "",
                          preMoney: "",
                          poolTarget: step.poolTarget,
                        },
                  )
                }
              >
                <option value="percent">Percent it sells</option>
                <option value="money">Money and valuation</option>
              </select>
            </Field>
            {byPercent ? (
              <Field label="Sells, % of the company">
                <input
                  className="inp num"
                  value={step.sells ?? ""}
                  onChange={(e) => onChange({ ...step, sells: e.target.value })}
                  placeholder="20"
                />
              </Field>
            ) : (
              <>
                <Field label={withCurrency("New money")}>
                  <input
                    className="inp num"
                    value={step.newMoney ?? ""}
                    onChange={(e) => onChange({ ...step, newMoney: e.target.value })}
                    placeholder={wholeInput("2000000")}
                  />
                </Field>
                <Field label={withCurrency("Pre-money valuation")}>
                  <input
                    className="inp num"
                    value={step.preMoney ?? ""}
                    onChange={(e) => onChange({ ...step, preMoney: e.target.value })}
                    placeholder={wholeInput("8000000")}
                  />
                </Field>
              </>
            )}
            <Field label="Pool after, % (optional)">
              <input
                className="inp num"
                value={step.poolTarget ?? ""}
                onChange={(e) => onChange({ ...step, poolTarget: e.target.value })}
                placeholder="12"
              />
            </Field>
          </div>
        </div>
      );
    }
    case "exit":
      return (
        <div className="card stack">
          {head}
          <Field label={withCurrency("Company sells for")}>
            <input
              className="inp num"
              value={step.value}
              onChange={(e) => onChange({ kind: "exit", value: e.target.value })}
              placeholder={wholeInput("200000000")}
            />
          </Field>
        </div>
      );
    case "grant":
      return null; // not offered on the screen (v1)
  }
}
