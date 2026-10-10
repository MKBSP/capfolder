import { builders as b, type EventDraft, nextSecurityIdNumber } from "@capfolder/core";
import { useMemo, useState } from "react";
import { DateInput } from "../components/DateInput";
import { CrumbHeader } from "../components/Header";
import { newPerson, type PersonChoice, PersonPicker, resolvePerson } from "../components/PersonPicker";
import { ErrorList, Field } from "../components/ui";
import { useDryRun } from "../dryrun";
import { day, todayIso } from "../fmt";
import { useApp } from "../state";
import { standardTerms } from "../terms";

const digits = (s: string) => s.replace(/[,\s$]/g, "");
const plus30 = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, dd + 30)).toISOString().slice(0, 10);
};

/** F-15: shares to a founder or advisor, or preferred recorded after a priced round. */
export function NewShares() {
  const app = useApp();
  const latest = app.latest;
  const classes = latest ? [...latest.classes.entries()] : [];
  const [who, setWho] = useState<PersonChoice>(() => newPerson());
  const [classId, setClassId] = useState(classes[0]?.[0] ?? "");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(todayIso());
  const [vesting, setVesting] = useState(false);
  const [start, setStart] = useState(todayIso());
  const [termsId] = useState(() => b.newId("vt"));
  const [errors, setErrors] = useState<string[] | null>(null);

  const drafts = useMemo<EventDraft[] | null>(() => {
    const person = resolvePerson(who);
    if (!latest || !person || !classId || !digits(quantity)) return null;
    const terms = vesting ? standardTerms(latest, termsId) : null;
    return [
      ...person.drafts,
      ...(terms?.drafts ?? []),
      ...b.stockIssuance({
        state: latest,
        stakeholderId: person.id,
        classId,
        quantity: digits(quantity),
        price: digits(price) || "0",
        date,
        securityId: `CS-${nextSecurityIdNumber(latest, "CS")}`,
        ...(terms ? { vestingTermsId: terms.id, vestingStart: start } : {}),
      }),
    ];
  }, [latest, who, classId, quantity, price, date, vesting, start, termsId]);
  const dry = useDryRun(drafts);

  return (
    <>
      <CrumbHeader title="New shares" />
      <main className="medium">
        <section className="card stack">
          {!classes.length ? (
            <div className="banner amber">Set up authorized shares first (Start from zero).</div>
          ) : null}
          <PersonPicker label="Holder" value={who} onChange={setWho} />
          <div className="grid2">
            <Field label="Class">
              <select className="inp" value={classId} onChange={(e) => setClassId(e.target.value)}>
                {classes.map(([id, c]) => (
                  <option key={id} value={id}>
                    {c.data.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Shares">
              <input className="inp num" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </Field>
            <Field label="Price per share (USD)">
              <input
                className="inp num"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00001"
              />
            </Field>
            <Field label="Issued on">
              <DateInput value={date} onChange={setDate} />
            </Field>
          </div>
          <div className="row wrap">
            <button
              type="button"
              className={`chip ${!vesting ? "green" : ""}`}
              onClick={() => setVesting(false)}
            >
              No vesting
            </button>
            <button
              type="button"
              className={`chip ${vesting ? "green" : ""}`}
              onClick={() => setVesting(true)}
            >
              4 years · 1-year cliff · monthly
            </button>
            {vesting ? (
              <label className="row small">
                Vesting starts
                <DateInput style={{ width: 170 }} value={start} onChange={(v) => setStart(v)} />
              </label>
            ) : null}
          </div>
          {vesting && plus30(date) >= todayIso() ? (
            <div className="banner amber">
              File the 83(b) within 30 days of {day(date)}: by {day(plus30(date))}.
            </div>
          ) : null}
          <ErrorList errors={errors ?? dry?.errors ?? null} />
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn primary"
              onClick={async () => {
                if (!drafts) return setErrors(["Fill in the holder and the number of shares."]);
                const errs = await app.run(drafts);
                if (errs) return setErrors(errs);
                app.go({ name: "home" });
              }}
            >
              Record shares
            </button>
          </div>
        </section>
      </main>
    </>
  );
}
