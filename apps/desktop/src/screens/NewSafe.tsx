import { builders as b, type EventDraft, nextSecurityIdNumber } from "@capfolder/core";
import { useMemo, useState } from "react";
import { AttachModal } from "../components/AttachModal";
import { CrumbHeader } from "../components/Header";
import { newPerson, type PersonChoice, PersonPicker, resolvePerson } from "../components/PersonPicker";
import { ErrorList, Field } from "../components/ui";
import { useDryRun } from "../dryrun";
import { day, todayIso, usd, usdShort } from "../fmt";
import { useApp } from "../state";
import { sumMoney } from "../views";
import { discountFraction } from "../wizard";

const digits = (s: string) => s.replace(/[,\s$]/g, "");

/** NewSafe.html (F-11 / F-12). "Record as signed" works now; sending for signature arrives in M5. */
export function NewSafe() {
  const app = useApp();
  const [who, setWho] = useState<PersonChoice>(() => newPerson("INSTITUTION"));
  const [amount, setAmount] = useState("");
  const [cap, setCap] = useState("");
  const [discount, setDiscount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [mfn, setMfn] = useState(false);
  const [errors, setErrors] = useState<string[] | null>(null);
  const [attachFor, setAttachFor] = useState<string | null>(null);
  const latest = app.latest;
  const securityId = latest ? `SAFE-${nextSecurityIdNumber(latest, "SAFE")}` : "SAFE-1";

  const person = resolvePerson(who);
  const drafts = useMemo<EventDraft[] | null>(() => {
    const person = resolvePerson(who);
    if (!latest || !person || !digits(amount)) return null;
    return [
      ...person.drafts,
      b.safe({
        state: latest,
        stakeholderId: person.id,
        amount: digits(amount),
        cap: digits(cap) || undefined,
        discount: discountFraction(discount),
        mfn,
        date,
        securityId,
      }),
    ];
  }, [latest, who, amount, cap, discount, mfn, date, securityId]);
  const dry = useDryRun(drafts);
  const investor =
    person?.name ||
    (("id" in who && latest?.stakeholders.get(who.id)?.name?.legal_name) as string) ||
    "Investor";
  const before = (app.state ? [...app.state.securities.values()] : [])
    .filter((x) => x.kind === "convertible" && x.amount && x.amount !== "0")
    .map((x) => x.amount!);
  const row = dry?.rows.find((r) => r.securityId === securityId);

  async function record() {
    if (!drafts) return setErrors(["Fill in the investor and the amount."]);
    const errs = await app.run(drafts);
    if (errs) return setErrors(errs);
    setAttachFor(securityId);
  }

  return (
    <>
      <CrumbHeader title="New SAFE" />
      <main className="page" style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
        <section className="card stack" style={{ flex: "1 1 380px", maxWidth: 520 }}>
          <div className="meta">Template: YC post-money SAFE (valuation cap)</div>
          <PersonPicker label="Investor" value={who} onChange={setWho} defaultType="INSTITUTION" />
          <div className="grid2">
            <Field label="Amount (USD)">
              <input
                className="inp num"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="200,000"
              />
            </Field>
            <Field label="Valuation cap (USD)">
              <input
                className="inp num"
                value={cap}
                onChange={(e) => setCap(e.target.value)}
                placeholder="10,000,000"
              />
            </Field>
            <Field label="Discount (optional)">
              <input
                className="inp num"
                value={discount}
                onChange={(e) => setDiscount(e.target.value.replace("%", ""))}
                placeholder="e.g. 20%"
              />
            </Field>
            <Field label="Date">
              <input className="inp" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <label className="row small">
            <input type="checkbox" checked={mfn} onChange={(e) => setMfn(e.target.checked)} /> Most favored
            nation (MFN)
          </label>
          <div className="banner">
            <div style={{ fontWeight: 500, marginBottom: 4 }}>On the cap table</div>
            {row ? (
              <>
                <div>
                  {investor} ≈{" "}
                  {row.asConverted
                    ? `${row.asConverted}% as-converted (${usdShort(digits(amount))} ÷ ${usdShort(digits(cap))})`
                    : "converts at the next round (no cap)"}
                </div>
                <div className="muted">
                  SAFEs outstanding: {usdShort(before.length ? sumMoney(before) : "0")} →{" "}
                  {usdShort(sumMoney([...before, digits(amount)]))}
                </div>
              </>
            ) : (
              <span className="muted">Fill in the investor and amount to see the effect.</span>
            )}
          </div>
          <ErrorList errors={errors ?? dry?.errors ?? null} />
          <div className="row wrap">
            <button
              type="button"
              className="btn"
              onClick={() =>
                app.go({
                  name: "comingSoon",
                  title: "Send for signature",
                  milestone: "M5",
                  text: "The investor gets a link and signs in the browser; you countersign here.",
                })
              }
            >
              Send for signature
            </button>
            <button type="button" className="btn primary" onClick={record}>
              Record as signed
            </button>
          </div>
          <p className="meta">
            Already signed on paper or the investor's own form? Record it, then attach the PDF. It goes to
            docs/safes/.
          </p>
        </section>
        <section
          className="card"
          style={{ flex: "1 1 420px", fontFamily: "Georgia, 'IBM Plex Serif', serif", lineHeight: 1.6 }}
          aria-label="Preview"
        >
          <h2 style={{ fontFamily: "inherit", textAlign: "center" }}>SAFE</h2>
          <p style={{ textAlign: "center" }} className="muted">
            (Simple Agreement for Future Equity)
          </p>
          <p>
            THIS CERTIFIES THAT in exchange for the payment by <mark>{investor}</mark> (the "Investor") of{" "}
            <mark>{usd(digits(amount) || undefined)}</mark> (the "Purchase Amount") on or about{" "}
            <mark>{day(date)}</mark>, <mark>{(latest?.issuer?.legal_name as string) ?? "the Company"}</mark>{" "}
            (the "Company") issues to the Investor the right to certain shares of the Company's Capital Stock,
            subject to the terms described below.
          </p>
          <p>
            The "Post-Money Valuation Cap" is <mark>{usd(digits(cap) || undefined)}</mark>.
            {discount ? (
              <>
                {" "}
                The "Discount Rate" is <mark>{100 - Number(discount)}%</mark>.
              </>
            ) : null}
          </p>
          <p className="meta">
            Template text from Y Combinator's post-money SAFE, used unmodified when sending (M5). This is a
            preview.
          </p>
        </section>
      </main>
      <AttachModal
        open={!!attachFor}
        target={attachFor ?? undefined}
        docType="safe"
        onClose={() => {
          setAttachFor(null);
          app.go({ name: "home" });
        }}
      />
    </>
  );
}
