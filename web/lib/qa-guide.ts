/*
 * The QA guide (spec §7.11, D73): what a model needs before it checks IntelliDrugs data, in six compact Markdown topics,
 * served by both MCP servers as the tool get_qa_guide and as the resources intellidrugs://qa-guide/{topic}.
 *
 * Source of truth: web/lib/qa-guide.ts. tools/qa-mcp/src/qa-guide.ts is a byte-identical copy, made with
 *   cp web/lib/qa-guide.ts tools/qa-mcp/src/qa-guide.ts
 * and tools/qa-mcp/tests/parity.test.ts fails when the two differ. So this file imports nothing, has no server-only marker and
 * no I/O: constants and pure functions only, compiled unchanged by both packages.
 *
 * Every factual line is tied to the code, a test, the spec or a dated external page by web/tests/fixtures/qa-guide-claims.ts
 * (§7.11.7). Any content change bumps GUIDE_VERSION and adds a GUIDE_HISTORY entry in web/tests/qa-guide.test.ts (§7.11.5).
 * Machine-facing text, not page copy (§1.7): the /review/qa page lists the topics, never their text.
 */

/** §7.11.5: semver, independent of the server version. */
export const GUIDE_VERSION = "1.4.0";
export const GUIDE_TITLE = "IntelliDrugs QA guide";
export const GUIDE_TOPICS = ["overview", "data_model", "sources", "checks", "pitfalls", "reporting"] as const;
export type GuideTopic = (typeof GUIDE_TOPICS)[number];
export const GUIDE_URI_PREFIX = "intellidrugs://qa-guide/";
export const GUIDE_MIME_TYPE = "text/markdown";

export type GuideEntry = { title: string; summary: string; text: string; related: readonly GuideTopic[] };

const md = (...lines: string[]): string => lines.join("\n");

const OVERVIEW = md(
  "IntelliDrugs is a drug knowledge base for Bangladesh, built from the DGDA drug register. Each brand product is one DGDA concept, read through OCL, the national terminology server.",
  "A pipeline builds our data from each product in four stages, always in this order: `dgda`, `substances`, `clinical`, `ddinter`.",
  "",
  "## The review gate",
  "",
  "- Nothing is public until a pharmacist approves the record (`displayStatus` `approved`).",
  "- An engineer can check a record (`engineer_checked`), but an engineer's check never publishes it.",
  "- Senior pharmacists review substances and DDInter interaction pairs across all batches at once; a pair's `review` state shows that review.",
  "- QA accounts and QA keys cannot record review decisions.",
  "",
  "## What QA is for",
  "",
  "- QA reads every current record, including records no pharmacist has approved, so everything you read is unreviewed.",
  "- Your job is to re-check our data against its sources and report each mismatch.",
  "- Findings are reports, not fixes. The tools are read-only: nothing you do with them changes data, and a finding never claims that something was fixed.",
  "- \"No interaction data\" never means a combination is safe.",
  "- Nothing here is clinical advice.",
  "",
  "## Where to start",
  "",
  "- `list_batches` lists the batches; `get_batch` lists a batch's records with each stage's status and note; `get_record` reads one record in full.",
  "- `find_records` lists the records that match a problem filter; `get_pairs` lists one substance's DDInter pairs.",
  "- Then read the `data_model`, `checks` and `reporting` topics.",
);

