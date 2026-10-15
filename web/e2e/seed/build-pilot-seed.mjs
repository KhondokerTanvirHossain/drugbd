// Generates 10-pilot.sql from Board R's embedded pilot export (spec §11.4). Deterministic: same input, same bytes.
// Usage (from web/): node e2e/seed/build-pilot-seed.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const E2E_BATCHES = ["0001-pilot", "e2e-desk", "e2e-stale", "e2e-fail", "e2e-complete",
  "e2e-a11y-light", "e2e-a11y-dark", "e2e-a11y-forced"];
const STAGES = ["dgda", "substances", "clinical", "ddinter"];
const DROPPED = "DDInter351";   // §1.6 item 7: the systemic chloramphenicol entry never pairs with the eye drop

const q = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const n = (v) => (v === null || v === undefined ? "NULL" : String(v));
const arr = (xs) => `'{${xs.map((x) => `"${String(x).replace(/["\\]/g, "")}"`).join(",")}}'`;
const json = (o) => q(JSON.stringify(o));
const sourceOf = (method) => (method === "xm" ? "dgda-ocl" : method === "drugbank" || method === "name" ? "ddinter2" : "rxnav");
const nameSource = { icd11: "dgda-ocl", dgda_content: "dgda-ocl", rxnorm: "rxnav", ddinter: "ddinter2" };

function extract(html) {
  const m = /var DATA=(\{.*?\});\n/s.exec(html);
  if (!m) throw new Error("Board R: DATA not found");
  return JSON.parse(m[1]);
}

/** Post-fix DDInter stage: drop every "text not found" pair with DDInter351; a stage left with no note is OK. */
function ddinterStage(item) {
  const st = item.stages.ddinter;
  const parts = st.note ? st.note.split("; ").filter((p) => !p.includes(DROPPED)) : [];
  const textMissing = parts.map((p) => /DDInter text not found for (DDInter\d+)\/(DDInter\d+)/.exec(p)).filter(Boolean).map((m) => [m[1], m[2]]);
  const evidence = item.clinical.route !== "systemic" ? { route: item.clinical.route, text_missing: textMissing } : { text_missing: textMissing };
  return { status: parts.length === 0 && st.status === "warn" && st.note.includes("text not found") ? "ok" : st.status,
    note: parts.join("; "), evidence };
}

const GENERAL_SCOPES = ["systemic", "any"];
const idNum = (id) => Number(String(id).replace(/\D/g, "")) || 0;
const plain = (v) => (v === null || v === undefined ? null : String(v));   // P0's _num(): numbers as plain text
const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);

/** P0's RouteRule twin (etl choose()): the entries for the product's route, else systemic or any (assumed), else none. */
function choose(ddCodes, route) {
  const byId = (a, b) => idNum(a.code) - idNum(b.code);
  if (route) {
    const exact = ddCodes.filter((c) => c.route === route).sort(byId);
    if (exact.length) return { chosen: exact.map((c) => c.code), assumed: false };
  }
  const general = ddCodes.filter((c) => GENERAL_SCOPES.includes(c.route)).sort(byId);
  return { chosen: general.map((c) => c.code), assumed: general.length > 0 };
}

/** P0's v1 snapshot payload (etl build_payload): one ingredient per DGDA XM row, ordered by XM code. */
function snapshot(item, stage) {
  const b = item.brand, c = item.clinical;
  const byXm = new Map(item.ingredients.flatMap((i) => i.codes.filter((k) => k.system === "ICD11_XM").map((k) => [k.code, i])));
  return {
    version: 1, extracted_at: item.extractedAt,
    brand: { dar_number: b.dar_number, trade_name: b.trade_name, company: b.company, dosage_form: b.dosage_form, generic_content_raw: b.generic_content_raw },
    clinical_drug: { bdc_id: c.bdc_id, display_name: c.display_name, dose_form: c.dose_form, route: c.route },
    ingredients: [...item.dgdaIngredients].sort((x, y) => cmp(x.xm, y.xm)).map((d) => {
      const i = byXm.get(d.xm);
      if (!i) return { xm_code: d.xm, name: d.name, bds_id: null, substance: null, strength: null, codes: [], ddinter_chosen: [], route_assumed: false };
      const pick = choose(i.codes.filter((k) => k.system === "DDINTER"), c.route);
      return {
        xm_code: d.xm, name: d.name, bds_id: i.bds, substance: i.name,
        strength: { raw: i.raw, value: plain(i.strength), unit: i.unit ?? null, per_value: plain(i.per), per_unit: i.perUnit ?? null },
        codes: [...i.codes].sort((x, y) => cmp(x.system, y.system) || cmp(x.code, y.code))
          .map((k) => ({ system: k.system, code: k.code, route_scope: k.route })),
        ddinter_chosen: pick.chosen, route_assumed: pick.assumed && pick.chosen.length > 0,
      };
    }),
    stages: Object.fromEntries(STAGES.map((s) => [s, s === "ddinter" ? { status: stage.status, note: stage.note }
      : { status: item.stages[s].status, note: item.stages[s].note }])),
  };
}

