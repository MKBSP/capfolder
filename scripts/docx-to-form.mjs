// Turns a YC form (.docx) into templates/yc/<name>.json: paragraphs of styled runs, text unchanged, for
// packages/core renderForm. Run: node scripts/docx-to-form.mjs <file.docx> <name> <source url>
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const [file, name, source] = process.argv.slice(2);
const part = (p) => {
  try {
    return execFileSync("unzip", ["-p", file, p], {
      encoding: "utf8",
      maxBuffer: 1 << 26,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
};
const unxml = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
const on = (rPr, tag) => {
  const m = rPr.match(new RegExp(`<w:${tag}(?: w:val="([^"]*)")?/>`));
  return !!m && m[1] !== "0" && m[1] !== "false" && m[1] !== "none";
};
const twip = (pPr, attr) => Number(pPr.match(new RegExp(`<w:ind [^>]*w:${attr}="(-?\\d+)"`))?.[1] ?? 0) / 20;

function paragraphs(xml) {
  return [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map(([p]) => {
    const pPr = p.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/)?.[1] ?? "";
    const runs = [];
    for (const [r] of p.matchAll(/<w:r[ >][\s\S]*?<\/w:r>/g)) {
      const rPr = r.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)?.[1] ?? "";
      const style = { b: on(rPr, "b"), i: on(rPr, "i"), u: on(rPr, "u"), caps: on(rPr, "caps") };
      let t = "";
      for (const [, tab, txt] of r.matchAll(/(<w:tab\/>)|<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g))
        t += tab ? "\t" : unxml(txt);
      if (!t) continue;
      const last = runs.at(-1);
      if (last && ["b", "i", "u", "caps"].every((k) => !!last[k] === style[k])) last.t += t;
      else runs.push({ t, ...Object.fromEntries(Object.entries(style).filter(([, v]) => v)) });
    }
    const jc = pPr.match(/<w:jc w:val="(\w+)"/)?.[1];
    return {
      ...(jc === "center" ? { align: "center" } : {}),
      ...(pPr.includes("<w:numPr>") ? { bullet: true } : {}),
      indent: Math.max(0, twip(pPr, "left")),
      first: twip(pPr, "firstLine") - twip(pPr, "hanging"),
      runs,
    };
  });
}
const text = (xml) =>
  paragraphs(xml)
    .map((p) =>
      p.runs
        .map((r) => r.t)
        .join("")
        .replace(/\t+/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .join(" ");
const out = {
  source,
  license:
    "© Y Combinator Management, LLC. CC BY-ND 4.0 (https://creativecommons.org/licenses/by-nd/4.0/legalcode). Unmodified except for filled-in blanks.",
  header: text(part("word/header2.xml")) || text(part("word/header1.xml")),
  footer: text(part("word/footer2.xml")) || text(part("word/footer1.xml")),
  paragraphs: paragraphs(part("word/document.xml")),
};
writeFileSync(new URL(`../templates/yc/${name}.json`, import.meta.url), `${JSON.stringify(out, null, 1)}\n`);
const all = out.paragraphs.flatMap((p) => p.runs.map((r) => r.t)).join("\n");
console.log(
  name,
  out.paragraphs.length,
  "paragraphs; blanks:",
  [...new Set(all.match(/\$?\[[^\]]*\]/g))].join(" "),
);