const DATA_MODEL = md(
  "A record is one brand product in one batch. `get_record` returns it; the paths below are in the answer's `data`.",
  "",
  "## The chain",
  "",
  "- Brand product (DGDA register), then parsed ingredients and strengths, then the clinical drug, then substances with codes, then DDInter entries, then interaction pairs.",
  "",
  "## Brand product",
  "",
  "- `conceptId` is the DGDA concept id, for example `186-0030-006--napa`.",
  "- `source.json` is the register record as last fetched (`source.link.fetchedAt`); `source.link` is its register page. `extractedAt` moves only when a run changes the record's data or review state (a `history[]` `extract` entry).",
  "- `extraction.darNumber`, `tradeName`, `company`, `dosageForm` and `genericContentRaw` come from the register record's extras; the trade name falls back to the concept's display name.",
  "- `extraction.dgdaIngredients[]` lists the register's active ingredients, each an ICD-11 `xmCode` and `name`.",
  "- `extraction.parseStatus` is `parsed`, `partial` or `failed`, and `parseNote` says why a parse was not full, or why a full parse made no clinical drug.",
  "",
  "## Parsed ingredients and strengths",
  "",
  "- The `clinical` stage parses `extraction.genericContentRaw`. What it read is in `stages[clinical].evidence.parsed[]` (strengths as text), and how each parsed name matched a substance is in `stages[clinical].evidence.aligned[]`.",
  "- A partial parse keeps the names but never the strengths; a failed parse keeps neither.",
  "- `extraction.ingredients[]` has one entry per DGDA ingredient, in XM code order: `bdsId` (null when the XM code has no substance), `name`, `raw` (the clinical drug's text, else the DGDA ingredient's name), and the clinical drug's `strengthValue`, `strengthUnit`, `perValue` and `perUnit` (else null).",
  "",
  "## Clinical drug",
  "",
  "- `extraction.clinicalDrug` holds `bdcId`, `displayName`, `doseForm`, `route` and `signature`. It is null unless the parse was full, every parsed name aligned to its own substance and every substance of the product was parsed.",
  "- The route comes from the dosage form: `ophthalmic`, `otic`, `nasal`, `inhalation`, `vaginal`, `rectal`, `oromucosal`, `topical`, `unspecified`, or `systemic` when the form names no other site.",
  "- One signature (dose form, route, substances and strengths) is one `bdcId`, shared by every brand with it: the first brand's `raw`, strengths and `doseForm` are kept, and may quote another brand: this record's own text is `extraction.genericContentRaw` (`pitfalls`).",
  "",
  "## Substances and codes",
  "",
  "- A substance (`bdsId`, BDS- and six digits) is created once per ICD-11 XM code from DGDA and shared by every product with that code.",
  "- `extraction.ingredients[].names[]` lists its names, with `type` `icd11`, `rxnorm`, `dgda_content` or `ddinter`.",
  "- `extraction.ingredients[].codes[]` lists its codes: `system`, `code`, `routeScope`, `method`, `confidence` and `link`.",
  "- `ICD11_XM` comes from DGDA (method `xm`, confidence 1.0).",
  "- `RXCUI` comes from RxNav, looked up by the substance's name, or by its name in the generic content when that finds nothing: method `rxnav-exact` (confidence 1.0) or `rxnav-approx` (confidence 0.8). It is always an ingredient (IN): a salt's PIN leads to its IN (`pitfalls`).",
  "- `ATC`, `DRUGBANK` and `SNOMEDCT` come from RxNav for that RxCUI, with the same method and confidence. Every 7-character ATC code RxNav lists is kept.",
  "- `DDINTER` codes are DDInter entries found by the substance's names, each with a `routeScope`: method `drugbank` (confidence 1.0) when the entry's DrugBank id is one of the substance's, else `name` (confidence 0.7), which the `ddinter` stage notes as a warning.",
  "- `extraction.ingredients[].coverage` is `full` (DDInter has an entry for one of its names), `none` (DDInter has no entry for any of its names) or `not_run` (no coverage is stored: the `ddinter` stage has not run for it, or the ingredient has no substance).",
  "- `extraction.ingredients[].coverageNote` lists the DDInter entries, or says there is no interaction data.",
  "",
  "## DDInter entries and pairs",
  "",
  "- `extraction.ingredients[].ddinter.entries[]` lists every DDInter entry matched to the substance, with its `routeScope` and pair `counts`.",
  "- `extraction.ingredients[].ddinter.chosen[]` lists the entries chosen for this product's route, each with `routeAssumed`.",
  "- `ddinterRoute.route` is the clinical drug's route (null without one); `ddinterRoute.routeAssumed` is true when any chosen entry was assumed.",
  "- `pairs.inBatch.pairs[]` and `pairs.otherBatches.pairs[]` are the interaction pairs with records in this batch and in other batches: `ddinterA`, `ddinterB`, `severity` (`major`, `moderate`, `minor` or `unknown`), `actions`, `link` (the DDInter pair page), `textMissing` and `review` (`state` `not_reviewed`, `reviewed`, `changed` or `issue`, and `at`).",
  "- `pairs.inBatch.notChecked` and `pairs.otherBatches.notChecked` list partners that were not checked, each with its `reason`.",
  "",
  "## Stages, status and history",
  "",
  "- `stages[]` has one result per stage that ran: `stage`, `status` (`ok`, `warn` or `fail`), `notes`, `textMissing` and `evidence`, what the stage stored, unchanged.",
  "- Evidence keys: `dgda` has `source` and `concept_class`; `substances` has `substances` (each `bds_id`, `name`, `xm`, `rxcui`, `atc`, `drugbank`, `method`); `clinical` has `raw`, `parse_status`, `parsed`, `aligned`, `bdc_id` and `signature`; `ddinter` has `mappings`, `coverage`, `pair_count`, `disease_count`, `food_count`, `text_fetch_count`, `text_missing`, `route`, `chosen` and `route_assumed`.",
  "- `displayStatus` is `pending`, `engineer_checked`, `approved`, `issue` or `back_in_review` (approved, then re-extracted; awaiting a new approval).",
  "- `history[]` lists runs and decisions, oldest first: role, time and decision only.",
  "",
  "## The other tools",
  "",
  "- `list_batches`: each batch's `batchId`, `status` (`in_review`, `approved` or `rejected`), `itemCount`, `approvedCount` and `runAt`.",
  "- `get_batch`: the batch's current records in concept id order, each with `items[].stages[]` (`stage`, `status` and the stage's `note`).",
  "- `find_records`: 100 records a page, each with `batchId`, `conceptId`, `tradeName`, `displayStatus` and `items[].stages` (null for a stage with no result).",
  "- `get_pairs`: 50 pairs a page for one substance, with `pairs[].entry`, `pairs[].partner`, `pairs[].severity`, `pairs[].interaction`, `pairs[].management`, `pairs[].applies`, `pairs[].review` and `pairs[].changes[]` (only when the review state is `changed`).",
);

