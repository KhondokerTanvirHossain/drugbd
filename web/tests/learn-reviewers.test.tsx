import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { learnContext } from "@/components/learn/context";
import { P } from "@/content/learn/pilot-snapshot";
import ReviewersChapter from "@/content/learn/reviewers";
import { NO_DATA_SENTENCE } from "@/lib/copy";
import { pilotStats } from "./fixtures/learn-stats";

const render = (stats = pilotStats()) => renderToStaticMarkup(<ReviewersChapter ctx={learnContext(stats)} />);
const card = (html: string, name: string) =>
  new RegExp(`<div class="stage stage--(ok|warn)"><p class="stage-head"><span class="stage-name">${name}</span>[\\s\\S]*?</div></div>`).exec(html)?.[0] ?? "";

describe("chapter 7, For reviewers", () => {
  it("each record's DDInter warning is the post-fix one (§1.6 items 7 and 10)", () => {
    const html = render();
    expect(html).toContain("DDInter text not found for 5 pairs:");
    expect(html).toContain("DDInter text not found for 6 pairs:");
    expect(html).toContain("DDInter text not found for 1 pair:");
    const warnings = html.slice(html.indexOf('id="rev-warnings"'), html.indexOf('id="rev-issue"'));
    expect(warnings).not.toContain("DDInter351");
    expect(card(html, "Chloramphenicol")).toMatch(/^<div class="stage stage--ok">/);
    expect(card(html, "Chloramphenicol")).not.toContain("stage-note");
    expect(card(html, "Napa").match(/class="stage-pair"/g)).toHaveLength(6);
  });

  it("Domperidone's note is NO_DATA_SENTENCE in full (§1.6 item 12)", () => {
    const html = card(render(), "Domperidone");
    expect(html).toContain(`<p class="stage-note">${NO_DATA_SENTENCE}</p>`);
    expect(html).toContain('<span class="sev sev--nodata">No interaction data</span>Its pairs are not checked.');
  });

  it("the specific Chloramphenicol note is §1.6 item 6's, under the unchanged caption", () => {
    const html = render();
    expect(html).toContain("Chloramphenicol eye drops: route is ophthalmic, and the interactions use DDInter352 (ophthalmic). The ophthalmic entry DDInter352 has no pair with the pilot drugs; it has 112 pairs in DDInter. Please confirm that DDInter351 (systemic) should not apply to this product.");
    expect(html).toContain("Names the record, the field, both values and the question.");
    expect(html).not.toContain("the DDInter warning lists pairs on DDInter351");
  });

  it("keys use §1.6 item 14's undo window; the desk pictures keep the default 8", () => {
    const html = render();
    expect(html).toContain("Opens the undo window (8 seconds by default; 20 or 60 in desk settings). Pharmacist: publishes when it closes.");
    expect(html).toContain("<b>You&#x27;re reviewing as a pharmacist.</b> &quot;Looks correct&quot; publishes this record after an 8-second undo window.");
    expect(html).toContain('<span class="toast-sub">Publishes in 8 seconds.</span>');
    expect(html).toContain('<span class="toast-bar" aria-hidden="true"><i class="toastAt60"></i></span>');
  });

  it("the comparison table comes from the snapshot and is withdrawn with G Warfarin", () => {
    expect(render()).toContain("<caption>G Warfarin, DGDA source beside the extraction</caption>");
    const html = render(pilotStats({ withdrawn: [P.warfarin] }));
    expect(html).not.toContain("DGDA source beside the extraction");
    expect(card(html, "G Warfarin")).toBe("");
    expect(html.match(/data-withdrawn/g)).toHaveLength(4);
  });

  it("a warning card that prints a partner record's mapping is withdrawn with that partner (G3, §6.8)", () => {
    const html = render(pilotStats({ withdrawn: [P.amlodipine] }));
    const warnings = html.slice(html.indexOf('id="rev-warnings"'), html.indexOf('id="rev-issue"'));
    expect(warnings).not.toContain("DDInter79");
    for (const name of ["G Warfarin", "Napa", "G-Metformin", "Amoxycillin Clavulanic Acid"]) expect(card(html, name), name).toBe("");
    expect(card(html, "Chloramphenicol")).toMatch(/^<div class="stage stage--ok">/);
  });

  it("the relation legend names pilot records, so it is a snapshot block too", () => {
    expect(render()).toContain("G Warfarin&#x27;s dosage form, Tablet.");
    for (const id of [P.warfarin, P.napa, P.chloramphenicol]) {
      const html = render(pilotStats({ withdrawn: [id] }));
      expect(html).not.toContain("dosage form, Tablet.");
      expect(html).not.toContain("Napa&#x27;s Paracetamol is Acetaminophen.");
    }
  });

  it("each specific note quotes its records' DDInter mappings, so it shows only while they are usable (G3, §6.8)", () => {
    const WARF_NOTE = "G Warfarin: Warfarin + Amlodipine (DDInter1951/DDInter79) has no grade and no text.";
    const CHL_NOTE = "Chloramphenicol eye drops: route is ophthalmic";
    expect(render()).toContain(WARF_NOTE);
    for (const stats of [pilotStats({ withdrawn: [P.chloramphenicol] }), pilotStats({ missing: [P.chloramphenicol] })]) {
      const html = render(stats);
      expect(html).not.toContain(CHL_NOTE);
      expect(html).not.toContain("DDInter352");
      expect(html).toContain(WARF_NOTE);
      expect(html).toContain("Interactions look wrong.");
    }
    for (const id of [P.warfarin, P.amlodipine]) {
      const html = render(pilotStats({ withdrawn: [id] }));
      expect(html).not.toContain(WARF_NOTE);
      expect(html).toContain(CHL_NOTE);
      expect(html).toContain("Check this record.");
    }
  });
});
