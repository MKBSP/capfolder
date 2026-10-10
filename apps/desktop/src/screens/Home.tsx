import {
  capTableRows,
  capTableTotals,
  checkInvariants,
  computeGaps,
  type Gap,
  nextVest,
  type Row,
} from "@capfolder/core";
import { useMemo, useState } from "react";
import { AttachModal } from "../components/AttachModal";
import { DateInput } from "../components/DateInput";
import { ExportDialog } from "../components/ExportDialog";
import { MainHeader } from "../components/Header";
import { Chip, ComingSoon, Menu, ShowMath, StatCard, VestingBar } from "../components/ui";
import { day, money, moneyShort, percent, shares, todayIso } from "../fmt";
import { useApp } from "../state";
import { docChip, isFounder, scheduleText, typeLabel, vestingCell } from "../views";

/** Main.html: the cap table is the home screen. */
export function Home() {
  const app = useApp();
  const { state, vault, asOf } = app;
  const [open, setOpen] = useState<string | null>(null);
  const [attach, setAttach] = useState<{ target?: string; docType?: string } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const rows = useMemo(() => (state ? capTableRows(state) : []), [state]);
  const gaps = useMemo(() => (state ? computeGaps(state) : []), [state]);
  const problems = useMemo(() => (state ? checkInvariants(state) : []), [state]);
  if (!state || !vault) return null;

  const fdRows = rows.filter((r) => r.group <= 2);
  const safes = rows.filter((r) => r.group === 3);
  const founderIds = fdRows
    .filter((r) => isFounder(state, state.securities.get(r.securityId)))
    .map((r) => r.securityId);
  const totals = capTableTotals(rows, founderIds); // all numbers from core
  const fd = totals.fullyDiluted;

  const New = (
    <Menu
      primary
      label="+ New"
      items={[
        { label: "SAFE", onClick: () => app.go({ name: "newSafe" }) },
        { label: "Grant", onClick: () => app.go({ name: "newGrant" }) },
        { label: "Shares", onClick: () => app.go({ name: "newShares" }) },
        { label: "Option pool", onClick: () => app.go({ name: "pool" }) },
        { label: "Person", onClick: () => app.go({ name: "newPerson" }) },
      ]}
    />
  );
  const Export = (
    <button type="button" className="btn" onClick={() => setExporting(true)}>
      Export
    </button>
  );

  // A company can change currency; SAFEs keep theirs, so a total only makes sense in one currency.
  const safeCurrencies = [...new Set(rows.filter((r) => r.group === 3).map((r) => r.currency ?? "USD"))];
  return (
    <>
      <MainHeader>
        <label className="row small muted" style={{ gap: 6 }}>
          As of
          <DateInput
            style={{ width: 160, minHeight: 36 }}
            value={asOf}
            max="9999-12-31"
            onChange={(v) => app.setAsOf(v || todayIso())}
          />
        </label>
        {Export}
        {New}
      </MainHeader>
      <VaultBanners />
      {exporting ? (
        <ExportDialog
          open
          onClose={() => setExporting(false)}
          onSaved={(path) => {
            setExporting(false);
            setSaved(path);
          }}
        />
      ) : null}
      {saved ? (
        <div className="banner green" style={{ margin: "12px 24px 0" }}>
          Saved <span className="mono">{saved}</span>
        </div>
      ) : null}
      <main className="page" style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        <section style={{ flex: "999 1 640px", minWidth: 0 }}>
          <div className="stats">
            <StatCard label="Fully diluted" value={shares(fd)} />
            <StatCard label="Founders" value={`${totals.selectedPercent}%`} />
            <StatCard label="Pool available" value={shares(totals.poolAvailable)} />
            <StatCard
              label="SAFEs outstanding"
              value={
                safeCurrencies.length > 1 ? "Mixed currencies" : money(totals.safeAmount, safeCurrencies[0])
              }
            />
          </div>
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            {rows.length === 0 ? (
              <p className="muted" style={{ padding: 20 }}>
                Nothing issued as of {day(asOf)}. Use + New to add shares, a pool, grants or SAFEs.
                {app.latest && app.latest.securities.size === 0 && app.latest.stakeholders.size === 0 ? (
                  <>
                    {" "}
                    Or bring your existing cap table:{" "}
                    <button type="button" className="btn link" onClick={() => app.go({ name: "import" })}>
                      Import a cap table
                    </button>
                  </>
                ) : null}
              </p>
            ) : (
              <table className="tbl" style={{ minWidth: 760 }}>
                <thead>
                  <tr>
                    <th className="th">Name</th>
                    <th className="th">Type</th>
                    <th className="th right">Shares</th>
                    <th className="th right">%</th>
                    <th className="th">Vesting</th>
                    <th className="th">Document</th>
                  </tr>
                </thead>
                <tbody>
                  {fdRows.map((r) => (
                    <CapRow
                      key={r.securityId}
                      r={r}
                      gaps={gaps}
                      open={open === r.securityId}
                      toggle={() => setOpen(open === r.securityId ? null : r.securityId)}
                    />
                  ))}
                  {safes.length ? (
                    <>
                      <tr>
                        <td className="td meta" colSpan={6} style={{ background: "var(--soft)" }}>
                          SAFEs · as-converted, not in fully diluted
                        </td>
                      </tr>
                      {safes.map((r) => {
                        const chip = docChip(state, r, gaps);
                        return (
                          <tr key={r.securityId} className={chip?.tone === "red" ? "attn" : ""}>
                            <td className="td">
                              <button
                                type="button"
                                className="btn link"
                                onClick={() => {
                                  const x = state.securities.get(r.securityId);
                                  if (x) app.go({ name: "person", id: x.stakeholderId });
                                }}
                              >
                                {r.stakeholder}
                              </button>
                            </td>
                            <td className="td muted">{typeLabel(state, r)}</td>
                            <td className="td num right">{money(r.safeAmount, r.currency)}</td>
                            <td className="td num right" title={r.math.as_converted}>
                              {r.asConverted ? `≈${r.asConverted}%` : "—"}
                            </td>
                            <td className="td meta">
                              {r.safeCap ? `Cap ${moneyShort(r.safeCap, r.currency)}` : "No cap"}
                              {r.safeDiscount ? ` · ${percent(r.safeDiscount)}` : ""}
                            </td>
                            <td className="td">{chip ? <Chip tone={chip.tone}>{chip.text}</Chip> : null}</td>
                          </tr>
                        );
                      })}
                    </>
                  ) : null}
                </tbody>
              </table>
            )}
          </div>
        </section>
        <aside style={{ flex: "1 1 300px", maxWidth: 360 }} className="stack">
          <div className="card">
            <div className="row spread">
              <h2 style={{ margin: 0 }}>What's missing</h2>
              {gaps.length ? <Chip tone="amber">{gaps.length} gaps</Chip> : <Chip tone="green">Nothing</Chip>}
            </div>
            <div className="stack" style={{ marginTop: 12 }}>
              {gaps.map((g) => (
                <GapLine
                  key={`${g.kind}:${g.target}`}
                  g={g}
                  onAttach={(target, docType) => setAttach({ target, docType })}
                />
              ))}
            </div>
          </div>
          <div className="card">
            <h2>Waiting for signature</h2>
            <ComingSoon milestone="M5">
              Send documents for signature and see who still has to sign.
            </ComingSoon>
          </div>
          <div className={`banner ${problems.length ? "red" : "green"} small`}>
            {problems.length
              ? problems.join(" · ")
              : `Vault verified · ${vault.events.length} events · totals add to ${fd > 0n ? "100.00%" : "0%"}`}
          </div>
        </aside>
      </main>
      <AttachModal
        open={!!attach}
        target={attach?.target}
        docType={attach?.docType}
        onClose={() => setAttach(null)}
      />
    </>
  );
}