const SOURCES = md(
  "Check each field against its authoritative source. When the field has its own `link`, cite that address: the API builds it from the code. The patterns below are for a code shown without one; a code that does not fit its system's pattern gets no link. `{c}` is the code.",
  "",
  "## DGDA register, through OCL",
  "",
  "- Authoritative for `source.json`, `extraction.tradeName`, `extraction.company`, `extraction.dosageForm`, `extraction.darNumber`, `extraction.genericContentRaw` and `extraction.dgdaIngredients[]` (XM code and name).",
  "- Address: `https://tr.ocl.dghs.gov.bd/#/orgs/MoHFW/sources/DGDA-Drugs/concepts/{conceptId}/`, the record's `source.link`.",
  "- That register page and the RxNav search pages below are JavaScript apps that render only in a browser: a plain HTTP request gets the page shell with no data, which is never evidence of a missing value.",
  "- To read the register record as data, use the OCL API the pipeline reads: `https://api.tr.ocl.dghs.gov.bd/orgs/MoHFW/sources/DGDA-Drugs/concepts/{conceptId}/?verbose=true&includeMappings=true`.",
  "- `source.json` is the register record our data was built from, as fetched at `source.link.fetchedAt`. Compare the extraction with it first.",
  "- A difference between `source.json` and the live register record means the source changed after it was fetched, not that the extraction is wrong: report it as a changed source, not as an extraction error.",
  "",
  "## NLM RxNav",
  "",
  "- Authoritative for `RXCUI`: `https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm={c}`.",
  "- `SNOMEDCT` codes also come from RxNav; check them there: `https://mor.nlm.nih.gov/RxNav/search?searchBy=SNOMEDCT&searchTerm={c}`.",
  "- As data, without a browser: `https://rxnav.nlm.nih.gov/REST/rxcui/{c}/allProperties.json?prop=codes` (`{c}` the RxCUI) lists the codes RxNav holds for an RxCUI, `ATC`, `DRUGBANK` and `SNOMEDCT` among them; the pipeline reads the same call.",
  "",
  "## WHO ATC/DDD index",
  "",
  "- Authoritative for what an `ATC` code means: `https://atcddd.fhi.no/atc_ddd_index/?code={c}&showdescription=no`. Our ATC codes come from RxNav for the substance's RxCUI.",
  "",
  "## DrugBank",
  "",
  "- `DRUGBANK` ids come from RxNav: `https://go.drugbank.com/drugs/{c}`.",
  "- DrugBank refuses automated requests (a plain HTTP request gets 403), so a person checks a DrugBank id in a browser, or through the DrugBank link on the DDInter drug page.",
  "",
  "## ICD-11",
  "",
  "- `ICD11_XM` codes come from the DGDA register. The ICD-11 browser has no link by code: open `https://icd.who.int/browse/latest-release/mms/en` and search for the code.",
  "",
  "## DDInter 2.0",
  "",
  "- Authoritative for DDInter entries and their route scope (`extraction.ingredients[].ddinter.entries[]` and `extraction.ingredients[].ddinter.chosen[]`): the drug page `https://ddinter2.scbdd.com/server/drug-detail/{c}/`.",
  "- Authoritative for a pair's `severity`, `actions`, `interaction`, `management` and `textMissing`: the pair page `https://ddinter2.scbdd.com/server/interact/{interactionId}/`. A pair with no stored interaction id has no link.",
  "",
  "## Cross-check only: US drug labels",
  "",
  "- DailyMed: `https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query={name}`.",
  "- openFDA: `https://api.fda.gov/drug/label.json?search=openfda.generic_name:\"{name}\"&limit=1`.",
  "- They cover US-approved drugs only and hold label text, not structured pairs. They are never authoritative for any field here, so a difference from DDInter is at most `suspicious`.",
);

