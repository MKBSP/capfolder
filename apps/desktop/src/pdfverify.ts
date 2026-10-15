// docs/05 "Verify the signed PDF before filing": the sealed PDF isn't byte-identical to what was sent, so the text
// of every original page must match (pdf.js), and the signed copy must still have those pages first.
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

// pdf.js uses `globalThis.pdfjsWorker` when present: parsing runs in this thread (fine for contracts, and it
// works the same in the Tauri webview and in tests, with no worker file to serve).
let ready: Promise<void> | undefined;
export const loadPdfWorker = () =>
  (ready ??= import("pdfjs-dist/legacy/build/pdf.worker.mjs").then((w) => {
    (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = w;
  }));

/** pdf.js reads text with `for await (… of stream)`; WebKit (the macOS webview) has no such iterator yet. */
export function ensureStreamIterator() {
  const proto = ReadableStream.prototype as unknown as Record<symbol, unknown>;
  if (proto[Symbol.asyncIterator]) return;
  proto[Symbol.asyncIterator] = async function* (this: ReadableStream) {
    const reader = this.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  };
}

interface PageInfo {
  text: string;
  annotations: number; // pdf.js ignores annotation appearances in text, so count them separately
}

/** Each page's text (whitespace-normalized) and how many annotations sit on it. */
export async function pageInfo(bytes: Uint8Array): Promise<PageInfo[]> {
  await loadPdfWorker();
  ensureStreamIterator();
  // verbosity 0: text extraction doesn't need the standard font files pdf.js would otherwise warn about
  const task = pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false, verbosity: 0 });
  const doc = await task.promise;
  try {
    const out: PageInfo[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const c = await page.getTextContent();
      out.push({
        text: c.items
          .map((x) => ("str" in x ? x.str : ""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
        annotations: (await page.getAnnotations()).length,
      });
    }
    return out;
  } finally {
    await task.destroy();
  }
}

export const pageTexts = async (bytes: Uint8Array) => (await pageInfo(bytes)).map((p) => p.text);

/**
 * A sanity check, not tamper-proofing: every original page must have the same text and no added annotations,
 * and no page may be missing. It doesn't compare what pages look like, so content drawn as shapes or images
 * would pass (rendering each page and comparing pixels is the next step).
 */
export async function verifySigned(
  sent: Uint8Array,
  signed: Uint8Array,
  originalPages: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  let a: PageInfo[];
  let b: PageInfo[];
  try {
    [a, b] = [await pageInfo(sent), await pageInfo(signed)];
  } catch (e) {
    return { ok: false, reason: `The signed copy isn't a readable PDF (${(e as Error).message}).` };
  }
  if (b.length < a.length)
    return { ok: false, reason: "The signed copy has fewer pages than what you sent." };
  for (let i = 0; i < originalPages; i++) {
    if (a[i]!.text !== b[i]!.text)
      return { ok: false, reason: `Page ${i + 1} of the signed copy doesn't match what you sent.` };
    if (b[i]!.annotations > a[i]!.annotations)
      return { ok: false, reason: `Something was added on top of page ${i + 1} of the signed copy.` };
  }
  // Signature pages (YC's own, or the one Capfolder adds) gain signatures, but every word sent stays, in order.
  for (let i = originalPages; i < a.length; i++) {
    const got = b[i]!.text.split(" ");
    let at = 0;
    for (const w of a[i]!.text.split(" ").filter(Boolean)) {
      at = got.indexOf(w, at);
      if (at < 0)
        return { ok: false, reason: `Page ${i + 1} of the signed copy doesn't keep the text you sent.` };
      at++;
    }
  }
  return { ok: true };
}
