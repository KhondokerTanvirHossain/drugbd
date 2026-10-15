import { renderToStaticMarkup as r } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AutomatedChecks from "@/components/review/detail/AutomatedChecks";
import BackInReviewCard from "@/components/review/detail/BackInReviewCard";
import ComparisonTable from "@/components/review/detail/ComparisonTable";
import EvidenceContent from "@/components/review/detail/EvidenceContent";
import History from "@/components/review/detail/History";
import RecordHeader from "@/components/review/detail/RecordHeader";
import DiffTable from "@/components/review/desk/DiffTable";
import { NO_DATA_SENTENCE, NOT_RUN } from "@/lib/copy";
import { pilotItem } from "./fixtures/pilot";

describe("RecordHeader (§5.5.1, §5.2)", () => {
  it("crumb, title, meta, the pending pill and the hidden line", () => {
    const html = r(<RecordHeader item={pilotItem("napa")} tools={<span>tools</span>} backHref="/review/0001-pilot/x?pane=list" />);
    expect(html).toContain('<span class="mono">0001-pilot</span>, record 8 of 10');
    expect(html).toContain("<h1");
    expect(html).toContain(">Napa</h1>");
    expect(html).toContain('Beximco Pharmaceuticals Ltd., <span class="mono nowrap">DAR 186-0030-006</span>, Tablet');
    expect(html).toContain('<span class="rv rv--pending">Not yet reviewed by a pharmacist</span>');
    expect(html).toContain("Hidden from readers until a pharmacist approves it.");
    expect(html).toContain('<a class="backToList" href="/review/0001-pilot/x?pane=list">Back to list</a>');
    expect(html).toContain("<span>tools</span>");
  });

  it.each([["engineer_checked", "rv--engineer"], ["issue", "rv--issue"], ["back_in_review", "rv--back"]] as const)(
    "%s adds the not-reviewed pill after its own", (status, cls) => {
      const html = r(<RecordHeader item={pilotItem("napa", { displayStatus: status })} tools={null} backHref="#" />);
      expect(html.indexOf(cls)).toBeGreaterThan(-1);
      expect(html.indexOf("rv--pending")).toBeGreaterThan(html.indexOf(cls));
    });

  it("an approved record is published and has one green pill", () => {
    const html = r(<RecordHeader item={pilotItem("napa", { displayStatus: "approved" })} tools={null} backHref="#" />);
    expect(html).toContain("Published. Readers can see this record.");
    expect(html.match(/rv--approved/g)).toHaveLength(1);
    expect(html).not.toContain("rv--pending");
  });
});

