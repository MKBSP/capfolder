// Small shared pieces ported from the mockups (design/app/*.html).
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { TIPS } from "../copy";

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

export const Field = (p: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
  tip?: keyof typeof TIPS;
}) => {
  const field = (
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
  // the tip sits beside the label, not in it, so the field's name stays just its label
  return p.tip ? (
    <div className="tip-field">
      {field}
      <Tip about={p.tip} />
    </div>
  ) : (
    field
  );
};

/** "?" next to a jargon word: the button reads the sentence as its description; a click shows it. */
export function Tip({ about }: { about: keyof typeof TIPS }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const [term, text] = TIPS[about];
  return (
    <>
      <button
        type="button"
        className="tip"
        aria-label={`What is ${term}?`}
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        ?
      </button>
      <span id={id} className="meta tip-text" hidden={!open}>
        {text}
      </span>
    </>
  );
}

/** Native <dialog>: Esc closes, focus is trapped by the browser. */
export function Modal(p: { open: boolean; onClose(): void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    // showModal centres it over a backdrop; an `open` attribute would show it inline in the page instead
    if (p.open && !d.open) d.showModal ? d.showModal() : d.setAttribute("open", "");
    if (!p.open && d.open) d.close?.();
  }, [p.open]);
  if (!p.open) return null;
  return (
    <dialog ref={ref} className="modal" onClose={p.onClose} aria-label={p.title}>
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

/** A button that opens a list of actions. Escape or a click elsewhere closes it. */
export function Menu(p: {
  label: ReactNode;
  items: { label: string; onClick(): void; id?: string; current?: boolean }[];
  primary?: boolean;
  /** Replaces the button look (e.g. the header's company switcher). */
  className?: string;
  align?: "left";
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <span ref={box} style={{ position: "relative" }}>
      <button
        type="button"
        ref={trigger}
        className={p.className ?? `btn ${p.primary ? "primary" : ""}`}
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {p.label}
      </button>
      {open ? (
        <div className={`menu ${p.align ?? ""}`} role="menu">
          {p.items.map((i) => (
            <button
              type="button"
              role="menuitem"
              key={i.id ?? i.label}
              aria-current={i.current || undefined}
              onClick={() => {
                setOpen(false);
                i.onClick();
              }}
            >
              {i.label}
              {i.current ? <span className="muted"> ✓</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );
}
