import { useState } from "react";
import { relayClient } from "../signing";
import { useApp } from "../state";
import { ErrorList, Field } from "./ui";

/** F-04: email → 6-digit code from the relay → verified (the device token is kept in app settings). */
export function EmailVerify(p: { onVerified(): void; action?: string }) {
  const app = useApp();
  const [email, setEmail] = useState(app.settings.email);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[] | null>(null);
  const client = relayClient(app.platform, app.settings);
  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    setErrors(null);
    try {
      await f();
    } catch (e) {
      setErrors([(e as Error).message]);
    } finally {
      setBusy(false);
    }
  };
  const send = () =>
    run(async () => {
      await client.start(email.trim());
      setSentTo(email.trim());
    });
  return (
    <div className="stack">
      <Field label="Email">
        <input
          className="inp"
          type="email"
          value={email}
          placeholder="you@company.com"
          onChange={(e) => {
            setEmail(e.target.value);
            setSentTo(null);
          }}
        />
      </Field>
      {sentTo ? (
        <>
          <p className="small" style={{ margin: 0 }}>
            We sent a 6-digit code to {sentTo}
          </p>
          <Field label="Code">
            <input
              className="inp num"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </Field>
          <button type="button" className="btn link small" disabled={busy} onClick={send}>
            Resend code
          </button>
        </>
      ) : null}
      <ErrorList errors={errors} />
      <div className="row" style={{ justifyContent: "flex-end" }}>
        {sentTo ? (
          <button
            type="button"
            className="btn primary"
            disabled={busy || code.length !== 6}
            onClick={() =>
              run(async () => {
                const r = await client.verify(sentTo, code);
                await app.setSettings({
                  ...app.settings,
                  email: r.email,
                  relayToken: r.token,
                  relayTokens: { ...app.settings.relayTokens, [app.settings.relayUrl]: r.token },
                });
                p.onVerified();
              })
            }
          >
            {p.action ?? "Verify & continue"}
          </button>
        ) : (
          <button
            type="button"
            className="btn primary"
            disabled={busy || !email.includes("@")}
            onClick={send}
          >
            Send code
          </button>
        )}
      </div>
    </div>
  );
}
