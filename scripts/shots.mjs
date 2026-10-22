// Help-page screenshots from the real app on in-memory files (apps/desktop/screenshots.html), never real data.
// pnpm shots <slug> → apps/website/help/img/<slug>-<n>-<step>.jpg + <slug>.shots.json (orange boxes in % of the image).
// Uses the installed Chrome (playwright-core, channel "chrome"): nothing is downloaded.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const PORT = 5199;
const BASE = `http://localhost:${PORT}/screenshots.html`;
const OUT = new URL("../apps/website/help/img/", import.meta.url);
const PAD = 8;

// Each step: what to do first, then what to capture (`crop`, else the window) and which elements get an orange box.
const FLOWS = {
  import: {
    url: `${BASE}?flow=import`,
    steps: [
      { name: "start", hl: (p) => [p.getByRole("button", { name: "Import a cap table" })] },
      {
        name: "source",
        act: (p) => p.getByRole("button", { name: "Import a cap table" }).click(),
        crop: (p) => p.locator("main"),
        hl: (p) => [
          p.getByRole("radiogroup", { name: "Source" }),
          p.getByRole("button", { name: "Choose file…" }),
        ],
      },
      {
        name: "columns",
        act: (p) => p.getByRole("button", { name: "Choose file…" }).click(),
        crop: (p) => p.locator("main"),
        hl: (p) => [p.getByRole("table").first(), p.getByRole("button", { name: "Continue" })],
      },
      {
        name: "compare",
        act: async (p) => {
          await p.getByRole("button", { name: "Continue" }).click();
          await p.getByLabel("Fully diluted in Pulley").fill("8,000,000");
          await p.getByLabel("Common shares in Pulley").fill("7,000,000");
          await p.getByLabel("Pool available in Pulley").fill("920,000");
        },
        crop: (p) => p.getByRole("heading", { name: "Compare with Pulley" }).locator(".."),
        hl: (p) => [p.getByRole("heading", { name: "Compare with Pulley" }).locator("..").getByRole("table")],
      },
      {
        name: "before-you-cancel",
        act: async (p) => {
          await p.getByRole("button", { name: "Save to the cap table" }).click();
          await p.getByText(/Reports don't include signed documents/).waitFor();
          await p.getByRole("button", { name: "Cap table" }).click();
        },
        hl: (p) => [p.getByRole("region", { name: "Before you cancel Pulley" })],
      },
    ],
  },
};

const slug = process.argv[2];
const flow = FLOWS[slug];
if (!flow) {
  console.error(`Usage: pnpm shots <${Object.keys(FLOWS).join("|")}>`);
  process.exit(1);
}

const up = () =>
  fetch(BASE).then(
    (r) => r.ok,
    () => false,
  );
let vite;
if (!(await up())) {
  vite = spawn(
    "pnpm",
    ["--filter", "@capfolder/desktop", "exec", "vite", "--port", String(PORT), "--strictPort"],
    {
      stdio: "ignore",
    },
  );
  for (let i = 0; i < 60 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage({
    viewport: { width: 1480, height: 812 },
    deviceScaleFactor: 2,
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await page.goto(flow.url);
  const shots = [];
  for (const [i, step] of flow.steps.entries()) {
    if (step.act) await step.act(page);
    await page.evaluate(() => window.scrollTo(0, 0)); // boxes in page coordinates
    await page.waitForTimeout(300);
    const area = step.crop ? await step.crop(page).boundingBox() : { x: 0, y: 0, width: 1480, height: 812 };
    const m = step.crop ? 20 : 0; // a margin around a cropped panel, so its orange box has room
    const top = Math.min(m, 6); // little above: the screen's previous element sits close
    const pageH = await page.evaluate(() => document.documentElement.scrollHeight);
    const clip = { x: area.x - m, y: area.y - top, width: area.width + 2 * m, height: area.height + top + m };
    clip.height = Math.min(clip.height, pageH - clip.y); // the image can't run past the page
    const file = `${slug}-${i + 1}-${step.name}.jpg`;
    await page.screenshot({
      path: new URL(file, OUT).pathname,
      clip,
      fullPage: true,
      quality: 85,
      type: "jpeg",
      scale: "css",
    });
    const hl = [];
    for (const el of step.hl(page)) {
      const b = await el.boundingBox();
      if (!b) throw new Error(`${file}: highlight target not found`);
      const x = Math.max(b.x - PAD, clip.x);
      const y = Math.max(b.y - PAD, clip.y);
      const pct = (v, of) => Math.round((v / of) * 1000) / 10;
      hl.push({
        left: pct(x - clip.x, clip.width),
        top: pct(y - clip.y, clip.height),
        width: pct(Math.min(b.x + b.width + PAD, clip.x + clip.width) - x, clip.width),
        height: pct(Math.min(b.y + b.height + PAD, clip.y + clip.height) - y, clip.height),
      });
    }
    shots.push({
      file,
      w: Math.round(clip.width),
      h: Math.round(clip.height),
      crop: step.crop ? clip : null,
      hl,
    });
    console.log(`✓ ${file}`);
  }
  writeFileSync(new URL(`${slug}.shots.json`, OUT), `${JSON.stringify(shots, null, 2)}\n`);
} finally {
  await browser.close();
  vite?.kill();
}
