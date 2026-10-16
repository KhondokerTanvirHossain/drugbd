/*
 * Board P wording for the public site (docs/artifacts/2026-10-12-intellidrugs-public.html), with the §1.6 corrections
 * (items 1, 9, 15 and 17) applied. Client-safe. New copy (§1.7) lives in NEW_COPY / PUBLIC_NEW (lib/copy.ts); strings
 * that name "low risk" live in lib/copy.ts too, because the paraphrase guard scans every other file.
 */
import { P1C_COPY } from "@/lib/copy";

export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const NAV = {
  label: "Main", medicines: "Medicines", checker: "Interaction checker", learn: "Learn", partners: "For partners",
  signIn: "Sign in", menu: "Menu", searchLabel: "Search medicines", searchPlaceholder: "Brand, substance or DAR number",
  privacy: "Privacy",
} as const;

/** The other name systems that "call it" the preferred name (search hit line). */
export const SYSTEM_NAMES: Record<string, string> = { rxnorm: "RxNorm", icd11: "ICD-11", ddinter: "DDInter" };

export const FOOTER = {
  linksHeading: "IntelliDrugs",
  sourcesHeading: "Data sources and licences",
  sources: [
    { name: "DGDA register", text: ", the official register of DGDA-registered products.", confirm: null },
    { name: "DDInter 2.0", text: ", drug–drug, drug–disease and drug–food interactions.", confirm: "Licence line to confirm" },
    { name: "RxNav and RxNorm", text: ". This product uses publicly available data from the U.S. National Library of Medicine (NLM). NLM is not responsible for the product and does not endorse it.", confirm: null },
    { name: "ICD-11", text: " medicament codes, © World Health Organization, CC BY-ND 3.0 IGO.", confirm: null },
    { name: "ATC, DrugBank and SNOMED CT", text: " codes, mapped through RxNav.", confirm: "Licence lines to confirm" },
  ],
  host: "drugdb.eliooo.org",
  legal: "Severity levels and management text are DDInter 2.0's, shown truncated, never rewritten.",
} as const;

/** A tick line with a bold middle: [before, bold, after]. */
export type Tick = readonly [string, string, string];

