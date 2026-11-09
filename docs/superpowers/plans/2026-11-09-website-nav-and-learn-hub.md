# Website: one navbar everywhere, Learn as the hub for articles

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every page of capfolder.com shows the same pill navbar (the homepage's), written from one file by a script and checked by the site test; `/learn/` becomes the hub for everything readable (explainers, founder guides, what's new) and `/blog/` stays as the "What's new" collection.

**Architecture:** The site is static HTML with no templating, so the navbar lives in `apps/website/_nav.html` and `apps/website/nav.mjs` rewrites the nav block in every `index.html` (marking the current section). `site.test.ts` compares each page's nav to that file, so drift fails CI. The pill nav's CSS moves from the homepage's inline style to `page.css`; the "Book a call" handler moves from the homepage's inline script to `track.js`, which every page already loads. The hub and the blog index reuse the existing `.lhero` and `.lcards` design.

**Tech Stack:** plain HTML/CSS, one Node script (`node:fs`), vitest for `site.test.ts`.

**Spec:** Mads, 2026-11-09 (chat): nav drift between pages; Blog and Learn feel the same; Learn is the hub, Blog is the "what's new" collection (features, fixes, events, campaigns); Help stays separate, listed on the hub; nav items `Learn · Compare · Pricing · GitHub | Book a call · Download`.

## Global Constraints

- No templating engine, no new dependency; the dev server (`vite --port 4321`) must serve the raw files correctly, so the script writes the nav into the committed files.
- Existing URLs stay (`/learn/<slug>/`, `/guides/<slug>/`, `/blog/<slug>/`, `/help/…`); no redirects needed.
- Every page keeps `href="/page.css"` except the homepage, which keeps its inline CSS; the pill nav CSS is present in both.
- `/testing-landing-page/` and `dist/` are never touched by the script.
- The homepage tests in `site.test.ts` (page F rules) keep passing.
- Copy rules: plain words, no marketing superlatives; "What's new" for the blog collection.

## Review Focus

