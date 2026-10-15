// The launch page must not ship placeholders or claim things the app doesn't do (docs/09 M8).
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
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

test("cookieless analytics, no banner (docs/11)", () => {
  expect(html).toMatch(
    /<script defer data-domain="capfolder\.com" src="https:\/\/plausible\.io\/js\/script\.js"><\/script>/,
  );
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
  for (const named of ["Plausible", "Tally", "GitHub", "install ping", "Settings", "relay"])
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
    "5 signing requests a day",
    "No online backup",
    "Bring your own AI",
  ])
    expect([s, pricing.includes(s)]).toEqual([s, true]);
});
