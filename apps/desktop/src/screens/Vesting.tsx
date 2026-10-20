import {
  builders as b,
  capTableRows,
  capTableTotals,
  fmv,
  fullyVestedOn,
  mulDec,
  nextVest,
  percentOf,
  poolOverview,
  type Security,
  securityVested,
  vestingSchedule,
} from "@capfolder/core";
import { useMemo, useState } from "react";
import { DateInput } from "../components/DateInput";
import { MainHeader } from "../components/Header";
import { Chip, ErrorList, Field, Modal, VestingBar } from "../components/ui";
import { VestingGraph } from "../components/VestingGraph";
import { day, money, num, plusDays, shares, todayIso, withCurrency } from "../fmt";
import { join } from "../fs/types";
import { useApp } from "../state";
import { isSafeDocPath } from "../vault";

/** Everyone's options from the pool: how much has vested, what's next, and what it's worth at the 409A price. */
export function Vesting() {
  const app = useApp();
  const s = app.state;
  const [open, setOpen] = useState<string | null>(null);
  const [former, setFormer] = useState(false);
  const [adding409a, setAdding409a] = useState(false);
  const fd = useMemo(() => (s ? capTableTotals(capTableRows(s)).fullyDiluted : 0n), [s]);
  if (!s) return null;
  const pool = poolOverview(s);
  const price = fmv(s);
  const grants = [...s.securities.values()].filter(
    (x) => x.planId && x.kind === "equity" && (former || !x.stoppedAt),
  );
  const hasFormer = [...s.securities.values()].some((x) => x.planId && x.stoppedAt);

  return (
    <>
      <MainHeader>
        <label className="row small muted" style={{ gap: 6 }}>
          As of
          <DateInput
            style={{ width: 160, minHeight: 36 }}
            value={app.asOf}
            max="9999-12-31"
            onChange={(v) => app.setAsOf(v || todayIso())}
          />
        </label>
        <button type="button" className="btn" onClick={() => setAdding409a(true)}>
          {price ? `409A ${money(price.amount, price.currency)}` : "Add 409A"}
        </button>
        <button type="button" className="btn primary" onClick={() => app.go({ name: "newGrant" })}>
          + New grant
        </button>
      </MainHeader>
      <main className="page">
        <div className="row wrap" style={{ alignItems: "baseline", gap: 12, marginBottom: 16 }}>
          <h1 style={{ margin: 0 }}>Equity incentive pool</h1>
          {pool ? (
            <span className="muted">
              {pool.name}
              {pool.approved ? ` · approved ${day(pool.approved)}` : ""}
            </span>
          ) : null}
        </div>
        {!pool ? (
          <div className="card">
            <p>No option pool yet. Create one to grant options and follow their vesting here.</p>
            <button type="button" className="btn primary" onClick={() => app.go({ name: "pool" })}>
              Create the pool
            </button>
          </div>
        ) : (
          <>
            <div className="stats">
              <PoolCard
                label="Total pool"
                value={pool.reserved}
                sub={`${percentOf(pool.reserved, fd)}% of company · ${shares(fd)} fully diluted`}
              />
              <PoolCard
                label="Allocated"
                value={pool.allocated}
                sub={`${percentOf(pool.allocated, pool.reserved)}% of pool · ${pool.people} ${pool.people === 1 ? "person" : "people"}`}
              />
              <PoolCard
                label="Vested"
                value={pool.vested}
                sub={`${percentOf(pool.vested, pool.allocated)}% of allocated`}
                green
              />
              <PoolCard
                label="Available to grant"
                value={pool.available}
                sub={`${percentOf(pool.available, pool.reserved)}% of pool${pool.returned ? ` · incl. ${shares(pool.returned)} returned` : ""}`}
              />
            </div>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="poolbar" aria-hidden="true">
                <span className="v" style={{ width: `${percentOf(pool.vested, pool.reserved)}%` }} />
                <span
                  className="g"
                  style={{ width: `${percentOf(pool.allocated - pool.vested, pool.reserved)}%` }}
                />
              </div>
              <div className="row wrap meta" style={{ gap: 18, marginTop: 10 }}>
                <span>
                  <span className="key v" /> Vested <span className="num">{shares(pool.vested)}</span>
                </span>
                <span>
                  <span className="key g" /> Granted, not vested yet{" "}
                  <span className="num">{shares(pool.allocated - pool.vested)}</span>
                </span>
                <span>
                  <span className="key a" /> Available <span className="num">{shares(pool.available)}</span>
                </span>
              </div>
            </div>
            {!price ? (
              <div className="banner small" style={{ marginBottom: 16 }}>
                No 409A recorded, so FMV and vested value show "—".{" "}
                <button type="button" className="btn link small" onClick={() => setAdding409a(true)}>
                  Add 409A
                </button>
              </div>
            ) : null}
            <div className="card" style={{ padding: 0, overflowX: "auto" }}>
              <table className="tbl" style={{ minWidth: 820 }}>
                <thead>
                  <tr>
                    <th className="th">Name</th>
                    <th className="th">Grant</th>
                    <th className="th right">Shares</th>
                    <th className="th">Vested</th>
                    <th className="th right">Strike</th>
                    <th className="th">Next vest</th>
                    <th className="th">Documents</th>
                    <th className="th" />
                  </tr>
                </thead>
                <tbody>
                  {grants.map((x) => (
                    <GrantRow
                      key={x.id}
                      x={x}
                      open={open === x.id}
                      toggle={() => setOpen(open === x.id ? null : x.id)}
                    />
                  ))}
                  {!grants.length ? (
                    <tr>
                      <td className="td muted" colSpan={8}>
                        No options granted{former ? "" : " to current employees"} as of {day(s.asOf)}.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {hasFormer ? (
              <label className="row small" style={{ gap: 8, marginTop: 12 }}>
                <input type="checkbox" checked={former} onChange={(e) => setFormer(e.target.checked)} />
                Show former employees
              </label>
            ) : null}
          </>
        )}
      </main>
      {adding409a ? <Add409a onClose={() => setAdding409a(false)} /> : null}
    </>
  );
}

function PoolCard(p: { label: string; value: bigint; sub: string; green?: boolean }) {
  return (
    <div className="card tight stat">
      <div className="meta">{p.label}</div>
      <div className="val" style={p.green ? { color: "var(--green-600)" } : undefined}>
        {shares(p.value)}
      </div>
      <div className="meta small">{p.sub}</div>
    </div>
  );
}

/** Vested so far, exercised included (the grant's own count, not what's left to exercise). */
const vestedOf = (x: Security, s: NonNullable<ReturnType<typeof useApp>["state"]>) =>
  (securityVested(x, s, s.asOf).vested ?? 0n) + x.exercised;

function GrantRow({ x, open, toggle }: { x: Security; open: boolean; toggle(): void }) {
  const app = useApp();
  const s = app.state!;
  const name = s.stakeholders.get(x.stakeholderId)?.name?.legal_name ?? x.stakeholderId;
  const vested = vestedOf(x, s);
  const next = nextVest(x, s, s.asOf);
  const signed = docsFor(x, s).length > 0;
  return (
    <>
      <tr className={`click ${open ? "sel" : ""}`} onClick={toggle}>
        <td className="td">
          <button
            type="button"
            className="btn link"
            onClick={(e) => {
              e.stopPropagation();
              app.go({ name: "person", id: x.stakeholderId });
            }}
          >
            {name}
          </button>
          {x.stoppedAt ? <span className="meta"> · left {day(x.stoppedAt)}</span> : null}
        </td>
        <td className="td muted">{x.compensationType?.replace("OPTION_", "") ?? "Option"}</td>
        <td className="td num right">{shares(x.originalQuantity)}</td>
        <td className="td">
          <VestingBar
            fraction={Number(percentOf(vested, x.originalQuantity)) / 100}
            label={`${Math.round(Number(percentOf(vested, x.originalQuantity)))}%`}
          />
        </td>
        <td className="td num right">{money(x.price, x.priceCurrency)}</td>
        <td className="td">
          {next ? (
            <>
              <div className="num">{day(next.date)}</div>
              <div className="meta">
                +{shares(next.quantity)}
                {vested > 0n ? " monthly" : " at the cliff"}
              </div>
            </>
          ) : (
            <span className="meta">—</span>
          )}
        </td>
        <td className="td">
          {signed ? <Chip tone="green">Signed</Chip> : <Chip tone="amber">Missing</Chip>}
        </td>
        <td className="td right">
          <button
            type="button"
            className="btn link chev"
            aria-label={`${name} details`}
            aria-expanded={open}
            onClick={(e) => {
              e.stopPropagation();
              toggle();
            }}
          >
            {open ? "▾" : "▸"}
          </button>
        </td>
      </tr>
      {open ? (
        <tr className="sel">
          <td className="td" colSpan={8}>
            <GrantDetails x={x} name={name} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

const docsFor = (x: Security, s: NonNullable<ReturnType<typeof useApp>["state"]>) =>
  [...s.docs.values()].filter(
    (d) =>
      !d.removed &&
      isSafeDocPath(d.data.path) && // a path from the shared log stays inside the vault's docs/
      (d.links.has(x.id) || d.links.has(x.txId) || d.links.has(x.stakeholderId)),
  );

function GrantDetails({ x, name }: { x: Security; name: string }) {
  const app = useApp();
  const s = app.state!;
  const price = fmv(s);
  const vested = vestedOf(x, s);
  const toExercise = securityVested(x, s, s.asOf).vested ?? 0n;
  const pts = vestingSchedule(x, s) ?? [];
  const cliff = pts.findIndex((p) => p.cumulative > 0n);
  const full = fullyVestedOn(x, s);
  const docs = docsFor(x, s);
  return (
    <section aria-label={name} className="stack" style={{ gap: 16 }}>
      <VestingGraph x={x} name={name} />
      <div className="vdetails">
        <div>
          <h3>Key dates</h3>
          <KV k="Grant date" v={day(x.date)} />
          {x.vestingStart ? <KV k="Vesting start" v={day(x.vestingStart.date)} /> : null}
          {cliff > 0 ? <KV k="Cliff" v={day(pts[cliff]!.date)} /> : null}
          <KV k="Fully vested" v={full ? day(full) : "—"} />
          {x.stoppedAt ? <KV k="Vesting stopped" v={day(x.stoppedAt)} /> : null}
          {x.expires ? <KV k="Option expiry" v={day(x.expires)} /> : null}
        </div>
        <div>
          <h3>Price</h3>
          <KV k="Strike" v={money(x.price, x.priceCurrency)} />
          <KV k="FMV" v={price ? money(price.amount, price.currency) : "—"} />
          <KV k="Vested" v={shares(vested)} />
          <KV k="Exercise cost" v={x.price ? money(mulDec(toExercise, x.price), x.priceCurrency) : "—"} />
          <KV k="Vested value" v={price ? money(mulDec(vested, price.amount), price.currency) : "—"} />
          {x.stoppedAt ? <KV k="Exercise by" v={day(plusDays(x.stoppedAt, 90))} /> : null}
        </div>
        <div>
          <h3>Signed documents</h3>
          {docs.length ? (
            docs.map((d) => (
              <div key={String(d.data.doc_id)} className="row spread small" style={{ padding: "4px 0" }}>
                <span className="mono" style={{ overflowWrap: "anywhere" }}>
                  {String(d.data.path).split("/").pop()}
                </span>
                <button
                  type="button"
                  className="btn link small"
                  onClick={() => app.vault && app.platform.reveal(join(app.vault.root, String(d.data.path)))}
                >
                  Open
                </button>
              </div>
            ))
          ) : (
            <p className="meta">None yet. Attach the signed grant in Documents.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="row spread small" style={{ padding: "3px 0" }}>
      <span className="muted">{k}</span>
      <span className="num">{v}</span>
    </div>
  );
}

/** Record a 409A: the date, the price per common share, and who did it. The report itself goes in Documents. */
function Add409a({ onClose }: { onClose(): void }) {
  const app = useApp();
  const [date, setDate] = useState(todayIso());
  const [price, setPrice] = useState("");
  const [provider, setProvider] = useState("");
  const [errors, setErrors] = useState<string[] | null>(null);
  const classId = app.latest
    ? ([...app.latest.classes.entries()].find(([, c]) => c.data.class_type === "COMMON")?.[0] ??
      [...app.latest.classes.keys()][0])
    : undefined;
  async function save() {
    const p = num(price);
    if (!/^\d+(\.\d{1,10})?$/.test(p) || Number(p) <= 0)
      return setErrors(["Enter the price per share from the 409A report, like 0.42."]);
    if (!classId) return setErrors(["Set up authorized shares first."]);
    const errs = await app.run([
      b.valuation409a({
        price: p,
        date,
        classId,
        provider: provider.trim() || undefined,
        currency: app.currency,
      }),
    ]);
    if (errs) return setErrors(errs);
    onClose();
  }
  return (
    <Modal open onClose={onClose} title="Add a 409A valuation">
      <div className="stack">
        <div className="grid2">
          <Field label="Effective date">
            <DateInput value={date} onChange={setDate} />
          </Field>
          <Field label={withCurrency("Price per common share")}>
            <input
              className="inp num"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.42"
            />
          </Field>
        </div>
        <Field label="Done by (optional)">
          <input className="inp" value={provider} onChange={(e) => setProvider(e.target.value)} />
        </Field>
        <p className="meta">Attach the signed report and the board consent in Documents.</p>
        <ErrorList errors={errors} />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn primary" onClick={save}>
            Save 409A
          </button>
        </div>
      </div>
    </Modal>
  );
}
