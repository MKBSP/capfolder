import { type Security, vestingSchedule } from "@capfolder/core";
import { useState } from "react";
import { day, month, shares } from "../fmt";
import { useApp } from "../state";

const W = 1040;
const H = 240;
const L = 64;
const R = 16;
const T = 14;
const B = 30;

/** Vesting over time: flat until the cliff, the jump, then monthly steps; solid up to today, dashed after. */
export function VestingGraph({ x, name }: { x: Security; name: string }) {
  const s = useApp().state!;
  const [steps, setSteps] = useState(true);
  const [hover, setHover] = useState<number | null>(null);
  const sched = vestingSchedule(x, s);
  if (!sched?.length) return null;
  const start = x.vestingStart?.date ?? x.date;
  let pts = sched[0]!.date > start ? [{ date: start, cumulative: 0n }, ...sched] : sched;
  const stop = x.stoppedAt;
  if (stop) {
    pts = pts.filter((p) => p.date <= stop);
    if (pts.at(-1)?.date !== stop) pts.push({ date: stop, cumulative: pts.at(-1)?.cumulative ?? 0n });
  }
  const total = x.originalQuantity > 0n ? x.originalQuantity : 1n;
  const n = pts.length;
  const px = (i: number) => L + (n > 1 ? i / (n - 1) : 0) * (W - L - R);
  const py = (v: bigint) => T + (1 - Number((v * 10000n) / total) / 10000) * (H - T - B);
  const path = (from: number, to: number) => {
    let d = `M${px(from)},${py(pts[from]!.cumulative)}`;
    for (let i = from + 1; i <= to; i++)
      d += steps ? `H${px(i)}V${py(pts[i]!.cumulative)}` : `L${px(i)},${py(pts[i]!.cumulative)}`;
    return d;
  };
  const today = pts.findLastIndex((p) => p.date <= s.asOf);
  const cliff = pts.findIndex((p) => p.cumulative > 0n);
  const vestedNow = today >= 0 ? pts[today]!.cumulative : 0n;
  const base = py(0n);
  const h = hover === null ? null : pts[hover]!;
  const pct = (v: bigint) => `${Number((v * 1000n) / total) / 10}%`;
  const move = (i: number) => setHover(Math.max(0, Math.min(n - 1, i)));

  return (
    <div className="vgraph">
      <div className="row spread" style={{ marginBottom: 6 }}>
        <span className="meta">
          <span className="key solid" /> Vested <span className="key dash" /> Still to vest
        </span>
        <select
          className="inp small"
          aria-label="Graph style"
          value={steps ? "steps" : "line"}
          onChange={(e) => setSteps(e.target.value === "steps")}
          style={{ width: "auto", minHeight: 30 }}
        >
          <option value="steps">Monthly steps</option>
          <option value="line">Straight line</option>
        </select>
      </div>
      <div style={{ position: "relative" }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: focus lets keyboard users step through the months
          tabIndex={0}
          aria-label={`Vesting schedule for ${name}: ${shares(vestedNow)} of ${shares(x.originalQuantity)} vested by ${day(s.asOf)}${stop ? `, vesting stopped ${day(stop)}` : ""}. Use the arrow keys to read each month.`}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const fx = ((e.clientX - r.left) / r.width) * W;
            move(Math.round(((fx - L) / (W - L - R)) * (n - 1)));
          }}
          onPointerLeave={() => setHover(null)}
          onFocus={() => setHover(Math.max(0, today))}
          onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") move((hover ?? today) + 1);
            if (e.key === "ArrowLeft") move((hover ?? today) - 1);
          }}
        >
          {[0n, total / 2n, total].map((v) => (
            <g key={String(v)}>
              <line x1={L} x2={W - R} y1={py(v)} y2={py(v)} className="grid" />
              <text x={L - 8} y={py(v) + 4} textAnchor="end" className="lbl">
                {shares(v)}
              </text>
            </g>
          ))}
          {today > 0 ? <path d={`${path(0, today)}V${base}H${px(0)}Z`} className="area" /> : null}
          {today > 0 ? <path d={path(0, today)} className="done" /> : null}
          {today < n - 1 ? <path d={path(Math.max(0, today), n - 1)} className="todo" /> : null}
          {cliff > 1 ? (
            <text x={px(cliff)} y={H - 4} textAnchor="middle" className="lbl">
              Cliff
            </text>
          ) : null}
          <text x={px(0)} y={H - 4} className="lbl">
            {month(pts[0]!.date)}
          </text>
          <text x={px(n - 1)} y={H - 4} textAnchor="end" className="lbl">
            {stop ? "Vesting stopped" : month(pts[n - 1]!.date)}
          </text>
          {today >= 0 && today < n - 1 ? (
            <g>
              <line x1={px(today)} x2={px(today)} y1={T} y2={base} className="today" />
              <text x={px(today)} y={T - 2} textAnchor="middle" className="lbl today-lbl">
                Today
              </text>
            </g>
          ) : null}
          {h && hover !== null ? (
            <g>
              <line x1={px(hover)} x2={px(hover)} y1={T} y2={base} className="cross" />
              <circle cx={px(hover)} cy={py(h.cumulative)} r={4} className="dot-pt" />
            </g>
          ) : null}
        </svg>
        {h && hover !== null ? (
          <div
            className="vtip"
            role="status"
            style={{
              left: `${(px(hover) / W) * 100}%`,
              transform: px(hover) > W * 0.65 ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
            }}
          >
            <b>
              {day(h.date)}
              {hover < cliff ? " · before cliff" : hover === cliff && cliff > 1 ? " · cliff" : ""}
            </b>
            {stop && h.date === stop ? (
              <div>Vesting stopped · {shares(x.originalQuantity - h.cumulative)} given up</div>
            ) : null}
            <div>
              {shares(h.cumulative)} vested · {pct(h.cumulative)} of grant
            </div>
            <div className="meta">{shares(x.originalQuantity - h.cumulative)} unvested</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
