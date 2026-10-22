# Brief for Claude Code: write and publish Capfolder feature + help articles

Put this file at `docs/launch/content-brief.md` in the repo, then tell Claude Code:
> Read docs/launch/content-brief.md and do batch 1.

---

## Goal
For each shipped feature, publish two pages on capfolder.com:
- **Feature page** `/features/<slug>/`: what it does, why it matters, honest limits. This is the page people find on Google.
- **Help page** `/help/<slug>/`: step-by-step instructions, one real screenshot per step, orange highlight boxes.

Then add links from the existing `/learn/` and `/compare/` pages. The `/learn/` concept articles already exist (12); don't rewrite them.

## Read first
1. `CLAUDE.md`, especially "Help pages follow the app" and "Never claim legal advice".
2. `CHANGELOG.md`: the source of truth for what has shipped. Only describe features that appear there.
3. `apps/website/help/founders/index.html`: **the template**. Copy its HTML, CSS, zoom script, `.shot`/`.hl` markup and voice exactly.
4. `apps/website/learn/vesting/index.html`: the FAQPage JSON-LD pattern.
5. `apps/website/help/pages.json` and `scripts/help-check.mjs`.
6. `apps/desktop/screenshots.html` and `apps/desktop/src/test/screenshots.tsx`: the real app running on in-memory files, used for screenshots.

## Article list (do in this order, one batch per PR)

| Batch | Slug | Feature page H1 (draft) | Help flow to screenshot |
|---|---|---|---|
| 1 | `import` | Move your cap table from Pulley or Carta before Dec 8 | Start → Import → pick Pulley → choose file → match columns → check (totals match) → save → "Before you cancel Pulley" card |
| 1 | — | `/migrate/from-pulley/` (feature-page format) | Reuse the import screenshots. Add the dates table: Nov 30 Carta opt-in, Dec 8 shutdown, Jan 31 2027 data access (source: Pulley FAQ / eqvista.com) |
| 2 | `issue-safe` | Issue a YC post-money SAFE and get it signed | New SAFE → fill amount, cap, discount → optional pro rata side letter → live impact on cap table → send |
| 2 | `e-signing` | Collect signatures with a link, no signer account | Signatures screen → status per signer → reminder → sealed copy filed in docs/ |
| 3 | `vesting` | See everyone's vesting on one screen | Vesting screen → pool cards → open a grant row (graph with cliff, Today, key dates) → Person → Terminate |
| 3 | `export` | Export your cap table to Excel, CSV or OCF | Home → Export → as-of date → Excel → show the Overview tab (open the .xlsx in the browser preview or screenshot from LibreOffice headless) |
| 4 | `option-grants` | Create an option pool and grant options | Option pool → create/increase → New grant (pool check, below-FMV warning) |
| 4 | `document-sorting` | Drop in your signed documents and let Capfolder file them | Documents → Add documents → progress → Needs you → confirm |
| 5 | `whats-missing` | See which signed documents are missing | What's missing list → Get a template |
| 5 | `share-with-lawyer` | Send your lawyer everything in one zip | Documents → Share with lawyer → Everything / One person |
| 6 | `ask-ai` | Ask questions about your cap table, with sources | ⌘K → question → answer with links → draft card → form opens filled in |
| 6 | `plain-files` | Your cap table is a folder of plain files | Finder-style view of the folder (render the vault tree as an HTML figure, not a screenshot of the OS) + events.jsonl excerpt from the sample company |
| 7 | `security`, `corrections-and-transfers`, `get-started` | — | As above |

After batch 1, also add `/features/index.html` listing every feature page (card grid like `/learn/`), and put "Features" in the shared navbar on every page.

## Screenshots: how to take them

**Never use real company data.** Use only the sample company or test people (Tim Apple, Steve Jobs, Steve Wozniak, Bill Gates, Jeff Bezos, `*.example` emails).

1. **Harness.** Add `scripts/shots.mjs` using Playwright (dev dependency; check the licence is compatible with AGPL). It should:
   - Start the desktop Vite dev server (`pnpm --filter desktop exec vite --port 5199`) and open `http://localhost:5199/screenshots.html`.
   - Use viewport **1480×812**, `deviceScaleFactor: 2`, light theme, animations off (`reducedMotion: 'reduce'`).
   - Drive each flow with role/text selectors (`getByRole('button', { name: 'Import' })`), not CSS classes.
   - For each step, save `apps/website/help/img/<slug>-<n>-<step>.jpg` (quality 85, about 1480 px wide) and write the bounding box of every element to highlight as **percentages of the image** to `apps/website/help/img/<slug>.shots.json`, e.g. `{ "file": "...", "w": 1480, "h": 812, "hl": [{ "left": 34.6, "top": 13.3, "width": 30.9, "height": 38.4 }] }`. Pad each box by 8 px.
   - Crop to the relevant panel when the full window would be unreadable at 760 px wide (use `locator.screenshot()` or `clip`). Record the crop in the JSON.
   - Add a `pnpm shots <slug>` script, so a release can re-run it when `help:check` flags a page.
