import { readFileSync } from "node:fs";
import { renderToStaticMarkup as r } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrandIcon, CodeChip, MatchRelation, NoDataBlock, NoDataChip, ReviewStatus, Severity, StageCheck, Wordmark } from "@/components/ui";
import { NO_DATA_SENTENCE } from "@/lib/copy";

describe("Wordmark", () => {
  it("is IntelliDrugs with an aria-hidden cobalt stop, sized by a module class (no inline style)", () => {
    expect(r(<Wordmark size={20} />)).toBe('<span class="wordmark s20">IntelliDrugs' +
      '<span class="wordmark-dot" aria-hidden="true">.</span></span>');
    for (const size of [13, 16, 17, 19, 20, 28] as const) expect(r(<Wordmark size={size} />)).toContain(`class="wordmark s${size}"`);
    expect(r(<Wordmark size={28} />)).not.toContain("style=");
  });
  it("adds the sub-brand after an sr-only space", () => {
    expect(r(<Wordmark size={16} sub="Review" />)).toContain(
      '<span class="wordmark-dot" aria-hidden="true">.</span><span class="sr-only"> </span><span class="wordmark-sub">Review</span>');
  });
});

describe("BrandIcon", () => {
  it("uses the thickened 16 px master and the regular paths above it", () => {
    expect(r(<BrandIcon size={16} />)).toContain('d="M13 25h8v24h-8zM13 14h8v8h-8zM25 14h10a17.5 17.5 0 0 1 0 35H25zM33 22h2a9.5 9.5 0 0 1 0 19h-2z"');
    const big = r(<BrandIcon size={32} />);
    expect(big).toContain('width="32" height="32" viewBox="0 0 64 64" aria-hidden="true"');
    expect(big).toContain('d="M14 26h7v23h-7zM14 15h7v7h-7zM26 15h9a17 17 0 0 1 0 34h-9zM33 22h2a10 10 0 0 1 0 20h-2z"');
    expect(big).toContain('fill="var(--brand-mark)"');
    expect(big).toContain('fill="var(--on-brand-mark)"');
  });
  it("app/icon.svg is the 16 px master with the fixed brand colours", () => {
    const svg = readFileSync(new URL("../app/icon.svg", import.meta.url), "utf8");
    expect(svg).toContain("M13 25h8v24h-8z");
    expect(svg).toContain('fill="#1F5BB8"');
    expect(svg).toContain('fill="#FFFFFF"');
  });
});

describe("Severity", () => {
  it.each([["major", "sev--major", "Major"], ["moderate", "sev--moderate", "Moderate"], ["minor", "sev--minor", "Minor"],
    ["unknown", "sev--unclassified", "Severity not classified by DDInter"],
    ["low", "sev--unclassified", "Severity not classified by DDInter"],
    ["", "sev--unclassified", "Severity not classified by DDInter"]])("%j renders %s", (level, cls, word) => {
    expect(r(<Severity level={level} />)).toBe(`<span class="sev ${cls}">${word}</span>`);
  });
  it("prints an optional count", () => {
    expect(r(<Severity level="major" count={138} />)).toBe('<span class="sev sev--major">Major <b class="sev-n">138</b></span>');
  });
});

describe("no-data marks (hatch = coverage none only)", () => {
  it("NoDataChip is a hatched severity-shaped chip with the given label", () => {
    expect(r(<NoDataChip label="No data" />)).toBe('<span class="sev sev--nodata">No data</span>');
  });
  it("NoDataBlock is always expanded, role=note, with the fixed sentence and no green", () => {
    const html = r(<NoDataBlock title="Domperidone" bdsId="BDS-000010" pairs={["Domperidone + Warfarin"]} />);
    expect(html).toMatch(/^<div class="nodata-block hatch" role="note"><span class="nodata-glyph" aria-hidden="true"><\/span>/);
    expect(html).toContain('<p class="nodata-title">Domperidone <span class="mono id">BDS-000010</span></p>');
    expect(html).toContain(`<p class="nodata-text">${NO_DATA_SENTENCE}</p>`);
    expect(html).toContain('<p class="nodata-pairs">Not checked: <span class="sev sev--nodata">Domperidone + Warfarin</span></p>');
    expect(html).not.toMatch(/<details|rv--approved|--ok/);
  });
});

