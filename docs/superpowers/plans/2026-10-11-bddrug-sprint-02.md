# BDDrug KB — Sprint 2 Implementation Plan: full pipeline for the pilot 10

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every stage of the pipeline runs for the 10 pilot products in `batches/0001-pilot.txt`, and every stage's output is visible on drugdb.eliooo.org next to the evidence it came from:

DGDA product → ingredient/strength parse → substance (`BDS-` ID) → names and codes (ICD-11 XM, RxCUI, ATC level 5, DrugBank, SNOMED CT) → clinical drug (`BDC-` ID) → DDInter mapping (route-aware) → drug–drug, drug–disease and drug–food interactions with "no data" coverage → interaction checker.

**Architecture:** This sprint follows Sprint 1's layout: raw snapshots, then curated tables, then the API, then the SSR site.
- Every external call (RxNav, DDInter) is stored verbatim in `raw.http_snapshot`, so reviewers can see the evidence and re-runs can work offline.
- Each pipeline stage writes one `ops.stage_result` row per batch item (status `ok` / `warn` / `fail`, a note, and evidence JSON). The batch page shows these rows beside the data.
- Interactions are kept in DDInter's own ID space (`ddinter_drug`, `ddinter_pair`, ...). They link to our substances through `substance_code(system='DDINTER', route_scope)`, so partner drugs outside our catalog still show by name.

**Tech Stack:** Same as Sprint 1. ETL: Python 3.12, httpx, psycopg 3, pytest, respx, testcontainers. HTML parsing uses the stdlib `html.parser` only, with no new dependency. The API (Spring Boot 3.4.2 WebFlux/R2DBC) and web (Next.js 15.5.27) stacks are unchanged.

**Spec:** `docs/design/2026-10-11-bd-drug-kb-design.md` and `docs/design/2026-10-11-implementation-plan.md` (pilot-first strategy). Sprint 2 scope was re-cut on 2026-10-11 at the product owner's request: finish the whole pipeline first, and move login and review buttons to Sprint 3.

## Global Constraints
- Brands come only from DGDA-Drugs on OCL. MedEx-derived data is never shown or served.
- Substance IDs are ours and permanent: `BDS-` + 6 digits (e.g. `BDS-000001`). Clinical drug IDs: `BDC-` + 6 digits. IDs are minted once and never reused or renumbered. Re-runs must find existing IDs, not mint new ones.
- One substance per ICD-11 XM code (DGDA's `Has-active-ingredient` mapping). XM names are salt-free base substances, e.g. "Warfarin" for "Warfarin Sodium".
- "No interaction data" is never shown as "no interactions". A substance without a DDInter mapping has coverage `none`, shown as "No interaction data in DDInter for this substance."
- Route matters. A product whose dose form is ophthalmic, otic, nasal or topical uses DDInter's route-specific entry when one exists. Otherwise it uses the general entry and marks the alert `route_assumed: true`.
- External services are called politely and only for the batch's substances:
  - RxNav: at most 10 req/s.
  - DDInter: at most 1 req/s, with a session and CSRF token, and `User-Agent: bddrug-etl/0.2 (+niramoy)`.
  - Every response is stored in `raw.http_snapshot`.
- Every curated code or mapping row records `source`, `method` (`xm` | `rxnav-exact` | `rxnav-approx` | `drugbank` | `name` | `route-name`) and `confidence` (0–1).
- API responses use the platform envelope. There is no patient data and no PHI in logs.
- Commits: `type(scope): description`, ending with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` (or the authoring model's own trailer).

## Review Focus
1. **Paracetamol ↔ Acetaminophen.** Napa's content says "Paracetamol" and its XM name is "Acetaminophen". Both must resolve to one substance with both names recorded, RxCUI 161 and ATC N02BE01.
2. **Combination product.** Amoxicillin + clavulanic acid 500 mg + 125 mg must give one clinical drug with two ingredients, each with its own strength, aligned by substance (not by list position).
3. **Route-scoped entry.** The chloramphenicol eye drop must map to DDInter352 "Chloramphenicol (ophthalmic)", not DDInter351, and show that on the product page.
4. **Not in DDInter.** Domperidone must show coverage `none` and the "No interaction data" sentence. The checker must say the same when domperidone is checked; it must never show it as safe.
5. **Idempotency.** Running the full pipeline twice on the same batch produces no new `BDS-`/`BDC-` IDs and no duplicate rows. Stage results are replaced, not appended.

---

## File structure (new or changed)
```
db/migrations/V3__pipeline.sql              substances, codes, names, clinical drugs, ddinter mirror, http snapshots, stage results
etl/src/bddrug_etl/http/snapshot.py          SnapshotHttp: polite httpx wrapper that stores every response in raw.http_snapshot
etl/src/bddrug_etl/parse/content.py          parse_generic_content(raw) -> ParsedContent (pure)
etl/src/bddrug_etl/parse/names.py            normalize_name(), strip_salt(), route_for_dosage_form() (pure)
etl/src/bddrug_etl/rxnav/client.py           RxNavClient: rxcui_for_name(), codes_for_rxcui()
etl/src/bddrug_etl/stages/substances.py      build_substances(conn, rxnav, concept_ids) -> stage results
etl/src/bddrug_etl/stages/clinical.py        build_clinical_drugs(conn, rxnav, concept_ids) -> stage results
etl/src/bddrug_etl/ddinter/client.py         DDInterClient: drug_list(), drug_detail(), graph(), diseases(), foods(), interaction()
etl/src/bddrug_etl/ddinter/html.py           parse_drug_detail(html), parse_interaction(html) (pure)
etl/src/bddrug_etl/stages/ddinter.py         map_and_load_ddinter(conn, client, concept_ids) -> stage results
etl/src/bddrug_etl/stages/results.py         write_stage_results(conn, batch_id, stage, results)
etl/src/bddrug_etl/jobs/run_pipeline.py      CLI: bddrug-etl --batch FILE [--stages dgda,substances,clinical,ddinter]
api/.../domain/{Substance,SubstanceCode,SubstanceName,ClinicalDrug,ClinicalIngredient,InteractionAlert,CheckResult,StageResult}.java
api/.../adapter/persistence/{R2dbcSubstanceAdapter,R2dbcCheckAdapter}.java (+ R2dbcProductAdapter/R2dbcBatchAdapter extended)
api/.../presentation/{SubstanceController,CheckController}.java
web/app/substances/[id]/page.tsx, web/app/check/page.tsx (+ product and batch pages extended), web/lib/api.ts extended
```

---

### Task 1: V3 schema

**Files:** Create `db/migrations/V3__pipeline.sql`. Test: `etl/tests/test_schema_v3.py`.

**Produces:**
```sql
CREATE SEQUENCE curated.bds_seq;  CREATE SEQUENCE curated.bdc_seq;

CREATE TABLE raw.http_snapshot (
  source TEXT NOT NULL, request_key TEXT NOT NULL,          -- e.g. 'rxnav', 'GET /REST/rxcui.json?name=Paracetamol&search=2'
  status INT NOT NULL, body TEXT NOT NULL, fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source, request_key));