const CHECKS = md(
  "For each problem filter: what it matches, what to compare, against which source, and what counts as a mismatch (`wrong_value`, `missing_value` or `suspicious`). Then one section per stage. Start each check from `get_record`.",
  "",
  "## `strength_missing`",
  "",
  "- Matches: a parsed ingredient in `stages[clinical].evidence.parsed[]` has no strength value.",
  "- Compare `stages[clinical].evidence.parsed[]` and `extraction.ingredients[].strengthValue` with `extraction.genericContentRaw` and `source.json`, using `pitfalls`.",
  "- Mismatch (`missing_value`): the register states a strength that we hold as null.",
  "- A partial parse never carries strengths, by design, so every partial parse matches too: check those under `parse_partial`.",
  "",
  "## `parse_partial`",
  "",
  "- Matches: `extraction.parseStatus` is `partial`; `extraction.parseNote` says why.",
  "- Compare every ingredient named in `extraction.genericContentRaw` with the names in `stages[clinical].evidence.parsed[]` and `extraction.dgdaIngredients[]`.",
  "- Mismatch: an ingredient the register names that the parse lost (`missing_value`), or a parsed name that is not an ingredient (`wrong_value`).",
  "",
  "## `route_assumed`",
  "",
  "- Matches: `stages[ddinter].evidence.route_assumed` is true, the pipeline's view.",
  "- Compare it with `ddinterRoute.routeAssumed`, the API's view: a disagreement is itself a finding (`suspicious`).",
  "- Compare `ddinterRoute.route` with `extraction.dosageForm` (`pitfalls` lists the routes).",
  "- On DDInter, look for an entry for that route under each name in `extraction.ingredients[].names[]`: an entry for the route that we did not choose is `missing_value`.",
  "",
  "## `no_ddinter_data`",
  "",
  "- Matches: a substance's `extraction.ingredients[].coverage` is `none`; `not_run` never matches.",
  "- Search DDInter for every name in `extraction.ingredients[].names[]`; `pitfalls` lists name traps.",
  "- Mismatch (`missing_value`): DDInter has an entry for the substance. If none is found, report it as no data, never as safe.",
  "",
  "## `unaligned`",
  "",
  "- Matches: an ingredient has `extraction.ingredients[].bdsId` null, or `stages[clinical].evidence.aligned[]` has an entry whose `bds_id` is null.",
  "- Compare the DGDA ingredient's XM code and name in `extraction.dgdaIngredients[]` with the parsed name in `stages[clinical].evidence.aligned[]`.",
  "- Mismatch (`missing_value`): two names of the same substance that did not align. An elemental name that is not aligned to a salt is by design (`pitfalls`).",
  "",
  "## `stage_warn`",
  "",
  "- Matches: a stage result with status `warn`; with `stage`, that stage's result.",
  "- Read the stage's `notes` in `stages[]`, or its note in `items[].stages[]` from `get_batch`, then follow that stage's section below.",
  "",
  "## `stage_fail`",
  "",
  "- Matches: a stage result with status `fail`. Read its notes, then follow that stage's section below.",
  "",
  "## Stage `dgda`",
  "",
  "- Compare `extraction.tradeName`, `extraction.darNumber`, `extraction.company`, `extraction.dosageForm`, `extraction.genericContentRaw` and `extraction.dgdaIngredients[]` with `source.json`, then `source.json` with the live register record from the OCL API (`sources`).",
  "- In `source.json` they are the `extras` keys `trade_name` (else `display_name`), `dar_number`, `company`, `dosage_form` and `generic_content_raw`; each DGDA ingredient is a `mappings` entry with `map_type` `Has-active-ingredient`, its XM code in `to_concept_code` and its name in `to_concept_name`.",
  "- The extraction collapses whitespace, skips retired mappings and keeps the first name for each XM code (`pitfalls`).",
  "- It fails when the concept is not found at source, or is not a registered Drug product.",
  "",
  "## Stage `substances`",
  "",
  "- Check the `RXCUI`, `ATC` and `DRUGBANK` codes in `extraction.ingredients[].codes[]` against RxNav and the WHO index.",
  "- An `rxnav-approx` code came from an approximate name search: check by name that the RxCUI is the same substance.",
  "- Compare at the ingredient level: our `RXCUI` is an IN, so when RxNav finds a precise ingredient (PIN) for a salt name, follow it to its ingredient before you compare, and compare `ATC`, `DRUGBANK` and `SNOMEDCT` with that ingredient's codes (`pitfalls`).",
  "- It warns for a substance with no RxCUI, or a DGDA ingredient that no parsed name aligned to. It fails when DGDA maps no ICD-11 ingredient.",
  "",
  "## Stage `clinical`",
  "",
  "- Check each parsed strength, unit and per value in `stages[clinical].evidence.parsed[]` against `extraction.genericContentRaw`, using `pitfalls`.",
  "- Check the route and dose form in `extraction.clinicalDrug` against `extraction.dosageForm`.",
  "- It fails when the parse failed. It warns when the parse was partial, or when a full parse made no clinical drug: a name not aligned, two names on one substance, or a substance not in the parsed content.",
  "",
  "## Stage `ddinter`",
  "",
  "- Check each chosen entry's route scope in `extraction.ingredients[].ddinter.chosen[]` against `ddinterRoute.route`.",
  "- For a `name` match, compare the DrugBank id on the DDInter drug page with the substance's `DRUGBANK` codes.",
  "- Check a pair's severity and actions against its DDInter pair page (`pairs.inBatch.pairs[].link`), and its interaction and management text through `get_pairs`.",
  "- `textMissing` has three shapes. On a pair, `pairs.inBatch.pairs[].textMissing` holds two booleans, `interaction` and `management`, true when that text is missing; on a stage, `stages[].textMissing` lists the pairs whose DDInter text was not found, with `ddinterA`, `ddinterB`, their names and `severity`; `stages[ddinter].evidence.text_missing` lists the same pairs as id pairs.",
  "- A pair whose text was not found may or may not have a `link`: the pipeline stores its DDInter interaction id only when it finds a text, and a later run that finds none removes the text but keeps an id stored earlier. With a link, open that pair page. Without one, open the DDInter drug page of `ddinterA` or `ddinterB` in a browser, find the partner in its interaction list and open that interaction: a text found there that we lack is `missing_value`.",
  "- Its warnings: matched by name only, DDInter route assumed, no DDInter entry for the route, no interaction data, DDInter text not found. It fails when a DDInter pair list could not be read in full, or a DGDA ingredient has no substance yet.",
);

