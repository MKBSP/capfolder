// Which help and feature pages need a look before a release: those whose app files changed since the version (or
// commit) they were last checked against. Records: apps/website/help/pages.json ("founders" → /help/founders/) and
// apps/website/features/pages.json ("features/import" → /features/import/). After updating a page (text, and
// screenshots via pnpm shots <slug>), set its "checked" to the version being released.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const record = (file, prefix) =>
  Object.entries(JSON.parse(readFileSync(new URL(`../apps/website/${file}`, import.meta.url), "utf8"))).map(
    ([key, v]) => [`${prefix}${key}`, v],
  );
const pages = [...record("help/pages.json", "help/"), ...record("features/pages.json", "")];
const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();
let stale = 0;
for (const [page, { checked, covers }] of pages) {
  try {
    git("rev-parse", "--verify", "--quiet", `${checked}^{commit}`);
  } catch {
    console.log(`? ${page}: tag ${checked} not found (git fetch --tags)`);
    stale++;
    continue;
  }
  const changed = git("diff", "--name-only", `${checked}..HEAD`, "--", ...covers);
  if (!changed) continue;
  stale++;
  console.log(`✗ /${page}/ (checked ${checked}): app changed in\n  ${changed.split("\n").join("\n  ")}`);
}
console.log(stale ? `\n${stale} page(s) to review.` : "Help and feature pages are up to date.");
