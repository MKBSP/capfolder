// Puts tesseract.js (worker, core, English data) in public/ocr/ so OCR runs from the app itself, never a CDN.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { build } from "vite";

const require = createRequire(import.meta.url);
const out = new URL("../public/ocr/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const tess = dirname(require.resolve("tesseract.js/package.json"));
const core = dirname(require.resolve("tesseract.js-core/package.json"));
const eng = dirname(require.resolve("@tesseract.js-data/eng/package.json"));

for (const f of [
  "tesseract-core-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-relaxedsimd-lstm.wasm.js",
])
  copyFileSync(join(core, f), join(out, f));
copyFileSync(join(eng, "4.0.0_best_int/eng.traineddata.gz"), join(out, "eng.traineddata.gz"));
if (!existsSync(join(out, "worker.min.js")))
  await build({
    configFile: false,
    publicDir: false,
    logLevel: "warn",
    build: {
      outDir: out,
      emptyOutDir: false,
      lib: {
        entry: join(tess, "src/worker-script/browser/index.js"),
        formats: ["iife"],
        name: "TesseractWorker",
        fileName: () => "worker.min.js",
      },
    },
    define: { global: "self" },
  });
console.log("ocr assets ready in public/ocr/");
