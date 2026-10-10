import { Stepper } from "../components/ui";
import { useApp } from "../state";

/** EmailStep.html (F-04). Verification needs the signing relay, so only Skip works until M5. */
export function Email() {
  const { go } = useApp();
  return (
    <main className="narrow">
      <Stepper current={2} />
      <div className="stack">
        <h1>
          Your email <span className="muted">(optional)</span>
        </h1>
        <p className="muted">
          Used only when you send something for signature, so investors see it comes from you. Everything else
          works without it.
        </p>
        <label>
          <span className="lbl">Email</span>
          <input className="inp" type="email" disabled placeholder="you@company.com" />
        </label>
        <div className="soon small">Email verification arrives with signing (M5).</div>
        <div className="row spread">
          <button type="button" className="btn link" onClick={() => go({ name: "create" })}>
            Skip for now
          </button>
          <button type="button" className="btn primary" disabled>
            Verify &amp; continue
          </button>
        </div>
        <p className="meta">Skip, and we'll ask the first time you send a document.</p>
      </div>
    </main>
  );
}