function CapRow({ r, gaps, open, toggle }: { r: Row; gaps: Gap[]; open: boolean; toggle(): void }) {
  const app = useApp();
  const state = app.state!;
  const x = state.securities.get(r.securityId);
  const chip = docChip(state, r, gaps);
  const v = vestingCell(state, r);
  const next = x ? nextVest(x, state, state.asOf) : null;
  return (
    <>
      <tr
        className={`click ${open ? "sel" : ""} ${chip?.tone !== "green" && r.group !== 2 ? "attn" : ""}`}
        onClick={toggle}
      >
        <td className="td">
          {x ? (
            <button
              type="button"
              className="btn link"
              onClick={(e) => {
                e.stopPropagation();
                app.go({ name: "person", id: x.stakeholderId });
              }}
            >
              {r.stakeholder}
            </button>
          ) : (
            <span className="muted">{r.stakeholder}</span>
          )}
        </td>
        <td className="td muted">{typeLabel(state, r)}</td>
        <td className="td num right">{shares(r.shares)}</td>
        <td className="td num right">{r.fdPercent}%</td>
        <td className="td">
          {v ? <VestingBar fraction={v.fraction} label={v.label} /> : <span className="meta">—</span>}
        </td>
        <td className="td">{chip ? <Chip tone={chip.tone}>{chip.text}</Chip> : null}</td>
      </tr>
      {open ? (
        <tr className="sel">
          <td className="td small" colSpan={6}>
            <div className="row wrap" style={{ gap: 20 }}>
              {r.group === 2 ? (
                <span>{r.math.shares}</span>
              ) : (
                <>
                  {r.vested !== null ? (
                    <span>
                      {shares(r.vested)} of {shares(r.shares)} vested
                    </span>
                  ) : (
                    <span>Vesting unknown</span>
                  )}
                  {next ? (
                    <span>
                      Next: {shares(next.quantity)} on {day(next.date)}
                    </span>
                  ) : null}
                  {x ? <span>{scheduleText(state, x)}</span> : null}
                  {x?.price && r.group === 1 ? <span>Strike {money(x.price, x.priceCurrency)}</span> : null}
                </>
              )}
              <ShowMath math={r.math} />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

const GAP_DOC: Record<string, string> = {
  no_signed_doc: "",
  missing_83b: "83b",
  no_ip_assignment: "ciiaa",
  no_board_consent: "board_consent",
  no_plan_documents: "plan",
};

function GapLine({ g, onAttach }: { g: Gap; onAttach(target: string, docType?: string): void }) {
  const app = useApp();
  const canAttach = g.kind in GAP_DOC;
  return (
    <div className="row" style={{ alignItems: "flex-start" }}>
      <span className={`dot ${g.severity}`} />
      <span className="small grow">
        {g.text}{" "}
        {canAttach ? (
          <button
            type="button"
            className="btn link small"
            onClick={() => onAttach(g.target, GAP_DOC[g.kind] || undefined)}
          >
            Attach
          </button>
        ) : null}{" "}
        {g.kind === "no_ip_assignment" ? (
          <button
            type="button"
            className="btn link small"
            onClick={() => app.go({ name: "comingSoon", title: "Send for signature", milestone: "M5" })}
          >
            Send for signature
          </button>
        ) : null}
      </span>
    </div>
  );
}

/** F-31 banners: broken record, edited CSV, missing files. */
export function VaultBanners() {
  const { vault } = useApp();
  if (!vault) return null;
  return (
    <div style={{ margin: "0 24px" }}>
      {vault.broken ? (
        <div className="banner red" style={{ marginTop: 12 }} role="alert">
          The record is broken at line {vault.broken.line}: {vault.broken.reason}. Restore the folder from
          your backup. The app is read-only until then.
        </div>
      ) : null}
      {vault.csvEdited ? (
        <div className="banner amber" style={{ marginTop: 12 }}>
          captable.csv was edited outside the app. Your edits weren't applied (kept as{" "}
          <span className="mono">captable.edited.csv</span>). Make changes in the app.
        </div>
      ) : null}
      {vault.missingDocs.length ? (
        <div className="banner amber" style={{ marginTop: 12 }}>
          {vault.missingDocs.length} linked document{vault.missingDocs.length > 1 ? "s are" : " is"} missing
          from the folder.
        </div>
      ) : null}
    </div>
  );
}
