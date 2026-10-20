import {
  builders as b,
  type EventDraft,
  fullyVestedOn,
  liveEvents,
  nextVest,
  reduce,
  type Security,
  securityVested,
  vestingSchedule,
} from "@capfolder/core";
import { type ReactNode, useMemo, useState } from "react";
import { DateInput } from "../components/DateInput";
import { CrumbHeader } from "../components/Header";
import { newPerson, type PersonChoice, PersonPicker, resolvePerson } from "../components/PersonPicker";
import { Chip, ErrorList, Field, Modal } from "../components/ui";
import { VestingGraph } from "../components/VestingGraph";
import { day, money, moneyShort, month, num, plusDays, shares, todayIso } from "../fmt";
import { CORRECTABLE, getPath, type HistoryItem, historyFor } from "../history";
import { useApp } from "../state";
import { scheduleText } from "../views";

type Dialog =
  | "edit"
  | "terminate"
  | "exercise"
  | "repurchase"
  | "transfer"
  | { correct: HistoryItem }
  | { reverse: HistoryItem }
  | null;

/** Person.html: summary, vesting chart, holdings, history, and the change flows (F-18, F-19, F-22, F-23, F-24). */
export function Person({ id }: { id: string }) {
  const app = useApp();
  const s = app.state;
  const [dialog, setDialog] = useState<Dialog>(null);
  if (!s || !app.vault) return null;
  const p = s.stakeholders.get(id);
  if (!p) return <main className="medium">Not found.</main>;
  const secs = [...s.securities.values()].filter(
    (x) => x.stakeholderId === id && (x.kind === "convertible" || x.quantity > 0n),
  );
  const equity = secs.filter((x) => x.kind !== "convertible");
  const options = secs.filter((x) => x.kind === "equity");
  const transferable = secs.filter((x) => x.kind === "stock" || x.convertibleType === "SAFE");
  const vestingStock = secs.filter((x) => x.kind === "stock" && (x.vestingTermsId || x.vestings?.length));
  const main = equity.find((x) => vestingSchedule(x, s)) ?? equity[0];
  const history = historyFor(app.vault.events, s, id);
  const email = p.contact_info?.emails?.[0]?.email_address;
  const role = options.length
    ? "Employee"
    : equity.length
      ? "Shareholder"
      : secs.length
        ? "Investor"
        : "No holdings";

  return (
    <>
      <CrumbHeader title={p.name?.legal_name} back={{ name: "people" }}>
        <button type="button" className="btn" onClick={() => setDialog("edit")}>
          Edit
        </button>
        {transferable.length ? (
          <button type="button" className="btn" onClick={() => setDialog("transfer")}>
            Transfer…
          </button>
        ) : null}
        {options.length ? (
          <button type="button" className="btn" onClick={() => setDialog("exercise")}>
            Record exercise
          </button>
        ) : null}
        {vestingStock.length ? (
          <button type="button" className="btn" onClick={() => setDialog("repurchase")}>
            Repurchase unvested…
          </button>
        ) : null}
        {equity.some((x) => x.vestingTermsId || x.vestings?.length) ? (
          <button type="button" className="btn danger" onClick={() => setDialog("terminate")}>
            Terminate…
          </button>
        ) : null}
      </CrumbHeader>
      <main className="page" style={{ maxWidth: 1120 }}>
        <div className="row wrap" style={{ gap: 32, marginBottom: 20 }}>
          <div className="grow">
            <div className="meta">
              {role}
              {email ? ` · ${email}` : ""}
            </div>
            <h1>{p.name?.legal_name}</h1>
          </div>
          {main ? <Summary x={main} /> : null}
        </div>
        {main && vestingSchedule(main, s) ? (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="row spread">
              <h2 style={{ margin: 0 }}>Vesting schedule</h2>
              <span className="meta">{scheduleText(s, main)}</span>
            </div>
            <div style={{ marginTop: 12 }}>
              <VestingGraph x={main} name={p.name?.legal_name ?? id} />
            </div>
          </div>
        ) : null}
        <div
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}
        >
          {secs.map((x) => (
            <HoldingCard key={x.id} x={x} />
          ))}
          <div className="card">
            <h2>History</h2>
            {history.map((h) => (
              <div
                key={h.event.id}
                className="row"
                style={{
                  alignItems: "flex-start",
                  padding: "6px 0",
                  borderBottom: "1px solid var(--row-divider)",
                }}
              >
                <span className="mono meta" style={{ width: 92, flex: "none" }}>
                  {h.date}
                </span>
                <span
                  className="small grow"
                  style={{ textDecoration: h.reversed ? "line-through" : undefined }}
                >
                  {h.text}
                  {h.reversed ? <span className="meta"> (reversed)</span> : null}
                </span>
                {h.correctable && !h.reversed ? (
                  <span className="row" style={{ gap: 8 }}>
                    {CORRECTABLE[h.event.type] ? (
                      <button
                        type="button"
                        className="btn link small"
                        onClick={() => setDialog({ correct: h })}
                      >
                        Correct…
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn link small"
                      onClick={() => setDialog({ reverse: h })}
                    >
                      Reverse…
                    </button>
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </main>
      {dialog === "edit" ? (
        <EditDialog
          id={id}
          canTransfer={transferable.length > 0}
          onTransfer={() => setDialog("transfer")}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === "transfer" ? <TransferDialog secs={transferable} onClose={() => setDialog(null)} /> : null}
      {dialog === "terminate" ? (
        <TerminateDialog
          secs={equity.filter((x) => x.vestingTermsId || x.vestings?.length)}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === "exercise" ? <ExerciseDialog secs={options} onClose={() => setDialog(null)} /> : null}
      {dialog === "repurchase" ? (
        <RepurchaseDialog secs={vestingStock} onClose={() => setDialog(null)} />
      ) : null}
      {dialog && typeof dialog === "object" && "correct" in dialog ? (
        <CorrectDialog item={dialog.correct} onClose={() => setDialog(null)} />
      ) : null}
      {dialog && typeof dialog === "object" && "reverse" in dialog ? (
        <ReverseDialog item={dialog.reverse} onClose={() => setDialog(null)} />
      ) : null}
    </>
  );
}

function Summary({ x }: { x: Security }) {
  const s = useApp().state!;
  const v = securityVested(x, s, s.asOf);
  const next = nextVest(x, s, s.asOf);
  const full = fullyVestedOn(x, s);
  return (
    <div className="row" style={{ gap: 28 }}>
      <div>
        <div className="meta">Vested</div>
        <div className="num" style={{ fontSize: 22 }}>
          {shares(v.vested)} <span className="meta">/ {shares(x.quantity)}</span>
        </div>
      </div>
      <div>
        <div className="meta">Next vest</div>
        <div className="num" style={{ fontSize: 22 }}>
          {next ? `${shares(next.quantity)} ${day(next.date).replace(/ \d{4}$/, "")}` : "—"}
        </div>
      </div>
      <div>
        <div className="meta">Fully vested</div>
        <div className="num" style={{ fontSize: 22 }}>
          {full ? month(full) : "—"}
        </div>
      </div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="row spread small" style={{ padding: "4px 0" }}>
      <span className="muted">{k}</span>
      <span className="num">{v}</span>
    </div>
  );
}

function HoldingCard({ x }: { x: Security }) {
  const s = useApp().state!;
  const plan = x.planId ? s.plans.get(x.planId)?.data.plan_name : undefined;
  if (x.kind === "convertible")
    return (
      <div className="card">
        <h2>SAFE · {x.id}</h2>
        <KV k="Amount" v={money(x.amount, x.currency)} />
        <KV k="Valuation cap" v={x.cap ? moneyShort(x.cap, x.currency) : "None"} />
        {x.discount ? <KV k="Discount" v={`${Number(x.discount) * 100}%`} /> : null}
        <KV k="Date" v={day(x.date)} />
      </div>
    );
  return (
    <div className="card">
      <h2>
        {x.kind === "equity" ? "Grant" : "Shares"} · {x.id}
      </h2>
      {plan ? <KV k="Type" v={`${x.compensationType?.replace("OPTION_", "") ?? ""} · ${plan}`} /> : null}
      <KV k={x.kind === "equity" ? "Options" : "Shares"} v={shares(x.quantity)} />
      {x.exercised ? <KV k="Exercised" v={shares(x.exercised)} /> : null}
      {x.price ? (
        <KV k={x.kind === "equity" ? "Strike" : "Price"} v={money(x.price, x.priceCurrency)} />
      ) : null}
      <KV k="Issued" v={day(x.date)} />
      {x.stoppedAt ? <KV k="Vesting stopped" v={day(x.stoppedAt)} /> : null}
    </div>
  );
}

/** Shared dialog body: runs the drafts through core, shows its errors, closes on success. */
function useSave(onClose: () => void) {
  const app = useApp();
  const [errors, setErrors] = useState<string[] | null>(null);
  return {
    errors,
    setErrors,
    async save(drafts: EventDraft[]) {
      if (!drafts.length) return setErrors(["Nothing to record."]);
      const errs = await app.run(drafts);
      if (errs) return setErrors(errs);
      onClose();
    },
  };
}

function EditDialog({
  id,
  canTransfer,
  onTransfer,
  onClose,
}: {
  id: string;
  canTransfer: boolean;
  onTransfer(): void;
  onClose(): void;
}) {
  const app = useApp();
  const prev = app.latest!.stakeholders.get(id)!;
  const [kind, setKind] = useState<"same" | "other" | "duplicate" | null>(null);
  const [name, setName] = useState(prev.name?.legal_name ?? "");
  const [email, setEmail] = useState(prev.contact_info?.emails?.[0]?.email_address ?? "");
  const others = [...app.latest!.stakeholders.values()].filter((x) => x.id !== id);
  const [keep, setKeep] = useState(others[0]?.id ?? "");
  const keepName = app.latest!.stakeholders.get(keep)?.name?.legal_name ?? "";
  const { errors, setErrors, save } = useSave(onClose);
  const choice = (k: typeof kind, label: string) => (
    <button type="button" className={`btn ${kind === k ? "primary" : ""}`} onClick={() => setKind(k)}>
      {label}
    </button>
  );
  return (
    <Modal open onClose={onClose} title="Edit person">
      <div className="stack">
        <p>Is this the same person or legal entity?</p>
        <div className="row wrap">
          {choice("same", "Same, just a new name or email")}
          {choice("other", "A different entity")}
          {others.length ? choice("duplicate", "A duplicate of someone else here") : null}
        </div>
        {kind === "other" ? (
          <div className="stack">
            <p>
              Moving holdings to another person or entity is a transfer. Record it once the transfer agreement
              is signed.
            </p>
            {canTransfer ? (
              <button type="button" className="btn primary" onClick={onTransfer}>
                Transfer holdings…
              </button>
            ) : (
              <p className="meta">{prev.name?.legal_name} has no shares or SAFEs to transfer.</p>
            )}
          </div>
        ) : null}
        {kind === "duplicate" ? (
          <>
            <Field label="Keep">
              <select className="inp" value={keep} onChange={(e) => setKeep(e.target.value)}>
                {others.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name?.legal_name}
                  </option>
                ))}
              </select>
            </Field>
            <p className="meta">
              Everything recorded for {prev.name?.legal_name} moves to {keepName}: holdings, documents, and
              the name, which sorting will still recognize. The history keeps both records.
            </p>
            <ErrorList errors={errors} />
            <button
              type="button"
              className="btn primary"
              onClick={async () => {
                const drafts = b.mergePeople({ events: app.vault!.events, fromId: id, intoId: keep });
                if (!drafts.length) return setErrors(["Nothing to merge."]);
                const errs = await app.run(drafts);
                if (errs) return setErrors(errs);
                app.go({ name: "person", id: keep });
              }}
            >
              Merge into {keepName}
            </button>
          </>
        ) : null}
        {kind === "same" ? (
          <>
            <Field label="Name">
              <input className="inp" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Email">
              <input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <p className="meta">Signed documents keep the name they were signed with.</p>
            <ErrorList errors={errors} />
            <button
              type="button"
              className="btn primary"
              onClick={() => save([b.stakeholderUpdate({ previous: prev, name, email })])}
            >
              Save
            </button>
          </>
        ) : null}
      </div>
    </Modal>
  );
}

function TransferDialog({ secs, onClose }: { secs: Security[]; onClose(): void }) {
  const app = useApp();
  const [secId, setSecId] = useState(secs[0]?.id ?? "");
  const [to, setTo] = useState<PersonChoice>(() => newPerson("INSTITUTION"));
  const [date, setDate] = useState(todayIso());
  const [qty, setQty] = useState("");
  const { errors, setErrors, save } = useSave(onClose);
  const at = useMemo(() => reduce(app.vault!.events, date), [app.vault, date]);
  const x = at.securities.get(secId) ?? secs.find((s) => s.id === secId);
  const isSafe = x?.kind === "convertible";
  return (
    <Modal open onClose={onClose} title="Transfer">
      <div className="stack">
        <SecuritySelect secs={secs} value={secId} onChange={setSecId} />
        <PersonPicker label="To" value={to} onChange={setTo} defaultType="INSTITUTION" />
        <div className="grid2">
          <Field
            label={isSafe ? "Amount" : "Shares"}
            hint={
              x
                ? isSafe
                  ? `${money(x.amount, x.currency)} outstanding.`
                  : `${shares(x.quantity)} outstanding.`
                : undefined
            }
          >
            <input className="inp num" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <Field label="Date">
            <DateInput value={date} onChange={setDate} />
          </Field>
        </div>
        <p className="meta">
          {isSafe
            ? "The new holder gets their own SAFE with the same cap and discount."
            : "Vesting carries over unchanged. Options can't be transferred."}{" "}
          Attach the signed transfer agreement from Documents.
        </p>
        <ErrorList errors={errors} />
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            const who = resolvePerson(to);
            if (!who) return setErrors(["Enter who receives it."]);
            const q = num(qty);
            const r = b.transfer({
              state: at,
              securityId: secId,
              toStakeholderId: who.id,
              date,
              ...(isSafe ? { amount: q } : { quantity: q }),
            });
            if ("error" in r) return setErrors([r.error]);
            return save([...who.drafts, ...r.drafts]);
          }}
        >
          Record transfer
        </button>
      </div>
    </Modal>
  );
}

function SecuritySelect({
  secs,
  value,
  onChange,
}: {
  secs: Security[];
  value: string;
  onChange(v: string): void;
}) {
  if (secs.length < 2) return null;
  return (
    <Field label="Holding">
      <select className="inp" value={value} onChange={(e) => onChange(e.target.value)}>
        {secs.map((x) => (
          <option key={x.id} value={x.id}>
            {x.id} · {shares(x.quantity)}
          </option>
        ))}
      </select>
    </Field>
  );
}

function TerminateDialog({ secs, onClose }: { secs: Security[]; onClose(): void }) {
  const app = useApp();
  const [secId, setSecId] = useState(secs[0]?.id ?? "");
  const [date, setDate] = useState(todayIso());
  const [reason, setReason] = useState("Voluntary");
  const { errors, save } = useSave(onClose);
  const at = useMemo(() => reduce(app.vault!.events, date), [app.vault, date]);
  const x = at.securities.get(secId);
  const v = x ? securityVested(x, at, date) : null;
  const drafts = x ? b.termination({ state: at, securityId: secId, date, reason }) : [];
  return (
    <Modal open onClose={onClose} title="Terminate">
      <div className="stack">
        <SecuritySelect secs={secs} value={secId} onChange={setSecId} />
        <div className="grid2">
          <Field label="Last day">
            <DateInput value={date} onChange={setDate} />
          </Field>
          <Field label="Reason">
            <select className="inp" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option>Voluntary</option>
              <option>For cause</option>
              <option>Other</option>
            </select>
          </Field>
        </div>
        {v ? (
          <div className="banner">
            Vested <span className="num">{shares(v.vested)}</span> · returns{" "}
            <span className="num">{shares(v.unvested)}</span>
            {x?.planId ? " to the pool" : " (cancelled)"}
            {x?.kind === "equity" ? <> · exercise by {day(plusDays(date, 90))}</> : null}
          </div>
        ) : null}
        <ErrorList errors={errors} />
        <button type="button" className="btn primary danger" onClick={() => save(drafts)}>
          Record termination
        </button>
      </div>
    </Modal>
  );
}

function ExerciseDialog({ secs, onClose }: { secs: Security[]; onClose(): void }) {
  const app = useApp();
  const [secId, setSecId] = useState(secs[0]?.id ?? "");
  const [date, setDate] = useState(todayIso());
  const [qty, setQty] = useState("");
  const { errors, save } = useSave(onClose);
  const at = useMemo(() => reduce(app.vault!.events, date), [app.vault, date]);
  const x = at.securities.get(secId);
  const vested = x ? securityVested(x, at, date).vested : null;
  const q = num(qty);
  return (
    <Modal open onClose={onClose} title="Record exercise">
      <div className="stack">
        <SecuritySelect secs={secs} value={secId} onChange={setSecId} />
        <div className="grid2">
          <Field
            label="Options exercised"
            hint={vested !== null ? `${shares(vested)} vested and unexercised on that date.` : undefined}
          >
            <input className="inp num" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <Field label="Date">
            <DateInput value={date} onChange={setDate} />
          </Field>
        </div>
        <p className="meta">
          The options become common shares. Attach the signed exercise notice from Documents.
        </p>
        <ErrorList errors={errors} />
        <button
          type="button"
          className="btn primary"
          onClick={() => save(x && q ? b.exercise({ state: at, securityId: secId, quantity: q, date }) : [])}
        >
          Record exercise
        </button>
      </div>
    </Modal>
  );
}

function RepurchaseDialog({ secs, onClose }: { secs: Security[]; onClose(): void }) {
  const app = useApp();
  const [secId, setSecId] = useState(secs[0]?.id ?? "");
  const [date, setDate] = useState(todayIso());
  const { errors, save } = useSave(onClose);
  const at = useMemo(() => reduce(app.vault!.events, date), [app.vault, date]);
  const x = at.securities.get(secId);
  const v = x ? securityVested(x, at, date) : null;
  return (
    <Modal open onClose={onClose} title="Repurchase unvested shares">
      <div className="stack">
        <SecuritySelect secs={secs} value={secId} onChange={setSecId} />
        <Field label="Date">
          <DateInput value={date} onChange={setDate} />
        </Field>
        {v ? (
          <div className="banner">
            Unvested <span className="num">{shares(v.unvested)}</span> go back to the company at{" "}
            {money(x?.price, x?.priceCurrency)} per share. Vested{" "}
            <span className="num">{shares(v.vested)}</span> stay.
          </div>
        ) : null}
        <ErrorList errors={errors} />
        <button
          type="button"
          className="btn primary"
          onClick={() => save(x ? b.repurchaseUnvested({ state: at, securityId: secId, date }) : [])}
        >
          Record repurchase
        </button>
      </div>
    </Modal>
  );
}

function CorrectDialog({ item, onClose }: { item: HistoryItem; onClose(): void }) {
  const fields = CORRECTABLE[item.event.type] ?? [];
  const [path, setPath] = useState(fields[0]?.path ?? "");
  const events = useApp().vault!.events;
  // the value as it stands now, after any earlier corrections
  const current = useMemo(
    () => getPath(liveEvents(events).find((e) => e.id === item.event.id)?.data, path),
    [events, item, path],
  );
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const { errors, setErrors, save } = useSave(onClose);
  return (
    <Modal open onClose={onClose} title="Correct a mistake">
      <div className="stack">
        <p className="small">{item.text}</p>
        <Field label="What's wrong">
          <select className="inp" value={path} onChange={(e) => setPath(e.target.value)}>
            {fields.map((f) => (
              <option key={f.path} value={f.path}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid2">
          <Field label="Recorded as">
            <input className="inp num" value={String(current ?? "")} disabled />
          </Field>
          <Field label="Should be">
            <input
              className="inp num"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              type={path === "date" ? "date" : "text"}
            />
          </Field>
        </div>
        <Field label="Why">
          <input
            className="inp"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Typo when entering"
          />
        </Field>
        <p className="meta">
          The original line stays in the record; the correction is added after it. If the signed document
          itself is wrong, it needs an amendment.
        </p>
        <ErrorList errors={errors} />
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            if (!value.trim() || !reason.trim()) return setErrors(["Enter the right value and the reason."]);
            save([
              b.correction({
                target: item.event.id,
                field: path,
                old: current,
                new: num(value),
                reason,
              }),
            ]);
          }}
        >
          Record correction
        </button>
      </div>
    </Modal>
  );
}

function ReverseDialog({ item, onClose }: { item: HistoryItem; onClose(): void }) {
  const [reason, setReason] = useState("");
  const { errors, setErrors, save } = useSave(onClose);
  return (
    <Modal open onClose={onClose} title="Reverse an entry">
      <div className="stack">
        <p className="small">
          <Chip tone="amber">Reverse</Chip> {item.text}
        </p>
        <p className="meta">
          Use this when the whole entry shouldn't exist (for example, a duplicate). It stays visible in
          history.
        </p>
        <Field label="Why">
          <input
            className="inp"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Entered twice"
          />
        </Field>
        <ErrorList errors={errors} />
        <button
          type="button"
          className="btn primary danger"
          onClick={() =>
            reason.trim()
              ? save([b.reversal({ target: item.event.id, reason })])
              : setErrors(["Enter the reason."])
          }
        >
          Reverse entry
        </button>
      </div>
    </Modal>
  );
}
