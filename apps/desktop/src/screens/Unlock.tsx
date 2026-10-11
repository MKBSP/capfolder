import { useEffect, useRef, useState } from "react";
import { Logo } from "../components/ui";

/** F-03 / F-34: app password. The files themselves are never locked. */
export function Unlock({ verify, onUnlock }: { verify(p: string): Promise<boolean>; onUnlock(): void }) {
  const [pw, setPw] = useState("");
  const [wrong, setWrong] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  return (
    <main className="narrow" style={{ paddingTop: 120 }}>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          // a keychain that refuses (access denied, no Secret Service on Linux) isn't a wrong password: say so
          const ok = await verify(pw).catch(
            (err) => `The password store didn't answer: ${String(err?.message ?? err)}`,
          );
          setBusy(false);
          if (ok === true) onUnlock();
          else setWrong(typeof ok === "string" ? ok : "That's not it. Try again.");
        }}
      >
        <Logo size={40} />
        <h1>Capfolder is locked</h1>
        <label>
          <span className="lbl">App password</span>
          <input
            className="inp"
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            ref={input}
          />
        </label>
        {wrong ? <div className="errors">{wrong}</div> : null}
        <button className="btn primary" type="submit" disabled={busy || !pw}>
          Unlock
        </button>
        <p className="meta">
          Forgot it? Remove the "Capfolder" app-lock item from your password store (macOS: Keychain Access ·
          Windows: Credential Manager · Linux: Passwords and Keys). Your files are never locked, so nothing is
          lost.
        </p>
      </form>
    </main>
  );
}
