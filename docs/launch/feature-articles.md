# Capfolder — feature articles plan
Source: repo `MKBSP/capfolder` CHANGELOG v0.1.0–0.1.3 + unreleased commits, site `/learn` and `/help` (checked 2026-10-22).

## 1. Three article types, one per job

| Type | URL | Reader | Job | Exists |
|---|---|---|---|---|
| **Learn** | `/learn/<concept>/` | Founder Googling a term | Explain the concept | 12 articles |
| **Feature** | `/features/<slug>/` | Founder comparing tools | "Can it do X, and how well" → download | **0, build these** |
| **Help** | `/help/<slug>/` | Existing user | Step-by-step with screenshots | 1 (`founders`) |

Each feature gets **one Feature page + one Help page**. Links run in a triangle:
- **Learn → Feature:** "Do this in Capfolder"
- **Feature → Help:** "Step by step"
- **Feature → Learn:** "What is a…"

## 2. Shipped features → articles

P1 = write first (Pulley shutdown and search demand). Keywords are guesses; check them in Search Console and Bing before writing.

| # | Feature (shipped) | Feature slug | Target query | Links to Learn | Help slug | P |
|---|---|---|---|---|---|---|
| 1 | Import from Pulley, Carta, Cake, OCF or a spreadsheet. Checks every total against the old tool; "Before you cancel" card | `import` (+ `/migrate/from-pulley`, `/migrate/from-carta`) | export cap table from pulley, pulley alternative | cap-table, fully-diluted | `import` | P1 |
| 2 | New SAFE: YC post-money SAFE filled in, pro rata side letter, wire instructions after signing | `issue-safe` | how to issue a SAFE, YC SAFE template | safe, valuation-cap-discount, pre-money-post-money | `new-safe` | P1 |
| 3 | E-signing by link: signer needs no account, signing order, reminders, sealed PDF checked page by page, relay can be self-hosted | `e-signing` | sign SAFE online free, docusign alternative for SAFE | safe | `signatures` | P1 |
| 4 | Vesting: graph with cliff, monthly steps, Today line, stops on leaving; terminate, exercise, repurchase unvested | `vesting` | vesting schedule tracker, track employee vesting | vesting, 83b-election | `vesting` | P1 |
| 5 | Export: Excel laid out like Pulley/Carta (Overview with charts, ledgers, vesting by month, missing docs), CSV, OCF, PDF; any as-of date | `export` | cap table excel template, export cap table | cap-table | `export` | P1 |
| 6 | Option pool + grants: create or increase the pool, pool check, below-FMV warning, ISO/NSO | `option-grants` | how to grant stock options startup | option-pool, iso-vs-nso | `grants` | P2 |
| 7 | 409A record: FMV, vested value, below-FMV warning on new grants | `409a-tracking` | track 409A valuation | 409a-valuation | (in `grants`) | P2 |
| 8 | Document sorting: drop PDFs, scans or photos; OCR offline; rules, then past choices, then local AI; unclear cases go to "Needs you" | `document-sorting` | organize startup legal documents | — | `documents` | P2 |
| 9 | What's missing: due-diligence checklist, "Get a template" (Cooley GO, YC, IRS, Series Seed) | `whats-missing` | startup due diligence checklist | 83b-election | `documents` | P2 |
| 10 | Share with lawyer: .zip with cap table, every document, record hash, gaps; everyone or one person | `share-with-lawyer` | send cap table to lawyer, data room cap table | — | `share` | P2 |
| 11 | Ask AI: your own key (Claude, OpenAI, Gemini) or a local model; answers with sources, drafts as cards, "What needs my attention?" | `ask-ai` | AI cap table | dilution | `ask-ai` | P2 |
| 12 | Use your own AI on the folder: AGENTS.md/CLAUDE.md in every company folder | `bring-your-own-ai` | claude code cap table, local AI equity | — | `own-ai` | P3 |
| 13 | Plain-file record: append-only, hash-chained, OCF 1.2.0, tested math, backup detection (iCloud, Dropbox, Drive, git) | `plain-files` (or `how-it-works`) | open cap format, cap table data ownership | cap-table | — | P2 |
| 14 | Corrections: correct or reverse instead of edit, transfer shares or a SAFE, merge duplicate people | `corrections-and-transfers` | transfer shares cap table | — | `people` | P3 |
| 15 | Start from zero: 3 questions, wizard, Get started checklist, sample company, tour, "?" tips | `get-started` | create a cap table from scratch | cap-table | `founders` ✅ | P3 |
| 16 | Several companies: switcher, one folder each | (section in #13) | — | — | `companies` | P3 |
| 17 | Security: app lock (keychain), signed updates, signed rules pack, untrusted-file handling | `security` | is local cap table safe | — | — | P2 |
| 18 | Country and currency: number and date formats, incorporation country, company currency | (section in #5 or #15) | — | — | — | P3 |

**Count:** 15 Feature pages + 3 migrate pages + about 12 Help pages.

## 3. Feature page template (`/features/<slug>/`)

Keep each page to 600–900 words. Every section must carry real data or screenshots, so the page isn't thin and survives Google's spam updates.

```
H1: <Do the job> — <plain outcome>                 e.g. "Issue a YC SAFE and get it signed, free"
Lead (2 sentences): what it does + who for. Answer first (AI Overviews quote this).

[Screenshot of the real screen, alt text describing it]

## The problem                    2–3 sentences, founder's pain (your own story where true)
## How it works in Capfolder      3–5 numbered steps, 1 screenshot each, orange boxes like /help
## What's checked for you         the safety checks (e.g. sealed PDF page check, totals must match)
## Where your data goes           local files / what touches the relay / nothing uploaded
## What it doesn't do yet         honest limits + link to /roadmap/
## Compared with Pulley / Carta   3-row mini table, link to /compare/<x>/
## FAQ                            3–5 Q&A → FAQPage JSON-LD (same pattern as /learn)
CTA: Download (no signup) · Step-by-step → /help/<slug>/ · Concept → /learn/<x>/
Footer: "Last checked against v0.1.x on <date>"
```
JSON-LD to include: `SoftwareApplication` (price 0, operatingSystem macOS/Windows/Linux), `FAQPage`, `HowTo` for the steps.

## 4. Help page template (`/help/<slug>/`)

Copy `help/founders/` exactly:
- Steps with screenshots, orange boxes on each one.
- Click a screenshot to enlarge it.
- Register every page in `help/pages.json` under `covers: [app files]`. `pnpm help:check` then flags it when those files change.

## 5. Keep articles in sync with the code

- Add `apps/website/features/pages.json`, mirroring `help/pages.json`, with `checked` (version) and `covers` (app files) per feature page.
- Extend `help:check` to `site:check` so it reads both files. The release run summary then lists stale feature pages too.
- **Changelog → article queue:** each release's "Added" lines either map to an existing slug (update that page and bump `checked`) or create a new row in the table above.
- **Screenshots:** reuse `apps/desktop/screenshots.html` (the sample company) so every image is consistent and shows no real data.

## 6. Order and cadence

| Week | Ship |
|---|---|
| 1 | `/migrate/from-pulley` + `/features/import` + `/help/import` (Pulley shuts down Dec 8) |
| 2 | `/features/issue-safe` + `/features/e-signing` + their help pages |
| 3 | `/features/vesting` + `/features/export` |
| 4 | `/features/` index page + `/migrate/from-carta` + `/features/plain-files` + `/features/security` |
| 5–8 | P2 rest (2 a week), then P3 |

## 7. Where to publish

- **Home for everything:** capfolder.com. Google credits the page that's indexed first and marked canonical, so the original always goes there.
- **Use folders, not a blog, for feature and comparison articles.** They're evergreen pages you'll keep updating:
  - feature articles go in `/features/`
  - comparisons in `/compare/`
  - migration guides in `/migrate/`
- **Add `/blog/` only for dated posts:** build-in-public updates, release notes with context. Every blog post should link to one feature or compare page.

| Place | How | Canonical link back to your site? |
|---|---|---|
| dev.to | Repost the full article. Set `canonical_url` to the capfolder.com page. Tag #opensource, #showdev, #tauri | Yes |
| Hashnode | Repost the full article. Set "originally published at" | Yes |
| Medium | Use "Import a story", which sets canonical automatically | Yes |
| Indie Hackers | Product page post. Write a short, story-led version (the lesson) and link to the full article. Don't paste the whole thing | No, so keep it short and different |
| LinkedIn | Long post with the core insight and no link in the post. Answer in comments | No |
| Bluesky / Mastodon | 1–2 sentences plus the link | — |

**Rules:**
1. Cross-post **only after Google has indexed the original**. Check with URL Inspection in Search Console; it's usually 3–7 days.
2. Make dev.to, Hashnode and Medium full reposts with canonical set. Everywhere else, write a short version that's different from the original.
3. Put dev.to- and dev-tool-flavoured topics first: plain files, OCF, Tauri, signing relay, local AI. Founder topics (SAFE, vesting, Pulley) go to LinkedIn and Indie Hackers.
4. Automation: GitHub Actions on merge to `main` reads new `/blog/` and `/features/` pages from the sitemap, waits until they're indexed, then drafts the cross-posts. The dev.to API supports `canonical_url` and `published:false`, so drafts land unpublished and you approve them in dev.to. The social posts reuse the approval-issue flow from the growth plan.

## 8. Weekly cadence

| Day | Do |
|---|---|
| Mon | Publish feature or compare article #1 |
| Tue | Submit 1 directory |
| Wed | Publish article #2. Cross-post last week's articles (already indexed) to dev.to, Hashnode and Medium |
| Thu | Submit 1 directory. Indie Hackers post |
| Fri | Publish article #3 (optional). Weekly numbers post |

- **Directories:** use 2 a week, not 1 a day. The free list has about 15 good ones, so a daily pace runs out in 3 weeks. Spaced out, they last until Product Hunt (about 8 weeks).
- **Articles:** 2–3 a week fits the 10–25 pages/week ceiling for new sites with room to spare.

After each one ships:
1. Add it to the sitemap and send it to IndexNow.
2. Link it from the matching `/learn` pages and `/compare` pages.
3. Write one build-in-public post per feature (LinkedIn long post, Bluesky with the link) using the same screenshots.
4. Wait 3 weeks, then check Search Console impressions by folder before scaling.
