import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  P, PILOT_IDS, PILOT_SNAPSHOT as S, actionCounts, codeCount, entryName, severityCounts, substanceNamed, type PilotId,
} from "@/content/learn/pilot-snapshot";

/** The concept ids of batch 0001-pilot in the CI seed, which is what /v1/stats reports in the e2e stack (§6.8). */
function seededPilotIds(): string[] {
  const sql = readFileSync(fileURLToPath(new URL("../e2e/seed/10-pilot.sql", import.meta.url)), "utf8");
  const ids = new Set<string>();
  for (const block of sql.split("INSERT INTO ").filter((b) => b.startsWith("ops.batch_item "))) {
    for (const m of block.split(";")[0].matchAll(/\('0001-pilot',\s*'[^']*',\s*'([^']+)'/g)) ids.add(m[1]);
  }
  return [...ids].sort();
}
const CONTENT = fileURLToPath(new URL("../content/learn/", import.meta.url));

/** Board R's embedded pilot export: the source P1B's e2e seed is built from (e2e/seed/build-pilot-seed.mjs). */
type BoardCode = { system: string; code: string; route: string };
type BoardIngredient = { bds: string; name: string; codes: BoardCode[]; coverage: { coverage: string };
  ddi: { major: number; moderate: number; minor: number; unknown: number; total: number }; disease: number; food: number };
type BoardItem = { conceptId: string; ingredients: BoardIngredient[]; stages: { ddinter: { note: string | null } };
  brand: { trade_name: string; dar_number: string; company: string; dosage_form: string; generic_content_raw: string };
  clinical: { bdc_id: string; display_name: string; route: string; signature: string } };
type BoardPair = { ida: string; idb: string; severity: string; actions: string[]; interaction: string | null; management: string | null };
const html = readFileSync(fileURLToPath(new URL("../../docs/artifacts/2026-10-12-intellidrugs-reviewer.html", import.meta.url)), "utf8");
const DATA = JSON.parse(/var DATA=(\{[\s\S]*?\});\n/.exec(html)![1]) as { items: BoardItem[]; pilotPairs: BoardPair[] };

/** §1.6 item 7: the systemic chloramphenicol entry never applies to the eye drops. */
const DROPPED = "DDInter351";
const key = (a: string, b: string) => [a, b].sort().join("/");
const boardPair = (a: string, b: string) => DATA.pilotPairs.find((p) => key(p.ida, p.idb) === key(a, b))!;
/**
 * Product owner, 2026-10-15: chapter 6 counts Chloramphenicol by the eye drops' route-scoped entry, as the desk does. Board R
 * carries only the sum of its three entries, so these are the per-entry counts read from production (read-only, counted
 * the way IngredientSummaryReader does); they must add up to Board R's sum.
 */
const CHLORAMPHENICOL_ENTRIES = {
  DDInter351: { major: 47, moderate: 421, minor: 21, unknown: 49, total: 538, disease: 3, food: 0 },
  DDInter352: { major: 1, moderate: 111, minor: 0, unknown: 0, total: 112, disease: 1, food: 0 },
  DDInter353: { major: 0, moderate: 4, minor: 0, unknown: 0, total: 4, disease: 2, food: 0 },
} as const;
const ddinterParts = (it: BoardItem) => (it.stages.ddinter.note ?? "").split("; ").filter((p) => p !== "" && !p.includes(DROPPED));

describe("the pilot snapshot against Board R's pilot export", () => {
  it("names the ten pilot records once each, in concept order", () => {
    expect(new Set(PILOT_IDS).size).toBe(10);
    expect([...PILOT_IDS]).toEqual(DATA.items.map((i) => i.conceptId).sort());
    expect(Object.values(P).sort()).toEqual([...PILOT_IDS]);
  });

  it("every snapshot block is keyed by a concept id that /v1/stats reports (§6.8): the CI seed's 0001-pilot items", () => {
    expect(seededPilotIds()).toEqual([...PILOT_IDS]);
  });

  it("every ids list in a Learn chapter names pilot records only", () => {
    const ELEMENT = /^(P\.(amlodipine|aspirin|simvastatin|chloramphenicol|domperidone|warfarin|metformin|napa|clarith|amoxiclav)|id)$/;
    // No chapter exists yet in Task 4; the test bites from Task 6 on, as each chapter lands.
    const files = readdirSync(CONTENT).filter((f) => f.endsWith(".tsx"));
    for (const f of files) {
      const src = readFileSync(join(CONTENT, f), "utf8");
      for (const m of src.matchAll(/\bids(?:=\{|:\s*)(\[[^\]]*\]|[A-Za-z_.]+)/g)) {
        if (m[1] === "PILOT_IDS" || m[1] === "cardIds") continue;
        expect(m[1].startsWith("["), `${f}: ids=${m[1]}`).toBe(true);
        expect(m[1].slice(1, -1).trim(), `${f}: empty ids`).not.toBe("");
        // `id` is allowed only as the loop variable of PILOT_IDS.map((id) => …); chapter 7's warning cards use cardIds(id), whose PilotId[] return type keeps them pilot-only.
        for (const el of m[1].slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean)) expect(el, `${f}: ${m[1]}`).toMatch(ELEMENT);
      }
    }
  });

  it("holds Board R's brand and clinical-drug facts for each record", () => {
    for (const it of DATA.items) {
      const r = S.records[it.conceptId as PilotId];
      expect([r.tradeName, r.darNumber, r.company, r.dosageForm, r.genericContentRaw, r.bdcId, r.clinicalDrug, r.route, r.signature])
        .toEqual([it.brand.trade_name, it.brand.dar_number, it.brand.company, it.brand.dosage_form, it.brand.generic_content_raw,
          it.clinical.bdc_id, it.clinical.display_name, it.clinical.route, it.clinical.signature]);
    }
  });

  it("holds Board R's codes, DDInter entries and record counts for each substance", () => {
    const board = DATA.items.flatMap((it) => it.ingredients.map((i) => ({ product: it.conceptId, i })));
    expect(S.substances.map((s) => s.bdsId).sort()).toEqual(board.map((b) => b.i.bds).sort());
    for (const { product, i } of board) {
      const s = S.substances.find((x) => x.bdsId === i.bds)!;
      const codes = (system: string) => i.codes.filter((c) => c.system === system).map((c) => c.code);
      expect(s.product).toBe(product);
      expect(s.name).toBe(i.name);
      expect(s.codes).toEqual({ icd11: codes("ICD11_XM")[0], rxcui: codes("RXCUI")[0], atc: codes("ATC"), drugbank: codes("DRUGBANK")[0],
        snomed: codes("SNOMEDCT") });
      expect(s.entries).toEqual(i.codes.filter((c) => c.system === "DDINTER").map((c) => ({ id: c.code, route: c.route })));
      expect(s.coverage).toBe(i.coverage.coverage);
      if (s.countedEntry) continue;  // checked against its own entry below
      expect(s.drugDrug).toEqual({ major: i.ddi.major, moderate: i.ddi.moderate, minor: i.ddi.minor, unknown: i.ddi.unknown, total: i.ddi.total });
      expect([s.disease, s.food]).toEqual([i.disease, i.food]);
    }
  });

  it("counts Chloramphenicol by DDInter352 (ophthalmic) only: 112 records, as the desk does; the three entries sum to Board R's 654", () => {
    expect(S.substances.filter((s) => s.countedEntry).map((s) => s.name)).toEqual(["Chloramphenicol"]);
    const s = substanceNamed("Chloramphenicol");
    const it = DATA.items.find((x) => x.conceptId === s.product)!;
    const i = it.ingredients.find((x) => x.bds === s.bdsId)!;
    expect(s.countedEntry).toEqual({ id: "DDInter352", route: it.clinical.route });
    expect(s.entries).toContainEqual(s.countedEntry);
    const { disease, food, ...drugDrug } = CHLORAMPHENICOL_ENTRIES.DDInter352;
    expect(s.drugDrug).toEqual(drugDrug);
    expect([s.disease, s.food]).toEqual([disease, food]);
    expect(s.drugDrug.total).toBe(112);
    const all = Object.values(CHLORAMPHENICOL_ENTRIES);
    const sum = (k: keyof (typeof all)[number]) => all.reduce((n, e) => n + e[k], 0);
    expect(Object.keys(CHLORAMPHENICOL_ENTRIES)).toEqual(s.entries.map((e) => e.id));
    expect({ major: sum("major"), moderate: sum("moderate"), minor: sum("minor"), unknown: sum("unknown"), total: sum("total") }).toEqual(i.ddi);
    expect([sum("disease"), sum("food")]).toEqual([i.disease, i.food]);
    // None of its 112 pairs is with a pilot drug (§1.6 item 5): Board R has no DDInter352 pilot pair.
    expect(DATA.pilotPairs.filter((p) => p.ida === s.countedEntry!.id || p.idb === s.countedEntry!.id)).toEqual([]);
  });

  it("its 28 pairs are Board R's pilot pairs without the DDInter351 ones (§1.6 items 5 and 10)", () => {
    const board = DATA.pilotPairs.filter((p) => p.ida !== DROPPED && p.idb !== DROPPED)
      .map((p) => `${key(p.ida, p.idb)}|${p.severity}|${p.actions.join(",")}`).sort();
    expect(S.pairs.map((p) => `${key(p.ddinterA, p.ddinterB)}|${p.severity}|${p.action}`).sort()).toEqual(board);
    expect(S.pairs).toHaveLength(28);
    for (const p of S.pairs) expect([entryName(p.ddinterA), entryName(p.ddinterB)]).toEqual([p.a, p.b]);
  });

  it("each record's DDInter warning is Board R's stage note without the DDInter351 pairs", () => {
    for (const it of DATA.items) {
      const parts = ddinterParts(it);
      const w = S.warnings[it.conceptId as PilotId];
      const missing = parts.map((p) => /^DDInter text not found for (DDInter\d+)\/(DDInter\d+)$/.exec(p))
        .filter((m): m is RegExpExecArray => m !== null).map((m) => key(m[1], m[2])).sort();
      expect(w.textMissing.map((t) => key(t.ddinterA, t.ddinterB)).sort()).toEqual(missing);
      expect(w.noData).toBe(parts.includes("No interaction data in DDInter for this substance"));
      expect(w.status).toBe(parts.length === 0 ? "ok" : "warn");
      for (const t of w.textMissing) expect([entryName(t.ddinterA), entryName(t.ddinterB)]).toEqual([t.a, t.b]);
    }
  });

  it("the DDInter text Learn quotes is Board R's, unchanged", () => {
    expect(S.workedCheck.management).toBe(boardPair("DDInter1951", "DDInter20").management);
    for (const e of S.actionExamples) {
      const b = boardPair(e.ddinterA, e.ddinterB);
      expect([e.interaction, e.severity, e.action]).toEqual([b.interaction, b.severity, b.actions[0]]);
    }
  });
});

describe("the §1.6 counts the snapshot must give", () => {
  it("severity: Major 4, Moderate 6, Minor 2, not classified 16, of 28 (items 5 and 11)", () => {
    expect(severityCounts()).toEqual({ major: 4, moderate: 6, minor: 2, unknown: 16 });
  });

  it("actions: synergy 3, metabolism 6, not given 16; the others unchanged (item 11)", () => {
    expect(actionCounts()).toEqual({ synergy: 3, metabolism: 6, antagonism: 1, distribution: 1, others: 1, unknown: 16 });
  });

  it("the row hints of item 7", () => {
    const hint = (id: PilotId) => {
      const w = S.warnings[id];
      if (w.noData) return "No DDInter data";
      if (w.status === "ok") return "All checks OK";
      const n = w.textMissing.length;
      return `1 check warning, ${n} ${n === 1 ? "pair" : "pairs"} without text`;
    };
    expect(Object.fromEntries(PILOT_IDS.map((id) => [S.records[id].tradeName, hint(id)]))).toEqual({
      "Amlodipine-5": "1 check warning, 4 pairs without text",
      Aspirin: "1 check warning, 5 pairs without text",
      Simvastatin: "1 check warning, 4 pairs without text",
      Chloramphenicol: "All checks OK",
      Domperidone: "No DDInter data",
      "G Warfarin": "1 check warning, 1 pair without text",
      "G-Metformin": "1 check warning, 5 pairs without text",
      Napa: "1 check warning, 6 pairs without text",
      Clarith: "1 check warning, 2 pairs without text",
      "Amoxycillin Clavulanic Acid": "1 check warning, 5 pairs without text",
    });
  });

  it("the chapter 4 pilot results: DDInter warned 9 of 10, the other stages OK for all 10 (item 11)", () => {
    expect(S.stages).toEqual({ dgda: { ok: 10, warn: 0, fail: 0 }, substances: { ok: 10, warn: 0, fail: 0 },
      clinical: { ok: 10, warn: 0, fail: 0 }, ddinter: { ok: 1, warn: 9, fail: 0 } });
    expect(PILOT_IDS.filter((id) => S.warnings[id].status === "warn")).toHaveLength(S.stages.ddinter.warn);
    expect(PILOT_IDS.filter((id) => S.warnings[id].textMissing.length > 0)).toHaveLength(8);
  });

  it("severity counts sum to their totals for every substance", () => {
    for (const s of S.substances) {
      const d = s.drugDrug;
      expect(d.major + d.moderate + d.minor + d.unknown).toBe(d.total);
    }
  });

  it("Domperidone has no DDInter entry, six codes, and one not-checked pair with each other pilot substance", () => {
    const domp = substanceNamed("Domperidone");
    expect([domp.coverage, domp.entries.length, codeCount(domp)]).toEqual(["none", 0, 6]);
    expect(S.notCheckedPairs).toBe(S.substances.length - 1);
  });
});

describe("snapshot-only values (§6.8) are present and dated", () => {
  it("has a DD/MM/YYYY snapshot date and ISO times with an explicit zone, so they read the same in any TZ", () => {
    expect(S.storedOn).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(S.runAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/);
    expect(Number.isNaN(Date.parse(S.runAt))).toBe(false);
    expect(S.batchId).toBe("0001-pilot");
  });

  it("G Warfarin's extraction time is the host's re-run stamp, after the first run, or null (never a pre-re-run time)", () => {
    if (S.warfarinExtractedAt === null) return;
    expect(S.warfarinExtractedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/);
    expect(Date.parse(S.warfarinExtractedAt)).toBeGreaterThan(Date.parse(S.runAt) + 3_600_000);
  });

  it("holds the chapter 4 evidence counts and the glossary review lines", () => {
    for (const v of [...Object.values(S.evidence), ...Object.values(S.review)]) expect(Number.isInteger(v) && v >= 0).toBe(true);
    expect(S.evidence.stageResult).toBe(40);
    expect(S.evidence.reviewDecision).toBe(0);
    expect(S.review.decisions).toBe(S.evidence.reviewDecision);
    expect(S.review.reruns).toBe(S.evidence.batchRun - 1);
    expect([S.review.backInReview, S.review.engineerChecked, S.review.issueReported]).toEqual([0, 0, 0]);
  });
});
