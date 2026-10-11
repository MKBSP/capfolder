import { describe, expect, test } from "vitest";
import { reduce } from "../src/reduce";
import { sortText } from "../src/sort";
import { acmeEvents, ev } from "./helpers";

const noDocs = acmeEvents().filter((e) => !e.type.startsWith("doc_"));
const state = reduce(noDocs, "9999-12-31");
const sort = (t: string, s = state) => sortText(t, s);

describe("M4 review: never file against the wrong row", () => {
  test("C1 a consent links only the grant whose name and count share a resolution", () => {
    const joao = sort(`ACME INC.
ACTION BY UNANIMOUS WRITTEN CONSENT OF THE BOARD OF DIRECTORS
Directors: Mads Petersen, Lisa Moreau
RESOLVED, that the Company grants an option to purchase 40,000 shares to João Silva under the 2025 Equity Incentive Plan.`);
    expect(joao.targets).toEqual(["OPT-2"]);
    const lisa140 = sort(`ACME INC.
ACTION BY UNANIMOUS WRITTEN CONSENT OF THE BOARD OF DIRECTORS
RESOLVED, that the Company grants an option to purchase 140,000 shares to Lisa Moreau.`);
    expect(lisa140.targets).toEqual([]);
  });
  test("C2 a grant notice, exercise, award or amendment headed with the plan name is not the plan", () => {
    for (const title of [
      "NOTICE OF GRANT OF STOCK OPTION",
      "NOTICE OF EXERCISE",
      "RSU AWARD AGREEMENT",
      "FIRST AMENDMENT TO THE 2025 EQUITY INCENTIVE PLAN",
    ]) {
      const r = sort(
        `ACME INC.\n2025 EQUITY INCENTIVE PLAN\n${title}\nOptionholder: Lisa Moreau\nNumber of Shares: 40,000`,
      );
      expect([title, r.status]).toEqual([title, "review"]);
    }
  });
  test("C3 side letters, amendments, exercise notices, offer letters and stock certificates need the founder", () => {
    const docs = [
      `SIDE LETTER\nThis letter relates to the Safe under which, in exchange for the payment by Y Combinator (the "Investor") of $500,000 (the "Purchase Amount") on or about January 10, 2022, the Company issued a Simple Agreement for Future Equity.`,
      `AMENDMENT TO SAFE\nThe Simple Agreement for Future Equity issued for the payment by Y Combinator (the "Investor") of $500,000 (the "Purchase Amount") on or about January 10, 2022 is amended.`,
      `STOCK OPTION EXERCISE NOTICE\nOptionholder: Lisa Moreau\nI exercise 40,000 shares pursuant to the Stock Option Agreement dated October 7, 2025.`,
      `OFFER LETTER\nEmployee: Lisa Moreau\nYou must sign the Company's Confidential Information and Invention Assignment Agreement.`,
      `STOCK CERTIFICATE\nACME INC.\nTHE SHARES ARE SUBJECT TO THE CERTIFICATE OF INCORPORATION OF ACME INC.`,
    ];
    for (const d of docs) expect([d.slice(0, 20), sort(d).status]).toEqual([d.slice(0, 20), "review"]);
  });
  test("C4 a phrase found only in the body never files itself", () => {
    const merged = `This Restricted Stock Purchase Agreement between Acme Inc. and Ana Ribeiro (the "Purchaser") covers 3,000,000 shares of the Company's Common Stock, entered into as of September 14, 2021; the Purchaser may file an election under Section 83(b) of the Internal Revenue Code within 30 days, as described in this agreement and in the exhibits attached to it.`;
    expect(sort(merged).status).toBe("review");
  });
  test("I7 no date and the holder has two holdings of that kind: review", () => {
    const two = reduce(
      [
        ...noDocs,
        ev("TX_STOCK_ISSUANCE", {
          id: "tx_ana2",
          date: "2024-01-01",
          security_id: "CS-9",
          stakeholder_id: "sh_ana",
          stock_class_id: "sc_common",
          quantity: "5000",
          share_price: { amount: "0.01", currency: "USD" },
          stock_legend_ids: [],
          security_law_exemptions: [],
        }),
      ],
      "9999-12-31",
    );
    const r = sort("STOCK PURCHASE AGREEMENT\nPurchaser: Ana Ribeiro\nShares: 3,000,000", two);
    expect(r.status).toBe("review");
    expect(sort("STOCK PURCHASE AGREEMENT\nPurchaser: Ana Ribeiro\nShares: 3,000,000").status).toBe("auto");
  });
  test("I5 only a rule may skip a document; AI or past choices saying 'not equity' go to the founder", () => {
    const ai = sortText("whatever", state, { proposal: { type: "not_equity", fields: {} } });
    expect(ai.status).toBe("review");
    const corpus = Array.from({ length: 5 }, () => ({
      type: "not_equity" as const,
      terms: { coffee: 3, lunch: 2 },
    }));
    expect(sortText("coffee lunch coffee lunch coffee", state, { corpus }).status).toBe("review");
  });
  test("I15 a consent that needs review keeps its proposed links", () => {
    const r = sort(`ACME INC.
ACTION BY UNANIMOUS WRITTEN CONSENT OF THE BOARD OF DIRECTORS
RESOLVED, that the 2025 Equity Incentive Plan is adopted.
RESOLVED, that the Company grants an option to purchase 40,000 shares to Lisa Moreau.
Dated: Septem[illegible]`);
    expect(r.status).toBe("review");
    expect(r.targets).toEqual(["plan_2025", "OPT-1"]);
  });
});

