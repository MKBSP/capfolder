import { strFromU8 } from "fflate";
import { describe, expect, test } from "vitest";
import { appendEvents } from "../src/append";
import { captableCsv } from "../src/captable-csv";
import { verifyChain } from "../src/chain";
import { lawyerDocPaths, lawyerPackage } from "../src/export/lawyer";
import { toPdf } from "../src/export/pdf";
import { cellText, DISCLAIMER, sheets } from "../src/export/sheets";
import { toXlsx } from "../src/export/xlsx";
import { unzip, zip } from "../src/export/zip";
import { toOcfExport } from "../src/ocf-export";
import { fromOcfExport } from "../src/ocf-import";
import { acmeEvents, ev, readFix } from "./helpers";

const AS_OF = "2026-10-07";
const base = acmeEvents();
const text = cellText;
const sheet = (name: string, events = base) => sheets(events, AS_OF).find((s) => s.name === name)!;

describe("sheets", () => {
  test("four tabs", () =>
    expect(sheets(base, AS_OF).map((s) => s.name)).toEqual(["Summary", "By person", "Vesting", "SAFEs"]));
  test("Summary has totals and every cap table row", () => {
    const rows = sheet("Summary").rows.map((r) => r.map(text));
    expect(rows).toContainEqual(["Fully diluted", "8000000"]);
    expect(rows).toContainEqual(["Option pool available", "920000"]);
    expect(rows).toContainEqual(["SAFEs outstanding (USD)", "900000"]);
    expect(rows).toContainEqual([
      "Tim Apple",
      "common",
      "Common",
      "4000000",
      "50.00",
      "3000000",
      "1000000",
      "",
      "",
      "",
      "",
      "missing",
    ]);
    expect(rows).toContainEqual([
      "Angel A",
      "safe",
      "",
      "",
      "",
      "",
      "",
      "150000",
      "8000000",
      "0.20",
      "1.88",
      "signed",
    ]);
  });
  test("By person", () => {
    const rows = sheet("By person").rows.map((r) => r.map(text));
    expect(rows[0]).toEqual([
      "Name",
      "Email",
      "Shares & options",
      "FD %",
      "Vested",
      "Unvested",
      "SAFE amount (USD)",
    ]);
    expect(rows.find((r) => r[0] === "Steve Wozniak")).toEqual([
      "Steve Wozniak",
      expect.any(String),
      "40000",
      "0.50",
      "10000",
      "30000",
      "",
    ]);
    expect(rows.find((r) => r[0] === "Fund X")?.[6]).toBe("250000");
  });
  test("Vesting", () => {
    const woz = sheet("Vesting")
      .rows.map((r) => r.map(text))
      .find((r) => r[0] === "Steve Wozniak")!;
    expect(woz.slice(0, 11)).toEqual([
      "Steve Wozniak",
      "OPT-1",
      "option",
      "40000",
      "40000",
      "10000",
      "30000",
      "2025-10-07",
      "2026-11-07",
      "833",
      "2029-10-07",
    ]);
  });
  test("SAFEs", () => {
    expect(sheet("SAFEs").rows.map((r) => r.map(text))).toEqual([
      ["Holder", "Type", "Amount (USD)", "Valuation cap", "Discount", "Post-money %", "Document"],
      ["Y Combinator", "safe", "500000", "10000000", "", "5.00", "signed"],
      ["Angel A", "safe", "150000", "8000000", "0.20", "1.88", "signed"],
      ["Fund X", "safe", "250000", "10000000", "", "2.50", "missing"],
    ]);
  });
  test("person scope only shows that person", () => {
    const s = sheets(base, AS_OF, { stakeholderId: "sh_woz" });
    const all = s
      .flatMap((x) => x.rows.flat().map(text))
      .join("|")
      .replace(DISCLAIMER, "");
    expect(all).toContain("Steve Wozniak");
    for (const other of ["Tim Apple", "Steve Jobs", "Bill Gates", "Y Combinator", "Fund X", "Angel A"])
      expect(all).not.toContain(other);
  });
});

describe("xlsx", () => {
  const files = unzip(toXlsx(sheets(base, AS_OF)));
  test("is a workbook with one sheet per tab", () => {
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining(["[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet4.xml"]),
    );
    expect(strFromU8(files["xl/workbook.xml"]!)).toContain('name="By person"');
  });
  test("numbers are numbers, written from exact strings", () => {
    const s1 = strFromU8(files["xl/worksheets/sheet1.xml"]!);
    expect(s1).toContain("<v>4000000</v>");
    expect(s1).toContain("<v>1.88</v>");
  });
  test("a formula-like name stays text and XML is escaped", () => {
    const evil = [
      ...base,
      ev("STAKEHOLDER", {
        id: "sh_tim",
        name: { legal_name: '=HYPERLINK("x")&<b>' },
        stakeholder_type: "INDIVIDUAL",
      }),
    ];
    const xml = strFromU8(unzip(toXlsx(sheets(evil, AS_OF)))["xl/worksheets/sheet1.xml"]!);
    expect(xml).not.toContain("<f>");
    expect(xml).toContain("=HYPERLINK(&quot;x&quot;)&amp;&lt;b&gt;");
  });
});

test("pdf renders, including names outside the PDF font", async () => {
  const pdf = await toPdf(sheets(base, AS_OF), "Acme Inc. cap table");
  expect(strFromU8(pdf.slice(0, 5))).toBe("%PDF-");
  const odd = [
    ...base,
    ev("STAKEHOLDER", { id: "sh_tim", name: { legal_name: "Zoë 李 ≈ →" }, stakeholder_type: "INDIVIDUAL" }),
  ];
  expect((await toPdf(sheets(odd, AS_OF), "x")).length).toBeGreaterThan(1000);
});