describe("ComparisonTable (§5.5.2)", () => {
  it("is a real table with the sr-only caption, column and row headers", () => {
    const html = r(<ComparisonTable item={pilotItem("napa")} />);
    expect(html).toContain('<table class="cmp"><caption class="sr-only">Napa: DGDA register compared with the pipeline extraction</caption>');
    expect(html).toContain('<th scope="col">Field</th><th scope="col" class="cmp-src srcHead">DGDA source</th><th scope="col">Relation</th><th scope="col">Extracted by the pipeline</th>');
    expect(html).toContain("Each relation compares the two values on its row. Fields copied from the register have no verdict.");
  });

  it("rows and relations for Napa", () => {
    const html = r(<ComparisonTable item={pilotItem("napa")} />);
    expect(html).toContain('<th scope="row">Trade name</th><td class="cmp-src">Napa</td><td class="relCell"><span class="copy">Copied from the register</span></td><td>Napa<span class="cmp-sub mono">186-0030-006--napa</span></td>');
    expect(html).toContain('<span class="match match--norm">Normalised</span><span class="cmp-sub">Paracetamol kept as the DGDA name</span>');
    expect(html).toContain('<span class="cmp-sub">1 ingredient parsed</span>');
    expect(html).toContain('<th scope="row">DGDA ingredient code</th><td class="cmp-src"><span class="mono">XM5DJ7</span><span class="cmp-sub">Acetaminophen</span></td>');
    expect(html).toContain('Names: Acetaminophen (ICD-11), acetaminophen (RxNorm), Paracetamol (DGDA), Acetaminophen (DDInter)');
    expect(html).toContain('<span class="cmp-sub"><span class="mono">BDC-000001</span>, route systemic, dose form Tablet</span>');
    expect(html).toContain("6 codes for Acetaminophen");
    expect(html).toContain('<span class="code-sys">DDInter</span>DDInter14<span class="code-meta">drugbank, 1.0, systemic</span>');
    expect(html).toContain('<span class="cmp-sub">Interaction data found</span><span class="cmp-sub">Checked against <span class="mono">DDInter14</span> (systemic)</span>');
  });

  it("the eye drop is checked against DDInter352, and its strength is Normalised", () => {
    const html = r(<ComparisonTable item={pilotItem("chloramphenicol")} />);
    expect(html).toContain('Checked against <span class="mono">DDInter352</span> (ophthalmic)');
    expect(html).not.toContain('Checked against <span class="mono">DDInter351</span>');
    expect(html).toContain('<span class="match match--norm">Normalised</span><span class="cmp-sub">Written as 5 mg per 1 ml</span>');
  });

  it("no-data coverage: the No data chip and the full sentence; not_run: the plain line, never the hatch", () => {
    const html = r(<ComparisonTable item={pilotItem("domperidone")} />);
    expect(html).toContain('<span class="sev sev--nodata">No data</span>');
    expect(html).toContain(NO_DATA_SENTENCE);
    const base = pilotItem("napa");
    const notRun = r(<ComparisonTable item={{ ...base, ingredients: [{ ...base.ingredients[0], coverage: { coverage: "not_run", note: "" },
      ddinter: { chosen: [], entries: [] } }] }} />);
    expect(notRun).toContain(NOT_RUN);
    expect(notRun).not.toContain("sev--nodata");
    expect(notRun).not.toContain(NO_DATA_SENTENCE);
  });

  it("a combination product numbers its rows and names both ingredients", () => {
    const html = r(<ComparisonTable item={pilotItem("amoxycillin")} />);
    for (const th of ["Substance 1", "Strength 1", "Substance 2", "Strength 2", "Codes 1", "Codes 2", "DDInter mapping 1", "DDInter mapping 2"])
      expect(html).toContain(`<th scope="row">${th}</th>`);
    expect(html).toContain("Both ingredients and strengths found");
    expect(html).toContain("Parser&#x27;s part of the DGDA text");
    expect(html).toContain('<span class="match match--same">Matches</span><span class="cmp-sub">Capitalisation only</span>');
  });
});

describe("AutomatedChecks (§5.5.3)", () => {
  it("merges quiet OK stages and splits the text-missing pairs into a list", () => {
    const html = r(<AutomatedChecks item={pilotItem("napa")} />);
    expect(html).toContain("3 OK, 1 warning. Pipeline run 11/10/2026 21:27 UTC");
    expect(html).toContain('<span class="stage-name">DGDA load, Substances, Clinical drug</span><span class="stage-status">OK</span>');
    expect(html).toContain("DDInter text not found for 6 pairs with other medicines in this batch.");
    expect(html).toContain('<li class="stage-pair">DDInter1164 + DDInter14 <span class="mono">DDInter1164/DDInter14</span>');
    expect(html).not.toContain("DDInter351");
  });

  it("the eye drop is all OK; no-data coverage shows the full sentence as the DDInter note", () => {
    expect(r(<AutomatedChecks item={pilotItem("chloramphenicol")} />)).toContain(
      '<span class="stage-name">DGDA load, Substances, Clinical drug, DDInter</span><span class="stage-status">OK</span>');
    const nodata = r(<AutomatedChecks item={pilotItem("domperidone")} />);
    expect(nodata).toContain(`<p class="stage-note">${NO_DATA_SENTENCE}</p>`);
    expect(nodata).not.toContain("No interaction data in DDInter for this substance<");
  });

  it("fail notes stay whole; a missing stage counts as failed with No note; other notes are verbatim lines", () => {
    const base = pilotItem("napa");
    const item = { ...base, stages: [
      { stage: "dgda" as const, status: "fail" as const, notes: [{ kind: "other" as const, text: "error: RuntimeError: a; b", ddinterId: null, route: null }],
        textMissing: [], evidence: {} },
      { stage: "ddinter" as const, status: "warn" as const, notes: [
        { kind: "route_assumed" as const, text: "DDInter route assumed: DDInter1951 (systemic) used for unknown route", ddinterId: "DDInter1951", route: null }],
        textMissing: [], evidence: {} },
    ] };
    const html = r(<AutomatedChecks item={item} />);
    expect(html).toContain("1 warning, 3 failed.");
    expect(html).toContain('<p class="stage-note">error: RuntimeError: a; b</p>');
    expect(html).toContain('<p class="stage-note">DDInter route assumed: DDInter1951 (systemic) used for unknown route</p>');
    expect(html.match(/<span class="stage-status">Failed<\/span>/g)).toHaveLength(3);
    expect(html.match(/No note/g)).toHaveLength(2);
  });
});