const PITFALLS = md(
  "These traps come from how the pipeline reads Bangladesh registrations. Know them before you call a value wrong.",
  "",
  "## Units and numbers",
  "",
  "- `gm` is grams and is stored as `g`, also as a per unit.",
  "- A leading decimal is a number: `.5 mg` is 0.5 mg.",
  "- `Lac` (lakh) is 100,000: `6 Lac Unit` is stored as 600000 `unit`. The unit word after `Lac` is kept: `unit`, `units` or `iu`.",
  "- `MIU` is 1,000,000 IU: `3 MIU` is stored as 3000000 `iu`.",
  "- `Lf` (vaccines) is kept as the unit `lf`.",
  "- Per puff, per spray and per metered inhalation are stored as per `actuation`; per litre or liter as per `l`.",
  "- A per with no number is per 1: `5 mg/ml` is 5 mg per 1 ml.",
  "- Thousands separators are read as one number (`1,000` is 1000); any other comma inside a number fails the parse as an ambiguous number.",
  "- A trailing per on the last strength of a combination applies to every strength when no other strength has one: in `A 3 gm + B 300 mg/100 ml` both strengths are per 100 ml.",
  "",
  "## Names",
  "",
  "- An elemental name (`Calcium`, `Zinc`, `Iron`) states an elemental amount, not the amount of a salt.",
  "- The `clinical` stage's one-ingredient rule never pairs an elemental name with a salt substance (`Zinc sulphate`, `calcium carbonate`): an elemental name that is not aligned is by design.",
  "- An element and its salt never have equal strengths: a record that stores an elemental name's strength under a salt substance is a finding (`wrong_value`).",
  "- Trailing salt words are ignored when names are compared (`Amlodipine Besilate` matches `Amlodipine`), except when only an element would be left: `Calcium Acetate` stays whole.",
  "- INN and US names are the same substance: `Salbutamol` and `albuterol`, `Paracetamol` and `acetaminophen`, `Acetylsalicylic acid` and `aspirin`.",
  "- The register, RxNorm and DDInter may each use a different name: Napa's ingredient is `Paracetamol` in the register's generic content, `Acetaminophen` in ICD-11 and DDInter, and `acetaminophen` in RxNorm. A name difference alone is not a mismatch.",
  "",
  "## DDInter",
  "",
  "- DDInter entries are route-scoped: an entry named with (ophthalmic), (otic), (nasal) or (topical) has that scope, and any other entry is `systemic`.",
  "- So an `inhalation`, `vaginal`, `rectal`, `oromucosal` or `unspecified` product never finds an entry for its own route: the general entry stands in when there is one, with `routeAssumed` true.",
  "- Chloramphenicol eye drops use the ophthalmic entry `DDInter352`, not the systemic `DDInter351`.",
  "- `routeAssumed` means no entry matched the product's route, or the route is unknown, and the general entry (scope `systemic` or `any`) stood in.",
  "- A substance with entries for other routes only, and no general one, gets no entry for the product; the stage note says No DDInter entry for route, then the route.",
  "- DDInter's drug page may list ATC codes that we do not hold, because our ATC codes come from RxNav for the substance's RxCUI. That alone is not a mismatch.",
  "- Some substances have no DDInter data (coverage `none`). That never means a combination is safe.",
  "- RxNav may list more than one DrugBank id for one substance, and we keep every one it lists. A DDInter drug page's DrugBank id is used only when the page links exactly one.",
  "",
  "## Register text",
  "",
  "- Register text is stored with each run of whitespace collapsed to one space and no leading or trailing space: the register's `Paracetamol  500 mg` (two spaces) is stored as `Paracetamol 500 mg`. A whitespace-only difference is not a mismatch.",
  "- The extraction skips retired ingredient mappings, and when one XM code has more than one mapping it keeps the first name.",
  "",
  "## Shared clinical drugs",
  "",
  "- A clinical drug is shared by every brand with its signature, and it keeps the first brand's text and dose form spelling.",
  "- So `extraction.ingredients[].raw` may read `Paracetamol 500 mg` on a record whose `extraction.genericContentRaw` reads `Paracetamol BP 500mg`.",
  "- Check a record's own text in `extraction.genericContentRaw` and `stages[clinical].evidence.parsed[]`; a `raw` or `doseForm` that differs from it is not a mismatch.",
  "",
  "## RxNorm codes",
  "",
  "- Our `RXCUI` is the base ingredient (IN), not a salt: searching RxNav for the register's salt name (`Amlodipine Besilate`) finds a precise ingredient (PIN) with another RxCUI, and that PIN's ingredient is the one to compare.",
  "- When the lookup cannot settle on one ingredient (several match, or the concept found is neither IN nor PIN), no RxCUI is stored.",
  "",
  "## Register ids",
  "",
  "- DAR category `077` (the third segment of the DAR number) marks a probable veterinary product, such as the register's boluses and water-soluble powders. This is still to be confirmed with the pharmacist or DGDA.",
  "- Some DGDA concept ids carry a malformed DAR number with no category, for example `001--023--zinacef`.",
  "- Concept ids may hold characters such as `(`: `040-090(-077--mectigen-vet-oral-solution` is a real id. Copy ids exactly.",
);

