import { EmailVerify } from "../components/EmailVerify";
import { Stepper } from "../components/ui";
import { useApp } from "../state";

/** EmailStep.html (F-04). */
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
        <EmailVerify onVerified={() => go({ name: "create" })} />
        <div className="row">
          <button type="button" className="btn link" onClick={() => go({ name: "create" })}>
            Skip for now
          </button>
        </div>
        <p className="meta">Skip, and we'll ask the first time you send a document.</p>
      </div>
    </main>
  );
}
