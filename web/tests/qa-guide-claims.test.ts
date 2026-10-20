import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { qaReference } from "@/lib/qa-api-reference";
import { GUIDE, GUIDE_TOPICS, guideBody, type GuideTopic } from "@/lib/qa-guide";
import { CLAIMS, type Claim } from "./fixtures/qa-guide-claims";

/*
 * §7.11.7, §11.1 "QA guide accuracy": every factual line of the guide is tied to its source. Each non-empty, non-heading
 * line of every topic (and of the index) holds at least one claim's text; each claim's text is in its topic; each code,
 * test or spec source contains its needle (read from the repository, as the reference test reads etl/); each external
 * source is an https address with the date it was opened. Field paths in data_model, checks and reporting resolve in the
 * QA API reference's example answers, so a renamed field fails here as it fails the reference; every source address in
 * sources is one of the §7.11.7 patterns, and SourceLinks.java builds the ones it owns.
 */

const REPO = join(__dirname, "..", "..");
const SPEC = readFileSync(join(REPO, "docs/superpowers/specs/2026-10-12-intellidrugs-ux-design.md"), "utf8");
const SOURCE_LINKS = readFileSync(join(REPO, "api/src/main/java/com/niramoy/bddrug/domain/SourceLinks.java"), "utf8");

type Where = GuideTopic | "index";
/** The index's own lines: everything before its "## Overview" (the overview's lines are the overview topic's). */
const INDEX_TEXT = (() => {
  const text = guideBody(null).text;
  return text.slice(0, text.indexOf("## Overview")).trimEnd();
})();
const textOf = (w: Where) => (w === "index" ? INDEX_TEXT : GUIDE[w].text);
const factLines = (w: Where) => textOf(w).split("\n").filter((l) => l.trim() !== "" && !l.startsWith("#"));

/**
 * A spec section: from its heading (matched by its number or name prefix) to the next heading of the same or a higher level.
 * A `#` line inside a fenced code block is not a heading (§7.11.2 quotes the index, whose lines start with `## `).
 */
