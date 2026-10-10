import { describe, expect, test } from "vitest";
import { validateOcf } from "../src/ocf/validate";

describe("validateOcf", () => {
  test("valid stakeholder passes", () => {
    expect(
      validateOcf({
        object_type: "STAKEHOLDER",
        id: "sh_1",
        name: { legal_name: "Ana" },
        stakeholder_type: "INDIVIDUAL",
      }),
    ).toEqual([]);
  });
  test("missing required field is reported", () => {
    const errs = validateOcf({ object_type: "STAKEHOLDER", id: "sh_1", stakeholder_type: "INDIVIDUAL" });
    expect(errs.join(" ")).toMatch(/name/);
  });
  test("unknown property is rejected", () => {
    const errs = validateOcf({
      object_type: "STAKEHOLDER",
      id: "sh_1",
      name: { legal_name: "A" },
      stakeholder_type: "INDIVIDUAL",
      shoe_size: 9,
    });
    expect(errs.length).toBeGreaterThan(0);
  });
  test("unknown object_type", () => {
    expect(validateOcf({ object_type: "NOPE" })).toEqual(["Unknown OCF object_type or file_type: NOPE"]);
  });
  test("OCF file schemas dispatch on file_type", () => {
    expect(validateOcf({ file_type: "OCF_STAKEHOLDERS_FILE", items: [] })).toEqual([]);
  });
});
