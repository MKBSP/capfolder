// Small shared pieces ported from the mockups (design/app/*.html).
import { type ReactNode, useEffect, useRef, useState } from "react";

/** brand/mark.svg: the filled folder with three ascending bars. */
export const Logo = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-label="Capfolder" role="img">
    <path
      d="M2 6.5A2.5 2.5 0 0 1 4.5 4h4.1a2 2 0 0 1 1.5.7L12 7h7.5A2.5 2.5 0 0 1 22 9.5v9a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 18.5z"
      fill="#1F6F4A"
    />
    <rect x="13.2" y="4.6" width="1.8" height="1.6" rx="0.5" fill="#1F6F4A" />
    <rect x="15.8" y="3.0" width="1.8" height="3.2" rx="0.5" fill="#1F6F4A" />
    <rect x="18.4" y="1.4" width="1.8" height="4.8" rx="0.5" fill="#1F6F4A" />
  </svg>
);

export const Chip = ({
  tone,
  children,
}: {
  tone?: "green" | "amber" | "red" | "purple";
  children: ReactNode;
}) => <span className={`chip ${tone ?? ""}`}>{children}</span>;

export const VestingBar = ({ fraction, label }: { fraction: number; label: string }) => (
  <span className="row" style={{ gap: 8 }}>
    <span className="bar" aria-hidden="true">
      <span style={{ width: `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%` }} />
    </span>
    <span className="num meta">{label}</span>
  </span>
);

export const StatCard = ({ label, value }: { label: string; value: string }) => (
  <div className="card tight stat">
    <div className="meta">{label}</div>
    <div className="val">{value}</div>
  </div>
);

export const Stepper = ({ current, done = [] }: { current: number; done?: number[] }) => {
  const steps = ["Lock", "Email", "Company", "Start", "Documents"];
  return (
    <ol className="stepper" aria-label="Setup steps">
      {steps.map((s, i) => {
        const n = i + 1;
        const isDone = n < current || done.includes(n);
        return (
          <li key={s} className={n === current ? "current" : isDone ? "done" : ""}>
            {n} · {s}
            {isDone ? " ✓" : ""}
          </li>
        );
      })}
    </ol>
  );
};

export const ComingSoon = ({ milestone, children }: { milestone: string; children?: ReactNode }) => (
  <div className="soon">
    <strong>Coming soon · arrives in {milestone}</strong>
    {children ? (
      <div className="small" style={{ marginTop: 6 }}>
        {children}
      </div>
    ) : null}
  </div>
);

export const ErrorList = ({ errors }: { errors: string[] | null }) =>
  errors?.length ? (
    <div className="errors" role="alert">
      {errors.length === 1 ? (
        errors[0]
      ) : (
        <ul>
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  ) : null;

export const Field = (p: { label: string; children: ReactNode; hint?: ReactNode }) => (
  // biome-ignore lint/a11y/noLabelWithoutControl: the control is passed as a child
  <label className="field" style={{ display: "block" }}>
    <span className="lbl">{p.label}</span>
    {p.children}
    {p.hint ? (
      <span className="meta" style={{ display: "block", marginTop: 4 }}>
        {p.hint}
      </span>
    ) : null}
  </label>
);

/** Native <dialog>: Esc closes, focus is trapped by the browser. */
export function Modal(p: { open: boolean; onClose(): void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (p.open && !d.open) d.showModal?.();
    if (!p.open && d.open) d.close?.();
  }, [p.open]);
  if (!p.open) return null;
  return (
    <dialog ref={ref} className="modal" onClose={p.onClose} open={p.open} aria-label={p.title}>
      <div className="row spread" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>{p.title}</h2>
        <button type="button" className="btn link" onClick={p.onClose} aria-label="Close">
          ✕
        </button>
      </div>
      {p.children}
    </dialog>
  );
}

/** "How is this calculated?": the core's show-the-math strings. */
export function ShowMath({ math }: { math: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const lines = Object.values(math).filter(Boolean);
  if (!lines.length) return null;
  return (
    <span>
      <button type="button" className="btn link small" onClick={() => setOpen(!open)}>
        How is this calculated?
      </button>
      {open ? (
        <span className="mono meta" style={{ display: "block", marginTop: 6 }}>
          {lines.map((l) => (
            <span key={l} style={{ display: "block" }}>
              {l}
            </span>
          ))}
        </span>
      ) : null}
    </span>
  );
}

export function Menu(p: {
  label: ReactNode;
  items: { label: string; onClick(): void }[];
  primary?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative" }}>
      <button
        type="button"
        className={`btn ${p.primary ? "primary" : ""}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {p.label}
      </button>
      {open ? (
        <div className="menu" role="menu">
          {p.items.map((i) => (
            <button
              type="button"
              role="menuitem"
              key={i.label}
              onClick={() => {
                setOpen(false);
                i.onClick();
              }}
            >
              {i.label}
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );
}
