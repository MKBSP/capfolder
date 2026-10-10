import { md5 } from "js-md5";
import { expect, test } from "vitest";
import { validateOcf } from "../src/ocf/validate";
import { toOcfExport } from "../src/ocf-export";
import { acmeEvents, ev } from "./helpers";

const opts = { asOf: "2026-10-07", generatedAt: "2026-10-07T12:00:00Z" };
const files = toOcfExport(acmeEvents(), opts);

test("writes the manifest and the object files", () => {
  expect(Object.keys(files).sort()).toEqual([
    "Manifest.ocf.json",
    "Stakeholders.ocf.json",
    "StockClasses.ocf.json",
    "StockLegends.ocf.json",
    "StockPlans.ocf.json",
    "Transactions.ocf.json",
    "Valuations.ocf.json",
    "VestingTerms.ocf.json",
  ]);
});
test("every file validates against OCF 1.2.0", () => {
  for (const [name, text] of Object.entries(files))
    expect([name, validateOcf(JSON.parse(text))]).toEqual([name, []]);
});
test("manifest md5s match file contents", () => {
  const m = JSON.parse(files["Manifest.ocf.json"]!);
  expect(m.stakeholders_files[0]).toEqual({
    filepath: "./Stakeholders.ocf.json",
    md5: md5(files["Stakeholders.ocf.json"]!),
  });
});
test("all 11 acme transactions are exported", () => {
  expect(JSON.parse(files["Transactions.ocf.json"]!).items).toHaveLength(11);
});
test("reversed transactions are left out, corrections applied", () => {
  const out = toOcfExport(
    [
      ...acmeEvents(),
      ev("reversal", { target: "evt_0018", reason: "dup" }),
      ev("correction", {
        target: "evt_0012",
        field: "quantity",
        old: "4000000",
        new: "3900000",
        reason: "typo",
      }),
    ],
    opts,
  );
  expect(out["Transactions.ocf.json"]).not.toContain("tx_safe_fundx");
  expect(out["Transactions.ocf.json"]).toContain('"quantity": "3900000"');
});
test("transactions after asOf are left out", () => {
  expect(toOcfExport(acmeEvents(), { ...opts, asOf: "2023-01-01" })["Transactions.ocf.json"]).not.toContain(
    "tx_opt_lisa",
  );
});
