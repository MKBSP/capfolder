// Build step: add a content hash to the site's own CSS/JS links in dist/*.html, so browsers and
// Cloudflare fetch the new file right after a deploy instead of a cached copy (cache-control is 4 hours).
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const bust = (html, hashes) =>
  html.replace(/(href|src)="\/([\w.-]+\.(?:css|js))"/g, (m, attr, file) =>
    hashes[file] ? `${attr}="/${file}?v=${hashes[file]}"` : m,
  );

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = fileURLToPath(new URL("./dist/", import.meta.url));
  const hashes = Object.fromEntries(
    readdirSync(dist)
      .filter((f) => /\.(css|js)$/.test(f))
      .map((f) => [
        f,
        createHash("sha256")
          .update(readFileSync(join(dist, f)))
          .digest("hex")
          .slice(0, 10),
      ]),
  );
  for (const f of readdirSync(dist, { recursive: true }).filter((f) => f.endsWith(".html")))
    writeFileSync(join(dist, f), bust(readFileSync(join(dist, f), "utf8"), hashes));
}
