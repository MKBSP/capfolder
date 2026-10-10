import { type CSSProperties, useEffect, useRef, useState } from "react";
import { day, parseDay } from "../fmt";

// WebKit's native date field follows the OS locale (06/10/2026); this one always reads "6 Oct 2026".
const canPick = typeof HTMLInputElement !== "undefined" && "showPicker" in HTMLInputElement.prototype;

/** A date field showing "6 Oct 2026". Typed dates are understood day-first; the button opens the system calendar. */
export function DateInput(p: {
  value: string; // ISO "YYYY-MM-DD" or ""
  onChange(iso: string): void;
  id?: string;
  max?: string;
  disabled?: boolean;
  style?: CSSProperties;
  "aria-label"?: string;
}) {
  const [text, setText] = useState(p.value ? day(p.value) : "");
  const [editing, setEditing] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const valid = (t: string) => {
    const iso = parseDay(t);
    return iso && (!p.max || iso <= p.max) ? iso : null;
  };
  // Show the value tidily when it changes from outside or on blur, but never wipe what the founder typed
  // while it's invalid: the parent holds "" then, so its save is blocked instead of using an old date.
  useEffect(() => {
    if (editing) return;
    if (p.value) setText(day(p.value));
    else if (valid(text)) setText(""); // cleared from outside
  }, [p.value, editing]);
  const bad = !!text.trim() && !valid(text);
  return (
    <span className="date-inp" style={p.style}>
      <input
        className={`inp${bad ? " bad" : ""}`}
        id={p.id}
        aria-label={p["aria-label"]}
        aria-invalid={bad || undefined}
        placeholder="6 Oct 2026"
        disabled={p.disabled}
        value={text}
        onFocus={() => setEditing(true)}
        onBlur={() => setEditing(false)}
        onChange={(e) => {
          setText(e.target.value);
          p.onChange(valid(e.target.value) ?? "");
        }}
      />
      {canPick ? (
        <>
          <button
            type="button"
            className="date-btn"
            aria-label="Pick a date"
            disabled={p.disabled}
            onClick={() => picker.current?.showPicker()}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <rect x="2" y="3" width="12" height="11" rx="2" fill="none" stroke="currentColor" />
              <path d="M2 6.5h12M5 1.5v3M11 1.5v3" stroke="currentColor" />
            </svg>
          </button>
          <input
            ref={picker}
            type="date"
            tabIndex={-1}
            aria-hidden="true"
            className="date-native"
            value={p.value}
            max={p.max}
            onChange={(e) => e.target.value && p.onChange(e.target.value)}
          />
        </>
      ) : null}
    </span>
  );
}
