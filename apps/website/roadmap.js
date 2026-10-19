// The public roadmap, one copy for every page: <div data-roadmap data-vs="carta"></div> then <script src="/roadmap.js" defer>.
// data-vs marks the items that close a gap with that tool. Keep internal infrastructure out (site.test.ts).
const ROADMAP = {
  done: [
    { t: "Try a sample company before you enter your own", v: "0.1.3" },
    { t: "A Get started checklist and a guided tour", v: "0.1.3" },
    { t: "Ask AI: a side panel that proposes changes for you to confirm", v: "0.1.3" },
    { t: "Help pages with screenshots", v: "Oct 2026" },
  ],
  now: [
    { t: "Templates you can add your own clauses to" },
    { t: "More help pages: import, option pool and grants, SAFEs, filing documents" },
  ],
  next: [
    {
      t: "409A valuations: record them, get warned before one expires or a grant is priced below it",
      vs: ["carta", "pulley", "sumoshares"],
    },
    {
      t: "Option deadlines: see when someone's vested options expire after they leave",
      vs: ["carta", "sumoshares"],
    },
    {
      t: "After an import, type in your Pulley or Carta totals and see that they match",
      vs: ["pulley", "carta", "sumoshares"],
    },
    {
      t: "Pro: sync across computers, encrypted online backup, no limit on signing requests, AI included",
      vs: ["carta", "pulley"],
    },
    {
      t: "AI that reads your vesting plan, option plan or grant letter and sets up the matching terms for you to confirm",
    },
  ],
  later: [
    {
      t: "Investors and employees see their own holdings, and exercise options online",
      vs: ["carta", "pulley", "sumoshares"],
    },
    { t: "Round modelling, waterfalls, and SAFE conversion at a priced round", vs: ["carta", "pulley"] },
    { t: "Exercise reports for US tax forms (Form 3921 inputs)", vs: ["carta", "sumoshares"] },
    { t: "Installers signed by Apple and Microsoft, so your computer stops warning you" },
    { t: "Company templates outside the US (Portugal, Denmark, UK)" },
  ],
};
const COLS = [
  ["now", "Now"],
  ["next", "Next"],
  ["later", "Later"],
  ["done", "Done recently"],
];
const NAMES = { carta: "Carta", pulley: "Pulley", sumoshares: "SumoShares" };
const ISSUES = "https://github.com/MKBSP/capfolder/issues";

const esc = (s) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const css = document.createElement("style");
css.textContent = `.rm{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;align-items:start}
.rm-col{background:#fff;border:1px solid #E4E4E0;border-radius:16px;padding:20px}.rm-col.now{border-color:#1F6F4A}.rm-col.done{background:#F3F8F4}
.rm-col h3{font-size:16px;font-weight:600;margin:0}.rm-col ul{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:10px;font-size:15px;line-height:1.5;color:#3A3E46}
.rm-col li{display:flex;gap:8px}.rm-col li>span:first-child{color:#1F6F4A}.rm-tag{display:inline-block;margin-left:6px;font-size:12px;padding:1px 7px;border-radius:999px;background:#FFF1E0;color:#8A4A00;white-space:nowrap}
.rm-v{color:#5B606B;font-size:13px}.rm-links{display:flex;flex-wrap:wrap;gap:10px 22px;margin:16px 0 0;font-size:15px}`;
document.head.append(css);

for (const el of document.querySelectorAll("[data-roadmap]")) {
  const vs = el.dataset.vs;
  const item = (x) =>
    `<li><span aria-hidden="true">${x.v ? "✓" : "→"}</span><span>${esc(x.t)}${x.v ? ` <span class="rm-v">${esc(x.v)}</span>` : ""}${
      vs && x.vs?.includes(vs) ? `<span class="rm-tag">closes a gap with ${NAMES[vs]}</span>` : ""
    }</span></li>`;
  el.innerHTML = `<div class="rm">${COLS.map(
    ([k, h]) => `<div class="rm-col ${k}"><h3>${h}</h3><ul>${ROADMAP[k].map(item).join("")}</ul></div>`,
  ).join("")}</div>
<p class="rm-links"><a href="/roadmap/">Full roadmap</a><a href="${ISSUES}/new?template=feature.yml" data-umami-event="roadmap-request">Request a feature</a><a href="${ISSUES}/new?template=bug.yml">Report a bug</a><a href="${ISSUES}?q=is%3Aissue+is%3Aopen+label%3Afeature+sort%3Areactions-%2B1-desc">Vote on requests (👍)</a></p>`;
}
