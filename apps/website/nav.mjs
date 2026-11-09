// One navbar for every page. `node nav.mjs` writes _nav.html into each index.html (the homepage included),
// marking the current section; `node nav.mjs --check` lists the pages that differ and exits 1.
// site.test.ts checks the same thing, so a page with a stale nav fails CI.
import { globSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = new URL("./", import.meta.url);
const shared = readFileSync(new URL("_nav.html", here), "utf8").trim();
const NAV = /<nav aria-label="Main"[\s\S]*?<\/nav>/;
const OLD_TOPBAR = /<header class="topbar">[\s\S]*?<\/header>/;

/** The nav link a page's section highlights, or null (help, features, roadmap and the homepage mark nothing). */
export const sectionOf = (path) =>
  /^(learn|guides|blog)\//.test(path) ? "/learn/" : /^(compare|migrate)\//.test(path) ? "/compare/" : null;

export const navFor = (path) => {
  const section = sectionOf(path);
  return section ? shared.replace(`href="${section}"`, `href="${section}" aria-current="page"`) : shared;
};

const pages = [
  "index.html",
  ...globSync("**/index.html", {
    cwd: fileURLToPath(here),
    exclude: (f) => /^(dist|node_modules|testing-landing-page)(\/|$)/.test(f),
  }),
].sort();

const check = process.argv.includes("--check");
let stale = 0;
for (const p of pages) {
  const file = new URL(p, here);
  const html = readFileSync(file, "utf8");
  const want = navFor(p);
  const next = OLD_TOPBAR.test(html)
    ? html.replace(OLD_TOPBAR, want)
    : NAV.test(html)
      ? html.replace(NAV, want)
      : null;
  if (next === null) {
    console.error(`${p}: no nav found (expected <nav aria-label="Main"> or <header class="topbar">)`);
    stale++;
    continue;
  }
  if (next === html) continue;
  stale++;
  if (check) console.log(`${p}: nav differs`);
  else {
    writeFileSync(file, next);
    console.log(`${p}: nav written`);
  }
}
if (check && stale) process.exit(1);
if (!stale) console.log(`${pages.length} pages, nav up to date`);
