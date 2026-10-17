// docs/19: the sample company. Built from the golden fixture at first open (bundled as text, so no extra files ship),
// into the app-data folder. capfolder.json says "sample": vault.ts refuses every save to it.
import { PDFDocument, StandardFonts } from "pdf-lib";
import metaText from "../../../fixtures/acme-vault/capfolder.json?raw";
import eventsText from "../../../fixtures/acme-vault/events.jsonl?raw";
import { join, parentOf } from "./fs/types";
import { type App, openCompany } from "./state";
import { openVault } from "./vault";

export async function openSample(app: App) {
  const { fs } = app.platform;
  const root = join(await app.platform.appDataDir(), "sample");
  if (!(await fs.exists(join(root, "events.jsonl")))) {
    await fs.mkdir(join(root, "docs", "_removed"));
    for (const path of new Set(eventsText.match(/docs\/[^"]+\.pdf/g))) {
      await fs.mkdir(parentOf(join(root, path)));
      await fs.writeBytes(join(root, path), await placeholderPdf());
    }
    await fs.writeText(
      join(root, "capfolder.json"),
      `${JSON.stringify({ ...JSON.parse(metaText), sample: true }, null, 2)}\n`,
    );
    await fs.writeText(join(root, "events.jsonl"), eventsText); // last: a half-made copy is made again
  }
  app.setVault(await openVault(fs, root, app.ctx));
  app.go({ name: "home" });
}

/** Leave the sample: back to the founder's latest company, else set one up. */
export function startMyOwn(app: App) {
  const last = app.settings.recentVaults[0];
  if (last) return openCompany(app, last.root);
  app.setVault(null);
  app.go({ name: app.settings.termsAccepted ? "create" : "welcome" });
}

async function placeholderPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage().drawText("Sample document. Nothing here is real.", { x: 72, y: 720, size: 18, font });
  return doc.save();
}
