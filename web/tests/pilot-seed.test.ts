import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { E2E_BATCHES, buildPilotSeed, pilotPayloads } from "../e2e/seed/build-pilot-seed.mjs";

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const BOARD_R = readFileSync(at("../../docs/artifacts/2026-10-12-intellidrugs-reviewer.html"), "utf8");

describe("the e2e pilot seed (§11.4)", () => {
  const sql: string = buildPilotSeed(BOARD_R);

  it("the committed 10-pilot.sql is the generator's output (run `node e2e/seed/build-pilot-seed.mjs` after Board R changes)", () => {
    expect(readFileSync(at("../e2e/seed/10-pilot.sql"), "utf8")).toBe(sql);
  });

  it("seeds the ten pilot records into each e2e batch, the pilot batch newest", () => {
    expect(E2E_BATCHES).toEqual(["0001-pilot", "e2e-desk", "e2e-stale", "e2e-fail", "e2e-complete",
      "e2e-a11y-light", "e2e-a11y-dark", "e2e-a11y-forced"]);
    for (const b of E2E_BATCHES) expect(sql).toContain(`('${b}','in_review',10,`);
    expect(sql.match(/'DGDA-Drugs','186-0030-006--napa','pending'/g)).toHaveLength(8);
  });

  it("a seeded full run lists no concept ids, as the ETL writes a full run (the API's fullRuns() reads it so)", () => {
    expect(sql).toMatch(/INSERT INTO ops\.batch_run \(batch_id, run_at, stages, counts, concept_ids\) VALUES \('0001-pilot','[^']+','\{dgda,substances,clinical,ddinter\}','\{\}','\{\}'\);/);
  });

  it("snapshots use P0's v1 payload (etl build_payload), the shape SnapshotDiff reads", () => {
    const p = pilotPayloads(BOARD_R)["127-0163-052--chloramphenicol"] as {
      version: number; ingredients: { strength: Record<string, unknown>; codes: Record<string, unknown>[]; ddinter_chosen: string[]; route_assumed: boolean }[];
    };
    expect(Object.keys(p).sort()).toEqual(["brand", "clinical_drug", "extracted_at", "ingredients", "stages", "version"]);
    expect(p.version).toBe(1);
    const ing = p.ingredients[0];
    expect(Object.keys(ing).sort()).toEqual(["bds_id", "codes", "ddinter_chosen", "name", "route_assumed", "strength", "substance", "xm_code"]);
    expect(Object.keys(ing.strength).sort()).toEqual(["per_unit", "per_value", "raw", "unit", "value"]);
    expect(typeof ing.strength.value).toBe("string");                 // plain-number text, as _num() writes it
    expect(Object.keys(ing.codes[0]).sort()).toEqual(["code", "route_scope", "system"]);
    expect(ing.ddinter_chosen).toEqual(["DDInter352"]);               // the eye drop's ophthalmic entry (§1.5)
    expect(ing.route_assumed).toBe(false);
  });

  it("uses the post-fix DDInter notes: no DDInter351 pair, the eye drop's DDInter stage OK, 28 batch pairs", () => {
    expect(sql).not.toMatch(/text not found for [^;']*DDInter351/);
    expect(sql).toContain("('0001-pilot','127-0163-052--chloramphenicol','ddinter','ok','','{\"route\":\"ophthalmic\",\"text_missing\":[]}')");
    expect(sql.match(/^ \('DDInter\d+','DDInter\d+','(major|moderate|minor|unknown)'/gm)).toHaveLength(28);
  });

  it("is safe SQL: every quote in Board R's text is doubled, so each line holds an even number of quotes", () => {
    expect(sql).toContain("''");
    for (const line of sql.split("\n")) expect((line.match(/'/g) ?? []).length % 2, line).toBe(0);
  });
});