1. A page the script never saw (new page copied from an old one with the old `<header class="topbar">`): the test must name it (Task 1 test `every page carries the shared nav` lists the file).
2. The homepage's `href="#pricing"` and `href="#download"` on sub-pages: they must be `/#pricing`, `/#download` (one nav file with absolute links; Task 1 test checks `href="/#pricing"` on a sub-page and that the homepage still works with it).
3. "Book a call" on a sub-page with Tally blocked: the fallback goes to `https://tally.so/r/8NqXQ5` (the handler's `onerror`); Task 1 keeps that code path when moving it.
4. Keyboard users on a narrow screen: the `.links` are hidden under 960px with no menu; the footer carries the same links. Task 1 adds the Learn and Compare links to the sub-page footer line so nothing is unreachable (test: `foot` on `learn/index.html` contains `/compare/`).
5. The hub must list every explainer and guide, and the blog index every post: Task 2 tests compare directory listings to the index pages, so an added article that isn't listed fails CI.

---

### Task 1: One navbar, from one file

**Files:**
- Create: `apps/website/_nav.html` (the pill nav markup; `{{current:/learn/}}`-style markers are not used; the script sets `aria-current="page"` by matching `href`)
- Create: `apps/website/nav.mjs` (`node nav.mjs` rewrites every `**/index.html` except `dist/`, `node_modules/`, `testing-landing-page/`; `node nav.mjs --check` exits 1 and lists files that differ)
- Modify: `apps/website/package.json` (script `"nav": "node nav.mjs"`)
- Modify: `apps/website/page.css` (replace the `.topbar`/`.top` rules with the `.pillnav` rules, literal colors; mobile rules at 960/640)
- Modify: `apps/website/track.js` (the `[data-talk]` click → Tally popup, with the `tally.so/r/8NqXQ5` fallback, from `index.html`)
- Modify: `apps/website/index.html` (remove the Tally handler from the inline script; its nav is rewritten by the script like every other page)
- Modify: every `index.html` under `help/ roadmap/ compare/ learn/ guides/ features/ migrate/ blog/` (by the script)
- Modify: `apps/website/site.test.ts` (the "every sub-page has the same navbar" test becomes "every page carries the shared nav": for each page the `<nav aria-label="Main">…</nav>` block equals `_nav.html` with `aria-current="page"` on the link for its section: `/learn/` for learn, guides, blog; `/compare/` for compare, migrate; none for help, features, roadmap, the homepage)
- Test: `apps/website/site.test.ts`

**Interfaces:**
- Produces: `_nav.html` =

```html
<nav aria-label="Main" class="pillnav"><div>
  <a href="/" class="brand"><svg …folder…></svg>Capfolder</a>
  <div class="links"><a href="/learn/" class="navlink">Learn</a><a href="/compare/" class="navlink">Compare</a><a href="/#pricing" class="navlink">Pricing</a><a href="https://github.com/MKBSP/capfolder" class="navlink">GitHub</a></div>
  <div class="right"><button type="button" class="linkbtn navlink talk" data-talk data-umami-event="book-call-nav">Book a call</button><a href="/#download" class="btn btn-d" data-umami-event="nav-download">Download</a></div>
</div></nav>
```

(the brand SVG is the one in `index.html` today; `.linkbtn`, `.btn`, `.btn-d`, `.navlink` get rules in `page.css` so sub-pages render it like the homepage.)

- Produces: section rule in `nav.mjs`: `sectionOf(path)` → `"/learn/"` for `learn/`, `guides/`, `blog/`; `"/compare/"` for `compare/`, `migrate/`; `null` otherwise.

- [ ] **Step 1: Write the failing tests** (replace the "every sub-page has the same navbar" test)

```ts
const allPages = () => [ "index.html", ...globSync("**/index.html", { ignore: ["dist/**", "node_modules/**", "testing-landing-page/**"] }) ];
test("every page carries the shared nav from _nav.html, with its section marked", () => {
  const shared = read("_nav.html").trim();
  for (const p of allPages()) {
    const nav = read(p).match(/<nav aria-label="Main"[\s\S]*?<\/nav>/)?.[0] ?? "";
    expect([p, nav.replace(' aria-current="page"', "")]).toEqual([p, shared]);
    const section = /^(learn|guides|blog)\//.test(p) ? "/learn/" : /^(compare|migrate)\//.test(p) ? "/compare/" : null;
    const current = nav.match(/href="([^"]+)"[^>]*aria-current="page"/)?.[1] ?? null;
    expect([p, current]).toEqual([p, section]);
    if (p !== "index.html") expect([p, read(p).includes('href="/page.css"')]).toEqual([p, true]);
  }
  expect(read("page.css")).toContain(".pillnav");
  expect(read("page.css")).not.toContain(".topbar");
  expect(read("track.js")).toContain("8NqXQ5");
  expect(read("index.html")).not.toContain('openForm("8NqXQ5"');
});
test("learn's footer line keeps Compare and Help reachable on narrow screens", () => {
  const foot = read("learn/index.html").match(/<p class="foot"[\s\S]*?<\/p>/)![0];
  expect(foot).toContain('href="/compare/"');
  expect(foot).toContain('href="/help/"');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @capfolder/website exec vitest run -t "shared nav|footer line"`
Expected: FAIL, `_nav.html` missing.

- [ ] **Step 3: Write `_nav.html`, `nav.mjs`, the CSS and track.js moves; run `node nav.mjs`**

- [ ] **Step 4: Run the whole site test file and the build**

Run: `pnpm --filter @capfolder/website test && pnpm --filter @capfolder/website build`
Expected: all pass; `dist/` builds.

- [ ] **Step 5: Commit**

```bash
git add apps/website
git commit -m "feat(website): one navbar on every page, written from _nav.html by nav.mjs and checked by the site test"
```

---

### Task 2: Learn is the hub; Blog is "What's new"

**Files:**
- Modify: `apps/website/learn/index.html` (hero copy "Learn"; chips row `All · Explainers · Founder guides · What's new` as anchor links to sections; sections `id="guides"`, `id="explainers"`, `id="news"` (latest 3 posts, newest first, then "All posts →" to `/blog/`); a closing line "Using the app? The step-by-step guides are in Help." linking `/help/`; the foot line gains Compare and Help links)
- Modify: `apps/website/blog/index.html` (crumb `Capfolder · Learn · What's new`; hero title stays "What's new in Capfolder"; lead "New features, fixes, events and campaigns, one post at a time."; a line back to `/learn/`)
- Modify: `apps/website/blog/*/index.html` crumbs → `<a href="/">Capfolder</a> · <a href="/learn/">Learn</a> · <a href="/blog/">What's new</a> · Capfolder 0.1.x`
- Modify: `apps/website/guides/before-you-found/index.html` crumb → `… · <a href="/learn/#guides">Founder guides</a>`
- Modify: `apps/website/page.css` (`.chips` row: pill links, `aria-current` style)
- Test: `apps/website/site.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
test("learn is the hub: every explainer, every guide and the latest posts are listed, with a way to Help", () => {
  const hub = read("learn/index.html");
  for (const p of learnPages()) expect([p, hub.includes(`href="/${p.replace("index.html", "")}"`)]).toEqual([p, true]);
  for (const p of guidePages()) expect([p, hub.includes(`href="/${p.replace("index.html", "")}"`)]).toEqual([p, true]);
  expect(hub.match(/href="\/blog\/[a-z0-9-]+\/"/g)?.length).toBeGreaterThanOrEqual(2);
  for (const id of ["guides", "explainers", "news"]) expect(hub).toContain(`id="${id}"`);
  expect(hub).toContain('href="/blog/"');
  expect(hub).toContain('href="/help/"');
});
test("blog is the What's new collection: every post listed, crumbs lead back to Learn", () => {
  const index = read("blog/index.html");
  for (const p of blogPosts()) {
    expect([p, index.includes(`href="/${p.replace("index.html", "")}"`)]).toEqual([p, true]);
    expect([p, read(p).includes('<a href="/learn/">Learn</a>')]).toEqual([p, true]);
  }
  expect(index).toContain("What's new in Capfolder");
  expect(index).toContain('href="/learn/"');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @capfolder/website exec vitest run -t "hub|What's new collection"`
Expected: FAIL on `id="news"` and the blog crumbs.

- [ ] **Step 3: Rewrite the two index pages and the crumbs**

- [ ] **Step 4: Run the site tests**

Run: `pnpm --filter @capfolder/website test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/website
git commit -m "feat(website): Learn hub with explainers, founder guides and what's new; blog is the What's new collection"
```

---

### Task 3: Docs and the full gate

**Files:**
- Modify: `apps/website/PRODUCT.md` (a "Site map" section: nav items, the hub and its collections, Help separate, where the nav lives and how to change it: edit `_nav.html`, run `pnpm --filter @capfolder/website nav`)
- Modify: `CHANGELOG.md` (Unreleased → `### Website`: "One navbar on every page. Learn is the hub for explainers, founder guides and what's new; the blog is the What's new collection.")
- Modify: `docs/15-status-and-todo.md` (one line under item 19's neighbours: website nav unified and Learn hub, 2026-11-09)

- [ ] **Step 1: Make the edits**
- [ ] **Step 2: Run lint, typecheck and the site tests and build**

Run: `pnpm lint && pnpm --filter @capfolder/website test && pnpm --filter @capfolder/website build`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add apps/website/PRODUCT.md CHANGELOG.md docs/15-status-and-todo.md
git commit -m "docs: website site map, nav workflow, changelog"
```