export const LANDING = {
  pilot: "Pilot: {n} medicines being reviewed by pharmacists",
  h1: "Bangladesh's medicines, traced from brand to substance and checked by a pharmacist.",
  lede: "IntelliDrugs maps every DGDA-registered brand to its clinical drug and active substances, with ICD-11, RxNorm, ATC, DrugBank and SNOMED CT codes and DDInter 2.0 interactions. A record goes public only after a pharmacist approves it.",
  ledeNarrow: "Every DGDA-registered brand mapped to its clinical drug, active substances, international codes and DDInter 2.0 interactions. Public only after a pharmacist approves it.",
  ctaCheck: "Check interactions",
  ctaSearch: "Search medicines",
  fine: "Free to search. Continue with Google to sign in or create an account.",
  statsLabel: "IntelliDrugs in numbers",
  statRegister: "products in the official DGDA register",
  statCodesN: "5", statCodes: "code systems: ICD-11, RxNorm, ATC, DrugBank, SNOMED CT",
  statKindsN: "3", statKinds: "interaction kinds from DDInter 2.0: drug–drug, drug–disease, drug–food",
  statPilot: "medicines in pilot batch {id}, under pharmacist review now",
  audHeading: "One record, three kinds of work",
  audSub: "The same pharmacist-approved record serves the prescriber at the desk, the pharmacist at the counter and the systems that move prescriptions around.",
  audiences: [
    { title: "Doctors and prescribers", who: "Prescribing and checking a patient's medicines", ticks: [
      ["Find a brand by the name on the strip and see its ", "substance and strength", "."],
      ["Check a patient's medicines against each other, ", "Major first", "."],
      ["Read DDInter 2.0's own management text, truncated, ", "never paraphrased", "."]] as readonly Tick[] },
    { title: "Pharmacists", who: "Dispensing, substitution and review", ticks: [
      ["See the brands that share a ", "clinical drug", ", for substitution."],
      ["Trace every record to its ", "DGDA register entry", " and the checks it passed."],
      ["Invited pharmacists review records. ", "Their approval publishes them.", ""]] as readonly Tick[] },
    { title: "Partner companies", who: "EMR, pharmacy and pharma systems", ticks: [
      ["Permanent ", "BDS", " substance ids and BDC clinical drug ids."],
      ["Crosswalk codes to ", "ICD-11, RxNorm, ATC, DrugBank and SNOMED CT", "."],
      ["An interaction check that returns ", "pharmacist-approved data only", "."]] as readonly Tick[] },
  ],
  howHeading: "How a record becomes trustworthy",
  howSub: "Every product follows the same path. The last step before public is a person, and a re-run sends the record back to that person.",
  steps: [
    { title: "DGDA register", body: "Trade name, company, dosage form and generic text, read from the DGDA register exactly as filed." },
    { title: "Extraction", body: "Substances and strengths become a clinical drug, with codes for each substance." },
    { title: "4 automated checks", body: "DGDA load, substances, clinical drug and DDInter. Each ends OK, Warning or Failed with the pipeline's own note." },
    { title: "Pharmacist approval", body: "A pharmacist compares the register with the result. An engineer's check is recorded but never publishes." },
    { title: "Public", body: "Search, product pages, the checker and the partner API show the record." },
  ],
  stepRaw: "Paracetamol 500 mg", stepClinical: "Acetaminophen 500 mg tablet", stepBdc: "BDC-000001",
  loopLead: "Re-run after approval", loopText: "The record leaves public view until a pharmacist approves it again.",
  promisesHeading: "Three promises",
  promisesSub: "Fixed wording, the same on every screen and in the API. Silence is never shown as safety.",
  promiseNoData: "Missing data is never shown as safe",
  promiseNoDataName: "Domperidone", promiseNoDataId: "BDS-000010",
  promiseNoDataNote: "Pairs with Domperidone are counted as not checked, never as checked.",
  promiseApproval: "Nothing is public until a pharmacist approves it",
  promiseApprovalNote: "An engineer's check is recorded but does not publish. A record re-run after approval goes back to review.",
  promiseUnknownNote: "DDInter lists 512 of Acetaminophen's 645 drug pairs without a severity. They keep their own group and are never merged with Minor.",
  partnersHeading: "For partners: the same records, by API",
  partnersSub: "EMR, pharmacy and pharma systems get what the site shows: pharmacist-approved records, permanent ids and crosswalk codes, in one response envelope.",
  partnerTicks: [
    "Check several products in one call. Alerts come sorted by severity, Major first.",
    "No-data substances and unreviewed products are listed by name, ",
    "Every response uses ",
  ],
  partnerTickBold: "never dropped",
  partnerEnvelope: "{success, data, message, errors, metadata}",
  requestAccess: "Request partner access",
  requestNote: "Sign in first. Access is granted by the IntelliDrugs team.",
  codeRequest: "POST /v1/interactions/check",
  codeRequestLabel: "Request example",
  codeResponseLabel: "Public response example",
  responseToday: "Public response today.",
  responseNoneApproved: "None of the three is approved by a pharmacist, so all three are in notReviewed and nothing is checked. An empty alerts list does not mean they are safe together.",
} as const;

export const LOOKUP = {
  brand: "Brand in the DGDA register", brandNarrow: P1C_COPY.review.colBrand, clinical: "Clinical drug", substance: "Active substance",
  interactions: "Drug interactions in DDInter 2.0, {n} pairs", filedAs: "Filed as ", route: ", {route} route",
  alsoListed: ", also listed as {name}", alsoNarrow: ", also {name}",
} as const;

