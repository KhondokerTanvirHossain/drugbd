import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  GUIDE, GUIDE_MIME_TYPE, GUIDE_TITLE, GUIDE_TOOL, GUIDE_TOPICS, GUIDE_URI_PREFIX, GUIDE_VERSION, checkGuideArgs, guideBody,
  guideResources, readGuideResource, type GuideTopic,
} from "@/lib/qa-guide";
import { QA_FILTERS, QA_STAGES } from "@/lib/qa-query";

/*
 * §7.11.1–§7.11.6, §11.1 "QA guide module": the guide's one module (web/lib/qa-guide.ts, byte-identical in tools/qa-mcp),
 * its contract, its version pin, and the format, size, privacy and safety rules on every text, title and summary.
 * Accuracy (every line tied to a source) is qa-guide-claims.test.ts.
 */

/**
 * §7.11.5: every released guide content, oldest first. A content change needs a new entry with a higher version (patch:
 * wording; minor: a claim, path, URL, check, title or summary; major: a topic, GuideBody, the resource shape, the tool's
 * input schema or the uri scheme). Never edit an old entry.
 */
const GUIDE_HISTORY: readonly { version: string; sha256: string }[] = [
  { version: "1.0.0", sha256: "23ddddd10cbcdb0295d6ac4ce7044daf40a7601109a283e4e9f1bfd8363d8cdc" },
  // fix round 1: the whitespace pitfall and the source.json key map (dgda); the textMissing shapes and the partner route
  // (ddinter); the browser-only register and RxNav pages and the two JSON endpoints the pipeline reads (sources)
  { version: "1.1.0", sha256: "4fe1385762e62a65ed10fd3f80dd9f7b9d4845ac49f4f347db57835f17a6652e" },
];

const contentHash = () => createHash("sha256")
  .update(JSON.stringify({ GUIDE_TITLE, GUIDE_TOPICS, GUIDE_URI_PREFIX, GUIDE_MIME_TYPE, GUIDE, GUIDE_TOOL }), "utf8").digest("hex");
const semver = (v: string) => {
  const m = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(v);
  if (!m) throw new Error(`not semver: ${v}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])] as const;
};
const after = (a: string, b: string) => {
  const x = semver(a), y = semver(b);
  return x[0] !== y[0] ? x[0] > y[0] : x[1] !== y[1] ? x[1] > y[1] : x[2] > y[2];
};

const TITLES: Record<GuideTopic, string> = {
  overview: "What IntelliDrugs is and what QA is for",
  data_model: "How a record is built, field by field",
  sources: "Which source to check each field against",
  checks: "Checks for each problem filter and stage",
  pitfalls: "Known traps in the data",
  reporting: "How to report a finding",
};
const RELATED: Record<GuideTopic, GuideTopic[]> = {
  overview: ["data_model", "checks", "reporting"],
  data_model: ["sources", "checks"],
  sources: ["data_model", "checks", "pitfalls"],
  checks: ["sources", "pitfalls", "reporting"],
  pitfalls: ["checks", "sources"],
  reporting: ["overview", "checks"],
};

/** §7.11.2: the index, exactly. */
const INDEX = [
  "## Topics",
  "",
  ...GUIDE_TOPICS.map((t) => `- \`${t}\`: ${GUIDE[t].summary}`),
  "",
  "Call get_qa_guide with one topic, or read intellidrugs://qa-guide/{topic}.",
  "",
  "## Overview",
  "",
  GUIDE.overview.text,
].join("\n");

