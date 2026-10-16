import { describe, expect, it } from "vitest";
import { countChips, joinAnd, medicinesOnly, summarySentence } from "@/lib/check-summary";
import type { CheckResult, Side } from "@/lib/public-types";
import { emptyCheck } from "./fixtures/public";

const side = (conceptId: string, tradeName: string, name: string, bdsId: string | null = "BDS-x"): Side =>
  ({ conceptId, tradeName, bdsId, name, routeScope: null });
const summary = (over: Partial<CheckResult["summary"]>) => ({ ...emptyCheck().summary, ...over });

describe("summary sentence (§6.7.2, §11.1 check-summary)", () => {
  it("fewer than 2 medicines", () => {
    expect(summarySentence(null, 0)).toBe("Add at least 2 medicines to check them against each other.");
    expect(summarySentence(null, 1)).toBe("Add at least 2 medicines to check them against each other.");
  });

  it("the base sentence with plurals", () => {
    expect(summarySentence(emptyCheck({ summary: summary({ medicines: 2, totalPairs: 1, checkedPairs: 1, alertPairs: 1 }) }), 2))
      .toBe("2 medicines · 1 of 1 pair checked · 1 with an interaction listed");
    expect(summarySentence(emptyCheck({ summary: summary({ medicines: 3, totalPairs: 3, checkedPairs: 3, alertPairs: 0 }) }), 3))
      .toBe("3 medicines · 3 of 3 pairs checked · 0 with an interaction listed");
  });

  it("all not-checked pairs are no_data: they name the substances; one name 'has', more 'have'", () => {
    const r = emptyCheck({ summary: summary({ medicines: 3, totalPairs: 3, checkedPairs: 1, alertPairs: 1, notCheckedPairs: 2 }),
      notChecked: [
        { a: side("W", "G Warfarin", "Warfarin"), b: side("D", "Domperidone", "Domperidone"), reason: "no_data", side: "b" },
        { a: side("A", "Aspirin", "Acetylsalicylic acid"), b: side("D", "Domperidone", "Domperidone"), reason: "no_data", side: "b" }] });
    expect(summarySentence(r, 3)).toBe("3 medicines · 1 of 3 pairs checked · 1 with an interaction listed · 2 pairs not checked because Domperidone has no interaction data");
  });

  it("both sides no_data (API sets side 'a'): the opposite side's no-data substance is named too", () => {
    const sub = (bdsId: string, name: string, coverage: "none" | "full") => ({ bdsId, name, coverage, ddinter: [] });
    const r = emptyCheck({ summary: summary({ medicines: 2, totalPairs: 1, checkedPairs: 0, alertPairs: 0, notCheckedPairs: 1 }),
      products: [
        { conceptId: "D", tradeName: "Domperidone", route: null, substances: [sub("BDS-D", "Domperidone", "none")] },
        { conceptId: "X", tradeName: "X", route: null, substances: [sub("BDS-X", "X", "none")] }],
      notChecked: [{ a: side("D", "Domperidone", "Domperidone", "BDS-D"), b: side("X", "X", "X", "BDS-X"), reason: "no_data", side: "a" }] });
    expect(summarySentence(r, 2)).toBe("2 medicines · 0 of 1 pair checked · 0 with an interaction listed · 1 pair not checked because Domperidone and X have no interaction data");
  });

  it("the opposite side is not named when its substance has data, or a same-named substance elsewhere has none", () => {
    const sub = (bdsId: string, name: string, coverage: "none" | "full") => ({ bdsId, name, coverage, ddinter: [] });
    const r = emptyCheck({ summary: summary({ medicines: 3, totalPairs: 1, checkedPairs: 0, notCheckedPairs: 1 }),
      products: [
        { conceptId: "D", tradeName: "Domperidone", route: null, substances: [sub("BDS-D", "Domperidone", "none")] },
        { conceptId: "W", tradeName: "G Warfarin", route: null, substances: [sub("BDS-W", "Warfarin", "full")] },
        { conceptId: "W2", tradeName: "Other", route: null, substances: [sub("BDS-W", "Warfarin", "none")] }],
      notChecked: [{ a: side("D", "Domperidone", "Domperidone", "BDS-D"), b: side("W", "G Warfarin", "Warfarin", "BDS-W"), reason: "no_data", side: "a" }] });
    expect(summarySentence(r, 3)).toBe("3 medicines · 0 of 1 pair checked · 0 with an interaction listed · 1 pair not checked because Domperidone has no interaction data");
  });

  it("other reasons give the generic segment; not-reviewed medicines are counted", () => {
    const r = emptyCheck({ summary: summary({ medicines: 3, totalPairs: 1, checkedPairs: 0, notCheckedPairs: 1, notReviewed: 1 }),
      notChecked: [{ a: side("W", "G Warfarin", "Warfarin"), b: side("O", "Otimol", "Oticmol"), reason: "no_route", side: "b" }] });
    expect(summarySentence(r, 3)).toBe("3 medicines · 0 of 1 pair checked · 0 with an interaction listed · 1 pair not checked · 1 medicine not yet reviewed by a pharmacist");
  });

  it("a combination product plus one other: same-product pairs are not counted and the no-data wording still applies", () => {
    const r = emptyCheck({ summary: summary({ medicines: 2, totalPairs: 2, checkedPairs: 1, alertPairs: 0, noInteractionPairs: 1, notCheckedPairs: 1 }),
      notChecked: [
        { a: side("AMC", "Moxaclav", "Amoxicillin"), b: side("AMC", "Moxaclav", "Clavulanic acid"), reason: "same_product", side: "a" },
        { a: side("AMC", "Moxaclav", "Clavulanic acid"), b: side("D", "Domperidone", "Domperidone"), reason: "no_data", side: "b" }] });
    expect(summarySentence(r, 2)).toBe("2 medicines · 1 of 2 pairs checked · 0 with an interaction listed · 1 pair not checked because Domperidone has no interaction data");
    expect(countChips(r)).toEqual({ severities: [], noData: 1, other: 0 });
  });

  it("two products with the same substance: the duplicate is not counted", () => {
    const r = emptyCheck({ summary: summary({ medicines: 2 }), duplicates: [{ bdsId: "BDS-1", name: "Warfarin", conceptIds: ["W", "W2"] }] });
    expect(summarySentence(r, 2)).toBe("2 medicines · 0 of 0 pairs checked · 0 with an interaction listed");
  });

  it("the Not checked chip counts no_data only; other reasons are the plain count", () => {
    const r = emptyCheck({ summary: summary({ notCheckedPairs: 3, bySeverity: { major: 1, moderate: 0, minor: 2, unknown: 4 } }),
      notChecked: [
        { a: side("W", "W", "Warfarin"), b: side("D", "D", "Domperidone"), reason: "no_data", side: "b" },
        { a: side("W", "W", "Warfarin"), b: side("O", "O", "Oticmol"), reason: "no_route", side: "b" },
        { a: side("W", "W", "Warfarin"), b: side("N", "N", "Newmol", null), reason: "unmapped", side: "b" }] });
    expect(countChips(r)).toEqual({ severities: [["major", 1], ["minor", 2], ["unknown", 4]], noData: 1, other: 2 });
  });

  it("helpers", () => {
    expect(medicinesOnly(1)).toBe("1 medicine");
    expect(medicinesOnly(4)).toBe("4 medicines");
    expect([joinAnd([]), joinAnd(["A"]), joinAnd(["A", "B"]), joinAnd(["A", "B", "C"])]).toEqual(["", "A", "A and B", "A, B and C"]);
  });
});
