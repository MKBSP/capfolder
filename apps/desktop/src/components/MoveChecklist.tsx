import { todayIso } from "../fmt";
import { MOVES, type SourceId } from "../importRules";
import { useApp } from "../state";
import { Chip } from "./ui";

/** After an import from another tool: what to do before cancelling it. Shown on Home instead of Get started. */
export function MoveChecklist() {
  const app = useApp();
  const { vault, settings } = app;
  const mine = vault ? settings.onboarding[vault.root] : undefined;
  if (!vault || !mine?.movedFrom || mine.moveDismissed) return null;
  const move = MOVES[mine.movedFrom as SourceId];
  const tool = move?.tool ?? "your old tool";
  const ticks = mine.moveTicks ?? {};
  const items: { key: string; label: string; auto?: boolean }[] = [
    { key: "import", label: "Cap table imported", auto: true },
    {
      key: "tie",
      label: mine.tie === "note" ? "Totals checked (saved with a note)" : `Totals checked against ${tool}`,
      auto: true,
    },
    {
      key: "docs",
      label: `Every signed document downloaded from ${tool}${move ? ` (${move.docs})` : ""} and added to Documents`,
    },
    { key: "board", label: "Board consents and the option plan in Documents" },
    { key: "409a", label: "Last 409A report saved" },
    { key: "people", label: `3 people checked by hand against ${tool}` },
  ];
  if (items.every((x) => x.auto || ticks[x.key])) return null;
  const days = move?.closes ? Math.ceil((Date.parse(move.closes) - Date.parse(todayIso())) / 86_400_000) : 0;
  const save = (patch: object) =>
    app.setSettings((s) => ({
      ...s,
      onboarding: { ...s.onboarding, [vault.root]: { ...s.onboarding[vault.root], ...patch } },
    }));
  const title = `Before you cancel ${tool}`;
  return (
    <section className="card" aria-label={title} style={{ margin: "12px 24px 0" }}>
      <div className="row spread">
        <b>{title}</b>
        {days > 0 ? <Chip tone="amber">{days} days left</Chip> : null}
      </div>
      <ul className="stack small" style={{ listStyle: "none", padding: 0, margin: "12px 0 0", gap: 8 }}>
        {items.map((x) => (
          <li key={x.key}>
            <label className="row" style={{ alignItems: "flex-start" }}>
              <input
                type="checkbox"
                checked={!!x.auto || !!ticks[x.key]}
                disabled={x.auto}
                onChange={(e) => save({ moveTicks: { ...ticks, [x.key]: e.target.checked } })}
              />
              <span>{x.label}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="row spread" style={{ marginTop: 8 }}>
        <span className="meta">Download everything again on your last day, if anything changed.</span>
        <button type="button" className="btn link small" onClick={() => save({ moveDismissed: true })}>
          Hide
        </button>
      </div>
    </section>
  );
}