describe("ReviewStatus", () => {
  it.each([["pending", "rv--pending", "Not yet reviewed by a pharmacist"], ["approved", "rv--approved", "Approved by a pharmacist"],
    ["engineer_checked", "rv--engineer", "Engineer checked"], ["issue", "rv--issue", "Issue reported"],
    ["back_in_review", "rv--back", "Back in review"]] as const)("%s", (status, cls, word) => {
    expect(r(<ReviewStatus status={status} />)).toBe(`<span class="rv ${cls}">${word}</span>`);
  });
  it("compact keeps the rest of the wording as sr-only text, never aria-label", () => {
    expect(r(<ReviewStatus status="pending" compact />))
      .toBe('<span class="rv rv--pending rv--compact">Not yet reviewed<span class="sr-only"> by a pharmacist</span></span>');
    expect(r(<ReviewStatus status="approved" compact />))
      .toBe('<span class="rv rv--approved rv--compact">Approved<span class="sr-only"> by a pharmacist</span></span>');
    expect(r(<ReviewStatus status="engineer_checked" compact />))
      .toBe('<span class="rv rv--engineer rv--compact">Engineer checked<span class="sr-only">. Not yet reviewed by a pharmacist</span></span>');
    expect(r(<ReviewStatus status="pending" compact />)).not.toContain("aria-label");
  });
});

describe("StageCheck, MatchRelation, CodeChip", () => {
  it("StageCheck shows the icon word and the pipeline's own note", () => {
    expect(r(<StageCheck name="DGDA load" status="ok"><p className="stage-note">No pipeline note.</p></StageCheck>))
      .toBe('<div class="stage stage--ok"><p class="stage-head"><span class="stage-name">DGDA load</span>' +
        '<span class="stage-status">OK</span></p><p class="stage-note">No pipeline note.</p></div>');
    expect(r(<StageCheck name="DDInter" status="warn" />)).toContain('<span class="stage-status">Warning</span>');
    expect(r(<StageCheck name="Clinical" status="fail" />)).toContain('<span class="stage-status">Failed</span>');
  });
  it.each([["same", "Matches"], ["norm", "Normalised"], ["salt", "Salt removed"], ["added", "Added"], ["differs", "Differs"]] as const)(
    "MatchRelation %s", (kind, word) => {
      expect(r(<MatchRelation kind={kind} />)).toBe(`<span class="match match--${kind}">${word}</span>`);
    });
  it("MatchRelation prints an optional sub line", () => {
    expect(r(<MatchRelation kind="salt" sub="Removed: Sodium" />))
      .toBe('<span class="match match--salt">Salt removed</span><span class="cmp-sub">Removed: Sodium</span>');
  });
  it("CodeChip names the system and prints the reviewer meta", () => {
    expect(r(<CodeChip system="ICD11_XM" code="XM86W0" meta={{ method: "xm", confidence: 1 }} />))
      .toBe('<span class="code"><span class="code-sys">ICD-11</span>XM86W0<span class="code-meta">xm, 1.0</span></span>');
    expect(r(<CodeChip system="DDINTER" code="DDInter352" meta={{ method: "drugbank", confidence: 1, route: "ophthalmic" }} />))
      .toContain('<span class="code-meta">drugbank, 1.0, ophthalmic</span>');
    expect(r(<CodeChip system="DDINTER" code="DDInter20" meta={{ method: "name", confidence: 0.7 }} />)).toContain("name, 0.7");
    for (const [sys, label] of [["RXCUI", "RxCUI"], ["ATC", "ATC"], ["DRUGBANK", "DrugBank"], ["SNOMEDCT", "SNOMED CT"]])
      expect(r(<CodeChip system={sys} code="1" />)).toBe(`<span class="code"><span class="code-sys">${label}</span>1</span>`);
  });
});
