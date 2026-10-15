import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { API_STUB_SHAPE, learnContext } from "@/components/learn/context";
import { AsStored, BatchNote, Chapter, LivePill, Section, SnapshotBlock, St } from "@/components/learn/parts";
import { CHAPTERS, CHAPTER_SLUGS, chapterBySlug, sectionTitle } from "@/content/learn/chapters";
import { P, PILOT_IDS } from "@/content/learn/pilot-snapshot";
import { NOT_REVIEWED } from "@/lib/copy";
import { pilotStats } from "./fixtures/learn-stats";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const SECRET = <p>Acetaminophen BDS-000001</p>;

describe("chapter registry (§2.1)", () => {
  it("holds the ten chapters in order, with unique section ids", () => {
    expect(CHAPTER_SLUGS).toEqual(["start", "model", "codes", "process", "why", "interactions", "reviewers", "partners", "glossary", "faq"]);
    expect(CHAPTERS.map((c) => c.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const ids = CHAPTERS.flatMap((c) => c.sections.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("finds a chapter by its exact slug only", () => {
    expect(chapterBySlug("codes")?.title).toBe("Our IDs and the code systems");
    for (const s of ["Start", "start ", "start/", "", "glossary.html", "../start"]) expect(chapterBySlug(s)).toBeNull();
  });

  it("names the corrected chapter 6 section (§1.6 item 5) and refuses an unknown id", () => {
    expect(sectionTitle("int-pilot")).toBe("The pairs that apply to the pilot products");
    expect(() => sectionTitle("int-35")).toThrow("Learn: no section int-35");
  });
});

describe("Chapter and Section headings (§6.8, §10.5)", () => {
  it("prints the numbered chapter title as h1 or h2 and the section title from the registry", () => {
    const one = html(<Chapter slug="codes" level={1}><Section id="codes-ids" h={2}><p>x</p></Section></Chapter>);
    expect(one).toContain('<section class="ch" id="codes" aria-labelledby="h-codes">');
    expect(one).toContain('<h1 id="h-codes"><span class="chN">3</span> Our IDs and the code systems</h1>');
    expect(one).toContain('<div class="sub" id="codes-ids"><h2>Why our own BDS and BDC ids</h2>');
    const start = html(<Chapter slug="start" level={2}><Section id="start-what" h={3}><p>x</p></Section></Chapter>);
    expect(start).toContain('<h2 id="h-start">');
    expect(start).toContain("<h3>What IntelliDrugs is</h3>");
  });

  it("prints a stage word with its icon", () => {
    expect(html(<St status="warn" />)).toBe('<span class="st stWarn"><span class="ico" aria-hidden="true"></span>Warning</span>');
  });
});

describe("SnapshotBlock: frozen examples and live pills (§6.8)", () => {
  it("shows the example with each record's live pill", () => {
    const out = html(<SnapshotBlock ctx={learnContext(pilotStats({ approved: [P.napa] }))} ids={[P.napa, P.aspirin]}>{SECRET}</SnapshotBlock>);
    expect(out).toContain("Acetaminophen BDS-000001");
    expect(out).toContain('data-snapshot="186-0030-006--napa 076-0028-006--aspirin"');
    expect(out).toMatch(/<b>Napa<\/b><span class="rv rv--approved">Approved by a pharmacist<\/span>/);
    expect(out).toMatch(new RegExp(`<b>Aspirin</b><span class="rv rv--pending">${NOT_REVIEWED}</span>`));
  });

  it("an example drawn on all ten records carries the batch's pill and count instead", () => {
    const out = html(<SnapshotBlock ctx={learnContext(pilotStats())} ids={PILOT_IDS}>{SECRET}</SnapshotBlock>);
    expect(out).toContain("All 10 pilot records, batch <span class=\"mono\">0001-pilot</span>.");
    expect(out).toContain('class="rv rv--pending"');
  });

  it("with pills inline it prints no pill row", () => {
    const out = html(<SnapshotBlock ctx={learnContext(pilotStats())} ids={[P.napa]} pills="inline">{SECRET}</SnapshotBlock>);
    expect(out).not.toContain("snapPills");
    expect(out).toContain("Acetaminophen BDS-000001");
  });

  it("is withdrawn to the stub when a record has an issue or left the batch file (exampleUsable false)", () => {
    const out = html(<SnapshotBlock ctx={learnContext(pilotStats({ withdrawn: [P.aspirin] }))} ids={[P.napa, P.aspirin]}>{SECRET}</SnapshotBlock>);
    expect(out).not.toContain("Acetaminophen");
    expect(out).not.toContain("BDS-");
    expect(out).toContain("data-withdrawn");
    expect(out).toMatch(new RegExp(`<li><b>Aspirin</b><span class="rv rv--pending">${NOT_REVIEWED}</span></li>`));
    expect(out).toMatch(/<li><b>Napa<\/b><span class="rv rv--pending">/);
  });

  it("a record /v1/stats does not report withdraws its block (Review Focus 2)", () => {
    for (const stats of [pilotStats({ missing: [P.napa] }), pilotStats({ batchId: "0002-renamed" }),
      { ...pilotStats(), batches: [] }]) {
      const out = html(<SnapshotBlock ctx={learnContext(stats)} ids={[P.napa]}>{SECRET}</SnapshotBlock>);
      expect(out).not.toContain("Acetaminophen");
      expect(out).toMatch(new RegExp(`<li><b>Napa</b><span class="rv rv--pending">${NOT_REVIEWED}</span></li>`));
    }
  });
});

describe("live pieces", () => {
  it("LivePill and BatchNote follow /v1/stats", () => {
    const ctx = learnContext(pilotStats({ approved: [...PILOT_IDS] }));
    expect(html(<LivePill ctx={ctx} id={P.napa} />)).toContain("rv--approved");
    expect(html(<BatchNote ctx={ctx} />)).toContain("rv--approved");
    expect(html(<BatchNote ctx={learnContext(pilotStats({ missing: [P.napa] }))} />)).toContain("All 9 pilot records");
  });

  it("AsStored prints the snapshot date suffix (§1.7)", () => {
    expect(html(<AsStored />)).toBe('<span class="small">, as stored on 13/10/2026</span>');
  });

  it("pending(id) follows the live pill", () => {
    const ctx = learnContext(pilotStats({ approved: [P.napa] }));
    expect([ctx.pending(P.napa), ctx.pending(P.aspirin)]).toEqual([false, true]);
    expect(learnContext(pilotStats({ missing: [P.napa] })).pending(P.napa)).toBe(true);
  });
});

describe("API_STUB_SHAPE follows the API (§6.8 'Before P2')", () => {
  it("is true exactly when GET /v1/products/{id} serves the §7.4 hidden stub (no reviewStatus)", () => {
    const src = readFileSync(fileURLToPath(new URL("../../api/src/main/java/com/niramoy/bddrug/domain/HiddenRecord.java", import.meta.url)), "utf8");
    const product = /record Product\(([^)]*)\)/.exec(src)![1];
    // When P2 changes the stub, this fails until API_STUB_SHAPE turns on chapter 1's and chapter 8's API sentences.
    expect(API_STUB_SHAPE).toBe(!product.includes("reviewStatus") && product.includes("String status"));
    expect(learnContext(pilotStats()).apiStub).toBe(API_STUB_SHAPE);
    expect(learnContext(pilotStats(), true).apiStub).toBe(true);
  });
});
