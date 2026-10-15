import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { learnContext } from "@/components/learn/context";
import ProcessChapter from "@/content/learn/process";
import { P, PILOT_SNAPSHOT as S, substanceNamed } from "@/content/learn/pilot-snapshot";
import { NOT_REVIEWED, NO_DATA_SENTENCE, STALE_TITLE } from "@/lib/copy";
import { pilotStats } from "./fixtures/learn-stats";

const render = (stats = pilotStats()) => renderToStaticMarkup(<ProcessChapter ctx={learnContext(stats)} />);
const UNDO = "undo window (8 seconds by default; 20 or 60 in desk settings)";

describe("chapter 4, The process", () => {
  it("the swimlane is an image whose description carries the §1.6 item 14 undo window and the NOT_REVIEWED sentence", () => {
    const html = render();
    expect(html).toContain('<title id="dg-swim-t">From batch file to public record</title>');
    expect(html).toContain(`leaves the record hidden as ${NOT_REVIEWED}. A pharmacist presses A and after the ${UNDO} the record becomes public`);
    expect(html).not.toContain("8-second undo window");
    expect(html).toContain(">A, 8 s undo</text>");
  });

  it("the review gate carries the §1.6 item 4 sentence and the item 14 undo window", () => {
    const html = render();
    expect(html).toContain("Approval comes from the decision history. Each decision updates the record&#x27;s review status, and a re-run resets it, so a decision made before the latest extraction never counts.");
    expect(html).not.toContain("on every public read");
    expect(html.match(new RegExp(`and the ${UNDO.replace(/[()]/g, "\\$&")} closes`, "g"))).toHaveLength(2);
    expect(html).toContain("When the undo window closes, the record is public.");
    expect(html).not.toContain("After 8 seconds");
  });

  it("the DDInter pilot result is §1.6 item 11's, and the Domperidone note is NO_DATA_SENTENCE in full (item 12)", () => {
    const html = render();
    expect(html).toContain("9 of 10 records warned. Eight list pairs with no DDInter text. Domperidone has no DDInter data. Chloramphenicol is OK.");
    expect(html.match(/10 of 10 records/g)).toHaveLength(3);
    expect(html).toContain(`<p class="stage-note">${NO_DATA_SENTENCE}</p>`);
    expect(html).toContain("<p class=\"stage-note\">DDInter text not found for DDInter1951/DDInter79</p>");
  });

  it("dates every evidence count as stored (§6.8 snapshot values)", () => {
    const html = render();
    expect(html.match(/as stored on 13\/10\/2026/g)).toHaveLength(4);
    expect(html).toContain('<td class="num">40<span class="small">, as stored on 13/10/2026</span></td>');
    expect(html).toContain('<td class="num">0<span class="small">, as stored on 13/10/2026</span></td>');
  });

  it("the stale banner uses STALE_TITLE, the only em dash", () => {
    expect(render()).toContain(`<p class="banner-title">${STALE_TITLE}</p>`);
  });

  it("the batch progress list and its line are live, trade name and status only", () => {
    const html = render(pilotStats({ approved: [P.napa, P.clarith] }));
    expect(html).toContain('aria-label="Batch 0001-pilot records"');
    expect(html.match(/<li><b>[^<]+<\/b><span class="rv rv--(pending|approved)">/g)).toHaveLength(10);
    expect(html).toContain('<li><b>Napa</b><span class="rv rv--approved">');
    expect(html).toContain("2 of 10 approved.</b> Batch <span class=\"mono\">0001-pilot</span> is in review. It becomes approved when all 10 records are approved by a pharmacist.");
    expect(html).toContain("holds 10 records and its status is in review.");
  });

  it("says how many listed records were removed from the batch file, so 11 pills never sit under '10 of 10'", () => {
    const stats = pilotStats();
    stats.batches[0].items.push({ conceptId: "999-0000-000--old-brand", tradeName: "Old Brand", status: "not_reviewed", exampleUsable: false });
    const html = render(stats);
    expect(html).toContain("0 of 10 approved.</b> 1 record was removed from the batch file. Batch");
    expect(render()).not.toContain("removed from the batch file.");
  });

  it("prints G Warfarin's extraction time only when the snapshot holds the host's stamp", () => {
    expect(render()).toMatch(/G Warfarin was extracted( \d{2}\/\d{2}\/\d{4} \d{2}:\d{2} UTC)? in batch <span class="mono">0001-pilot<\/span>\./);
  });

  it("withdraws the stage results and the G Warfarin examples when G Warfarin has an issue", () => {
    const html = render(pilotStats({ withdrawn: [P.warfarin] }));
    expect(html).not.toContain("9 of 10 records warned");
    expect(html).not.toContain("DDInter1951/DDInter79");
    expect(html).not.toContain("was extracted");
    expect(html).toContain(`<p class="stage-note">${NO_DATA_SENTENCE}</p>`);
  });

  it("keys the G Warfarin DDInter card on Amlodipine-5 too, whose substance and entry it names (G3, §6.8)", () => {
    const html = render(pilotStats({ withdrawn: [P.amlodipine] }));
    expect(html).not.toContain("DDInter1951/DDInter79");
    expect(html).not.toContain("Warfarin + Amlodipine");
    expect(html).toContain("G Warfarin was extracted");
    expect(html).toContain(`<p class="stage-note">${NO_DATA_SENTENCE}</p>`);
    expect(render()).toContain(`data-snapshot="${P.warfarin} ${P.amlodipine}"`);
    expect(substanceNamed(S.warnings[P.warfarin].textMissing[0].b).product).toBe(P.amlodipine);
  });

  it("prints G Warfarin's live pill inside the re-run journey (pills=\"inline\")", () => {
    const tail = /in batch <span class="mono">0001-pilot<\/span>\.<\/p><span class="rv rv--(pending|approved)">/;
    expect(render().match(tail)?.[1]).toBe("pending");
    expect(render(pilotStats({ approved: [P.warfarin] })).match(tail)?.[1]).toBe("approved");
  });

  it("states no batch status and no progress when /v1/stats does not report the pilot batch", () => {
    const html = render(pilotStats({ batchId: "0002-other" }));
    expect(html).not.toContain("approved.</b>");
    expect(html).not.toContain("is in review");
    expect(html).not.toContain('aria-label="Batch 0001-pilot records"');
    expect(html).not.toContain("holds 10 records");
  });
});
