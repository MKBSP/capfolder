// The launch page must not ship placeholders or claim things the app doesn't do (docs/09 M8).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const read = (p: string) => readFileSync(new URL(`./${p}`, import.meta.url), "utf8");
const comparePages = () =>
  readdirSync(new URL("./compare", import.meta.url), { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "img")
    .map((d) => `compare/${d.name}/index.html`);
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

test("cookieless analytics, no banner (docs/11): Umami Cloud with a real website id", () => {
  expect(html).toMatch(
    /<script defer src="https:\/\/cloud\.umami\.is\/script\.js" data-website-id="[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"><\/script>/,
  );
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
    expect(p.checked).toMatch(/^v\d+\.\d+\.\d+$/);
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
