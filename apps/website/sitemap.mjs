// Build step: write dist/sitemap.xml from every index.html in dist/, so new pages are listed without editing anything.
import { readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const sitemap = (files) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${files
    .filter((f) => f === "index.html" || f.endsWith("/index.html"))
    .map((f) => `https://capfolder.com/${f.replace(/index\.html$/, "")}`)
    .sort()
    .map((u) => `  <url><loc>${u}</loc></url>\n`)
    .join("")}</urlset>\n`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = fileURLToPath(new URL("./dist/", import.meta.url));
  writeFileSync(`${dist}sitemap.xml`, sitemap(readdirSync(dist, { recursive: true })));
}