export const SEARCH = {
  resultsFor: 'Results for "{q}"',
  substanceOne: "substance", substanceMany: "substances", productOne: "product", productMany: "products",
  groupSubstance: "Substance", groupSubstances: "Substances", groupProducts: "Products",
  hitDgda: "Matched {matched}, the name in the DGDA register. {systems} call it {preferred}.",
  dataFound: "Interaction data found in DDInter 2.0, {ids}",
  filedAs: "Filed as {raw}. Clinical drug {display}, {bdc}.",
  stubLine: "A pharmacist hasn't approved this record yet, so its substance, codes and interactions are hidden.",
  noResults: 'No medicines match "{q}"',
  noResultsHint: "Check the spelling, or search by brand, substance or DAR number.",
  searchFor: "Search for {suggestion}",
  pilot: "IntelliDrugs is in its pilot. {n} medicines are in review now, and more follow in later batches.",
} as const;

export const STUB = {
  pending: "A pharmacist hasn't approved this record yet. Until then IntelliDrugs hides its clinical drug, codes and interactions, so nobody relies on data that hasn't been checked.",
  notNotFound: 'This is not the same as "not found" or "no data". The record exists and is in review in batch {batchId}.',
  substancePending: "A pharmacist hasn't approved this record yet. Until then IntelliDrugs hides its codes and interactions, so nobody relies on data that hasn't been checked.",
  searchOther: "Search other medicines",
} as const;

export const PRODUCT = {
  crumbRoot: "Medicines",
  crumbLabel: "Breadcrumb",
  whatsIn: "What's in it", whatsInSub: "From the register to the substance",
  traceBrand: "Brand, as filed with DGDA", traceClinical: "Clinical drug", traceSubstance: "Active substance",
  clinicalForm: "{form}, {route} route", alsoListed: "Also listed as {name}", namesLabel: "Names for this substance",
  codes: "Codes", codesSub: "{k} code systems and the DDInter entry, for {name} {bdsId}", codesCaption: "Crosswalk codes for {name}",
  codesRegion: "Codes for {name}",
  colSystem: "System", colCode: "Code", colWhat: "What the system is", colHow: "How it was matched",
  how: "{method}, confidence {confidence}",
  systems: {
    ICD11_XM: ["ICD-11", "WHO's ICD-11 medicament code. The DGDA register lists ingredients with it."],
    RXCUI: ["RxNorm", "Normalised drug names from the U.S. National Library of Medicine."],
    ATC: ["ATC", "WHO Anatomical Therapeutic Chemical classification."],
    DRUGBANK: ["DrugBank", "DrugBank's record for the substance."],
    SNOMEDCT: ["SNOMED CT", "Clinical terminology used in health records."],
    DDINTER: ["DDInter", "The DDInter 2.0 entry the interactions below come from."],
  } as Record<string, readonly [string, string]>,
  interactions: "Interactions", interactionsSub: "From DDInter 2.0, for {name}",
  pairsHeading: "{total} drug–drug pairs",
  diseaseOne: "drug–disease interaction", diseaseMany: "drug–disease interactions",
  foodOne: "drug–food interaction", foodMany: "drug–food interactions",
  checks: "Automated checks", checksSub: "{ok} OK, {w} {warnings}. Notes are the pipeline's own.",
  warningOne: "Warning", warningMany: "Warnings",
  noNote: "No pipeline note.",
  textMissing: "DDInter text not found for {n} {pairs}:",
  pairOne: "pair", pairMany: "pairs", brandOne: "brand", brandMany: "brands",
  asideLabel: "About this record",
  verification: "Verification",
  verifiedText: "A pharmacist compared this record with the DGDA register on {date}. Decision history shows roles, not names.",
  otherBrands: "Other brands of {name}",
  whereFrom: "Where this record comes from",
  dlSource: "Source", dlConcept: "Concept", dlExtracted: "Extracted", dlBatch: "Batch", dlChecks: "Checks",
  dgdaRegister: "DGDA register",
  checksValue: "{ok} OK, {w} Warning",
  checkWith: "Check {brand} with other medicines",
  report: "Report a problem with this record",
  sourceLine: "Source: DDInter 2.0, {a} + {b}",
} as const;