describe("History (§5.6.5)", () => {
  it("oldest first, UTC over Dhaka, roles and (you), the note in .raw, and the no-longer-counts suffix", () => {
    const item = pilotItem("napa", { history: [
      { kind: "run", at: "2026-10-11T21:27:17Z" },
      { kind: "extract", at: "2026-10-11T21:28:09Z", reason: "run" },
      { kind: "decision", at: "2026-10-12T03:00:00Z", decision: "ok", role: "engineer", counts: false, mine: false },
      { kind: "decision", at: "2026-10-12T04:00:00Z", decision: "issue", role: "pharmacist", note: "strength should read 5 mg", counts: true, mine: true },
    ] });
    const html = r(<History item={item} />);
    expect(html).toContain('<span class="histT">11/10/2026 21:27 UTC<span>12/10/2026 03:27 Dhaka</span></span>');
    expect(html).toContain("Batch 0001-pilot run started");
    expect(html).toContain("Engineer checked. Not published. No longer counts: the record was re-run after it.");
    expect(html).toContain('Issue reported (you). Note: <span class="raw">strength should read 5 mg</span>');
    expect(html).not.toContain("@");
  });
});

describe("EvidenceContent (§5.6.3)", () => {
  it("raw brand row, DGDA codes, the raw record collapsed, notes per stage and the pipeline facts", () => {
    const html = r(<EvidenceContent item={pilotItem("napa")} />);
    expect(html).toContain("<h5>Raw brand row</h5><p class=\"dr-note\">The DGDA register fields with the pipeline&#x27;s parse fields, exactly as stored.</p><pre>");
    expect(html).toContain("&quot;tradeName&quot;: &quot;Napa&quot;");
    expect(html).toContain("<h5>DGDA ingredient codes</h5><pre>");
    expect(html).toMatch(/<details><summary>Raw DGDA record<\/summary><pre>[\s\S]*186-0030-006--napa[\s\S]*<\/pre><\/details>/);
    expect(html).toContain('<dt>DGDA load</dt><dd><span>OK</span><span class="dr-note">No note</span></dd>');
    expect(html).toContain('<dt>Clinical signature</dt><dd><span class="mono">tablet|systemic|BDS-000001:500mg/</span></dd>');
    expect(html).toContain('<dt>Batch run</dt><dd>11/10/2026 21:27 UTC<span class="dr-note">0001-pilot, 10 items</span></dd>');
  });
});

describe("the back-in-review card and the diff table (§5.11)", () => {
  const rows = [{ field: "DDInter note", before: "old note", now: "" }, { field: "Pipeline extracted at", before: "2026-10-11T21:28:09Z", now: "2026-10-12T09:00:00Z" }];

  it("names the reason, quotes the not-reviewed pill text, and shows the diff when there is one", () => {
    const rerun = pilotItem("napa", { displayStatus: "back_in_review",
      reopen: { reason: "rerun", at: "2026-10-12T09:00:00Z", previousExtractedAt: "2026-10-11T21:28:09Z", diffAvailable: true } });
    const html = r(<BackInReviewCard item={rerun} diff={rows} />);
    expect(html).toContain('<div class="noteCard">');
    expect(html).toContain('<span class="rv rv--back">Back in review</span>');
    expect(html).toContain("This record was re-run after a pharmacist approved it. Readers see “Not yet reviewed by a pharmacist” until a pharmacist approves it again.");
    expect(html).toContain("<caption>Cells that changed in the re-run</caption>");
    const shared = pilotItem("napa", { displayStatus: "back_in_review",
      reopen: { reason: "shared_change", at: "x", previousExtractedAt: "y", diffAvailable: false } });
    expect(r(<BackInReviewCard item={shared} diff={null} />)).toContain("Shared substance data for this record changed after a pharmacist approved it.");
  });

  it("the diff table: field, what you were reviewing, now; times formatted; the footer line", () => {
    const html = r(<DiffTable rows={rows} />);
    expect(html).toContain('<thead><tr><th scope="col">Field</th><th scope="col" class="cmp-src">You were reviewing</th><th scope="col">Now</th></tr></thead>');
    expect(html).toContain('<th scope="row">DDInter note</th><td class="cmp-src">old note</td><td class="chg"></td>');
    expect(html).toContain('<td class="cmp-src">11/10/2026 21:28 UTC</td><td class="chg">12/10/2026 09:00 UTC</td>');
    expect(html).toContain("Cells that are not listed did not change.");
  });
});
