import {
  builders as b,
  capTableRows,
  type EventDraft,
  fmv,
  nextSecurityIdNumber,
  type State,
} from "@capfolder/core";
import { useMemo, useState } from "react";
import { DateInput } from "../components/DateInput";
import { CrumbHeader } from "../components/Header";
import {
  newPerson,
  type PersonChoice,
  PersonPicker,
  personNamed,
  resolvePerson,
} from "../components/PersonPicker";
import { ErrorList, Field, Tip } from "../components/ui";
import { useDryRun } from "../dryrun";
import { day, money, num, shares, todayIso, withCurrency } from "../fmt";
import { useApp } from "../state";
import { standardTerms } from "../terms";

const digits = num; // the founder's decimal mark (Settings → Your country)

/** F-14: grant options from the pool. Board consent + signing arrive in M5; for now the grant is recorded. */
export function NewGrant() {
  const app = useApp();
  const latest = app.latest;
  const price = latest ? fmv(latest) : null; // the latest 409A
  const plans = latest ? [...latest.plans.entries()] : [];
  const pre = (app.route.name === "newGrant" && app.route.prefill) || {}; // an Ask AI draft (docs/18)
  const [who, setWho] = useState<PersonChoice>(() =>
    pre.person ? personNamed(latest, pre.person, "INDIVIDUAL", pre.email) : newPerson(),
  );
  const [planId, setPlanId] = useState(plans[0]?.[0] ?? "");
  const [quantity, setQuantity] = useState(pre.options ?? "");
  const [strike, setStrike] = useState(pre.strike && pre.strike !== "0" ? pre.strike : "");
  const [date, setDate] = useState(pre.date ?? todayIso());
  // "standard" 4y/1y, "custom" (months/cliff from a draft), or "none"
  const custom =
    pre.months && !(pre.months === "48" && pre.cliff === "12")
      ? { months: Number(pre.months), cliff: Number(pre.cliff ?? 0) }
      : null;
  const [vestingKind, setVestingKind] = useState<"standard" | "custom" | "none">(
    custom ? "custom" : "standard",
  );
  const vesting = vestingKind !== "none";
  const setVesting = (on: boolean) => setVestingKind(on ? "standard" : "none");
  const [start, setStart] = useState(pre.start ?? todayIso());
  const [termsId] = useState(() => b.newId("vt"));
  const [errors, setErrors] = useState<string[] | null>(null);

  const drafts = useMemo<EventDraft[] | null>(() => {
    const person = resolvePerson(who);
    const plan = latest?.plans.get(planId);
    if (!latest || !person || !plan || !digits(quantity)) return null;
    const terms =
      vestingKind === "custom" && custom
        ? {
            id: termsId,
            drafts: [b.vestingTerms({ months: custom.months, cliffMonths: custom.cliff, id: termsId })],
          }
        : vesting
          ? standardTerms(latest, termsId)
          : null;
    return [
      ...person.drafts,
      ...(terms?.drafts ?? []),
      ...b.optionGrant({
        currency: app.currency,
        state: latest,
        stakeholderId: person.id,
        planId,
        classId: plan.data.stock_class_ids?.[0],
        quantity: digits(quantity),
        strike: digits(strike) || "0",
        date,
        securityId: `OPT-${nextSecurityIdNumber(latest, "OPT")}`,
        ...(terms ? { vestingTermsId: terms.id, vestingStart: start } : {}),
      }),
    ];
  }, [latest, who, planId, quantity, strike, date, vesting, vestingKind, start, termsId]);
  const dry = useDryRun(drafts);
  const poolNow = app.state ? capPool(app.state, planId) : null;
  const poolAfter =
    dry && !dry.errors ? dry.rows.find((r) => r.group === 2 && r.securityId === planId)?.shares : null;

  if (!plans.length)
    return (
      <>
        <CrumbHeader title="New grant" />
        <main className="medium stack">
          <div className="banner amber">Grants come from an option pool. Create the pool first.</div>
          <button type="button" className="btn primary" onClick={() => app.go({ name: "pool" })}>
            Create option pool
          </button>
        </main>
      </>
    );

  return (
    <>
      <CrumbHeader title="New grant" />
      <main className="medium">
        <section className="card stack">
          <PersonPicker label="Employee" value={who} onChange={setWho} />
          {plans.length > 1 ? (
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
            <Field label="Options">
              <input
                className="inp num"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="40,000"
              />
            </Field>
            <Field label={withCurrency("Strike price")} hint="From your latest 409A valuation.">
              <input
                className="inp num"
                value={strike}
                onChange={(e) => setStrike(e.target.value)}
                placeholder="0.12"
              />
            </Field>
            <Field label="Grant date">
              <DateInput value={date} onChange={setDate} />
            </Field>
            <Field label="Vesting starts" tip="vestingStart">
              <DateInput value={start} disabled={!vesting} onChange={(v) => setStart(v)} />
            </Field>
          </div>
          <div className="row">
            <button
              type="button"
              className={`chip ${vestingKind === "standard" ? "green" : ""}`}
              onClick={() => setVesting(true)}
            >
              4 years · 1-year cliff · monthly
            </button>
            <Tip about="cliff" />
            {custom ? (
              <button
                type="button"
                className={`chip ${vestingKind === "custom" ? "green" : ""}`}
                onClick={() => setVestingKind("custom")}
              >
                {custom.months} months · {custom.cliff ? `${custom.cliff}-month cliff` : "no cliff"} · monthly
              </button>
            ) : null}
            <button
              type="button"
              className={`chip ${!vesting ? "green" : ""}`}
              onClick={() => setVesting(false)}
            >
              No vesting
            </button>
          </div>
          {poolNow !== null ? (
            <div className="banner">
              Pool: <span className="num">{shares(poolNow)}</span> available
              {poolAfter !== undefined && poolAfter !== null ? (
                <>
                  {" "}
                  → <span className="num">{shares(poolAfter)}</span> after this grant
                </>
              ) : null}
            </div>
          ) : null}
          {!digits(strike) || Number(digits(strike)) === 0 ? (
            <div className="banner amber">Strike may be challenged. Get a 409A.</div>
          ) : price && Number(digits(strike)) < Number(price.amount) ? (
            <div className="banner amber">
              The strike is below the 409A price of {money(price.amount, price.currency)} (from{" "}
              {day(price.date)}). Options priced under fair market value can bring tax penalties for the
              employee (Section 409A).
            </div>
          ) : null}
          <ErrorList errors={errors ?? dry?.errors ?? null} />
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn primary"
              onClick={async () => {
                if (!drafts) return setErrors(["Fill in the employee and the number of options."]);
                const errs = await app.run(drafts);
                if (errs) return setErrors(errs);
                app.go({ name: "home" });
              }}
            >
              Record grant
            </button>
          </div>
          <p className="meta">
            The board consent and the grant notice for signature arrive with signing (M5). Attach signed
            copies from Documents.
          </p>
        </section>
      </main>
    </>
  );
}

function capPool(s: State, planId: string): bigint | null {
  return capTableRows(s).find((r) => r.group === 2 && r.securityId === planId)?.shares ?? null;
}
