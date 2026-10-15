import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { learnContext } from "@/components/learn/context";
import CodesChapter from "@/content/learn/codes";
import ModelChapter from "@/content/learn/model";
import { P } from "@/content/learn/pilot-snapshot";
import { NO_DATA_SENTENCE } from "@/lib/copy";
import { pilotStats } from "./fixtures/learn-stats";

const model = (stats = pilotStats()) => renderToStaticMarkup(<ModelChapter ctx={learnContext(stats)} />);
const codes = (stats = pilotStats()) => renderToStaticMarkup(<CodesChapter ctx={learnContext(stats)} />);
const svgs = (html: string) => html.match(/<svg[^>]*role="img"[^>]*>[\s\S]*?<\/svg>/g) ?? [];

describe("chapter 2, The model", () => {
  it("is the page's only h1, with h2 sections (§6.8 Headings)", () => {
    const html = model();
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('<h1 id="h-model"><span class="chN">2</span> The model</h1>');
    expect(html).toContain("<h2>Edge cases from the pilot</h2>");
  });

  it("the entity diagram is an image with its title and description (§10.5)", () => {
    const [svg] = svgs(model());
    expect(svg).toContain('aria-labelledby="dg-entity-t dg-entity-d"');
    expect(svg).toContain('<title id="dg-entity-t">IntelliDrugs entity diagram</title>');
    expect(svg).toContain("A brand product is reviewed in batch records.</desc>");
    expect(svg).toContain(">Napa, 186-0030-006</text>");
    expect(svg).toContain(">none: Domperidone</text>");
  });

  it("route scope: the eye drop is checked against DDInter352, which is the highlighted entry (§1.6 item 3)", () => {
    const html = model();
    expect(html).toContain('This eye-drop product is checked against <span class="mono">DDInter352</span>, the ophthalmic entry. When a product&#x27;s route has no DDInter entry, the systemic entry is used and marked &quot;route assumed&quot;.');
    expect(html).toMatch(/<span class="flowNode flowKey"><span class="mono">DDInter352<\/span> ophthalmic<\/span>/);
    expect(html).toMatch(/<span class="flowNode"><span class="mono">DDInter351<\/span> systemic<\/span>/);
    expect(html).not.toContain("planned, not current");
  });

  it("the no-data card is the hatch block with the fixed sentence and the not-checked pairs", () => {
    const html = model();
    expect(html).toContain('<div class="nodata-block hatch" role="note">');
    expect(html).toContain(`<p class="nodata-text">${NO_DATA_SENTENCE}</p>`);
    expect(html).toContain('<span class="sev sev--nodata">Domperidone + 8 other pilot substances</span>');
  });

  it("traces Napa from the snapshot, with its live pill and stage counts", () => {
    const html = model(pilotStats({ approved: [P.napa] }));
    expect(html).toContain('<dd class="mono">tablet|systemic|BDS-000001:500mg/</dd>');
    expect(html).toContain("<dd>645 records</dd>");
    expect(html).toContain("<dd>1 record</dd>");
    expect(html).toContain("Approved by a pharmacist");
  });

  it("withdraws only the cards of a record with an issue", () => {
    const html = model(pilotStats({ withdrawn: [P.chloramphenicol] }));
    expect(html).not.toContain("DDInter352");
    expect(html).toContain("Warfarin Sodium 5 mg");
    expect(html.match(/data-withdrawn/g)).toHaveLength(1);
  });
});

describe("chapter 3, Our IDs and the code systems", () => {
  it("lists Napa's codes, the DDInter chip with its route, and Acetylsalicylic acid's three ATC codes", () => {
    const html = codes();
    expect(html).toContain("<caption>Crosswalk codes for Acetaminophen, BDS-000001</caption>");
    expect(html).toContain('<span class="code"><span class="code-sys">DDInter</span>DDInter14<span class="code-meta">systemic</span></span>');
    expect(html).toContain("Acetylsalicylic acid has A01AD05, B01AC06 and N02BA01.");
    expect(html).toContain('<div class="scroll" tabindex="0" role="region" aria-label="Code systems table, scrolls sideways">');
  });

  it("draws the id parts and the matching diagram from the snapshot", () => {
    const html = codes();
    expect(html).toContain("<code>BDS</code>");
    expect(html).toContain("<code>000003</code>");
    expect(html).toContain('<span class="mono">BDC-000003</span> is Warfarin 5 mg tablet.');
    const [svg] = svgs(html);
    expect(svg).toContain('<title id="dg-match-t">How Napa&#x27;s codes were matched</title>');
    expect(svg).toContain(">RxCUI 161</text>");
  });

  it("withdraws the Napa table and diagram when Napa has an issue", () => {
    const html = codes(pilotStats({ withdrawn: [P.napa] }));
    expect(html).not.toContain("Crosswalk codes for Acetaminophen");
    expect(svgs(html)).toHaveLength(0);
    expect(html).toContain("is Warfarin 5 mg tablet.");
  });
});