function specSection(section: string): string | null {
  const lines = SPEC.split("\n");
  let fenced = false;
  const heading = lines.map((l) => {
    if (/^\s*```/.test(l)) fenced = !fenced;
    return fenced ? null : /^(#{1,6}) (.+)$/.exec(l);
  });
  const start = heading.findIndex((m) => m !== null && (m[2] === section || m[2].startsWith(`${section} `)));
  if (start < 0) return null;
  const level = heading[start]![1].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = heading[i];
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

describe("the claims map (§7.11.7)", () => {
  it.each([...GUIDE_TOPICS, "index"].map((w) => [w as Where]))("%s: every non-empty, non-heading line holds a claim", (w) => {
    const mine = CLAIMS.filter((c) => c.topic === w);
    for (const line of factLines(w)) {
      expect(mine.some((c) => line.includes(c.text)), `${w}: no claim for the line: ${line}`).toBe(true);
    }
  });

  it("every claim's text is in one line of its topic", () => {
    for (const c of CLAIMS) {
      expect(c.text.length, JSON.stringify(c)).toBeGreaterThan(0);
      expect(factLines(c.topic).some((l) => l.includes(c.text)), `${c.topic}: not in any line: ${c.text}`).toBe(true);
    }
  });

  const label = (c: Claim) => `${c.topic}: ${c.text}`;

  it("each code and test source exists and contains its needle", () => {
    for (const c of CLAIMS) {
      const s = c.source;
      if (s.kind !== "code" && s.kind !== "test") continue;
      const path = join(REPO, s.file);
      expect(existsSync(path), `${label(c)}: no file ${s.file}`).toBe(true);
      expect(readFileSync(path, "utf8").includes(s.needle), `${label(c)}: ${s.file} lacks ${s.needle}`).toBe(true);
      if (s.kind === "test") expect(s.file, label(c)).toMatch(/(^|\/)tests?\/|\.test\.|\.spec\.|Test\.java$/);
    }
  });

  it("each spec source names a section of the spec that contains its needle", () => {
    for (const c of CLAIMS) {
      const s = c.source;
      if (s.kind !== "spec") continue;
      const body = specSection(s.section);
      expect(body, `${label(c)}: no spec section ${s.section}`).not.toBeNull();
      expect(body!.includes(s.needle), `${label(c)}: §${s.section} lacks ${s.needle}`).toBe(true);
    }
  });

  it("each external source is an https address with the DD/MM/YYYY date it was opened", () => {
    for (const c of CLAIMS) {
      const s = c.source;
      if (s.kind !== "external" && s.kind !== "qa_read") continue;
      if (s.kind === "external") expect(s.url, label(c)).toMatch(/^https:\/\/[^\s]+$/);
      expect(s.checked, label(c)).toMatch(/^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/20[0-9]{2}$/);
    }
  });

  it("a qa_read claim never stands alone: its text also has a code, test or spec claim", () => {
    for (const c of CLAIMS.filter((x) => x.source.kind === "qa_read")) {
      expect(CLAIMS.some((x) => x.topic === c.topic && x.text === c.text && ["code", "test", "spec"].includes(x.source.kind)), label(c)).toBe(true);
    }
  });
});

// ---- field paths (§7.11.7)

const REF = qaReference("drugdb.example.org");
const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Whether `path` reaches a value in `root`: `a.b` keys, `[]` any element, `[0]` an index, `[clinical]` the stages element
 * whose `stage` is `clinical`.
 */
function resolves(root: unknown, path: string): boolean {
  let values: unknown[] = [root];
  for (const token of path.split(".")) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)((?:\[[^\]]*\])*)$/.exec(token);
    if (!m) return false;
    values = values.flatMap((v) => (isObject(v) && Object.hasOwn(v, m[1]) ? [v[m[1]]] : []));
    for (const [, b] of m[2].matchAll(/\[([^\]]*)\]/g)) {
      values = values.flatMap((v) => {
        if (!Array.isArray(v)) return [];
        if (b === "") return v;
        if (/^[0-9]+$/.test(b)) return Number(b) < v.length ? [v[Number(b)]] : [];
        return v.filter((e) => isObject(e) && e.stage === b);
      });
    }
    if (values.length === 0) return false;
  }
  return values.length > 0;
}

/** The example answers: each endpoint's envelope (data, and metadata for metadata.requestId). */
const ANSWERS = REF.endpoints.map((e) => e.example.body);
const resolvesInExamples = (path: string) =>
  path.startsWith("metadata.") ? ANSWERS.some((a) => resolves(a, path)) : ANSWERS.some((a) => resolves(a.data, path));

const codeSpans = (text: string) => [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
const PATH_TOPICS: GuideTopic[] = ["data_model", "checks", "reporting"];

describe("field paths (§7.11.7)", () => {
  it("the resolver: keys, any element, an index and a stage", () => {
    expect(resolvesInExamples("extraction.ingredients[0].strengthValue")).toBe(true);
    expect(resolvesInExamples("stages[clinical].evidence.parsed[]")).toBe(true);
    expect(resolvesInExamples("metadata.requestId")).toBe(true);
    expect(resolvesInExamples("extraction.ingredients[9].strengthValue")).toBe(false);
    expect(resolvesInExamples("stages[nope].evidence")).toBe(false);
    expect(resolvesInExamples("extraction.strengthValue")).toBe(false);
  });

  it.each(PATH_TOPICS.map((t) => [t]))("%s: every code span with . or [ is a field path that resolves in an example answer", (t) => {
    const paths = codeSpans(GUIDE[t].text).filter((c) => c.includes(".") || c.includes("["));
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) expect(resolvesInExamples(p), `${t}: ${p} is not a QA API field path`).toBe(true);
  });

  it("sources: every code span with . or [ that is not an address is a field path too", () => {
    for (const p of codeSpans(GUIDE.sources.text).filter((c) => !c.startsWith("https://") && (c.includes(".") || c.includes("[")))) {
      expect(resolvesInExamples(p), `sources: ${p}`).toBe(true);
    }
  });
});

// ---- source addresses (§7.11.7)

/**
 * The §7.11.7 patterns, and how SourceLinks.java builds the ones it owns (null: external, dated in the claims map; a file and
 * needle: a JSON endpoint the pipeline reads, also dated in the claims map).
 */
type Origin = string | null | { file: string; needle: string };
const PIPELINE = "etl/src/bddrug_etl";
const PATTERNS: Record<string, Origin> = {
  "https://tr.ocl.dghs.gov.bd/#/orgs/MoHFW/sources/DGDA-Drugs/concepts/{conceptId}/":
    'OCL_CONCEPT = "https://tr.ocl.dghs.gov.bd/#/orgs/MoHFW/sources/DGDA-Drugs/concepts/"',
  "https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm={c}": '"https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm={c}"',
  "https://mor.nlm.nih.gov/RxNav/search?searchBy=SNOMEDCT&searchTerm={c}": '"https://mor.nlm.nih.gov/RxNav/search?searchBy=SNOMEDCT&searchTerm={c}"',
  "https://api.tr.ocl.dghs.gov.bd/orgs/MoHFW/sources/DGDA-Drugs/concepts/{conceptId}/?verbose=true&includeMappings=true":
    { file: `${PIPELINE}/jobs/load_dgda.py`, needle: '"OCL_BASE_URL", "https://api.tr.ocl.dghs.gov.bd"' },
  "https://rxnav.nlm.nih.gov/REST/rxcui/{c}/allProperties.json?prop=codes":
    { file: `${PIPELINE}/rxnav/client.py`, needle: 'BASE = "https://rxnav.nlm.nih.gov/REST"' },
  "https://atcddd.fhi.no/atc_ddd_index/?code={c}&showdescription=no": '"https://atcddd.fhi.no/atc_ddd_index/?code={c}&showdescription=no"',
  "https://go.drugbank.com/drugs/{c}": '"https://go.drugbank.com/drugs/{c}"',
  "https://icd.who.int/browse/latest-release/mms/en": 'ICD11_HOME = "https://icd.who.int/browse/latest-release/mms/en"',
  "https://ddinter2.scbdd.com/server/drug-detail/{c}/": '"https://ddinter2.scbdd.com/server/drug-detail/{c}/"',
  "https://ddinter2.scbdd.com/server/interact/{interactionId}/": '"https://ddinter2.scbdd.com/server/interact/" + interactionId + "/"',
  "https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query={name}": null,
  'https://api.fda.gov/drug/label.json?search=openfda.generic_name:"{name}"&limit=1': null,
};

describe("source addresses (§7.11.7)", () => {
  const urls = codeSpans(GUIDE.sources.text).filter((c) => c.startsWith("https://"));

  it("every address in sources is one of the §7.11.7 patterns, and each pattern is there", () => {
    for (const u of urls) expect(Object.keys(PATTERNS), u).toContain(u);
    for (const p of Object.keys(PATTERNS)) expect(urls, p).toContain(p);
  });

  it("each SourceLinks pattern is the one SourceLinks.java builds; the OCL one ends with the concept id and a slash", () => {
    for (const [pattern, needle] of Object.entries(PATTERNS)) if (typeof needle === "string") expect(SOURCE_LINKS, pattern).toContain(needle);
    expect(SOURCE_LINKS).toContain("return OCL_CONCEPT + encoded + \"/\";");
  });

  it("each external and pipeline pattern has a dated external claim in sources", () => {
    for (const [pattern, needle] of Object.entries(PATTERNS)) {
      if (typeof needle === "string") continue;
      expect(CLAIMS.some((c) => c.topic === "sources" && c.text.includes(pattern) && c.source.kind === "external"), pattern).toBe(true);
    }
  });

  it("each pipeline pattern is the endpoint the pipeline reads: its file has the base address, the pipeline the path and query", () => {
    const pipeline = Object.entries(PATTERNS).flatMap(([p, o]) => (typeof o === "object" && o !== null ? [[p, o] as const] : []));
    expect(pipeline.map(([p]) => p)).toEqual([
      "https://api.tr.ocl.dghs.gov.bd/orgs/MoHFW/sources/DGDA-Drugs/concepts/{conceptId}/?verbose=true&includeMappings=true",
      "https://rxnav.nlm.nih.gov/REST/rxcui/{c}/allProperties.json?prop=codes",
    ]);
    for (const [pattern, { file, needle }] of pipeline) expect(readFileSync(join(REPO, file), "utf8"), pattern).toContain(needle);
    const ocl = readFileSync(join(REPO, `${PIPELINE}/ocl/client.py`), "utf8");
    expect(ocl).toContain('url = f"{self.base_url}/orgs/{owner}/sources/{source}/concepts/{concept_id}/"');
    expect(ocl).toContain('params={"verbose": "true", "includeMappings": "true"}');
    expect(readFileSync(join(REPO, `${PIPELINE}/rxnav/client.py`), "utf8")).toContain('f"/rxcui/{rxcui}/allProperties.json", {"prop": "codes"}');
  });

  it("no other topic carries an address", () => {
    for (const t of GUIDE_TOPICS.filter((x) => x !== "sources")) expect(GUIDE[t].text, t).not.toContain("https://");
  });
});
