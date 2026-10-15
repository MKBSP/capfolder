// F-09 "Read": the text of a document. PDF.js text layer first; pages without one (scans) and photos go through
// local OCR (tesseract.js, bundled in public/ocr/ by scripts/ocr-assets.mjs). Nothing leaves the computer.
import type { PDFPageProxy } from "pdfjs-dist";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { ensureStreamIterator, loadPdfWorker } from "./pdfverify";

export interface Ocr {
  image(bytes: Uint8Array): Promise<string>;
  pdfPage?(page: PDFPageProxy): Promise<string>;
}
export interface ReadResult {
  text: string;
  ocr: boolean;
}

export const isImage = (name: string) => /\.(png|jpe?g)$/i.test(name);
export const isReadable = (name: string) => isImage(name) || /\.pdf$/i.test(name);

/** A page's text with its line breaks: pdf.js marks line ends, and a gap between pieces is a space. */
async function pageText(page: PDFPageProxy): Promise<string> {
  ensureStreamIterator();
  const items = (await page.getTextContent()).items.filter((x) => "str" in x);
  let out = "";
  items.forEach((x, i) => {
    out += x.str;
    const next = items[i + 1];
    if (x.hasEOL) out += "\n";
    else if (next && !x.str.endsWith(" ") && next.transform[4] - (x.transform[4] + x.width) > 1) out += " ";
  });
  return out;
}

export async function readText(bytes: Uint8Array, name: string, ocr: Ocr = browserOcr): Promise<ReadResult> {
  if (isImage(name)) return { text: await ocr.image(bytes), ocr: true };
  await loadPdfWorker();
  const task = pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false, verbosity: 0 });
  const doc = await task.promise;
  try {
    const pages: string[] = [];
    let usedOcr = false;
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      let text = await pageText(page);
      // ponytail: "almost no text" = a scan; a page that mixes a text header with a scanned body isn't OCR'd
      if (text.replace(/\s/g, "").length < 20 && ocr.pdfPage) {
        text = await ocr.pdfPage(page);
        usedOcr = true;
      }
      pages.push(text);
    }
    return { text: pages.join("\n"), ocr: usedOcr };
  } finally {
    await task.destroy();
  }
}

// ---------- the app's OCR (webview) ----------

type TessWorker = {
  recognize(img: unknown): Promise<{ data: { text: string } }>;
  terminate(): Promise<unknown>;
};
let worker: Promise<TessWorker> | undefined;
const tesseract = () =>
  (worker ??= import("tesseract.js").then((m) => {
    const T = (m as unknown as { default?: typeof m }).default ?? m; // CommonJS package: the browser build has it on default
    const base = new URL("/ocr/", window.location.href).href;
    return T.createWorker("eng", T.OEM.LSTM_ONLY, {
      workerPath: `${base}worker.min.js`,
      corePath: base,
      langPath: base.replace(/\/$/, ""),
      workerBlobURL: false,
      gzip: true,
      cacheMethod: "none",
    }) as Promise<TessWorker>;
  }));

/** Frees the OCR worker (about 100 MB) once a batch is sorted. */
export async function endOcr() {
  const w = worker;
  worker = undefined;
  if (w) await (await w).terminate();
}

export const browserOcr: Ocr = {
  image: async (bytes) => (await (await tesseract()).recognize(new Blob([bytes as BlobPart]))).data.text,
  pdfPage: async (page) => {
    const viewport = page.getViewport({ scale: 2 }); // ~150 dpi for a letter page: enough for tesseract
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    // "print": pdf.js then renders straight through instead of waiting on animation frames (which a hidden or
    // minimised window never gets, so sorting would stall while the founder looks elsewhere)
    await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport, intent: "print" }).promise;
    return (await (await tesseract()).recognize(canvas)).data.text;
  },
};