/** The snapshot payload per concept id, for the seed test. */
export function pilotPayloads(html) {
  return Object.fromEntries(extract(html).items.map((it) => [it.conceptId, snapshot(it, ddinterStage(it))]));
}

export function buildPilotSeed(html) {
  const data = extract(html);
  const items = [...data.items].sort((a, b) => (a.conceptId < b.conceptId ? -1 : a.conceptId > b.conceptId ? 1 : 0));
  const runAt = data.batches[0].run_at;
  const out = ["-- Generated by e2e/seed/build-pilot-seed.mjs from docs/artifacts/2026-10-12-intellidrugs-reviewer.html. Do not edit.", ""];

  const subs = new Map(), names = new Map(), codes = new Map(), cover = new Map(), drugs = new Map(), cds = new Map(), cdis = [];
  for (const it of items) {
    cds.set(it.clinical.bdc_id, it.clinical);
    for (const i of it.ingredients) {
      subs.set(i.bds, i.name);
      cover.set(i.bds, i.coverage);
      for (const nm of i.names) names.set(`${i.bds}|${nm.name}|${nm.type}`, [i.bds, nm.name, nm.type]);
      for (const c of i.codes) codes.set(`${i.bds}|${c.system}|${c.code}`, [i.bds, c]);
      const ddNames = i.names.filter((x) => x.type === "ddinter").map((x) => x.name);
      const drugbank = i.codes.find((c) => c.system === "DRUGBANK")?.code ?? null;
      for (const c of i.codes.filter((c) => c.system === "DDINTER")) {
        const routed = ddNames.find((x) => x.endsWith(`(${c.route})`));
        drugs.set(c.code, { name: c.route === "systemic" ? (ddNames.find((x) => !x.includes("(")) ?? i.name) : (routed ?? i.name), route: c.route, drugbank });
      }
      cdis.push([it.clinical.bdc_id, i]);
    }
  }

  out.push("INSERT INTO curated.substance (bds_id, preferred_name) VALUES");
  out.push([...subs].sort().map(([id, name]) => ` (${q(id)},${q(name)})`).join(",\n") + ";");
  out.push("INSERT INTO curated.substance_code (bds_id, system, code, route_scope, source, method, confidence) VALUES");
  out.push([...codes.values()].map(([id, c]) => ` (${q(id)},${q(c.system)},${q(c.code)},${q(c.route)},${q(sourceOf(c.method))},${q(c.method)},${n(c.conf)})`).join(",\n") + ";");
  out.push("INSERT INTO curated.substance_name (bds_id, name, name_type, source) VALUES");
  out.push([...names.values()].map(([id, nm, t]) => ` (${q(id)},${q(nm)},${q(t)},${q(nameSource[t] ?? "dgda-ocl")})`).join(",\n") + ";");
  out.push("INSERT INTO curated.interaction_coverage (bds_id, coverage, note) VALUES");
  out.push([...cover].map(([id, c]) => ` (${q(id)},${q(c.coverage)},${q(c.note)})`).join(",\n") + ";");
  out.push("INSERT INTO curated.clinical_drug (bdc_id, signature, display_name, dose_form, route) VALUES");
  out.push([...cds].map(([id, c]) => ` (${q(id)},${q(c.signature)},${q(c.display_name)},${q(c.dose_form)},${q(c.route)})`).join(",\n") + ";");
  out.push("INSERT INTO curated.clinical_drug_ingredient (bdc_id, bds_id, strength_value, strength_unit, per_value, per_unit, raw_text) VALUES");
  out.push(cdis.map(([bdc, i]) => ` (${q(bdc)},${q(i.bds)},${n(i.strength)},${q(i.unit)},${n(i.per)},${q(i.perUnit)},${q(i.raw)})`).join(",\n") + ";");
  out.push("INSERT INTO curated.brand_product (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, quality_flag, bdc_id, parse_status, parse_note) VALUES");
  out.push(items.map(({ brand: b }) => ` (${q(b.concept_id)},${q(b.dar_number)},${q(b.trade_name)},${q(b.company)},${q(b.dosage_form)},${q(b.generic_content_raw)},${q(b.quality_flag)},${q(b.bdc_id)},${q(b.parse_status)},${q(b.parse_note)})`).join(",\n") + ";");
  out.push("INSERT INTO curated.brand_product_ingredient (concept_id, xm_code, ingredient_name) VALUES");
  out.push(items.flatMap((it) => it.dgdaIngredients.map((d) => ` (${q(it.conceptId)},${q(d.xm)},${q(d.name)})`)).join(",\n") + ";");
  out.push("INSERT INTO raw.ocl_concept (source, concept_id, payload) VALUES");
  out.push(items.map(({ brand: b }) => ` ('DGDA-Drugs',${q(b.concept_id)},${json({ id: b.concept_id, concept_class: "Drug", display_name: b.trade_name,
    extras: { dar_number: b.dar_number, company: b.company, dosage_form: b.dosage_form, generic_content: b.generic_content_raw } })})`).join(",\n") + ";");

  const pairs = data.pilotPairs.filter((p) => p.ida !== DROPPED && p.idb !== DROPPED).map((p) => (p.ida < p.idb ? p
    : { ...p, ida: p.idb, idb: p.ida, a: p.b, b: p.a }));
  for (const p of pairs) for (const [id, nm] of [[p.ida, p.a], [p.idb, p.b]]) if (!drugs.has(id)) drugs.set(id, { name: nm, route: "systemic", drugbank: null });
  out.push("INSERT INTO curated.ddinter_drug (ddinter_id, name, drugbank_id, route_scope) VALUES");
  out.push([...drugs].sort().map(([id, d]) => ` (${q(id)},${q(d.name)},${q(d.drugbank)},${q(d.route)})`).join(",\n") + ";");
  const texted = pairs.filter((p) => p.interaction !== null || p.management !== null);
  out.push("INSERT INTO curated.ddinter_interaction_text (interaction_id, interaction, management) VALUES");
  out.push(texted.map((p) => ` (${q(`pilot-${p.ida}-${p.idb}`)},${q(p.interaction)},${q(p.management)})`).join(",\n") + ";");
  out.push("INSERT INTO curated.ddinter_pair (ddinter_a, ddinter_b, severity, actions, partner_name_a, partner_name_b, interaction_id) VALUES");
  out.push(pairs.map((p) => ` (${q(p.ida)},${q(p.idb)},${q(p.severity)},${arr(p.actions)},${q(p.a)},${q(p.b)},${texted.includes(p) ? q(`pilot-${p.ida}-${p.idb}`) : "NULL"})`).join(",\n") + ";");

  E2E_BATCHES.forEach((batch, k) => {
    // The pilot batch keeps Board R's run time and is the newest; each e2e batch ran one hour earlier than the one before it.
    const run = k === 0 ? runAt : new Date(Date.parse(runAt) - k * 3_600_000).toISOString();
    const runId = `00000000-0000-4000-8000-${String(k + 1).padStart(12, "0")}`;
    out.push("", `-- batch ${batch}`);
    out.push(`INSERT INTO ops.batch (batch_id, status, item_count, run_at) VALUES (${q(batch)},'in_review',10,${q(run)});`);
    // A full run: concept_ids is empty (run_pipeline.py), which is how the API's fullRuns() finds it.
    out.push(`INSERT INTO ops.batch_run (batch_id, run_at, stages, counts, concept_ids) VALUES (${q(batch)},${q(run)},'{dgda,substances,clinical,ddinter}','{}','{}');`);
    out.push("INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note, extracted_at) VALUES");
    out.push(items.map((it) => ` (${q(batch)},'DGDA-Drugs',${q(it.conceptId)},'pending',NULL,${q(it.extractedAt)})`).join(",\n") + ";");
    out.push("INSERT INTO ops.stage_result (batch_id, concept_id, stage, status, note, evidence) VALUES");
    out.push(items.flatMap((it) => {
      const dd = ddinterStage(it);
      return STAGES.map((s) => s === "ddinter"
        ? ` (${q(batch)},${q(it.conceptId)},'ddinter',${q(dd.status)},${q(dd.note)},${json(dd.evidence)})`
        : ` (${q(batch)},${q(it.conceptId)},${q(s)},${q(it.stages[s].status)},${q(it.stages[s].note)},'{}')`);
    }).join(",\n") + ";");
    out.push("INSERT INTO ops.item_snapshot (batch_id, concept_id, extracted_at, run_id, reason, payload) VALUES");
    out.push(items.map((it) => ` (${q(batch)},${q(it.conceptId)},${q(it.extractedAt)},${q(runId)},'run',${json(snapshot(it, ddinterStage(it)))})`).join(",\n") + ";");
  });
  return out.join("\n") + "\n";
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const board = fileURLToPath(new URL("../../../docs/artifacts/2026-10-12-intellidrugs-reviewer.html", import.meta.url));
  const target = fileURLToPath(new URL("./10-pilot.sql", import.meta.url));
  writeFileSync(target, buildPilotSeed(readFileSync(board, "utf8")));
  console.log(`wrote ${target}`);
}