export const CHECK = {
  h1: "Check interactions",
  fieldLabel: "Add a medicine",
  placeholder: "Brand or substance, such as Napa or paracetamol",
  help: "Up and down arrows to move, Enter to add, Esc to close. 2 to 20 medicines.",
  selected: "Selected, {k} of 20",
  clearAll: "Clear all",
  none: "No medicines yet.",
  remove: "Remove {brand}",
  scenarios: "Start from a scenario",
  empty: "Add at least 2 medicines to check them against each other.",
  emptyResults: "Add medicines with the field on the left, or start from a scenario. Pairs appear here, Major first.",
  groupHeading: "{severity}, {k} {pairs}",
  matches: ". Matches {name}",
  matchesFor: ". Matches {name}, a name for {substance}",
  managementTruncated: "Management, truncated. Full text from DDInter 2.0.",
  managementFull: "Management, full text from DDInter 2.0.",
  interactionTruncated: "Interaction description, truncated. Full text from DDInter 2.0.",
  interactionFull: "Interaction description, full text from DDInter 2.0.",
  noText: "DDInter 2.0 gives no text for this pair.",
  metaAction: "{a} + {b}. Action: {actions}",
  legendHeading: "Severity legend, from DDInter 2.0",
  noDataChip: "No data",
  added: "{brand} added. {summary}",
  removedAnnounce: "{brand} removed. {summary}",
  cleared: "All medicines removed.",
  scenarioLoaded: "Scenario loaded: {scenario}. {summary}",
  notCheckedChip: "Not checked",
  medicineOne: "medicine", medicineMany: "medicines", pairOne: "pair", pairMany: "pairs", productOne: "product", productMany: "products",
  has: "has", have: "have",
} as const;

export const SIGNIN_CARD = {
  turnstile: "Cloudflare Turnstile",
  inviteLead: "Reviewing for the pilot?",
  inviteBody: "Pharmacists and engineers join by invite. Continue with the Google account your invite was sent to, and your reviewer tools appear.",
  privacy: "We use your Google name and email address only to sign you in and, for reviewers, to record each decision. Public decision history shows roles, never emails. We never post to your Google account.",
  privacyLink: "Privacy",
  readerHeading: "You're signed in as a reader",
  readerBody: "You can search medicines and check interactions. Reviewing needs an invite. If you were invited, sign out and continue with the invited Google account.",
  signOut: "Sign out",
  signedInAs: "Signed in as {name}",
  reviewerHeading: "You're a {role} reviewer for batch {id}",
  stepWaiting: "{n} records are waiting. Each shows {pill} until a pharmacist approves it.",
  stepCompare: "Compare the DGDA register with the extraction, then press {a} or choose Looks correct. You have {undo} seconds to undo with {u}.",
  stepPharmacist: "Your approval publishes the record. If the pipeline re-runs it later, it comes back to you as {pill}.",
  shortcutsNote: "Shortcuts work inside the desk only, and pause while you type.",
} as const;

/**
 * §6.6 substance page. "The boards define no substance page. It uses the product-page components only." These are the
 * page's own headings and lines; §1.7 has no row for them (recorded in the PR as a spec gap), so they live here.
 */
export const SUBSTANCE = {
  entriesHeading: "DDInter entries",
  ddHeading: "Drug–drug interactions",
  filterLabel: "Filter by severity",
  filterAll: "All",
  diseaseHeading: "Drug–disease",
  foodHeading: "Drug–food",
  productsHeading: "Products",
  clinicalHeading: "Clinical drugs",
  pairMeta: "{a} ({route}) + {b}. Action: {actions}",
  entryLine: "{id} ({route})",
  noneListed: "None listed in DDInter 2.0.",
  fullRecord: "Full record in DDInter 2.0",
} as const;

export const PARTNERS = {
  h1: "For partners",
  apiHeading: "Where the API stands",
  apiNow: "The API runs on the internal network today. Partner API keys, usage metering, OpenAPI docs and monthly releases are planned.",
  learnMore: "Learn chapter 8, For partners",
  formHeading: "Request partner access",
} as const;
