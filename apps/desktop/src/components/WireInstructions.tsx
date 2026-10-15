import { useState } from "react";
import { todayIso } from "../fmt";
import { type App, useApp } from "../state";
import { attachDocument } from "../vault";
import { ErrorList } from "./ui";

/** The company's current wire instructions: the newest wire_instructions document still in the folder. */
export function wireDoc(app: Pick<App, "latest">) {
  return [...(app.latest?.docs.entries() ?? [])]
    .filter(([, d]) => !d.removed && d.data.doc_type === "wire_instructions")
    .at(-1);
}

/** Pick a PDF and keep it in docs/company/ as the wire instructions. Returns an error, or null. */
export async function uploadWire(app: App): Promise<string | null> {
  const f = await app.platform.pickFile("Choose your wire instructions (PDF)", ["pdf"]);
  if (!f || !app.vault) return null;
  try {
    const r = await attachDocument(app.platform.fs, app.vault, app.ctx, {
      originalName: f.name,
      bytes: await app.platform.fs.readBytes(f.path),
      docType: "wire_instructions",
      date: todayIso(),
      person: "company",
    });
    if (r.ok === "duplicate") return "That file is already in your folder as another document.";
    if (!r.ok) return r.errors.join(" ");
    app.setVault(r.vault);
    return null;
  } catch (e) {
    return `Couldn't add ${f.name}: ${(e as Error).message ?? e}`;
  }
}

/** Settings → Company: what investors get after signing, and a button to add or replace it. */
export function WireInstructionsField() {
  const app = useApp();
  const [error, setError] = useState<string | null>(null);
  const doc = wireDoc(app);
  return (
    <div className="stack">
      <span className="lbl">Wire instructions</span>
      <div className="row">
        <span className="small muted clip grow">
          {doc
            ? String(doc[1].data.original_name ?? doc[1].data.path)
            : "No wire instructions yet. Investors get them by email once a SAFE is signed."}
        </span>
        <button type="button" className="btn" onClick={async () => setError(await uploadWire(app))}>
          {doc ? "Replace…" : "Upload wire instructions…"}
        </button>
      </div>
      <ErrorList errors={error ? [error] : null} />
    </div>
  );
}