describe("M4 review: a holding's own document, not any linked one", () => {
  test("I6 an 83(b) or a board consent linked to a holding doesn't count as its signed document", async () => {
    const { computeGaps } = await import("../src/gaps");
    const s = reduce(
      [
        ...noDocs,
        ev("doc_added", {
          doc_id: "d1",
          path: "docs/83b/a.pdf",
          sha256: "a",
          doc_type: "83b",
          original_name: "a.pdf",
        }),
        ev("doc_linked", { doc_id: "d1", target: "CS-2" }),
        ev("doc_added", {
          doc_id: "d2",
          path: "docs/consents/b.pdf",
          sha256: "b",
          doc_type: "board_consent",
          original_name: "b.pdf",
        }),
        ev("doc_linked", { doc_id: "d2", target: "OPT-1" }),
      ],
      "2026-10-07",
    );
    const missing = computeGaps(s)
      .filter((g) => g.kind === "no_signed_doc")
      .map((g) => g.target);
    expect(missing).toContain("CS-2");
    expect(missing).toContain("OPT-1");
  });
});

describe("M7 review: real PDFs wrap their lines", () => {
  const { readdirSync, readFileSync } = require("node:fs") as typeof import("node:fs");
  const DIR = new URL("../../../fixtures/acme-docs/", import.meta.url);
  const expected = JSON.parse(readFileSync(new URL("expected.json", DIR), "utf8"));
  const wrap = (t: string) =>
    t
      .split("\n")
      .flatMap((l) => l.match(/.{1,90}(\s|$)|\S+/g)?.map((x) => x.trim()) ?? [""])
      .join("\n");
  test.each(readdirSync(DIR).filter((f: string) => f.endsWith(".txt")))("%s wrapped at 90 columns", (f) => {
    const r = sort(wrap(readFileSync(new URL(f, DIR), "utf8")));
    expect({ status: r.status, targets: r.targets }).toEqual({
      status: expected[f].status,
      targets: expected[f].targets,
    });
  });
  test("a real YC legend before the heading doesn't hide it", () => {
    const legend =
      "THIS INSTRUMENT AND ANY SECURITIES ISSUABLE PURSUANT HERETO HAVE NOT BEEN REGISTERED UNDER THE SECURITIES ACT OF 1933, AS AMENDED (THE “SECURITIES ACT”), OR UNDER THE SECURITIES LAWS OF CERTAIN STATES. THESE SECURITIES MAY NOT BE OFFERED, SOLD OR OTHERWISE TRANSFERRED, PLEDGED OR HYPOTHECATED EXCEPT AS PERMITTED UNDER THE ACT AND APPLICABLE STATE SECURITIES LAWS PURSUANT TO AN EFFECTIVE REGISTRATION STATEMENT OR AN EXEMPTION THEREFROM.";
    const yc = readFileSync(new URL("yc-safe.txt", DIR), "utf8").split("\n").slice(1).join("\n");
    expect(sort(wrap(`${legend}\n${yc}`)).status).toBe("auto");
  });
  test("a grant notice whose first paragraph mentions the Notice of Exercise is still a grant", () => {
    const g = readFileSync(new URL("grant-lisa.txt", DIR), "utf8").replace(
      "and the Option Agreement.",
      "and the Option Agreement, the Notice of Exercise and the Plan, all of which are attached.",
    );
    expect(sort(wrap(g)).status).toBe("auto");
  });
});

describe("M7 review: papers about an agreement are not the agreement", () => {
  test.each([
    "JOINDER TO STOCK PURCHASE AGREEMENT",
    "SPOUSAL CONSENT\nSTOCK PURCHASE AGREEMENT",
    "NOTICE OF REPURCHASE\nRESTRICTED STOCK PURCHASE AGREEMENT",
    "STOCK TRANSFER\nSTOCK PURCHASE AGREEMENT",
  ])("%s", (title) => {
    expect(sort(`${title}\nPurchaser: Ana Ribeiro\nShares: 3,000,000\nDate: September 14, 2021`).status).toBe(
      "review",
    );
  });
  test.each(["MFN LETTER", "PRO RATA RIGHTS LETTER"])("%s over a SAFE", (title) => {
    expect(
      sort(
        `${title}\nSIMPLE AGREEMENT FOR FUTURE EQUITY\nInvestor: Y Combinator\nPurchase Amount: $500,000\nDate: January 10, 2022`,
      ).status,
    ).toBe("review");
  });
  test("a resolution cancelling a grant doesn't link it as its approval", () => {
    const r = sort(`ACME INC.
ACTION BY UNANIMOUS WRITTEN CONSENT OF THE BOARD OF DIRECTORS
RESOLVED, that the option to purchase 40,000 shares held by João Silva is hereby cancelled.`);
    expect(r.targets).toEqual([]);
  });
});