const REPORTING = md(
  "Report one finding per mismatch. Never claim a fix.",
  "",
  "## Finding format",
  "",
  "- `batchId` and `conceptId` of the record; or `bdsId` for a substance, with `ddinterA` and `ddinterB` for a pair.",
  "- `requestId`: the `metadata.requestId` of the read you checked, so the team can find that exact read.",
  "- `fieldPath`: the exact JSON path in the QA API answer's `data`, for example `extraction.ingredients[0].strengthValue`.",
  "- `ours`: our value, verbatim.",
  "- `source`: the source's value, verbatim.",
  "- `sourceUrl`: the address you checked (the field's own `link` when it has one) and the date you checked it.",
  "- `mismatch`: `wrong_value` (the source says something else), `missing_value` (the source has a value we do not) or `suspicious` (it looks wrong, but the source does not settle it).",
  "- One or two sentences of evidence.",
  "",
  "## Rules",
  "",
  "- Never claim a fix, never suggest a dose or treatment, and never include patient data, a key or anyone's personal data.",
  "- No interaction data is reported as no data, never as safe.",
  "- A record whose `extractedAt` is later than in the read you checked was extracted again: check it again before you repeat a finding.",
  "- A batch's `runAt` does not move when only some of its records are extracted again.",
  "",
  "## How findings reach the team",
  "",
  "- Report findings to the IntelliDrugs team as the product owner directs.",
  "- A reviewer confirms each one on the review desk and records it there with Report issue. QA accounts and keys cannot record decisions.",
);

