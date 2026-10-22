// The launch page must not ship placeholders or claim things the app doesn't do (docs/09 M8).
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const read = (p: string) => readFileSync(new URL(`./${p}`, import.meta.url), "utf8");
const comparePages = () =>
  readdirSync(new URL("./compare", import.meta.url), { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "img")
    .map((d) => `compare/${d.name}/index.html`);
const learnPages = () =>
  readdirSync(new URL("./learn", import.meta.url), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => `learn/${d.name}/index.html`);
const licenses = readFileSync(new URL("../../THIRD_PARTY_LICENSES.md", import.meta.url), "utf8");

test("no placeholders, old names or dead links", () => {
  for (const bad of ["[stars]", "[repo]", "[contact]", "[check", "Plainshare", 'href="#"', "[download link]"])
    expect([bad, html.includes(bad)]).toEqual([bad, false]);
});

test("no features that aren't built", () => {
  for (const bad of [
    "SQLite",
    "MCP server",
    "your key",
    "answers questions",
    "Standard templates, filled from a short form",
    "hash-match",
    "One docker command",
  ])
    expect([bad, html.includes(bad)]).toEqual([bad, false]);
});

test("download goes through the Tally form, then GitHub Releases; donations through Revolut", () => {
  expect(html).toContain("https://tally.so/widgets/embed.js");
  expect(html).toContain('"rjxQjR"');
  expect(html).toContain("https://api.github.com/repos/MKBSP/capfolder/releases/latest");
  expect(html).toContain("https://github.com/MKBSP/capfolder/releases/latest");
  expect(html).toContain("https://checkout.revolut.com/pay/5f256b0e-5234-478c-b512-e92228c101df");
});

test("cookieless analytics, no banner (docs/11): Umami Cloud through our own /stats proxy, on every page", () => {
  const tag =
    /<script defer src="\/stats\/script\.js" data-host-url="\/stats" data-website-id="[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"><\/script>/;
  for (const f of execSync("git ls-files '*.html'", { cwd: new URL(".", import.meta.url) })
    .toString()
    .trim()
    .split("\n"))
    expect([f, tag.test(read(f))]).toEqual([f, true]);
  // same-origin only: the CSP no longer needs (or allows) Umami's hosts
  expect(read("_headers")).not.toMatch(/umami/);
  expect(html).not.toContain("plausible");
  // the buttons we want counted
  for (const ev of [
    "get-download",
    "skip-download",
    "download-macos",
    "download-windows",
    "download-linux",
    "donate",
    "github",
    "nav-download",
  ])
    expect([ev, html.includes(`data-umami-event="${ev}"`)]).toEqual([ev, true]);
});

test("public roadmap: one module (roadmap.js) on home, /roadmap and every compare page; no internal infrastructure", () => {
  const rm = readFileSync(new URL("./roadmap.js", import.meta.url), "utf8");
  for (const col of ['"Now"', '"Next"', '"Later"', '"Done recently"', "feature.yml", "bug.yml"])
    expect(rm).toContain(col);
  expect(rm).not.toMatch(/laptop|Hetzner|AWS|relay/i);
  expect(html).toContain('href="/roadmap/"');
  for (const page of [html, read("roadmap/index.html"), ...comparePages().map(read)]) {
    expect(page).toContain("data-roadmap");
    expect(page).toContain('<script src="/roadmap.js" defer></script>');
  }
});

test("compare pages: Pulley/Carta alternative in titles, logo, dated sources, roadmap, issues, download; listed on /compare/ and linked from home", () => {
  const pages = comparePages();
  expect(pages.length).toBeGreaterThanOrEqual(3);
  const index = read("compare/index.html");
  for (const p of pages) {
    const page = read(p);
    const slug = p.split("/")[1];
    expect([slug, /<title>[^<]*alternative/i.test(page)]).toEqual([slug, true]);
    expect([
      slug,
      /Checked (January|February|March|April|May|June|July|August|September|October|November|December) 20\d\d/.test(
        page,
      ),
    ]).toEqual([slug, true]);
    expect([slug, (page.match(/class="src"/g) ?? []).length >= 1]).toEqual([slug, true]);
    expect([slug, page.includes('class="logos"')]).toEqual([slug, true]);
    for (const logo of page.matchAll(/src="\/compare\/img\/([^"]+)"/g))
      expect([logo[1], existsSync(new URL(`./compare/img/${logo[1]}`, import.meta.url))]).toEqual([
        logo[1],
        true,
      ]);
    for (const must of [
      'href="/#download"',
      "https://github.com/MKBSP/capfolder/issues",
      `data-vs="${slug}"`,
    ])
      expect([slug, must, page.includes(must)]).toEqual([slug, must, true]);
    expect([slug, index.includes(`href="/compare/${slug}/"`)]).toEqual([slug, true]);
  }
  expect(html).toContain('href="/compare/pulley/">Pulley alternative');
  expect(html).toContain('href="/compare/carta/">Carta alternative');
});

test("privacy contact is an email, not only GitHub issues", () => {
  expect(html.slice(html.indexOf('id="privacy"'))).toContain("mailto:privacy@capfolder.com");
});

test("acknowledged npm packages carry the license our license check found", () => {
  for (const [pkg, license] of [
    ...html.matchAll(/data-npm="([^"]+)"[^>]*>[^<]*<\/a><\/td><td[^>]*>[^<]*<\/td><td[^>]*>([^<]+)</g),
  ].map((m) => [m[1]!, m[2]!.trim()]))
    expect([
      pkg,
      licenses.includes(`- ${pkg} `) &&
        licenses
          .split("\n")
          .find((l) => l.startsWith(`- ${pkg} `))
          ?.endsWith(`: ${license}`),
    ]).toEqual([pkg, true]);
  expect(html.match(/data-npm="/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
});

test("visitors' browsers only talk to what the privacy section names (M8 review)", () => {
  expect(html).not.toContain("fonts.googleapis.com");
  expect(html).not.toMatch(/<script[^>]+tally\.so\/widgets\/embed\.js/); // Tally loads on click only
  expect(html).toContain('id="privacy"');
  const privacy = html.slice(html.indexOf('id="privacy"'));
  for (const named of ["Umami", "Tally", "GitHub", "install ping", "Settings", "relay"])
    expect([named, privacy.includes(named)]).toEqual([named, true]);
});

test("no claims the hosted relay can't back yet, and privacy answered honestly", () => {
  for (const bad of [
    "waits on the relay, encrypted",
    "Who can see my data?</h3><p>Only you.",
    "your AI, can be local",
    "Click any number",
  ])
    expect([bad, html.includes(bad)]).toEqual([bad, false]);
});

test("a11y: moving content can be paused (WCAG 2.2.2), the comparison table has row headers", () => {
  expect(html).toMatch(/<button[^>]*id="pause-motion"[^>]*aria-pressed="false"/);
  expect(html).toContain(".motion-paused *");
  const rows = html.match(/<tbody>[\s\S]*?<\/tbody>/)![0];
  expect(rows.match(/<tr>/g)!.length).toBe(rows.match(/<th scope="row"/g)!.length);
});

test("HN-friendly download: email optional, works without JS, unsigned-beta steps, exact disclaimer in the footer", () => {
  expect(html).toMatch(/id="skipdl"[^>]*>No thanks, just download</);
  expect(html).toMatch(/<noscript>[\s\S]*releases\/latest[\s\S]*<\/noscript>/);
  expect(html).toContain("Open Anyway");
  expect(html).toContain("More info → Run anyway");
  const footer = html.match(/<footer[\s\S]*?<\/footer>/)![0];
  expect(footer).toContain(
    "Capfolder is software, not a law firm. It does not give legal, tax or financial advice. Templates come from public sources such as Y Combinator and are provided as is. Have a lawyer review your documents.",
  );
  expect(html).not.toMatch(/then the relay deletes them\./);
});

test("pricing: free forever, self-hosted, and a paid plan that's clearly not out yet", () => {
  expect(html).toContain('href="#pricing"');
  const pricing = html.slice(
    html.indexOf('id="pricing"'),
    html.indexOf("</section>", html.indexOf('id="pricing"')),
  );
  for (const s of [
    "Free forever",
    "Self-hosted",
    "$50",
    "Coming",
    "10 signing requests a month",
    "No online backup",
    "Bring your own AI",
  ])
    expect([s, pricing.includes(s)]).toEqual([s, true]);
});

test("Pro: 'tell me when it's ready' opens the Pro waitlist form (aONDJb) with the 25% first-year offer", () => {
  const pro = html.slice(html.indexOf(">Pro</h3>"), html.indexOf("</section>", html.indexOf(">Pro</h3>")));
  expect(pro).toMatch(/id="prowait"[^>]*data-umami-event="pro-waitlist"/);
  expect(pro).toContain("25% off the first year");
  expect(html).toContain('"aONDJb"');
});

test("help pages: each one is in help/pages.json with the app files it shows, and listed on /help/", async () => {
  const { existsSync, readdirSync } = await import("node:fs");
  const help = new URL("./help/", import.meta.url);
  const pages = JSON.parse(readFileSync(new URL("pages.json", help), "utf8"));
  const dirs = readdirSync(help, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "img")
    .map((d) => d.name);
  expect(Object.keys(pages).sort()).toEqual(dirs.sort());
  const index = readFileSync(new URL("index.html", help), "utf8");
  for (const [page, p] of Object.entries<{ checked: string; covers: string[] }>(pages)) {
    expect(p.checked).toMatch(/^(v\d+\.\d+\.\d+|[0-9a-f]{7,40})$/); // a release, or the commit for a page written before the next one
    expect(p.covers.length).toBeGreaterThan(0);
    for (const f of p.covers)
      expect([f, existsSync(new URL(`../../${f}`, import.meta.url))]).toEqual([f, true]);
    expect(index).toContain(`href="/help/${page}/"`);
  }
});

test("no setup needed: said in the hero, the comparison and the FAQ", () => {
  expect(html).toContain("No setup needed.");
  expect(html).toContain(">Setup needed</th>");
  expect(html).toContain("Do I need a server");
});

test("every sub-page has the same navbar, with its section marked", () => {
  for (const [p, section] of [
    ["help/index.html", "/help/"],
    ["help/founders/index.html", "/help/"],
    ["roadmap/index.html", "/roadmap/"],
    ["compare/index.html", "/compare/"],
    ...comparePages().map((c) => [c, "/compare/"]),
    ["learn/index.html", "/learn/"],
    ...learnPages().map((l) => [l, "/learn/"]),
    ["help/import/index.html", "/help/"],
    ["features/index.html", "/features/"],
    ["features/import/index.html", "/features/"],
    ["migrate/from-pulley/index.html", "/features/"],
  ]) {
    const nav = read(p).match(/<nav class="top"[\s\S]*?<\/nav>/)?.[0] ?? "";
    for (const must of [
      'src="/favicon.svg"',
      'href="/features/"',
      'href="/compare/"',
      'href="/roadmap/"',
      'href="/help/"',
      'href="/learn/"',
      'href="/#download"',
      `href="${section}" aria-current="true"`,
    ])
      expect([p, must, nav.includes(must)]).toEqual([p, must, true]);
    expect([p, read(p).includes('href="/page.css"')]).toEqual([p, true]);
  }
});

test("story: the paperwork animation replaces the old list, and the Pause button pauses it too", () => {
  const story = html.slice(
    html.indexOf('id="story"'),
    html.indexOf("</section>", html.indexOf('id="story"')),
  );
  expect(story).toContain("<capfolder-paperwork");
  expect(story).not.toContain('class="lost');
  // Same card as the folder demo above: window bar, white, shadow
  expect(story).toContain('<div class="demo">');
  expect(read("capfolder-paperwork.js")).not.toContain("#FAFAF8");
  expect(html).toContain('<script src="/capfolder-paperwork.js" defer></script>');
  const anim = read("capfolder-paperwork.js");
  expect(anim).toContain("motion-paused");
  expect(anim).not.toMatch(/fetch\(|https?:\/\//);
});

const ROWS = [
  "Price",
  "Setup needed",
  "Where your data lives",
  "Works offline",
  "Works outside the US",
  "SAFEs",
  "Option grants and vesting",
  "E-signatures",
  "Documents",
  "409A valuations",
  "Employee and investor logins",
  "Round modelling",
];
test("compare tables: the same 12 rows on every page, each cell rated 0–3 with a key", () => {
  for (const p of comparePages()) {
    const table = read(p).match(/<div class="tbl">[\s\S]*?<\/table>/)?.[0] ?? "";
    expect([p, [...table.matchAll(/<th scope="row">([^<]*)/g)].map((m) => m[1])]).toEqual([p, ROWS]);
    expect([p, (table.match(/class="bar b[0-3]"/g) ?? []).length]).toEqual([p, ROWS.length * 2]);
    expect([p, read(p).includes('class="key"')]).toEqual([p, true]);
  }
});

const SITES: Record<string, string> = {
  pulley: "https://pulley.com",
  carta: "https://carta.com",
  sumoshares: "https://sumoshares.com",
};
test("compare hero: split layout with the same vs card and screenshot, 3 value points; no illustrations or At a glance", () => {
  for (const p of comparePages()) {
    const page = read(p);
    const slug = p.split("/")[1];
    for (const must of [
      'class="vscard"',
      'src="/compare/img/captable.jpg',
      'class="props"',
      'cols choose"',
      `href="${SITES[slug]}"`,
    ])
      expect([slug, must, page.includes(must)]).toEqual([slug, must, true]);
    expect([slug, (page.match(/class="tile/g) ?? []).length]).toEqual([slug, 2]);
    expect([slug, /\/img\/ill\/|class="glance"/.test(page)]).toEqual([slug, false]);
  }
});

test("cache: the build adds a content hash to every CSS/JS link, so a new deploy is fetched at once", async () => {
  const { bust } = await import("./bust.mjs");
  const out = bust('<link href="/page.css"><script src="/roadmap.js"></script><a href="/page.css.html">', {
    "page.css": "abc",
    "roadmap.js": "def",
  });
  expect(out).toBe(
    '<link href="/page.css?v=abc"><script src="/roadmap.js?v=def"></script><a href="/page.css.html">',
  );
});

test("Pulley and Carta pages: a 'Before you cancel' checklist, same items as the app", () => {
  for (const [page, tool] of [
    ["compare/pulley/index.html", "Pulley"],
    ["compare/carta/index.html", "Carta"],
  ]) {
    const h = read(page);
    expect(h).toContain(`<h2>Before you cancel ${tool}</h2>`);
    for (const item of ["Compare the totals", "Every signed document", "Board consents", "409A", "by hand"])
      expect(h).toContain(item);
  }
});

test("learn pages: SEO basics, 1,200–1,800 words, FAQ markup, sources, disclaimer; listed on /learn/, in the build and the home nav", () => {
  const pages = learnPages();
  expect(pages.length).toBeGreaterThanOrEqual(3);
  const index = read("learn/index.html");
  for (const p of pages) {
    const page = read(p);
    const slug = p.split("/")[1];
    expect([slug, /<title>[^<]{10,70}<\/title>/.test(page)]).toEqual([slug, true]);
    expect([slug, /<meta name="description" content="[^"]{70,170}">/.test(page)]).toEqual([slug, true]);
    expect([
      slug,
      page.includes(`<link rel="canonical" href="https://capfolder.com/learn/${slug}/">`),
    ]).toEqual([slug, true]);
    expect([slug, (page.match(/<h1[ >]/g) ?? []).length]).toEqual([slug, 1]);
    const sources =
      page.match(/<h2 id="sources">Sources<\/h2>\s*<ol class="srcs">([\s\S]*?)<\/ol>/)?.[1] ?? "";
    expect([slug, (sources.match(/<a href="https:/g) ?? []).length >= 3]).toEqual([slug, true]);
    expect([slug, page.includes("Not legal or tax advice")]).toEqual([slug, true]);
    const ld = page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? "{}";
    const faq = JSON.parse(ld);
    expect([slug, faq["@type"], faq.mainEntity?.length >= 3]).toEqual([slug, "FAQPage", true]);
    const words = page
      .match(/<main[^>]*>([\s\S]*?)<\/main>/)![1]!
      .replace(/<[^>]+>/g, " ")
      .split(/\s+/)
      .filter(Boolean).length;
    expect([slug, words >= 1200 && words <= 1900]).toEqual([slug, true]);
    expect([slug, index.includes(`href="/learn/${slug}/"`)]).toEqual([slug, true]);
    // brand illustration in the hero band at the top, and on the index card
    const ill = page.match(/<section class="lhero">[\s\S]*?<img src="(\/img\/ill\/[a-z]+\.svg)"/)?.[1];
    expect([slug, !!ill && existsSync(new URL(`.${ill}`, import.meta.url))]).toEqual([slug, true]);
    expect([slug, index.includes(`<a class="lcard" href="/learn/${slug}/"><img src="${ill}"`)]).toEqual([
      slug,
      true,
    ]);
  }
  expect(read("package.json")).toMatch(/cp -r [^"]*\blearn\b/);
  expect(html).toContain('href="/learn/"');
});

test("/stats proxy: the script from cloud.umami.is, events to gateway.umami.is with the visitor's IP and browser", async () => {
  const { onRequest } = await import("../../functions/stats/[[path]].js");
  const calls: [string, RequestInit][] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (u: string, init: RequestInit) => {
    calls.push([u, init]);
    return new Response("ok");
  }) as typeof fetch;
  try {
    const req = (path: string, init: RequestInit = {}) =>
      onRequest({ request: new Request(`https://capfolder.com${path}`, init) });
    await req("/stats/script.js");
    await req("/stats/api/send", {
      method: "POST",
      body: '{"type":"event"}',
      headers: { "user-agent": "Safari", "cf-connecting-ip": "1.2.3.4", "content-type": "application/json" },
    });
    expect((await req("/stats/../secret")).status).toBe(404);
    expect(calls.map((c) => c[0])).toEqual([
      "https://cloud.umami.is/script.js",
      "https://gateway.umami.is/api/send",
    ]);
    const sent = calls[1]![1];
    expect(sent.method).toBe("POST");
    expect(await new Response(sent.body).text()).toBe('{"type":"event"}');
    const h = new Headers(sent.headers);
    expect([h.get("user-agent"), h.get("x-forwarded-for")]).toEqual(["Safari", "1.2.3.4"]);
  } finally {
    globalThis.fetch = real;
  }
});

test("Bing Webmaster verification file is published at the site root", () => {
  expect(read("BingSiteAuth.xml")).toMatch(/<user>[0-9A-F]{32}<\/user>/);
  expect(read("package.json")).toMatch(/cp -r [^"]*\bBingSiteAuth\.xml\b/);
});

test("sitemap.xml lists every page (built from dist, so new pages need no edit); robots.txt points to it", async () => {
  const { sitemap } = await import("./sitemap.mjs");
  const xml: string = sitemap(["index.html", "learn/safe/index.html", "img/x.svg", "help/index.html"]);
  expect(xml.match(/<loc>[^<]+<\/loc>/g)).toEqual([
    "<loc>https://capfolder.com/</loc>",
    "<loc>https://capfolder.com/help/</loc>",
    "<loc>https://capfolder.com/learn/safe/</loc>",
  ]);
  expect(read("package.json")).toMatch(/node sitemap\.mjs/);
  expect(read("robots.txt")).toContain("Sitemap: https://capfolder.com/sitemap.xml");
});

test("every click is counted: track.js on every page (in the build), named from the button text; form submits counted", async () => {
  for (const f of execSync("git ls-files '*.html'", { cwd: new URL(".", import.meta.url) })
    .toString()
    .trim()
    .split("\n"))
    expect([f, read(f).includes('<script defer src="/track.js"></script>')]).toEqual([f, true]);
  expect(read("package.json")).toMatch(/cp -r [^"]*\btrack\.js\b/);
  await import("./track.js");
  const name = (globalThis as unknown as { capfolderEventName(el: unknown): string }).capfolderEventName;
  const el = (text: string, label?: string) => ({
    textContent: text,
    getAttribute: (a: string) => (a === "aria-label" ? (label ?? null) : null),
  });
  expect(name(el("  What is a SAFE? "))).toBe("what-is-a-safe");
  expect(name(el("★ Star", "Star on GitHub"))).toBe("star-on-github");
  expect(name(el(" → "))).toBe("click");
  expect(html).toContain('window.umami?.track("download-form-submitted")');
  expect(html).toContain('window.umami?.track("pro-waitlist-submitted")');
});

const allPages = () =>
  execSync("git ls-files --cached --others --exclude-standard '*.html'", {
    cwd: new URL(".", import.meta.url),
  })
    .toString()
    .trim()
    .split("\n");

test("every page: a title, a description, a canonical URL, alt text on every image, and JSON-LD that parses", () => {
  for (const p of allPages()) {
    const page = read(p);
    const url = `https://capfolder.com/${p.replace(/index\.html$/, "")}`;
    expect([p, /<title>[^<]{10,}<\/title>/.test(page)]).toEqual([p, true]);
    expect([p, /<meta name="description" content="[^"]{50,170}">/.test(page)]).toEqual([p, true]);
    expect([p, page.includes(`<link rel="canonical" href="${url}">`)]).toEqual([p, true]);
    for (const img of page.match(/<img [^>]*>/g) ?? [])
      expect([p, img, /\balt="/.test(img)]).toEqual([p, img, true]);
    for (const ld of page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g))
      expect(() => JSON.parse(ld[1]!), p).not.toThrow();
  }
});

test("feature pages (/features/, /migrate/): ≤60-char title, ≤155-char description, OG tags, app + FAQ + HowTo JSON-LD, a done help page, listed on /features/", () => {
  const index = read("features/index.html");
  const feats = allPages().filter((p) => /^(features|migrate)\/[^/]+\/index\.html$/.test(p));
  expect(feats).toEqual(
    expect.arrayContaining(["features/import/index.html", "migrate/from-pulley/index.html"]),
  );
  const record = JSON.parse(read("features/pages.json"));
  for (const p of feats) {
    const page = read(p);
    const slug = p.replace(/index\.html$/, "");
    expect([p, (page.match(/<title>([^<]*)<\/title>/)?.[1] ?? "").length <= 60]).toEqual([p, true]);
    expect([
      p,
      (page.match(/<meta name="description" content="([^"]*)">/)?.[1] ?? "x".repeat(200)).length <= 155,
    ]).toEqual([p, true]);
    for (const og of ["og:title", "og:description", "og:image"])
      expect([p, page.includes(`property="${og}"`)]).toEqual([p, true]);
    const types = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
      (m) => JSON.parse(m[1]!)["@type"],
    );
    expect([p, types]).toEqual([p, ["SoftwareApplication", "FAQPage", "HowTo"]]);
    const help = page.match(/href="\/help\/([a-z-]+)\/"/)?.[1];
    expect([p, !!help && existsSync(new URL(`./help/${help}/index.html`, import.meta.url))]).toEqual([
      p,
      true,
    ]);
    expect([p, index.includes(`href="/${slug}"`)]).toEqual([p, true]);
    expect([p, !!record[slug.replace(/\/$/, "")]]).toEqual([p, true]);
  }
  expect(read("package.json")).toMatch(/cp -r [^"]*\bfeatures\b[^"]*\bmigrate\b/);
  expect(html).toContain('href="/features/"');
});

test("help/import is recorded in pages.json, its screenshots exist with their orange boxes, and the learn, compare and home pages link to the import pages", () => {
  const help = JSON.parse(read("help/pages.json"));
  expect(help.import.covers).toContain("apps/desktop/src/screens/Import.tsx");
  const page = read("help/import/index.html");
  for (const { file, hl } of JSON.parse(read("help/img/import.shots.json"))) {
    expect([file, existsSync(new URL(`./help/img/${file}`, import.meta.url))]).toEqual([file, true]);
    expect([file, page.includes(`/help/img/${file}`)]).toEqual([file, true]);
    for (const b of hl)
      expect(page).toContain(`left:${b.left}%;top:${b.top}%;width:${b.width}%;height:${b.height}%`);
  }
  for (const p of ["learn/cap-table/index.html", "learn/fully-diluted/index.html"])
    expect([p, read(p).includes('href="/features/import/"')]).toEqual([p, true]);
  expect(read("compare/pulley/index.html")).toContain('href="/migrate/from-pulley/"');
  expect(read("compare/carta/index.html")).toContain('href="/features/import/"');
  expect(html).toContain('href="/features/import/"');
  expect(read("help/index.html")).toContain('href="/help/import/"');
});

test("IndexNow: the key file sits at the site root and the script posts the sitemap's URLs", () => {
  const key = readdirSync(new URL(".", import.meta.url)).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
  expect(key).toBeTruthy();
  expect(read(key!).trim()).toBe(key!.replace(".txt", ""));
  expect(read("package.json")).toMatch(new RegExp(`cp -r [^"]*\\b${key!.replace(".", "\\.")}`));
  const script = readFileSync(new URL("../../scripts/indexnow.mjs", import.meta.url), "utf8");
  expect(script).toContain("https://api.indexnow.org/indexnow");
  expect(script).toContain("sitemap.xml");
});
