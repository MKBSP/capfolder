import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { expect, test } from "vitest";
import { type Form, fillForm, renderForm, ycSafeValues } from "../src/export/form";

const form = (n: string): Form =>
  JSON.parse(readFileSync(new URL(`../../../templates/yc/${n}.json`, import.meta.url), "utf8"));
const text = (f: Form) => f.paragraphs.map((p) => p.runs.map((r) => r.t).join("")).join("\n");
const values = ycSafeValues({
  company: "Acme Inc.",
  investor: "Fund Y",
  amount: "250000",
  cap: "10000000",
  discount: "0.20",
  date: "2026-10-14",
  state: "Delaware",
  signerName: "Tim Apple",
  signerTitle: "CEO",
});

test("fills every blank in the cap SAFE and changes nothing else", () => {
  const f = form("safe-cap");
  const out = text(fillForm(f, values));
  expect(out).not.toMatch(/\[[^\]]*\]/);
  expect(out).toContain(
    "payment by Fund Y (the “Investor”) of $250,000 (the “Purchase Amount”) on or about October 14, 2026, Acme Inc., a Delaware corporation",
  );
  expect(out).toContain("The “Post-Money Valuation Cap” is $10,000,000.");
  expect(out).toContain("laws of the State of Delaware");
  // put the blanks back: the result is the original text, character for character
  const back = out
    .replace("payment by Fund Y", "payment by [Investor Name]")
    .replace("of $250,000 (", "of $[_____________] (")
    .replace("October 14, 2026", "[Date of Safe]")
    .replace("Cap” is $10,000,000.", "Cap” is $[_____________].")
    .replace("a Delaware corporation", "a [State of Incorporation] corporation")
    .replace("State of Delaware", "State of [Governing Law Jurisdiction]")
    .replace(/^Acme Inc\.$/m, "[Company Name]")
    .replace(", Acme Inc., a", ", [Company Name], a")
    .replace(/^ACME INC\.$/m, "[COMPANY]")
    .replace("Tim Apple", "[name]")
    .replace(/^CEO$/m, "[title]");
  expect(back).toBe(text(f));
});

test("discount SAFE: the Discount Rate is 100 minus the discount", () => {
  expect(text(fillForm(form("safe-discount"), values))).toContain("The “Discount Rate” is 80%");
});

test("an unknown blank is left visible, never guessed", () => {
  const f: Form = {
    ...form("safe-mfn"),
    paragraphs: [{ indent: 0, first: 0, runs: [{ t: "Pay [Something New]." }] }],
  };
  expect(text(fillForm(f, values))).toBe("Pay [Something New].");
});

test.each(["safe-cap", "safe-discount", "safe-mfn", "pro-rata-side-letter"])(
  "%s: YC's signature page is its own last page, with the company's then the investor's By: line",
  async (name) => {
    const r = await renderForm(fillForm(form(name), values));
    const doc = await PDFDocument.load(r.pdf);
    expect(r.signaturePage).toBe(doc.getPageCount());
    expect(r.signaturePage).toBeGreaterThan(1);
    expect(r.by.map((b) => b.page)).toEqual([r.signaturePage, r.signaturePage]);
    const [company, investor] = r.by;
    expect(company!.y).toBeLessThan(investor!.y); // company block first, higher up the page
    for (const b of r.by) expect(b.x + b.w).toBeLessThanOrEqual(100);
  },
);
