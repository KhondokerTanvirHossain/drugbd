import { describe, expect, it } from "vitest";
import { summariseSource } from "../lib/evidence";

describe("summariseSource", () => {
  it("keeps extras and active-ingredient mappings only, and the OCL link", () => {
    const raw = JSON.stringify({
      id: "341-0160-020--tericin",
      extras: { trade_name: "Tericin", generic_content_raw: "Amphotericin B  50 mg/vial" },
      mappings: [
        { map_type: "Has-active-ingredient", to_concept_code: "XM5TR4", to_concept_name: "Amphotericin B", retired: false, checksums: {} },
        { map_type: "Same-as", to_concept_code: "X", to_concept_name: "Y", retired: false },
      ],
    });
    expect(summariseSource(raw)).toEqual({
      extras: { trade_name: "Tericin", generic_content_raw: "Amphotericin B  50 mg/vial" },
      ingredients: [{ code: "XM5TR4", name: "Amphotericin B", retired: false }],
      oclUrl: "https://tr.ocl.dghs.gov.bd/#/orgs/MoHFW/sources/DGDA-Drugs/concepts/341-0160-020--tericin/",
    });
  });
  it("returns null when there is no source snapshot", () => {
    expect(summariseSource(null)).toBeNull();
  });
  it("returns null instead of throwing on malformed JSON", () => {
    expect(summariseSource("{not json")).toBeNull();
  });
});