CREATE TABLE curated.substance (
  bds_id TEXT PRIMARY KEY DEFAULT 'BDS-' || lpad(nextval('curated.bds_seq')::text, 6, '0'),
  preferred_name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'allopathic',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE curated.substance_code (
  bds_id TEXT NOT NULL REFERENCES curated.substance ON DELETE CASCADE,
  system TEXT NOT NULL CHECK (system IN ('ICD11_XM','RXCUI','ATC','DRUGBANK','SNOMEDCT','DDINTER')),
  code TEXT NOT NULL, route_scope TEXT NOT NULL DEFAULT 'any',   -- 'any' | 'systemic' | 'ophthalmic' | 'otic' | 'nasal' | 'topical'
  source TEXT NOT NULL, method TEXT NOT NULL, confidence NUMERIC(3,2) NOT NULL,
  PRIMARY KEY (bds_id, system, code));
CREATE UNIQUE INDEX substance_code_xm_unique ON curated.substance_code (code) WHERE system = 'ICD11_XM';

CREATE TABLE curated.substance_name (
  bds_id TEXT NOT NULL REFERENCES curated.substance ON DELETE CASCADE,
  name TEXT NOT NULL, name_type TEXT NOT NULL,            -- 'icd11' | 'dgda_content' | 'rxnorm' | 'ddinter'
  source TEXT NOT NULL, PRIMARY KEY (bds_id, name, name_type));

CREATE TABLE curated.clinical_drug (
  bdc_id TEXT PRIMARY KEY DEFAULT 'BDC-' || lpad(nextval('curated.bdc_seq')::text, 6, '0'),
  signature TEXT NOT NULL UNIQUE,                         -- deterministic: see Task 6
  display_name TEXT NOT NULL, dose_form TEXT NOT NULL, route TEXT NOT NULL);

CREATE TABLE curated.clinical_drug_ingredient (
  bdc_id TEXT NOT NULL REFERENCES curated.clinical_drug ON DELETE CASCADE,
  bds_id TEXT NOT NULL REFERENCES curated.substance,
  strength_value NUMERIC, strength_unit TEXT, per_value NUMERIC, per_unit TEXT, raw_text TEXT NOT NULL,
  PRIMARY KEY (bdc_id, bds_id));

ALTER TABLE curated.brand_product
  ADD COLUMN bdc_id TEXT REFERENCES curated.clinical_drug,
  ADD COLUMN parse_status TEXT CHECK (parse_status IN ('parsed','partial','failed')),
  ADD COLUMN parse_note TEXT;

CREATE TABLE curated.ddinter_drug (
  ddinter_id TEXT PRIMARY KEY, name TEXT NOT NULL, atc_codes TEXT[] NOT NULL DEFAULT '{}',
  drugbank_id TEXT, route_scope TEXT NOT NULL DEFAULT 'systemic', fetched_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE curated.ddinter_pair (
  ddinter_a TEXT NOT NULL, ddinter_b TEXT NOT NULL,            -- ddinter_a < ddinter_b (text order)
  severity TEXT NOT NULL CHECK (severity IN ('major','moderate','minor','unknown')),
  actions TEXT[] NOT NULL DEFAULT '{}', partner_name_a TEXT NOT NULL, partner_name_b TEXT NOT NULL,
  interaction_id TEXT, PRIMARY KEY (ddinter_a, ddinter_b));

CREATE TABLE curated.ddinter_interaction_text (
  interaction_id TEXT PRIMARY KEY, interaction TEXT NOT NULL, management TEXT NOT NULL, refs TEXT[] NOT NULL DEFAULT '{}');

CREATE TABLE curated.ddinter_disease (
  ddinter_id TEXT NOT NULL, interaction_id TEXT NOT NULL, disease_name TEXT NOT NULL,
  severity TEXT NOT NULL, text TEXT NOT NULL, refs TEXT[] NOT NULL DEFAULT '{}', PRIMARY KEY (ddinter_id, interaction_id));

CREATE TABLE curated.ddinter_food (
  ddinter_id TEXT NOT NULL, interaction_id TEXT NOT NULL, food TEXT NOT NULL, severity TEXT NOT NULL,
  mechanism TEXT, description TEXT NOT NULL, management TEXT NOT NULL, refs TEXT[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (ddinter_id, interaction_id));

CREATE TABLE curated.interaction_coverage (
  bds_id TEXT PRIMARY KEY REFERENCES curated.substance ON DELETE CASCADE,
  coverage TEXT NOT NULL CHECK (coverage IN ('full','none')), note TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE ops.stage_result (
  batch_id TEXT NOT NULL REFERENCES ops.batch ON DELETE CASCADE, concept_id TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('dgda','substances','clinical','ddinter')),
  status TEXT NOT NULL CHECK (status IN ('ok','warn','fail')), note TEXT NOT NULL, evidence JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (batch_id, concept_id, stage));
```

- [ ] Step 1: Write `test_schema_v3.py`. Apply V1–V3 to a testcontainers Postgres, then assert:
  - inserting two substances yields `BDS-000001` and `BDS-000002`
  - a second `ICD11_XM` row with the same code violates `substance_code_xm_unique`
  - `ops.stage_result` rejects stage `'foo'`
- [ ] Step 2: Run it and see it fail (relation does not exist).
- [ ] Step 3: Write the migration. Step 4: tests pass, and the existing etl + api suites still pass (the API tests apply all migrations).
- [ ] Step 5: Commit `feat(db): V3 schema for substances, clinical drugs, DDInter mirror, stage results`.

---

### Task 2: Pure parsers — content strings, names, routes

**Files:** Create `etl/src/bddrug_etl/parse/{__init__,content,names}.py`. Tests: `etl/tests/test_parse_content.py`, `etl/tests/test_parse_names.py`.

**Produces:**
```python
@dataclass(frozen=True)
class ParsedIngredient: name: str; strength_value: Decimal | None; strength_unit: str | None; per_value: Decimal | None; per_unit: str | None; raw_text: str
@dataclass(frozen=True)
class ParsedContent: status: Literal["parsed","partial","failed"]; ingredients: tuple[ParsedIngredient, ...]; note: str
def parse_generic_content(raw: str) -> ParsedContent
def normalize_name(name: str) -> str          # casefold, collapse whitespace, strip punctuation at ends, "amoxycillin"->"amoxicillin" spelling map
def strip_salt(name: str) -> str              # removes trailing salt/hydrate words: sodium, potassium, calcium, hydrochloride, hcl, besilate, besylate, maleate, mesylate, mesilate, tartrate, succinate, fumarate, citrate, sulfate, sulphate, phosphate, acetate, bromide, dihydrate, trihydrate, monohydrate
def route_for_dosage_form(dosage_form: str) -> str   # 'ophthalmic' for eye drops/eye ointment, 'otic' for ear drops, 'nasal' for nasal spray/drops, 'topical' for cream/ointment/gel/lotion, else 'systemic'
```

**Parsing rules:**
- Split the raw text at the first digit that starts a strength. The left part holds names, the right part holds strengths. Split both sides on `+`.
- A strength token is `<number> <unit>[/<number>? <unit>]`.
  - Units are case-insensitive: mg, mcg, µg, g, ml, iu, %, unit(s).
  - Per-units: ml, vial, g, tablet, capsule, dose, actuation.
  - `/ml` with no number means `per_value = 1`.
- If the name count equals the strength count, the status is `parsed`.
- If there are names but no strengths, the status is `partial` with the note "no strength in source".
- If the counts differ, the status is `partial` with the note "N names vs M strengths".
- Empty or unparseable text gives `failed`.

- [ ] Step 1: Tests, using the real pilot strings verbatim plus edge cases:
  - `"Paracetamol 500 mg"` → parsed, 1 ingredient, (500, mg, None, None)
  - `"Amoxicillin + Clavulanic Acid 500 mg + 125 mg"` → parsed, 2 ingredients in order, with 500 and 125
  - `"Chloramphenicol 5 mg/ml"` → (5, mg, 1, ml)
  - `"Warfarin Sodium 5 mg"` → name "Warfarin Sodium" (the parser does not strip salts)
  - `"Amphotericin B 50 mg/vial"` → (50, mg, 1, vial)
  - `"Insulin 100 IU/ml"` → (100, iu, 1, ml)
  - `"Vitamin B1, B6 & B12"` → partial, "no strength in source"
  - `"X + Y 10 mg"` → partial, "2 names vs 1 strengths"
  - `""` → failed
- Name tests:
  - `strip_salt("Warfarin Sodium") == "Warfarin"`, `strip_salt("Metformin Hydrochloride") == "Metformin"`, `strip_salt("Amlodipine Besilate") == "Amlodipine"`
  - `strip_salt("Sodium Chloride") == "Sodium Chloride"` (never strip the only word, or a salt word that is the leading word)
  - `normalize_name("Amoxycillin") == "amoxicillin"`
  - `route_for_dosage_form("Eye Drops") == "ophthalmic"`, `route_for_dosage_form("Tablet") == "systemic"`
- [ ] Steps 2–4: RED → implement → GREEN. Step 5: commit `feat(etl): parse DGDA generic content, names and routes`.

---

### Task 3: Snapshot HTTP + RxNav client

**Files:** Create `etl/src/bddrug_etl/http/{__init__,snapshot}.py`, `etl/src/bddrug_etl/rxnav/{__init__,client}.py`. Tests: `etl/tests/test_snapshot_http.py`, `etl/tests/test_rxnav.py` (respx; snapshot tests use the testcontainers DB).

**Produces:**
```python
class SnapshotHttp:
    def __init__(self, conn, source: str, http: httpx.Client, min_interval_s: float, user_agent: str = "bddrug-etl/0.2 (+niramoy)")
    def get(self, url: str, params: dict | None = None) -> httpx.Response          # paced; stores (source, "GET "+path?query) -> status+body; upsert
    def post(self, url: str, data: dict, headers: dict | None = None) -> httpx.Response   # request_key "POST "+path+"#"+sorted form fields minus csrfmiddlewaretoken
@dataclass(frozen=True)
class RxCodes: rxcui: str; name: str; tty: str; atc: tuple[str, ...]; drugbank: tuple[str, ...]; snomedct: tuple[str, ...]
class RxNavClient:
    BASE = "https://rxnav.nlm.nih.gov/REST"
    def __init__(self, http: SnapshotHttp)
    def rxcui_for_name(self, name: str) -> tuple[str, str] | None     # (rxcui, method): exact search=2 first ('rxnav-exact'); else approximateTerm.json?term=&maxEntries=1 with score>=... ('rxnav-approx'); prefer TTY IN over PIN: if result is PIN, follow related.json?tty=IN
    def codes_for_rxcui(self, rxcui: str) -> RxCodes                   # properties.json (name, tty) + allProperties.json?prop=codes → ATC (7-char only), DRUGBANK, SNOMEDCT
```
- [ ] Tests:
  - the snapshot row is written and upserted on a repeat call
  - pacing: two calls with `min_interval_s=0.2` take ≥0.2 s (monkeypatch `time.monotonic`/`sleep`)
  - the POST request_key excludes the CSRF token
  - `rxcui_for_name("Paracetamol")` → ("161", "rxnav-exact"), from a fixture JSON copied from the live RxNav response (save the fixtures under `etl/tests/fixtures/rxnav/`)
  - "Clavulanic acid" is a PIN 21216 and follows to IN 48203 "clavulanate"
  - `codes_for_rxcui("161").atc == ("N02BE01",)` and `drugbank` contains "DB00316"
  - a 5-char ATC class in the codes list is ignored
  - an unknown name → None
- [ ] RED → implement → GREEN; commit `feat(etl): snapshotting HTTP client and RxNav lookups`.

---

### Task 4: Stage — substances

**Files:** Create `etl/src/bddrug_etl/stages/{__init__,results,substances}.py`. Test: `etl/tests/test_stage_substances.py`.

**Produces:**
```python
@dataclass(frozen=True)
class StageResult: concept_id: str; status: Literal["ok","warn","fail"]; note: str; evidence: dict
def write_stage_results(conn, batch_id: str, stage: str, results: list[StageResult]) -> None     # delete+insert for (batch_id, stage, concept_ids)
def build_substances(conn, rxnav: RxNavClient, concept_ids: list[str]) -> list[StageResult]
```

**Algorithm, per product, for each `brand_product_ingredient` (xm_code, ingredient_name):**
1. Find the substance by the `ICD11_XM` code. If none exists, insert a substance with `preferred_name = ingredient_name` and a code row (ICD11_XM, xm_code, source 'dgda-ocl', method 'xm', confidence 1.0).
2. Upsert the name (ingredient_name, 'icd11', 'dgda-ocl').
3. If the substance has no `RXCUI` code yet:
   - Call `rxcui_for_name(ingredient_name)`. If that returns None, try `strip_salt` of the matching parsed content name.
   - On success: store the RXCUI (confidence 1.0 for exact, 0.8 for approx), then the `codes_for_rxcui` ATC, DRUGBANK and SNOMEDCT codes (source 'rxnav', method from the lookup), plus the RxNorm name as 'rxnorm'.
4. Also store the salt-stripped parsed content name for this ingredient as 'dgda_content' (e.g. "Paracetamol" for Acetaminophen). Find the matching parsed name with the alignment rule from Task 5. For single-ingredient products, it's the single parsed name.

**Results:**
- `ok` when every ingredient has a substance and an RxCUI.
- `warn` with the note "no RxCUI for <name>" when a lookup fails.
- `fail` with "no ICD-11 ingredient mapping from DGDA" when the product has no ingredients.
- Evidence: `{substances: [{bds_id, name, xm, rxcui, atc, drugbank, method}]}`.

- [ ] Tests use a fake RxNavClient (no HTTP) and the testcontainers DB with the 10 pilot rows seeded, using the real values listed in this plan's context:
  - Napa → one substance "Acetaminophen", names including "Paracetamol" (dgda_content) and "Acetaminophen" (icd11), codes RXCUI 161 and ATC N02BE01
  - the combination product → two substances
  - a second run creates no new substance and no duplicate code or name rows (Review Focus 5)
  - a product with no ingredients → `fail`
- [ ] RED → implement → GREEN; commit `feat(etl): substance stage with BDS IDs and RxNav codes`.

---

### Task 5: Stage — clinical drugs

**Files:** Create `etl/src/bddrug_etl/stages/clinical.py`. Test: `etl/tests/test_stage_clinical.py`.

**Produces:** `build_clinical_drugs(conn, concept_ids) -> list[StageResult]`

**Alignment:** each parsed ingredient is matched to one of the product's substances in this order:
1. `normalize_name(strip_salt(parsed.name))` equals the normalized name of any `substance_name` of that substance.
2. Otherwise, the product has exactly one parsed ingredient and one substance.
3. Otherwise the ingredient is unaligned, which gives `warn` with the note "could not align '<name>'". Never align by position for multi-ingredient products.

**Building the clinical drug:**
- Route = `route_for_dosage_form(dosage_form)`.
- signature = `dose_form.lower() + "|" + route + "|" + ";".join(sorted(f"{bds}:{value}{unit}/{per_value}{per_unit}" for each ingredient))`.
- display_name = `" + ".join(f"{preferred_name} {value} {unit}[/{per}]") + " " + dose_form.lower()`, e.g. "Acetaminophen 500 mg tablet".
- Upsert by signature (the same signature means the same `BDC-`), then set `brand_product.bdc_id`, `parse_status` and `parse_note`.

**Results:**
- `ok` when parsed and fully aligned.
- `warn` for partial or unaligned.
- `fail` when the parse failed, in which case no clinical drug is made and `parse_status` is set to `failed`.
- Evidence: `{raw: generic_content_raw, parsed: [...], aligned: [{name, bds_id}], bdc_id, signature}`.

- [ ] Tests on seeded data plus substances from Task 4's builder (or inserted directly):
  - Amoxicillin/Clavulanate → one BDC with 2 ingredients at 500 and 125 mg, aligned by name (Review Focus 2)
  - Chloramphenicol eye drops → route `ophthalmic`, per 1 ml
  - two brands with the same substance, strength and form share one BDC
  - a re-run mints no new BDC
- [ ] RED → implement → GREEN; commit `feat(etl): clinical drug stage with BDC IDs and route`.

---

### Task 6: DDInter client + HTML parsers

**Files:** Create `etl/src/bddrug_etl/ddinter/{__init__,client,html}.py`. Tests: `etl/tests/test_ddinter_html.py`, `etl/tests/test_ddinter_client.py`. Fixtures go under `etl/tests/fixtures/ddinter/`: real pages fetched once, politely, for DDInter1951 (warfarin) and one interaction page. Record the fetch date in a README in that folder.

**Produces:**
```python
@dataclass(frozen=True)
class DDInterDrug: ddinter_id: str; name: str; atc_codes: tuple[str, ...]; drugbank_id: str | None
@dataclass(frozen=True)
class DDInterPairRow: partner_id: str; partner_name: str; severity: str; actions: tuple[str, ...]
@dataclass(frozen=True)
class InteractionText: interaction: str; management: str; refs: tuple[str, ...]
def parse_drug_detail(html: str, ddinter_id: str) -> DDInterDrug     # name from 'Drugs Information' title, ATC Classification (may be several, comma/space separated), DrugBank id from go.drugbank.com/drugs/DBxxxxx link
def parse_interaction(html: str) -> InteractionText                   # 'Interaction' and 'Management' sections + numbered references
class DDInterClient:
    BASE = "https://ddinter2.scbdd.com"
    def __init__(self, http: SnapshotHttp)                    # min_interval_s=1.0 enforced by caller construction
    def drug_list(self) -> list[tuple[str, str]]               # POST /server/drug-source/ paged (length=500) with session cookie + CSRF from GET /server/drug/
    def drug_detail(self, ddinter_id: str) -> DDInterDrug      # GET /server/drug-detail/{id}/
    def graph(self, ddinter_id: str) -> list[DDInterPairRow]   # GET /server/grapher-datasource/{id}/ ; severity lowercased; 'synergy'/'antagonism'/... actions
    def pair_interaction_id(self, ddinter_id: str, partner_id: str) -> str | None   # POST /server/interact-with/{id}/ with search[value]=partner name, find row whose drug_id==partner_id
    def diseases(self, ddinter_id: str) -> list[dict]          # POST /server/interact-with-dis/{id}/ paged; level '3'/'2'/'1' -> major/moderate/minor
    def foods(self, ddinter_id: str) -> list[dict]             # POST /server/interact-with-food/{id}/ paged; magnesium field = mechanism
    def interaction(self, interaction_id: str) -> InteractionText   # GET /server/interact/{id}/
```
**Severity map** for `interact-with` integer levels: 3 → major, 2 → moderate, 1 → minor, anything else → unknown. Graph severities ("Major", ...) are lowercased.

- [ ] Tests:
  - `parse_drug_detail(warfarin fixture)` → name "Warfarin", "B01AA03" in atc_codes, drugbank "DB00682"
  - `parse_interaction(fixture)` → non-empty interaction and management, with ≥1 reference
  - client tests use respx with fixture bodies: the CSRF token is read from the cookie or page and sent; `drug_list` pages until `recordsTotal` is reached; disease level "3" → major
  - every client call goes through SnapshotHttp (assert snapshot rows exist)
- [ ] RED → implement → GREEN; commit `feat(etl): DDInter client and HTML parsers`.

---

### Task 7: Stage — DDInter mapping and interactions

**Files:** Create `etl/src/bddrug_etl/stages/ddinter.py`. Test: `etl/tests/test_stage_ddinter.py` (fake DDInterClient, testcontainers DB).

**Produces:** `map_and_load_ddinter(conn, client, concept_ids) -> list[StageResult]`

**Algorithm:**
1. Load `client.drug_list()` once per run.
2. **Candidates.** For each substance of the batch's products, collect DDInter entries whose `normalize_name(name without its "(route)" suffix)` equals the normalized form of any of the substance's names (icd11, rxnorm, dgda_content).
3. **Route scope.** The route_scope of a DDInter entry comes from its name suffix: `(ophthalmic)` → ophthalmic, `(otic)` → otic, `(nasal)` → nasal, `(topical)` → topical. No suffix → systemic.
4. **Confirm by DrugBank.** For each candidate, fetch `drug_detail`. If its drugbank_id equals one of the substance's DRUGBANK codes, use method `drugbank`, confidence 1.0. Otherwise use method `name`, confidence 0.7, and give the stage a `warn` with the note "DDInter <id> matched by name only".
5. **Store.**
   - Upsert into `ddinter_drug`.
   - Add a `substance_code` row (DDINTER, id, route_scope, 'ddinter2', method, confidence).
   - Add `substance_name` (ddinter name, 'ddinter').
   - Store `interaction_coverage` 'full' with the note "DDInter <ids>".
6. **No candidates.** Set coverage 'none' with the note "No interaction data in DDInter for this substance". The stage result is `warn` with the same note (Review Focus 4).
7. **Interactions.** For each mapped DDInter id:
   - Store every graph row as a `ddinter_pair`, ordered so a < b.
   - Store diseases into `ddinter_disease` and foods into `ddinter_food`.
   - For pairs where BOTH sides are mapped to substances in this batch, fetch `pair_interaction_id` and then `interaction(...)` into `ddinter_interaction_text`. Pairs involving drugs outside the batch keep severity and actions only, and fetch text in later batches.
8. **Evidence** per product: `{mappings: [{bds_id, ddinter_id, name, route_scope, method}], coverage, pair_count, disease_count, food_count}`.

- [ ] Tests with a fake client returning:
  - warfarin (DDInter1951, drugbank DB00682)
  - aspirin as "Acetylsalicylic acid" (DDInter20)
  - chloramphenicol entries 351 (systemic), 352 (ophthalmic) and 353 (otic)
  - no domperidone entry
  - a graph with a warfarin–aspirin Major pair

  Assert:
  - the chloramphenicol substance has DDINTER codes for 351/352/353 with the correct route_scope (Review Focus 3)
  - domperidone coverage is `none` and its result is `warn` (Review Focus 4)
  - warfarin–aspirin pair text is fetched exactly once
  - a name-only match gives `warn`
  - a re-run creates no duplicates
- [ ] RED → implement → GREEN; commit `feat(etl): DDInter mapping, interactions, coverage`.

---

### Task 8: Pipeline CLI + workflow

**Files:**
- Create `etl/src/bddrug_etl/jobs/run_pipeline.py`.
- Modify `etl/pyproject.toml` (the `bddrug-etl` script points to `run_pipeline:main`; keep `load_dgda` importable).
- Modify `etl/src/bddrug_etl/load/batches.py`: `run_batch` also writes the `dgda` stage result. ok when loaded, fail when not found or not a Drug.
- Modify `.github/workflows/load-dgda.yml`: same command, now runs all stages.
- Test: `etl/tests/test_run_pipeline.py`.

**Produces:** `bddrug-etl --batch FILE [--stages dgda,substances,clinical,ddinter]` (default: all, in that order).
- Each stage runs in its own transaction, then its stage results are written.
- A stage `fail` for one product never stops the other products.
- An exception in a stage marks every product in it `fail` with the error class name and stops the later stages. The exit code is non-zero.
- The final log line is `batch=<id> dgda=<ok/warn/fail counts> substances=… clinical=… ddinter=…`.

- [ ] Tests:
  - stage ordering and `--stages` subset
  - a stage exception gives a non-zero exit and leaves the earlier stages committed
  - the log line format

  Use fakes for the RxNav and DDInter clients through an injectable factory.
- [ ] RED → implement → GREEN; commit `feat(etl): pipeline CLI running all stages per batch`.

---

### Task 9: API — substances, clinical drug on products, checker, stage results

**Files:** see the file structure above. Modify `R2dbcProductAdapter` (adds a clinicalDrug block) and `R2dbcBatchAdapter` (adds stage results per item). Tests: extend `ProductApiIntegrationTest` seeds (V3 rows), add `SubstanceApiIntegrationTest` and `CheckApiIntegrationTest`.

**Produces:**
- `GET /v1/products/{conceptId}` adds:
  - `parseStatus`, `parseNote`
  - `clinicalDrug: {bdcId, displayName, doseForm, route, ingredients: [{bdsId, name, strengthValue, strengthUnit, perValue, perUnit}]} | null`
- `GET /v1/substances/{bdsId}` → `{bdsId, preferredName, names: [{name, nameType, source}], codes: [{system, code, routeScope, source, method, confidence}], coverage: {coverage, note}, products: [{conceptId, tradeName, company}], interactions: [{partnerName, partnerBdsId|null, severity, actions, interactionId, routeScope}], diseases: [...], foods: [...]}`. Interactions are sorted major → moderate → minor → unknown, then by partner name.
- `POST /v1/interactions/check` body `{conceptIds: [..2..20]}` →
  - `{products: [{conceptId, tradeName, substances: [{bdsId, name, coverage}]}], alerts: [{severity, a: {conceptId, bdsId, name}, b: {...}, actions, interaction, management, routeAssumed, source: "DDInter 2.0"}], duplicates: [{bdsId, name, conceptIds}], noData: [{conceptId, bdsId, name}]}`
  - Validation: 2–20 unique IDs, else 400 INVALID_QUERY. An unknown concept ID → 404 NOT_FOUND.
  - Route rule: use the DDINTER code whose route_scope equals the product's clinical-drug route. Otherwise use 'systemic' or 'any' and set `routeAssumed=true`.
- `GET /v1/batches/{id}` items gain `stages: [{stage, status, note, evidence}]`.
- [ ] Integration tests:
  - warfarin + aspirin → one major alert with text
  - domperidone in a check → listed in `noData` and never omitted
  - two products with the same BDS → `duplicates`
  - chloramphenicol eye drops with warfarin uses route ophthalmic (the seed puts a pair only on 352)
  - a substance page lists codes, including ATC N02BE01 for acetaminophen
  - validation errors use the envelope
- [ ] RED → implement → GREEN; commit `feat(api): substances, clinical drugs, interaction checker, stage evidence`.

---

### Task 10: Web — substance page, product/batch evidence, checker page

**Files:** Create `web/app/substances/[id]/page.tsx` and `web/app/check/page.tsx`. Modify the product page, the batch page, `web/lib/api.ts` (add `getSubstance`, `checkInteractions` with the 5 s timeout and no-store) and the layout nav ("Check"). Tests: `web/tests/substance-page.test.tsx`, `web/tests/check-page.test.tsx`, plus API client tests.

**Requirements:**
- **Product page:** the clinical drug and its ingredients link to `/substances/BDS-…`. Show parse status and note. Show a route badge, e.g. "ophthalmic".
- **Substance page:**
  - names and codes table, with source, method and confidence
  - coverage banner. For `none`, show exactly: "No interaction data in DDInter for this substance. This does not mean it is safe to combine."
  - interactions grouped by severity
  - diseases and foods
  - products using it
- **Batch page:** under each item, a stage table (dgda / substances / clinical / ddinter) with a status pill and note. A collapsible evidence JSON block for each stage.
- **Check page** (`/check`), server-rendered, no client JS:
  - a GET form with checkboxes for the products in loaded batches (from `/v1/batches` items)
  - submitting `?ids=…&ids=…` calls `POST /v1/interactions/check` server-side
  - alerts by severity, with interaction and management text and the source line "Source: DDInter 2.0"
  - a "Same substance in more than one product" section
  - a "No interaction data" section that is always shown when non-empty
  - fewer than 2 selected → a friendly message
- [ ] Tests:
  - substance page with coverage none renders the exact sentence
  - check page with a domperidone product renders the "No interaction data" section
  - check page with <2 ids shows the message without calling the API
  - API client encodes the ids and posts JSON
- [ ] `npm test`, `npm run build`; commit `feat(web): substance pages, pipeline evidence, interaction checker`.

---

### Task 11: End-to-end pilot run + deploy

- [ ] **Local:** build the three images and run the stack (same approach as Sprint 1's smoke test, with a local `n8n_edge` network). Run `bddrug-etl --batch /app/batches/0001-pilot.txt` against live RxNav and DDInter (polite rates). Then assert through the web container on the shared network:
  - `/batches/0001-pilot` shows 4 stages for all 10 items
  - Napa's substance page shows RxCUI 161, ATC N02BE01, and the names Paracetamol and Acetaminophen
  - `/check?ids=<warfarin>&ids=<aspirin>` shows a Major alert
  - `/check` with domperidone shows "No interaction data"
  - the chloramphenicol eye-drop product shows the ophthalmic DDInter mapping
  - Record the pipeline log line and the stage counts.
- [ ] Open a PR, wait for green CI, merge. After deploy, run the `load-dgda` workflow with `0001-pilot.txt`. Verify the same five checks on https://drugdb.eliooo.org, and confirm medioo, n8n and baymax respond as before.

## Definition of done
- All four stages run for the 10 pilot products on the live site, each with evidence on the batch page.
- The five Review Focus cases behave as specified, live.
- Re-running the pipeline creates no new IDs and no duplicate rows.
- CI is green, deploy succeeds, and the existing services are unaffected.
