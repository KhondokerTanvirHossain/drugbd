import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { learnContext } from "@/components/learn/context";
import FaqChapter from "@/content/learn/faq";
import GlossaryChapter from "@/content/learn/glossary";
import { P } from "@/content/learn/pilot-snapshot";
import { NOT_REVIEWED, NO_DATA_SENTENCE, STALE_TITLE } from "@/lib/copy";
import { pilotStats } from "./fixtures/learn-stats";

const gl = (stats = pilotStats()) => renderToStaticMarkup(<GlossaryChapter ctx={learnContext(stats)} />);
const faq = (stats = pilotStats()) => renderToStaticMarkup(<FaqChapter ctx={learnContext(stats)} />);
/** One glossary entry's <dd>, by its term. */
const entry = (html: string, term: string) => new RegExp(`<dt>${term}(<small>[^<]*</small>)?</dt><dd>([\\s\\S]*?)</dd>`).exec(html)?.[2] ?? "";

describe("chapter 9, Glossary (§6.8)", () => {
  it("lists Board L's 55 terms for the filter, with no input before JavaScript", () => {
    const html = gl();
    expect(html.match(/data-gl-item=""/g)).toHaveLength(55);
    expect(html).toContain('<dl class="gl" id="gl-list">');
    expect(html).not.toContain("<input");
  });

  it("the §1.6 item 11 counts and corrected lines", () => {
    const html = gl();
    expect(entry(html, "Severity")).toContain("4 Major, 6 Moderate, 2 Minor, 16 not classified");
    expect(entry(html, "Stage check")).toContain("DDInter for 9 of 10 records");
    expect(entry(html, "Route assumed")).toContain('This eye-drop product is checked against <span class="mono">DDInter352</span>, the ophthalmic entry.');
    expect(entry(html, "Route assumed")).not.toContain("DDInter351");
    expect(entry(html, "Undo window")).toContain("The undo window after &quot;Looks correct&quot; (8 seconds by default; 20 or 60 in desk settings) when U cancels it.");
  });

  it("dates the six snapshot-only lines (§6.8)", () => {
    const html = gl();
    for (const term of ["Back in review", "Engineer checked", "Issue reported", "Review decision", "Re-run", "Stage check"])
      expect(entry(html, term)).toContain("as stored on 13/10/2026");
    expect(html.match(/as stored on/g)).toHaveLength(6);
    expect(entry(html, "Re-run")).toContain("1 re-run since the first run, 11/10/2026");
    expect(entry(html, "Review decision")).toContain("0 decisions recorded");
  });

  it("live lines follow /v1/stats", () => {
    expect(entry(gl(), "Approved record")).toContain("none yet, 0 of 10 ");
    expect(entry(gl(), NOT_REVIEWED)).toContain("all 10 records");
    expect(entry(gl(), "DGDA")).toContain("39,196 products in the register");
    expect(entry(gl(), "Batch")).toContain('<span class="mono">0001-pilot</span>, 10 records, in review');
    const two = gl(pilotStats({ approved: [P.napa, P.clarith] }));
    // "2 of 10" is followed by the approved pill, never the batch's "Not yet reviewed" pill (it would read "2 of 10 not yet reviewed").
    expect(entry(two, "Approved record")).toContain('2 of 10 <span class="rv rv--approved">Approved by a pharmacist</span>');
    expect(entry(two, "Approved record")).not.toContain("rv--pending");
    expect(entry(two, NOT_REVIEWED)).toContain("8 of 10 records");
  });

  it("uses the safety constants for the definitions that are safety sentences", () => {
    const html = gl();
    expect(entry(html, "No interaction data")).toContain(`<p>${NO_DATA_SENTENCE}</p>`);
    expect(html).toContain(`<dt>${NOT_REVIEWED}</dt>`);
    expect(html).toContain("<dt>Severity not classified by DDInter</dt>");
    expect(entry(html, "Stale page")).toContain(STALE_TITLE);
  });

  it("withdraws the example of a record with an issue, keeping the term and its definition", () => {
    const html = gl(pilotStats({ withdrawn: [P.clarith] }));
    expect(entry(html, "Clinical drug")).toContain("data-withdrawn");
    expect(entry(html, "Clinical drug")).not.toContain("BDC-000005");
    expect(entry(html, "Clinical drug")).toContain("Substances with strengths, a dose form and a route.");
    expect(entry(html, "Severity")).toContain("data-withdrawn");
    expect(entry(html, "BDS id")).toContain("BDS-000010");
  });

  // Ruling (Task 12, after the Task 8/9 rulings): the live lines state the pilot batch's approval state, so they need /v1/stats to report it.
  it("states no batch line from a fallback: with the pilot batch unreported, the live examples and the batch note are left out", () => {
    const html = gl({ ...pilotStats(), batches: [] });
    expect(html.match(/data-gl-item=""/g)).toHaveLength(55);
    for (const term of ["Approved record", NOT_REVIEWED, "Batch"]) {
      expect(entry(html, term)).not.toContain("Pilot:");
      expect(entry(html, term)).not.toBe("");
    }
    expect(html).not.toContain("0 of 0");
    expect(html).not.toContain("all 0 records");
    expect(html).not.toContain("All 0 pilot records");
    expect(entry(html, "DGDA")).toContain("39,196 products in the register");
  });
});

describe("chapter 10, FAQ", () => {
  it("is native <details>, the first open, with §1.6 item 14's undo answer and the safety constants", () => {
    const html = faq();
    expect(html.match(/<details/g)).toHaveLength(10);
    expect(html).toContain("<details open=\"\"><summary>Why can&#x27;t I see Napa on the public site?</summary>");
    expect(html).toContain("before the undo window closes (8 seconds unless you lengthened it). Nothing is saved or published until the window closes.");
    expect(html).not.toContain("within 8 seconds");
    expect(html).toContain(`<b>${NO_DATA_SENTENCE}</b>`);
    expect(html).toContain(`<b>${STALE_TITLE}</b>`);
  });

  it("the email answer matches §7.1 A2: history is reviewer-only, no public email (§1.6 item 16)", () => {
    expect(faq()).toContain("No. Reviewer and reporter emails are stored for the team only. Decision history is served only to signed-in reviewers; public pages and the public API never show an email.");
    expect(faq()).not.toContain("Public decision history");
  });

  it("the Napa answer only while no pilot record is approved (Review Focus 5)", () => {
    for (const stats of [pilotStats({ approved: [P.napa] }), pilotStats({ approved: [P.napa, P.aspirin, P.warfarin, P.domperidone] }),
      { ...pilotStats(), batches: [] }]) {
      const html = faq(stats);
      expect(html).not.toContain("Why can&#x27;t I see Napa on the public site?");
      expect(html).not.toContain("Every pilot record is");
      expect(html.match(/<details/g)).toHaveLength(9);
      expect(html).toContain("<details open=\"\"><summary>No alerts came back. Is the combination safe?</summary>");
    }
  });

  // Ruling (Task 12, after the Task 11 ruling): "Every pilot record is ..." only while /v1/stats reports every pilot record.
  it("the Napa answer needs every pilot record reported as not reviewed, not only a batch count of 0 approved", () => {
    for (const stats of [pilotStats({ missing: [P.napa] }), pilotStats({ missing: [P.domperidone] })]) {
      const html = faq(stats);
      expect(html).not.toContain("Why can&#x27;t I see Napa on the public site?");
      expect(html).not.toContain("Every pilot record is");
      expect(html.match(/<details/g)).toHaveLength(9);
      expect(html).toContain("<details open=\"\"><summary>No alerts came back. Is the combination safe?</summary>");
    }
  });
});