2. **Fake files.** If a flow needs a file (a Pulley export, PDFs to sort), use `fixtures/` (e.g. `fixtures/acme-docs/`). If it's missing, add an anonymised fixture and register it in `fakePlatform` dialogs. Never put a real export in the repo.
3. **Signing screens.** These need the relay. Mock its responses in `fakePlatform` (status per signer, sealed). Don't send real email.
4. **Check every image by eye**: open it, confirm the highlighted element is the one the step talks about and no dev-only UI shows. Fix and retake before writing.
5. **Markup.** Use the `founders` pattern: `<img src="/help/img/<file>?v=1" width height alt loading="lazy">` plus `<span class="hl" style="left:…%;top:…%;width:…%;height:…%">` from the JSON. Alt text describes what's on screen in one sentence, including the numbers shown.

## Help page rules (`/help/<slug>/index.html`)
- Structure: crumb, H1 (the task, e.g. "Import from Pulley"), lead (outcome plus time it takes), "Orange boxes…" note, "Before you start" (what to have at hand), numbered H2 steps each with one figure, a `.tip` where useful, "Words used here" `<dl>` linking to `/learn/`, footer (GitHub issues plus "isn't legal advice").
- Add an entry to `help/pages.json` with `checked: "<current version>"` and `covers: [every app file the screenshots show]`.
- Add a card to `/help/index.html`.

## Feature page rules (`/features/<slug>/index.html`)
Use the same base styles and navbar as the help pages. 600–900 words. Sections, in order:
1. **H1 plus 2-sentence lead.** Answer first (AI Overviews quote this). Hero figure: the best screenshot from the help flow.
2. **The problem**, 2–3 sentences. State the general founder problem (SAFEs signed in different tools, documents scattered). No real company names.
3. **How it works:** 3–5 short steps, linking "Step by step →" to `/help/<slug>/`.
4. **What Capfolder checks for you:** the real safeguards from the CHANGELOG (e.g. totals must match the old tool; sealed PDF pages compared; AI only proposes).
5. **Where your data goes:** local files, what touches the relay, what's never uploaded.
6. **What it doesn't do yet:** honest limits, linking to `/roadmap/`.
7. **Compared with Pulley / Carta:** a 3-row table; link to `/compare/<x>/`. Take prices and claims only from the existing compare pages, with their sources.
8. **FAQ:** 3–5 questions, mirrored in FAQPage JSON-LD.
9. **CTA:** Download (`/#download`), Step by step, and the related `/learn/` article.
10. **Footer:** "Checked against v0.1.x on YYYY-MM-DD" and the legal-advice line.

`<head>`:
- `<title>` of 60 characters or fewer.
- Meta description of 155 characters or fewer.
- `<link rel="canonical" href="https://capfolder.com/features/<slug>/">`.
- Open Graph title, description and image (the hero screenshot).
- JSON-LD: `SoftwareApplication` (name Capfolder, `offers.price` 0, `operatingSystem` "macOS, Windows, Linux", `license` AGPL-3.0), `FAQPage`, and `HowTo` with the steps.

Add `apps/website/features/pages.json`, same shape as `help/pages.json`, and extend `scripts/help-check.mjs` to read both.

## Writing rules
- Plain English, short sentences, second person, same voice as `/help/founders/`.
- No adjectives without a number ("checks every total against Pulley to the share", not "accurate import").
- Every factual claim about other tools needs a source link and a "checked on" date. Don't invent prices, limits or user counts.
- No legal or tax advice. Point to a lawyer where a decision is needed.
- Feature names and button labels must match the app exactly (copy from `apps/desktop/src/copy.ts` and the screens).
- Mark anything uncertain `[verify]`, and ask Mads before publishing it.

## Cross-links (each batch)
- On each related `/learn/` page, add a box above the FAQ: "Do this in Capfolder → /features/<slug>/".
- On each `/compare/` page, link to the relevant feature pages.
- On the home page feature list, link each item to its feature page.
- Update the `apps/website/package.json` build script so `features` and `migrate` are copied into `dist/` (the build currently copies an explicit list of folders).

## Check before publishing
1. `pnpm i && pnpm test` passes, including `apps/website/site.test.ts`. Add tests that every page has a title, meta description, canonical, an `alt` on every image, and valid JSON-LD (`JSON.parse`).
2. `pnpm --filter @capfolder/website build`, then confirm the new URLs are in `dist/sitemap.xml`.
3. `pnpm dev:web` and view each new page at 375 px and 1440 px wide. No horizontal scroll; every screenshot zooms and the highlight boxes line up.
4. Paste each page's JSON-LD into validator.schema.org.
5. `pnpm help:check` lists nothing for the new pages.

## Publish
- One branch and one PR per batch, titled `Website: <slugs> feature + help pages`. List the URLs and attach 2–3 screenshots of the rendered pages in the PR description.
- Mads reviews and merges. Merging to `main` deploys the site. `[verify]`: confirm whether this is the Cloudflare Pages auto-deploy or a workflow.
- After deploy: submit each URL in Google Search Console (URL Inspection → Request indexing, at most 10 a day), and ping IndexNow (Bing). Add a `scripts/indexnow.mjs` that posts the new sitemap URLs, using a key file in `apps/website/`.
- Add a line under `## [Unreleased]` → `### Website` in `CHANGELOG.md`.

## Don't
- Don't change app behaviour to make a screenshot look better. If the UI is wrong, open an issue instead.
- Don't publish a feature page whose help page isn't done.
- Don't cross-post anywhere. Mads does that once Google has indexed the page.