/** §7.11.1: the six topics, their pinned titles and related topics, and the one-line summaries the index and resources use. */
export const GUIDE: Readonly<Record<GuideTopic, GuideEntry>> = Object.freeze({
  overview: {
    title: "What IntelliDrugs is and what QA is for",
    summary: "What IntelliDrugs is, the review gate, what QA is for, and the rules: findings are reports, and no data never means safe.",
    text: OVERVIEW,
    related: ["data_model", "checks", "reporting"],
  },
  data_model: {
    title: "How a record is built, field by field",
    summary: "How a brand product becomes parsed strengths, a clinical drug, substances with codes, DDInter entries and pairs, field by field.",
    text: DATA_MODEL,
    related: ["sources", "checks"],
  },
  sources: {
    title: "Which source to check each field against",
    summary: "The authoritative source and address for each field: DGDA through OCL, RxNav, WHO ATC, DrugBank, ICD-11, DDInter; US labels to cross-check.",
    text: SOURCES,
    related: ["data_model", "checks", "pitfalls"],
  },
  checks: {
    title: "Checks for each problem filter and stage",
    summary: "What to compare, against which source, and what counts as a mismatch, for each problem filter and each pipeline stage.",
    text: CHECKS,
    related: ["sources", "pitfalls", "reporting"],
  },
  pitfalls: {
    title: "Known traps in the data",
    summary: "Known traps: Bangladesh units and per values, elemental and salt names, INN and US names, DDInter route scope, missing data, odd ids.",
    text: PITFALLS,
    related: ["checks", "sources"],
  },
  reporting: {
    title: "How to report a finding",
    summary: "The finding format (record, field path, our value, the source's value, source address, kind of mismatch), the rules, and who gets it.",
    text: REPORTING,
    related: ["overview", "checks"],
  },
});

