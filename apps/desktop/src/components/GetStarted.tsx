import { getStarted } from "../onboarding";
import { aiFor } from "../settings";
import { useApp } from "../state";
import { Chip } from "./ui";

/** docs/19: the Get started list at the top of Home. Hidden when everything is done or the founder hides it. */
export function GetStarted() {
  const app = useApp();
  const { latest, vault, settings } = app;
  if (!latest || !vault) return null;
  const mine = settings.onboarding[vault.root] ?? {};
  if (mine.dismissed) return null;
  const steps = getStarted(latest, mine, !!aiFor(settings, "chat"));
  const done = steps.filter((x) => x.done).length;
  if (done === steps.length) return null;
  const empty = latest.securities.size === 0 && latest.stakeholders.size === 0;
  return (
    <details className="card" open aria-label="Get started" style={{ margin: "12px 24px 0" }}>
      <summary className="row spread" style={{ cursor: "pointer" }}>
        <b>Get started</b>
        <span className="meta">
          {done} of {steps.length} done
        </span>
      </summary>
      <ol className="stack" style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
        {steps.map((x) => (
          <li key={x.label} className="row" style={{ alignItems: "flex-start" }}>
            <span className="grow small">
              <b>{x.label}</b>
              <span className="muted" style={{ display: "block" }}>
                {x.help}
              </span>
            </span>
            {x.done ? (
              <Chip tone="green">Done</Chip>
            ) : (
              <span className="row">
                {empty && x.capTable && x.to.name !== "import" ? (
                  <button type="button" className="btn primary" onClick={() => app.go({ name: "import" })}>
                    Import
                  </button>
                ) : null}
                <button
                  type="button"
                  className={empty && x.capTable && x.to.name === "import" ? "btn primary" : "btn"}
                  onClick={() => app.go(x.to)}
                >
                  {x.action}
                </button>
              </span>
            )}
          </li>
        ))}
      </ol>
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
        <button
          type="button"
          className="btn link small"
          onClick={() => app.go({ name: "questions", next: { name: "home" } })}
        >
          Change my answers
        </button>
        <button
          type="button"
          className="btn link small"
          onClick={() =>
            app.setSettings((s) => ({
              ...s,
              onboarding: { ...s.onboarding, [vault.root]: { ...s.onboarding[vault.root], dismissed: true } },
            }))
          }
        >
          Hide this list
        </button>
      </div>
    </details>
  );
}
