// Which help pages (apps/website/help) need a look before a release: those whose app files changed since the
// version they were last checked against. Record: apps/website/help/pages.json. After updating a page (text and
// screenshots, see apps/desktop/screenshots.html), set its "checked" to the version being released.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const pages = JSON.parse(readFileSync(new URL("../apps/website/help/pages.json", import.meta.url), "utf8"));
const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();
let stale = 0;
for (const [page, { checked, covers }] of Object.entries(pages)) {
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
  console.log(`✗ /help/${page}/ (checked ${checked}): app changed in\n  ${changed.split("\n").join("\n  ")}`);
}
console.log(stale ? `\n${stale} help page(s) to review.` : "Help pages are up to date.");
