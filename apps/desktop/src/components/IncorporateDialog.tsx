import { builders as b, type EventDraft } from "@capfolder/core";
import { setCompanyCurrency } from "@capfolder/vault";
import { useMemo, useState } from "react";
import { day, num, shares, todayIso, withCurrency } from "../fmt";
import { useApp } from "../state";
import { standardTerms } from "../terms";
import { DateInput } from "./DateInput";
import { CompanyPlace } from "./RegionFields";
import { ErrorList, Field, Modal } from "./ui";

/** CAP-61: the company now exists. One batch: ISSUER, Common shares, and every open promise issued at par. */
export function IncorporateDialog(p: { onClose(): void }) {
  const app = useApp();
  const s = app.latest!;
  const plan = s.planned;
  const [name, setName] = useState(plan?.name ?? "");
  const [place, setPlace] = useState({
    country: plan?.country ?? "US",
    subdivision: plan?.subdivision ?? "",
    currency: app.currency,
  });
  const [date, setDate] = useState("");
  const [authorized, setAuthorized] = useState("10000000");
  const [par, setPar] = useState("0.00001");
  const [termsId] = useState(() => b.newId("vt"));
  const [errors, setErrors] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const drafts = useMemo<EventDraft[] | null>(() => {
    if (!plan || !date || !num(authorized) || !num(par)) return null;
    return b.incorporation({
      state: s,
      issuerId: plan.issuer_id,
      name: name.trim() || plan.name,
      country: place.country,
      subdivision: place.subdivision.trim(),
      date,
      authorized: num(authorized),
      parValue: num(par),
      currency: app.currency,
      terms: standardTerms(s, termsId), // only written if a promise vests
    });
  }, [s, plan, name, place, date, authorized, par, termsId, app.currency]);
  const kept = new Map(
    (drafts ?? [])
      .filter((d) => d.type === "promise_kept")
      .map((d) => [d.data.promise_id, d.data.security_id]),
  );
  const nameOf = (id: string) => String(s.stakeholders.get(id)?.name?.legal_name ?? id);

  async function record() {
    if (!plan)
      return setErrors(["This folder has no planned company to incorporate. Restore it from your backup."]);
    if (!date) return setErrors(["Enter the date of incorporation."]);
    if (date > todayIso()) return setErrors(["The incorporation date can't be in the future."]);
    if (!drafts) return setErrors(["Enter the authorized shares and the par value."]);
    setBusy(true);
    const errs = await app.run(drafts).finally(() => setBusy(false));
    if (errs) return setErrors(errs);
    p.onClose();
  }

  return (
    <Modal open onClose={p.onClose} title="Record the incorporation">
      <div className="stack">
        <Field label="Legal name">
          <input className="inp" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <CompanyPlace
          {...place}
          onChange={async (next) => {
            setPlace(next);
            if (next.currency !== app.currency && app.vault)
              app.setVault(await setCompanyCurrency(app.platform.fs, app.vault, next.currency));
          }}
        />
        <div className="grid2">
          <Field label="Date of incorporation">
            <DateInput value={date} onChange={setDate} />
          </Field>
          <Field label="Authorized shares">
            <input className="inp num" value={authorized} onChange={(e) => setAuthorized(e.target.value)} />
          </Field>
          <Field label={withCurrency("Par value per share")}>
            <input className="inp num" value={par} onChange={(e) => setPar(e.target.value)} />
          </Field>
        </div>
        {s.promises.size ? (
          <div className="card tight small">
            <div className="meta">
              {date
                ? `The promised shares are issued on ${day(date)} at the par value, ${par} ${app.currency} per share:`
                : "Each promise becomes Common shares at the par value."}
            </div>
            {[...s.promises.values()].map((x) => (
              // the record_incorporation summary's lines (packages/capfolder tools/write.ts)
              <div key={x.id}>
                {`${nameOf(x.stakeholderId)}: ${shares(x.quantity)} Common shares${kept.has(x.id) ? ` (${kept.get(x.id)})` : ""}, ${
                  x.vesting === "none"
                    ? "no vesting"
                    : `vesting from ${x.vestingStart || date ? day(x.vestingStart ?? date) : "the incorporation date"}`
                }.`}
              </div>
            ))}
          </div>
        ) : (
          <p className="meta">There are no promised shares to issue.</p>
        )}
        <ErrorList errors={errors} />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={p.onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={record} disabled={busy}>
            Record incorporation
          </button>
        </div>
      </div>
    </Modal>
  );
}
