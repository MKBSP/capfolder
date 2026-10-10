// docs/05 "Verify the signed PDF before filing": the sealed PDF isn't byte-identical to what was sent, so the text
// of every original page must match (pdf.js), and the signed copy must still have those pages first.
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

// pdf.js uses `globalThis.pdfjsWorker` when present: parsing runs in this thread (fine for contracts, and it
// works the same in the Tauri webview and in tests, with no worker file to serve).
let ready: Promise<void> | undefined;
const loadWorker = () =>
  (ready ??= import("pdfjs-dist/legacy/build/pdf.worker.mjs").then((w) => {
    (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = w;
  }));

/** The text of each page, whitespace-normalized. */
export async function pageTexts(bytes: Uint8Array): Promise<string[]> {
  await loadWorker();
  // verbosity 0: text extraction doesn't need the standard font files pdf.js would otherwise warn about
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    useSystemFonts: false,
    verbosity: 0,
  });
  const doc = await task.promise;
  try {
    const out: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const c = await (await doc.getPage(i)).getTextContent();
      out.push(
        c.items
          .map((x) => ("str" in x ? x.str : ""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
      );
    }
    return out;
  } finally {
    await task.destroy();
  }
}

export async function verifySigned(
  sent: Uint8Array,
  signed: Uint8Array,
  originalPages: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  let a: string[];
  let b: string[];
  try {
    [a, b] = [await pageTexts(sent), await pageTexts(signed)];
  } catch (e) {
    return { ok: false, reason: `The signed copy isn't a readable PDF (${(e as Error).message}).` };
  }
  if (b.length < a.length)
    return { ok: false, reason: "The signed copy has fewer pages than what you sent." };
  for (let i = 0; i < originalPages; i++)
    if (a[i] !== b[i])
      return { ok: false, reason: `Page ${i + 1} of the signed copy doesn't match what you sent.` };
  return { ok: true };
}
