import { MainHeader } from "../components/Header";
import { ComingSoon } from "../components/ui";

/** Signing.html: the relay arrives in M5. */
export function Signatures() {
  return (
    <>
      <MainHeader />
      <main className="medium stack">
        <div className="banner purple">
          In the cloud right now: <b>0</b> documents waiting for signatures. Everything else is only on this
          computer.
        </div>
        <ComingSoon milestone="M5">
          Send a document for signature: signers get a link and sign in any browser, no account. You
          countersign here. The signed PDF is pulled back, compared against your local original, filed in{" "}
          <span className="mono">docs/</span>, and then the relay deletes its copy. Encrypted in transit and
          on disk, deleted after signing.
        </ComingSoon>
      </main>
    </>
  );
}