/** §7.11.2: the text get_qa_guide gives without a topic: the index (one line per topic), then the overview. */
const INDEX = md(
  "## Topics",
  "",
  ...GUIDE_TOPICS.map((t) => `- \`${t}\`: ${GUIDE[t].summary}`),
  "",
  "Call get_qa_guide with one topic, or read intellidrugs://qa-guide/{topic}.",
  "",
  "## Overview",
  "",
  GUIDE.overview.text,
);
const INDEX_RELATED: readonly GuideTopic[] = ["data_model", "sources", "checks", "pitfalls", "reporting"];

export type GuideBody = { guideVersion: string; topic: GuideTopic | null; title: string; text: string; related: GuideTopic[] };

/** The JSON of a get_qa_guide result's second text block; `related` is a fresh array on every call. */
export function guideBody(topic: GuideTopic | null): GuideBody {
  if (topic === null) return { guideVersion: GUIDE_VERSION, topic: null, title: GUIDE_TITLE, text: INDEX, related: [...INDEX_RELATED] };
  const e = GUIDE[topic];
  return { guideVersion: GUIDE_VERSION, topic, title: e.title, text: e.text, related: [...e.related] };
}

export type GuideArgs = { ok: true; topic: GuideTopic | null } | { ok: false; field: string };

const isTopic = (v: unknown): v is GuideTopic => typeof v === "string" && (GUIDE_TOPICS as readonly string[]).includes(v);

/**
 * get_qa_guide's input rule, in the §7.9.8 style: the first input (in argument order) other than `topic` is refused by its
 * name, capped at 100 code points; then `topic`, when present, must be exactly one of GUIDE_TOPICS.
 */
export function checkGuideArgs(args: Readonly<Record<string, unknown>> | undefined): GuideArgs {
  const a: Readonly<Record<string, unknown>> = args ?? {};
  for (const name of Object.keys(a)) if (name !== "topic") return { ok: false, field: [...name].slice(0, 100).join("") };
  if (!Object.hasOwn(a, "topic")) return { ok: true, topic: null };
  const topic = a.topic;
  return isTopic(topic) ? { ok: true, topic } : { ok: false, field: "topic" };
}

export type GuideResource = { uri: string; name: GuideTopic; title: string; description: string; mimeType: "text/markdown" };

/** §7.11.3: resources/list, one entry per topic in GUIDE_TOPICS order. */
export function guideResources(): GuideResource[] {
  return GUIDE_TOPICS.map((t) => ({ uri: GUIDE_URI_PREFIX + t, name: t, title: GUIDE[t].title, description: GUIDE[t].summary,
    mimeType: "text/markdown" as const }));
}

/** §7.11.3: resources/read of an exact topic uri, or null (both servers answer -32002 "Resource not found"). */
export function readGuideResource(uri: string): { uri: string; mimeType: "text/markdown"; text: string } | null {
  const topic = GUIDE_TOPICS.find((t) => GUIDE_URI_PREFIX + t === uri);
  return topic === undefined ? null : { uri, mimeType: "text/markdown", text: GUIDE[topic].text };
}

/** §7.11.2: the sixth tool of both servers; each server adds the same annotations as its other tools. */
export const GUIDE_TOOL: {
  name: "get_qa_guide"; title: string; description: string;
  inputSchema: { type: "object"; properties: { topic: Record<string, unknown> }; additionalProperties: false };
} = {
  name: "get_qa_guide",
  title: "Get the QA guide",
  description: "How to check IntelliDrugs data: what it is, how a record is built, which source to check each field against, "
    + "a checklist per problem filter and stage, known traps, and how to report a finding. Without topic: the topic index and "
    + "the overview. Read one topic at a time. The answer is JSON: guideVersion, topic, title, text (Markdown) and related "
    + "topics. Read-only; it holds no record data and is never clinical advice.",
  inputSchema: {
    type: "object",
    properties: { topic: { type: "string", enum: [...GUIDE_TOPICS],
      description: "Optional: one of overview, data_model, sources, checks, pitfalls, reporting. Leave it out for the topic index and the overview." } },
    additionalProperties: false,
  },
};
