import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { reduce } from "../src/reduce";
import { classify, extract, nearest, type SortType, sortText, termCounts } from "../src/sort";
import { acmeEvents, ev } from "./helpers";

const DIR = new URL("../../../fixtures/acme-docs/", import.meta.url);
const txt = (f: string) => readFileSync(new URL(f, DIR), "utf8");
const expected: Record<
  string,
  { status: string; type: string | null; targets: string[]; suggestion?: string }
> = JSON.parse(txt("expected.json"));
const noDocs = acmeEvents().filter((e) => !e.type.startsWith("doc_"));
const state = reduce(noDocs, "9999-12-31");

describe("acme-docs golden (F-09)", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".txt"));
  test.each(files)("%s", (f) => {
    const r = sortText(txt(f), state);
    const want = expected[f]!;
    expect({ status: r.status, type: r.type, targets: r.targets, suggestion: r.suggestion }).toEqual({
      status: want.status,
      type: want.type,
      targets: want.targets,
      suggestion: want.suggestion,
    });
  });
  test("0 filed wrong, ≥80% of the clean equity documents filed automatically", () => {
    const results = files.map((f) => ({ f, r: sortText(txt(f), state), want: expected[f]! }));
    const auto = results.filter((x) => x.r.status === "auto");
    expect(
      auto.filter((x) => x.want.status !== "auto" || x.r.targets.join() !== x.want.targets.join()),
    ).toEqual([]);
    expect(auto.length / results.filter((x) => x.want.status === "auto").length).toBeGreaterThanOrEqual(0.8);
  });
});

describe("classify", () => {
  test("a grant notice that names the plan is a grant", () =>
    expect(classify(txt("grant-lisa.txt"))?.type).toBe("option_grant"));
  test("an SPA that mentions 83(b) is an SPA", () => expect(classify(txt("spa-mads.txt"))?.type).toBe("spa"));
  test("a board consent adopting the plan is a consent", () =>
    expect(classify(txt("board-consent-2025.txt"))?.type).toBe("board_consent"));
  test("an invoice that mentions shares is not skipped", () =>
    expect(classify("INVOICE\nLegal fees for the Stock Purchase Agreement\nTotal due $500")?.type).toBe(
      "spa",
    ));
  test("nothing recognisable", () => expect(classify("hello there")).toBeNull());
});

describe("extract", () => {
  test("YC SAFE fields", () =>
    expect(extract("safe", txt("yc-safe.txt"))).toEqual({
      name: "Y Combinator",
      amount: "500000",
      date: "2022-01-10",
      cap: "10000000",
      company: "Acme Inc.",
    }));
  test("YC's Discount Rate is 100 minus the discount", () =>
    expect(extract("safe", 'The "Discount Rate" is 80%.').discount).toBe("0.20"));
  test("a labelled discount is the discount", () =>
    expect(extract("safe", "Discount: 15%").discount).toBe("0.15"));
  test("a number OCR couldn't read is unreadable, not guessed", () =>
    expect(extract("safe", txt("scan_0042.txt")).cap).toBe("unreadable"));
  test("grant notice", () =>
    expect(extract("option_grant", txt("grant-lisa.txt"))).toMatchObject({
      name: "Lisa Moreau",
      shares: "40000",
      price: "0.12",
      date: "2025-10-07",
    }));
  test("83(b)", () =>
    expect(extract("83b", txt("83b-ana.txt"))).toMatchObject({
      name: "Ana Ribeiro",
      shares: "3000000",
      date: "2021-09-14",
    }));
});

describe("matching", () => {
  test("the date may be 3 days off, not 4", () => {
    const at = (d: string) =>
      sortText(txt("grant-lisa.txt").replace("Date of Grant: October 7, 2025", `Date of Grant: ${d}`), state);
    expect(at("October 10, 2025").status).toBe("auto");
    expect(at("October 11, 2025")).toMatchObject({ status: "review", suggestion: "OPT-1" });
  });
  test("an alias makes another name match", () => {
    const aliased = reduce(
      [...noDocs, ev("stakeholder_alias", { stakeholder_id: "sh_fundx", alias: "Fund X Ventures I, L.P." })],
      "9999-12-31",
    );
    const r = sortText(txt("scan_0042.txt").replace("$1[illegible],000,000", "$10,000,000"), aliased);
    expect(r).toMatchObject({ status: "auto", targets: ["SAFE-3"] });
  });
  test("a holding that already has its document is never filed again automatically", () => {
    const withDoc = reduce(acmeEvents(), "9999-12-31"); // the fixture already has the YC SAFE linked
    const r = sortText(txt("yc-safe.txt"), withDoc);
    expect(r.status).toBe("review");
    expect(r.problems.join(" ")).toMatch(/already has/);
  });
  test("two holdings with the same number and no name match: no suggestion", () => {
    const r = sortText(txt("grant-joao.txt").replace("João Silva", "Someone Else"), state);
    expect(r).toMatchObject({ status: "review", suggestion: undefined });
  });
});

describe("nearest (kNN)", () => {
  const corpus = (type: SortType, n: number, text: string) =>
    Array.from({ length: n }, () => ({ type, terms: termCounts(text) }));
  const letter = "Side letter granting pro rata rights and information rights to the investor";
  test("4 of 5 neighbours agree", () =>
    expect(nearest(termCounts(letter), [...corpus("other", 4, letter), ...corpus("safe", 1, letter)])).toBe(
      "other",
    ));
  test("3 of 5 is not enough", () =>
    expect(
      nearest(termCounts(letter), [...corpus("other", 3, letter), ...corpus("safe", 2, letter)]),
    ).toBeNull());
  test("dissimilar documents don't count", () =>
    expect(nearest(termCounts("bylaws of the corporation"), corpus("other", 5, letter))).toBeNull());
});
