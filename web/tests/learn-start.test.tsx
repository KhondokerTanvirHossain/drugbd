import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { learnContext } from "@/components/learn/context";
import StartChapter from "@/content/learn/start";
import { P, PILOT_IDS } from "@/content/learn/pilot-snapshot";
import { NOT_REVIEWED } from "@/lib/copy";
import { pilotStats } from "./fixtures/learn-stats";

const render = (stats = pilotStats(), apiStub = false) => renderToStaticMarkup(<StartChapter ctx={learnContext(stats, apiStub)} />);
const headings = (html: string) => [...html.matchAll(/<h([1-6])[^>]*>/g)].map((m) => Number(m[1]));
const API_SENTENCE = 'The API returns the same thing: the id, trade name, status <span class="mono">&quot;not_reviewed&quot;</span> and <span class="mono">hidden: true</span>.';

describe("/learn/start: the hero and chapter 1 (§6.8)", () => {
  it("the hero's h1 is the only h1, and no heading level is skipped (§10.5)", () => {
    const html = render();
    expect(html.match(/<h1[^>]*>Learn IntelliDrugs<\/h1>/g)).toHaveLength(1);
    expect(html.match(/<h1/g)).toHaveLength(1);
    const levels = headings(html);
    expect(levels[0]).toBe(1);
    levels.forEach((l, i) => { if (i > 0) expect(l - levels[i - 1]).toBeLessThanOrEqual(1); });
    expect(html).toContain('<h2 id="h-start"><span class="chN">1</span> Start here</h2>');
    expect(html).toContain("<h3>How to read a record</h3>");
  });

  it("prints the live facts from /v1/stats and the pilot run time in both zones", () => {
    const html = render();
    expect(html).toContain('<b class="num">39,196</b><span>products in the DGDA register</span>');
    expect(html).toContain('<b class="num">10</b><span>pilot medicines loaded so far</span>');
    expect(html).toContain('<b class="num">11</b><span>substances, each with a BDS id</span>');
    expect(html).toContain('<b class="num">0 of 10</b><span>approved by a pharmacist</span>');
    expect(html).toContain("Pilot run 11/10/2026 21:27 UTC, which is 12/10/2026 03:27 in Dhaka. Nothing from the pilot is public yet.");
  });

  it("follows live approvals, never the snapshot (Review Focus 5)", () => {
    const html = render(pilotStats({ approved: [P.napa] }));
    expect(html).toContain('<b class="num">1 of 10</b>');
    expect(html).not.toContain("Nothing from the pilot is public yet.");
    expect(html).toMatch(/<b>Napa<\/b><span class="rv rv--approved">Approved by a pharmacist<\/span>/);
    // §6.8 "Approval-state sentences": the public card and every sentence about it go once Napa is approved.
    for (const gone of ["What a public visitor sees for Napa today", "Public visitors see the smaller card below", 'class="pubMock"'])
      expect(html).not.toContain(gone);
    const all = render(pilotStats({ approved: [...PILOT_IDS] }));
    expect(all).toMatch(/<p class="status"><span class="rv rv--approved">/);
  });

  it("states Napa's approval state only when /v1/stats reports Napa (Review Focus 2, §6.8 'Approval-state sentences')", () => {
    for (const silent of [pilotStats({ missing: [P.napa] }), { ...pilotStats(), batches: [] }]) {
      const html = render(silent, true);
      for (const gone of ["Public visitors see the smaller card below until a pharmacist approves the record.",
        "What a public visitor sees for Napa today", 'class="pubMock"', "A pharmacist checks every record before its contents appear here.",
        "The API returns the same thing"])
        expect(html).not.toContain(gone);
    }
  });

  it("'Nothing from the pilot is public yet.' follows the pilot batch, not other batches", () => {
    const otherBatchApproved = { ...pilotStats(), approvedProducts: 1 };
    expect(render(otherBatchApproved)).toContain("Nothing from the pilot is public yet.");
    expect(render({ ...pilotStats(), batches: [] })).not.toContain("Nothing from the pilot is public yet.");
  });

  it("carries the §1.6 item 13 caption and public-card note, with no reviewStatus", () => {
    const html = render();
    expect(html).toContain("This is Napa as the review desk shows it. Each number matches a numbered note.");
    expect(html).toContain(`aria-label="What a public visitor sees for Napa today: the name and ${NOT_REVIEWED}."`);
    expect(html).toContain("What a public visitor sees for Napa today. It is never shown as &quot;not found&quot; or &quot;no data&quot;.");
    expect(html).not.toContain("signed-in reviewer sees it");
    expect(html).not.toContain("reviewStatus");
  });

  it("states the API's answer only once the API serves the §7.4 stub (§6.8 'Before P2')", () => {
    expect(render()).not.toContain("The API returns the same thing");
    expect(render(pilotStats(), true)).toContain(`What a public visitor sees for Napa today. ${API_SENTENCE} It is never shown`);
  });

  it("draws the annotated Napa record from the snapshot, with its live pill", () => {
    const html = render();
    expect(html).toContain('data-snapshot="186-0030-006--napa"');
    expect(html).toContain('<b>Acetaminophen 500 mg tablet</b><span class="mono">BDC-000001</span>');
    expect(html).toContain('<span class="sev sev--unclassified">Severity not classified by DDInter <b class="sev-n">512</b></span>');
    expect(html).toContain("645 drug–drug records, 3 drug–disease, 1 drug–food.");
    expect(html).toContain(`hidden behind &quot;${NOT_REVIEWED}&quot; until a pharmacist approves it.`);
  });

  it("withdraws the annotated record when Napa has an issue, and keeps the public card (a stub already)", () => {
    const html = render(pilotStats({ withdrawn: [P.napa] }));
    expect(html).toContain("data-withdrawn");
    expect(html).not.toContain("BDC-000001");
    expect(html).not.toContain("Acetaminophen");
    // G3 (§1.2): the #start-what prose names Napa's substance and strength, so it goes with the block.
    expect(html).not.toContain("500 mg");
    expect(html).not.toContain("contains paracetamol");
    expect(html).toContain("The website is <span class=\"mono\">drugdb.eliooo.org</span>.");
    expect(render()).toContain("works out that it contains paracetamol 500 mg, and connects paracetamol");
    expect(html).toContain("A pharmacist checks every record before its contents appear here.");
  });
});