describe("the module (§7.11.1)", () => {
  it("has no import, no require and no server-only: another package copies it byte for byte", () => {
    const src = readFileSync(new URL("../lib/qa-guide.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/^\s*import\b/m);
    expect(src).not.toMatch(/\brequire\(|\bimport\(/);
    expect(src).not.toMatch(/["']server-only["']/);
    expect(src).toContain("cp web/lib/qa-guide.ts tools/qa-mcp/src/qa-guide.ts");
  });

  it("names the guide, its topics in order, the uri prefix and the mime type", () => {
    expect(GUIDE_TITLE).toBe("IntelliDrugs QA guide");
    expect(GUIDE_TOPICS).toEqual(["overview", "data_model", "sources", "checks", "pitfalls", "reporting"]);
    expect(GUIDE_URI_PREFIX).toBe("intellidrugs://qa-guide/");
    expect(GUIDE_MIME_TYPE).toBe("text/markdown");
    expect(Object.keys(GUIDE)).toEqual([...GUIDE_TOPICS]);
  });

  it.each(GUIDE_TOPICS.map((t) => [t]))("%s: the pinned title and related topics; a one-line summary of at most 160 characters", (t) => {
    expect(GUIDE[t].title).toBe(TITLES[t]);
    expect([...GUIDE[t].related]).toEqual(RELATED[t]);
    expect(GUIDE[t].summary).not.toContain("\n");
    expect(GUIDE[t].summary.length).toBeGreaterThan(0);
    expect(GUIDE[t].summary.length).toBeLessThanOrEqual(160);
  });
});

describe("guideBody (§7.11.2)", () => {
  it("without a topic: the index and the overview, the guide's title and every other topic as related", () => {
    expect(guideBody(null)).toEqual({ guideVersion: GUIDE_VERSION, topic: null, title: GUIDE_TITLE, text: INDEX,
      related: ["data_model", "sources", "checks", "pitfalls", "reporting"] });
    expect(Object.keys(guideBody(null))).toEqual(["guideVersion", "topic", "title", "text", "related"]);
  });

  it.each(GUIDE_TOPICS.map((t) => [t]))("%s: the topic's title, text and related topics", (t) => {
    expect(guideBody(t)).toEqual({ guideVersion: GUIDE_VERSION, topic: t, title: GUIDE[t].title, text: GUIDE[t].text,
      related: [...GUIDE[t].related] });
    expect(Object.keys(guideBody(t))).toEqual(["guideVersion", "topic", "title", "text", "related"]);
  });

  it("related is a fresh array on every call", () => {
    for (const t of [null, ...GUIDE_TOPICS]) {
      const a = guideBody(t), b = guideBody(t);
      expect(a.related).not.toBe(b.related);
      if (t !== null) expect(a.related).not.toBe(GUIDE[t].related);
      a.related.push("overview");
      expect(guideBody(t).related).toEqual(b.related);
    }
  });
});

describe("checkGuideArgs (§7.11.2)", () => {
  it("no arguments or {} give the index; each topic is accepted", () => {
    expect(checkGuideArgs(undefined)).toEqual({ ok: true, topic: null });
    expect(checkGuideArgs({})).toEqual({ ok: true, topic: null });
    for (const t of GUIDE_TOPICS) expect(checkGuideArgs({ topic: t })).toEqual({ ok: true, topic: t });
  });

  it("refuses a topic that is not exactly one of the six (case-sensitive, never null or a number)", () => {
    for (const topic of ["nope", "Overview", "OVERVIEW", " overview", "", null, 1, ["overview"], { t: "overview" }, true]) {
      expect(checkGuideArgs({ topic })).toEqual({ ok: false, field: "topic" });
    }
  });

  it("refuses an input it does not take first, in argument order, its name capped at 100 code points", () => {
    expect(checkGuideArgs({ x: 1, topic: "nope" })).toEqual({ ok: false, field: "x" });
    expect(checkGuideArgs({ topic: "nope", x: 1 })).toEqual({ ok: false, field: "x" });
    expect(checkGuideArgs({ topic: "checks", page: 0 })).toEqual({ ok: false, field: "page" });
    expect(checkGuideArgs({ ["x".repeat(101)]: 1 })).toEqual({ ok: false, field: "x".repeat(100) });
    expect(checkGuideArgs({ ["\u{1F600}".repeat(101)]: 1 })).toEqual({ ok: false, field: "\u{1F600}".repeat(100) });
    expect(checkGuideArgs(JSON.parse('{"__proto__":1}'))).toEqual({ ok: false, field: "__proto__" });
  });
});

describe("resources (§7.11.3)", () => {
  it("guideResources lists the six topics in order, with uri, name, title, description and mime type only", () => {
    expect(guideResources()).toEqual(GUIDE_TOPICS.map((t) => ({ uri: `intellidrugs://qa-guide/${t}`, name: t, title: GUIDE[t].title,
      description: GUIDE[t].summary, mimeType: "text/markdown" })));
    for (const r of guideResources()) expect(Object.keys(r)).toEqual(["uri", "name", "title", "description", "mimeType"]);
    expect(guideResources()).not.toBe(guideResources());
  });

  it("readGuideResource gives each topic's text, the same text get_qa_guide gives", () => {
    for (const t of GUIDE_TOPICS) {
      expect(readGuideResource(`${GUIDE_URI_PREFIX}${t}`)).toEqual({ uri: `${GUIDE_URI_PREFIX}${t}`, mimeType: "text/markdown",
        text: GUIDE[t].text });
      expect(readGuideResource(`${GUIDE_URI_PREFIX}${t}`)!.text).toBe(guideBody(t).text);
    }
  });

  it("anything else is null: case, a trailing slash, a query, the bare prefix, the index", () => {
    for (const uri of ["intellidrugs://qa-guide/OVERVIEW", "intellidrugs://qa-guide/overview/", "intellidrugs://qa-guide/overview?x=1",
      "intellidrugs://qa-guide/", "intellidrugs://qa-guide", "intellidrugs://qa-guide/index", "intellidrugs://qa-guide/topics",
      "https://intellidrugs/qa-guide/overview", " intellidrugs://qa-guide/overview", "intellidrugs://qa-guide/overview#x", ""]) {
      expect(readGuideResource(uri), uri).toBeNull();
    }
  });
});

describe("GUIDE_TOOL (§7.11.2)", () => {
  it("is exactly the spec's tool: name, title, description and input schema, with no required input", () => {
    expect(GUIDE_TOOL).toEqual({
      name: "get_qa_guide",
      title: "Get the QA guide",
      description: "How to check IntelliDrugs data: what it is, how a record is built, which source to check each field against, "
        + "a checklist per problem filter and stage, known traps, and how to report a finding. Without topic: the topic index and "
        + "the overview. Read one topic at a time. The answer is JSON: guideVersion, topic, title, text (Markdown) and related "
        + "topics. Read-only; it holds no record data and is never clinical advice.",
      inputSchema: { type: "object", properties: { topic: { type: "string", enum: [...GUIDE_TOPICS],
        description: "Optional: one of overview, data_model, sources, checks, pitfalls, reporting. Leave it out for the topic index and the overview." } },
        additionalProperties: false },
    });
  });
});

describe("guideVersion (§7.11.5)", () => {
  it("is semver, and the last history entry pins the current content", () => {
    expect(() => semver(GUIDE_VERSION)).not.toThrow();
    const last = GUIDE_HISTORY.at(-1)!;
    expect(last.version, "the content changed: add a GUIDE_HISTORY entry with a higher version and bump GUIDE_VERSION").toBe(GUIDE_VERSION);
    expect(last.sha256, `the content changed: its hash is now ${contentHash()}`).toBe(contentHash());
  });

  it("versions strictly increase and no hash repeats", () => {
    expect(GUIDE_HISTORY[0].version).toBe("1.0.0");
    for (let i = 1; i < GUIDE_HISTORY.length; i++) expect(after(GUIDE_HISTORY[i].version, GUIDE_HISTORY[i - 1].version)).toBe(true);
    expect(new Set(GUIDE_HISTORY.map((h) => h.sha256)).size).toBe(GUIDE_HISTORY.length);
    for (const h of GUIDE_HISTORY) expect(h.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---- §7.11.6 format, size, privacy and safety

/** Every text the guide serves, with a name for the failure message. */
const TEXTS: [string, string][] = [...GUIDE_TOPICS.map((t) => [t, GUIDE[t].text] as [string, string]), ["index", INDEX]];
const LINES: [string, string][] = [...TEXTS, ...GUIDE_TOPICS.flatMap((t) => [[`${t} title`, GUIDE[t].title], [`${t} summary`,
  GUIDE[t].summary]] as [string, string][]), ["guide title", GUIDE_TITLE]];
/** A topic's text with its code spans removed. */
const prose = (text: string) => text.replace(/`[^`\n]*`/g, "");
const codeSpans = (text: string) => [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);

describe("format (§7.11.6)", () => {
  it.each(TEXTS)("%s: LF only, printable ASCII plus µ, no trailing space, no leading or trailing blank line, never three newlines", (_n, text) => {
    expect(text).not.toContain("\r");
    expect(text).toMatch(/^[\x20-\x7E\nµ]+$/);
    for (const line of text.split("\n")) expect(line, JSON.stringify(line)).not.toMatch(/\s$/);
    expect(text.startsWith("\n")).toBe(false);
    expect(text.endsWith("\n")).toBe(false);
    expect(text).not.toContain("\n\n\n");
    expect(text.trim()).toBe(text);
  });

  it.each(TEXTS)("%s: ## and ### headings only; lists and paragraphs: no table, HTML tag, image or Markdown link; backticks paired", (_n, text) => {
    for (const line of text.split("\n")) {
      if (line.startsWith("#")) expect(line, line).toMatch(/^#{2,3} \S/);
      expect(line, line).not.toMatch(/^\s*\|/);
      expect((line.match(/`/g) ?? []).length % 2, line).toBe(0);
    }
    expect(text).not.toMatch(/<\/?[A-Za-z!]/);
    expect(text).not.toMatch(/!\[/);
    expect(text).not.toMatch(/\]\(/);
  });

  it.each(LINES)("%s: titles, summaries and texts are printable ASCII plus µ", (_n, text) => {
    expect(text).toMatch(/^[\x20-\x7E\nµ]+$/);
  });

  it("tool, filter and underscored status names in a topic are always code spans", () => {
    const names = [...["list_batches", "get_batch", "get_record", "find_records", "get_pairs", "get_qa_guide"], ...QA_FILTERS,
      "engineer_checked", "back_in_review", "not_run", "data_model"];
    for (const t of GUIDE_TOPICS) {
      for (const n of names) expect(prose(GUIDE[t].text), `${t}: ${n} outside a code span`).not.toMatch(new RegExp(`\\b${n}\\b`));
    }
  });

  it("checks has a ## heading with the code span of each problem filter, then of each stage, in that order", () => {
    const headings = GUIDE.checks.text.split("\n").filter((l) => l.startsWith("## "));
    let at = -1;
    for (const name of [...QA_FILTERS, ...QA_STAGES]) {
      const i = headings.findIndex((h, k) => k > at && h.includes(`\`${name}\``));
      expect(i, `checks: no heading for ${name} after the previous one`).toBeGreaterThan(at);
      at = i;
    }
  });
});

describe("size (§7.11.6)", () => {
  it.each(GUIDE_TOPICS.map((t) => [t]))("%s: at most 6,400 characters; title at most 60", (t) => {
    expect(GUIDE[t].text.length).toBeLessThanOrEqual(6400);
    expect(GUIDE[t].title.length).toBeLessThanOrEqual(60);
  });

  it("the six texts and the index lines together: at most 32,000 characters", () => {
    const indexLines = INDEX.slice(0, INDEX.indexOf("## Overview"));
    const total = GUIDE_TOPICS.reduce((n, t) => n + GUIDE[t].text.length, 0) + indexLines.length;
    expect(total).toBeLessThanOrEqual(32000);
  });
});

describe("privacy and safety (§7.11.6)", () => {
  it.each(LINES)("%s: no @, key, hash, Bearer, internal API path, env name, schema name or person", (_n, text) => {
    expect(text).not.toContain("@");
    expect(text).not.toContain("idqa_");
    expect(text).not.toMatch(/[0-9a-f]{64}/i);
    expect(text).not.toContain("Bearer");
    expect(text).not.toMatch(/(?<!\/api\/qa)\/v1\//);
    for (const env of ["INTERNAL_API_TOKEN", "QA_API_KEYS", "REVIEWERS", "INTELLIDRUGS_QA_KEY"]) expect(text).not.toContain(env);
    expect(text).not.toMatch(/\b(ops|curated|raw)\./);
    for (const person of ["Tanvir", "Hossain", "Asif", "Yusuf"]) expect(text).not.toContain(person);
  });

  it.each(TEXTS)("%s: a line that says safe also says never or not; no line asks to change, fix or approve anything", (_n, text) => {
    for (const line of text.split("\n")) {
      if (/\bsafe(ty)?\b/i.test(line)) expect(line, line).toMatch(/\b(never|not)\b/i);
      if (/\b(fix|approve|change|edit|delete|update|correct)\b/i.test(prose(line))) expect(line, line).toMatch(/\b(never|not|cannot|no)\b/i);
    }
  });

  it("no code span carries a key, a token or an email", () => {
    for (const [, text] of TEXTS) for (const c of codeSpans(text)) expect(c).not.toMatch(/@|idqa_|Bearer/);
  });
});
