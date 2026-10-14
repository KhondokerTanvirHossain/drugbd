import { describe, expect, it } from "vitest";
import {
  NAME_TYPE_LABEL, formRelation, genericRelation, hasStrength, nameRelation, rawName, strengthRelation, strengthText, xmRelation,
} from "@/lib/relations";
import { PILOT, pilotItem } from "./fixtures/pilot";

const all = PILOT.map((p) => pilotItem(p.conceptId));

describe("§5.5.2 relations on the 10 pilot records", () => {
  it("substance names", () => {
    expect(all.flatMap((r) => r.ingredients.map((g) => [r.brand!.tradeName, g.name, nameRelation(g)]))).toEqual([
      ["Amlodipine-5", "Amlodipine", { kind: "same" }],
      ["Aspirin", "Acetylsalicylic acid", { kind: "norm", sub: "Aspirin kept as the DGDA name" }],
      ["Simvastatin", "Simvastatin", { kind: "same" }],
      ["Chloramphenicol", "Chloramphenicol", { kind: "same" }],
      ["Domperidone", "Domperidone", { kind: "same" }],
      ["G Warfarin", "Warfarin", { kind: "salt", sub: "Removed: Sodium" }],
      ["G-Metformin", "Metformin", { kind: "salt", sub: "Removed: Hydrochloride" }],
      ["Napa", "Acetaminophen", { kind: "norm", sub: "Paracetamol kept as the DGDA name" }],
      ["Clarith", "Clarithromycin", { kind: "same" }],
      ["Amoxycillin Clavulanic Acid", "Clavulanic acid", { kind: "same", sub: "Capitalisation only" }],
      ["Amoxycillin Clavulanic Acid", "Amoxicillin", { kind: "same" }],
    ]);
  });

  it("strengths", () => {
    expect(all.flatMap((r) => r.ingredients.map((g) => [strengthText(g), strengthRelation(g)]))).toEqual([
      ["5 mg", { kind: "same" }], ["300 mg", { kind: "same" }], ["10 mg", { kind: "same" }],
      ["5 mg per 1 ml", { kind: "norm", sub: "Written as 5 mg per 1 ml" }],
      ["10 mg", { kind: "same" }], ["5 mg", { kind: "same" }], ["500 mg", { kind: "same" }], ["500 mg", { kind: "same" }],
      ["500 mg", { kind: "same" }], ["125 mg", { kind: "same" }], ["500 mg", { kind: "same" }],
    ]);
  });

  it("generic content: one or both ingredients and strengths found", () => {
    expect(all.map((r) => genericRelation(r.brand!.genericContentRaw, r.ingredients))).toEqual([
      ...Array(9).fill({ kind: "same", sub: "Ingredient and strength found" }),
      { kind: "same", sub: "Both ingredients and strengths found" },
    ]);
  });

  it("dosage forms all match, and every DGDA XM code has its substance", () => {
    expect(all.map((r) => formRelation(r.brand!.dosageForm, r.clinicalDrug!.doseForm))).toEqual(Array(10).fill({ kind: "same" }));
    for (const r of all)
      for (const x of r.dgdaIngredients) expect(xmRelation(x.xmCode, r.ingredients).relation).toEqual({ kind: "same" });
    expect(xmRelation("XM2K88", pilotItem("amoxycillin").ingredients).match!.name).toBe("Clavulanic acid");
  });
});

describe("the rules themselves", () => {
  const g = pilotItem("g-warfarin").ingredients[0];

  it("rawName strips the trailing strength", () => {
    expect(rawName(g)).toBe("Warfarin Sodium");
    expect(rawName({ ...g, raw: "Amoxicillin 500 mg + Clavulanic Acid 125 mg" })).toBe("Amoxicillin");
  });

  it("hasStrength needs the exact number, unit and per, not a longer number", () => {
    expect(hasStrength("Warfarin Sodium 5 mg", g)).toBe(true);
    expect(hasStrength("Warfarin Sodium 15 mg", g)).toBe(false);
    expect(hasStrength("Warfarin Sodium 5 mg/ml", g)).toBe(true);
    expect(hasStrength("Warfarin Sodium 5.5 mg", g)).toBe(false);
    expect(hasStrength("Warfarin Sodium 0.5 mg", g)).toBe(false);
    expect(hasStrength("x 5 MG", g)).toBe(true);
    const drops = pilotItem("chloramphenicol").ingredients[0];
    expect(hasStrength("Chloramphenicol 5 mg/ml", drops)).toBe(true);
    expect(hasStrength("Chloramphenicol 5 mg/10 ml", { ...drops, perValue: 10 })).toBe(true);
    expect(hasStrength("Chloramphenicol 5 mg/ml", { ...drops, perValue: 10 })).toBe(false);
    expect(hasStrength("Chloramphenicol 5 mg/10ml", { ...drops, perValue: 10 })).toBe(false);
  });

  it("differs cases", () => {
    expect(formRelation("Tablet", "Capsule")).toEqual({ kind: "differs" });
    expect(formRelation("Tablet", "tablet")).toEqual({ kind: "same", sub: "Capitalisation only" });
    expect(formRelation("Tablet", null)).toEqual({ kind: "differs" });
    expect(nameRelation({ ...g, raw: "Heparin 5 mg" })).toEqual({ kind: "differs" });
    expect(strengthRelation({ ...g, raw: "Warfarin Sodium 2 mg" })).toEqual({ kind: "differs" });
    expect(strengthRelation({ ...g, strengthValue: null })).toEqual({ kind: "differs" });
    expect(genericRelation("Warfarin 2 mg", [g])).toEqual({ kind: "differs" });
    expect(xmRelation("XM0000", [g])).toEqual({ relation: { kind: "differs", sub: "No substance carries this code" }, match: null });
  });

  it("strength text has no trailing zeros and names the per", () => {
    expect(strengthText({ ...g, strengthValue: 0.5, strengthUnit: "%" })).toBe("0.5 %");
    expect(strengthText({ ...g, strengthValue: null })).toBe("");
    expect(NAME_TYPE_LABEL).toEqual({ icd11: "ICD-11", rxnorm: "RxNorm", dgda_content: "DGDA", ddinter: "DDInter" });
  });
});
