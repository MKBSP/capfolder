import { useState } from "react";
import type { Answers } from "../onboarding";
import { type Route, useApp } from "../state";

const QUESTIONS: [keyof Answers, string][] = [
  ["safes", "Do you have SAFEs or convertible notes?"],
  ["pool", "Do you have an option pool?"],
  ["priced", "Have you done a priced round?"],
];

/** docs/19: three yes/no questions after StartChoice. The answers hide Get started steps that don't apply. */
export function Questions({ next }: { next: Route }) {
  const app = useApp();
  const root = app.vault?.root ?? "";
  const [a, setA] = useState<Answers>(() => {
    const { dismissed: _, ...answers } = app.settings.onboarding[root] ?? {};
    return answers;
  });
  return (
    <main className="narrow">
      <div className="stack">
        <h1>Three quick questions</h1>
        <p className="muted">So we only show the steps that apply to you. You can change this later.</p>
        {QUESTIONS.map(([key, q]) => (
          <fieldset key={key} className="card tight" style={{ margin: 0 }}>
            <legend className="lbl">{q}</legend>
            <div className="row">
              {[true, false].map((yes) => (
                <label key={String(yes)} className={`opt ${a[key] === yes ? "on" : ""}`}>
                  <input
                    type="radio"
                    name={key}
                    checked={a[key] === yes}
                    onChange={() => setA({ ...a, [key]: yes })}
                  />
                  {yes ? "Yes" : "No"}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <div className="row spread">
          <button type="button" className="btn link" onClick={() => app.go(next)}>
            Skip
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={async () => {
              await app.setSettings((s) => ({
                ...s,
                onboarding: { ...s.onboarding, [root]: { ...s.onboarding[root], ...a } },
              }));
              app.go(next);
            }}
          >
            Continue
          </button>
        </div>
      </div>
    </main>
  );
}
