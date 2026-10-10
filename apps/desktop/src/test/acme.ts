import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fakePlatform } from "./fakePlatform";

// jsdom gives import.meta.url an http: scheme, so resolve from the package dir (vitest's cwd).
const FIX = resolve(process.cwd(), "../../fixtures/acme-vault");

/** A fake platform whose last-opened vault is the acme fixture (so <App> boots straight into Home). */
export function acmePlatform(opts: Parameters<typeof fakePlatform>[0] = {}) {
  const fp = fakePlatform(opts);
  const root = "/home/me/Documents/Acme";
  fp.fs.writeSync(`${root}/events.jsonl`, readFileSync(resolve(FIX, "events.jsonl"), "utf8"));
  fp.fs.writeSync(`${root}/capfolder.json`, readFileSync(resolve(FIX, "capfolder.json"), "utf8"));
  fp.fs.mkdirSync(`${root}/docs/_removed`);
  fp.fs.writeSync(
    "/appdata/settings.json",
    JSON.stringify({
      deviceId: "dev_t",
      lock: "none",
      idleMinutes: 15,
      telemetry: true,
      recentVaults: [{ name: "Acme", root }],
    }),
  );
  return { ...fp, root };
}
