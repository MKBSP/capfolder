import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { computeGaps, isHoldingProof } from "../src/gaps";
import { reduce } from "../src/reduce";
import { sortText, unsignedSignal } from "../src/sort";
import { acmeEvents } from "./helpers";

const safe = readFileSync(new URL("../../../fixtures/acme-docs/angel-a-safe.txt", import.meta.url), "utf8");
const state = reduce(
  acmeEvents().filter((e) => !e.type.startsWith("doc_")),
  "9999-12-31",
);

describe("unsigned drafts never file themselves as proof", () => {
  test.each([
    ["DRAFT watermark", `DRAFT\n${safe}`, "DRAFT"],
    ["draft in the title", safe.replace("SIMPLE AGREEMENT", "Draft Simple Agreement"), "draft"],
    ["a form, not the agreement", safe.replace("SIMPLE AGREEMENT", "FORM OF SIMPLE AGREEMENT"), "form of"],
    ["discussion copy", `${safe}\nFor discussion purposes only.`, "for discussion purposes"],
    ["template blanks", safe.replace("Investor: Angel A", "Investor: [Investor Name]"), "[Investor Name]"],
    ["empty bullets", safe.replace("$150,000", "$[●]"), "[●]"],
  ])("%s", (_, text, signal) => {
    expect(unsignedSignal(text)).toBe(signal);
    const r = sortText(text, state);
    expect(r.status).toBe("review");
    expect(r.draft).toBe(signal);
    expect(r.problems.join(" ")).toContain("unsigned draft");
  });

  test("signed evidence wins: e-signature stamps, /s/, a digital signature in the PDF", () => {
    expect(unsignedSignal(`DRAFT\n${safe}\nDocuSign Envelope ID: 1234-ABCD`)).toBeUndefined();
    expect(unsignedSignal(`DRAFT\n${safe}\nBy: /s/ Tim Apple`)).toBeUndefined();
    expect(unsignedSignal(`DRAFT\n${safe}`, { signedPdf: true })).toBeUndefined();
    expect(sortText(safe, state).status).toBe("auto");
  });

  test("checkboxes and filled-in brackets in a signed document aren't blanks", () => {
    expect(unsignedSignal(`${safe}\n[X] accredited  [ ] not accredited\n[Name: Tim Apple]`)).toBeUndefined();
  });

  test("ordinary words don't count: 'drafted by', 'redraft', lowercase draft in prose", () => {
    expect(
      unsignedSignal(`${safe}\nThis agreement was drafted by counsel. Any redraft must be signed.`),
    ).toBeUndefined();
  });

  test("a document filed as a draft isn't proof: the gap stays open", () => {
    expect(isHoldingProof("safe", ["draft"])).toBe(false);
    expect(isHoldingProof("safe", [])).toBe(true);
    const events = acmeEvents().map((e) =>
      e.type === "doc_added" && String(e.data.doc_type).startsWith("safe")
        ? { ...e, data: { ...e.data, flags: ["draft"] } }
        : e,
    );
    const gaps = computeGaps(reduce(events, "2026-10-07")).filter((g) => g.kind === "no_signed_doc");
    expect(gaps.map((g) => g.target)).toContain("SAFE-1");
  });
});

describe("no visible signature: the founder confirms", () => {
  test("a clean, filled-in copy with no signature evidence asks instead of filing itself", () => {
    const r = sortText(safe.replace(/Signed: .*\n?/g, ""), state, { signed: false });
    expect(r.status).toBe("review");
    expect(r.noSignature).toBe(true);
    expect(r.problems.join(" ")).toContain("can't see a signature");
  });
  test("a PDF signature, an e-sign stamp, or a scan (OCR) is evidence enough", () => {
    expect(sortText(safe, state, { signed: true }).status).toBe("auto");
    expect(sortText(`${safe}\nDocuSign Envelope ID: 12-AB`, state, { signed: false }).status).toBe("auto");
  });
  test("papers that aren't signed by parties (bylaws, certificate) don't need it", () => {
    const bylaws = readFileSync(new URL("../../../fixtures/acme-docs/bylaws.txt", import.meta.url), "utf8");
    expect(sortText(bylaws, state, { signed: false }).noSignature).toBeUndefined();
  });
});