describe("lawyer package", () => {
  const generatedAt = "2026-10-10T12:00:00Z";
  test("everything", async () => {
    const paths = lawyerDocPaths(base, { kind: "all" });
    expect(paths).toEqual([
      "docs/safes/2022-01-10_y-combinator.pdf",
      "docs/safes/2023-02-20_angel-a.pdf",
      "docs/grants/2025-10-07_steve-wozniak.pdf",
    ]);
    expect(lawyerDocPaths(base, { kind: "person", stakeholderId: "sh_woz" })).toEqual([
      "docs/grants/2025-10-07_steve-wozniak.pdf",
    ]);
    const docs = Object.fromEntries(paths.map((p, i) => [p, i === 0 ? new Uint8Array([1, 2, 3]) : null]));
    const files = await lawyerPackage({
      events: base,
      asOf: AS_OF,
      docs,
      scope: { kind: "all" },
      generatedAt,
    });
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        "README.txt",
        "cap-table.xlsx",
        "cap-table.pdf",
        "cap-table.csv",
        "whats-missing.txt",
        "events.jsonl",
        "ocf/Manifest.ocf.json",
        `documents/${paths[0]}`,
      ]),
    );
    expect(files["events.jsonl"]).toBe(readFix("events.jsonl"));
    expect(files["cap-table.csv"]).toBe(readFix("captable.expected.csv"));
    const readme = files["README.txt"] as string;
    expect(readme).toContain("As of 2026-10-07");
    expect(readme).toContain(base.at(-1)!.hash);
    expect(readme).toContain("not a law firm");
    expect(readme).toContain(`Missing file: ${paths[1]}`);
    expect(files["whats-missing.txt"]).toContain("No signed document for Fund X's SAFE");
  });
  test("one person leaks nobody else", async () => {
    const scope = { kind: "person", stakeholderId: "sh_woz" } as const;
    const files = await lawyerPackage({ events: base, asOf: AS_OF, docs: {}, scope, generatedAt });
    expect(Object.keys(files).sort()).toEqual([
      "README.txt",
      "cap-table.pdf",
      "cap-table.xlsx",
      "whats-missing.txt",
    ]);
    const xlsx = Object.values(unzip(files["cap-table.xlsx"] as Uint8Array))
      .map((b) => strFromU8(b))
      .join("");
    const txt = `${files["README.txt"]}${files["whats-missing.txt"]}${xlsx}`;
    expect(txt).toContain("Steve Wozniak");
    for (const other of ["Tim Apple", "Steve Jobs", "Bill Gates", "Fund X"]) expect(txt).not.toContain(other);
  });
  test("removed documents are left out", () => {
    const removed = [...base, ev("doc_removed", { doc_id: "doc_yc_safe" })];
    expect(lawyerDocPaths(removed, { kind: "all" })).not.toContain("docs/safes/2022-01-10_y-combinator.pdf");
  });
});

describe("OCF round trip (M6 acceptance)", () => {
  const strip = (csv: string) =>
    csv
      .split("\n")
      .map((l) => l.replace(/,[^,]*$/, ""))
      .join("\n"); // drop doc_status: docs aren't in OCF
  test("export → zip → unzip → import gives the same cap table", async () => {
    const exported = toOcfExport(base, { asOf: "9999-12-31", generatedAt: "2026-10-10T12:00:00Z" });
    const back = Object.fromEntries(Object.entries(unzip(zip(exported))).map(([k, v]) => [k, strFromU8(v)]));
    const r = fromOcfExport(back);
    if ("errors" in r) throw new Error(r.errors.join("; "));
    let i = 0;
    const ctx = {
      now: () => new Date("2026-10-10T12:00:00Z"),
      newId: () => `evt_I${String(i++).padStart(6, "0")}`,
      deviceId: "d",
    };
    const out = await appendEvents("", r.drafts, ctx);
    if (!out.ok) throw new Error(out.errors.join("; "));
    expect((await verifyChain(out.text)).ok).toBe(true);
    for (const d of ["2021-09-14", "2023-01-01", "2025-10-07", AS_OF, "2030-01-01"])
      expect([d, strip(captableCsv(out.events, d))]).toEqual([d, strip(captableCsv(base, d))]);
  });
  test("works from a nested folder and reports bad files", () => {
    const exported = toOcfExport(base, { asOf: AS_OF, generatedAt: "2026-10-10T12:00:00Z" });
    const nested = Object.fromEntries(Object.entries(exported).map(([k, v]) => [`acme-ocf/${k}`, v]));
    expect("drafts" in fromOcfExport(nested)).toBe(true);
    expect(fromOcfExport({ "x.json": "{}" })).toEqual({
      errors: ["No OCF manifest found (a file with file_type OCF_MANIFEST_FILE)"],
    });
    const broken = {
      ...exported,
      "Stakeholders.ocf.json": JSON.stringify({
        file_type: "OCF_STAKEHOLDERS_FILE",
        items: [{ object_type: "STAKEHOLDER", id: "x" }],
      }),
    };
    expect((fromOcfExport(broken) as { errors: string[] }).errors[0]).toMatch(
      /^Stakeholders\.ocf\.json: STAKEHOLDER x: /,
    );
  });
});
