// Recomputes prev/hash for every line of a FIXTURE events.jsonl. Never run on a real vault.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import canonicalize from "canonicalize";

const file = process.argv[2];
let prev = "0".repeat(64);
const out = readFileSync(file, "utf8")
  .trim()
  .split("\n")
  .map((l) => {
    const { hash: _h, ...e } = JSON.parse(l);
    e.prev = prev;
    prev = createHash("sha256").update(canonicalize(e)).digest("hex");
    return canonicalize({ ...e, hash: prev });
  });
writeFileSync(file, `${out.join("\n")}\n`);
