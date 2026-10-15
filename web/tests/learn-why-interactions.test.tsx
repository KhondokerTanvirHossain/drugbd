import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { learnContext } from "@/components/learn/context";
import InteractionsChapter from "@/content/learn/interactions";
import { P } from "@/content/learn/pilot-snapshot";
import WhyChapter from "@/content/learn/why";
import { NOT_REVIEWED, NOT_RUN, NO_DATA_SENTENCE, UNKNOWN_PAIR_LINE } from "@/lib/copy";
import { pilotStats } from "./fixtures/learn-stats";

const why = (stats = pilotStats()) => renderToStaticMarkup(<WhyChapter ctx={learnContext(stats)} />);
const ints = (stats = pilotStats()) => renderToStaticMarkup(<InteractionsChapter ctx={learnContext(stats)} />);
const chip = (cls: string, word: string, n: number) => `<span class="sev sev--${cls}">${word} <b class="sev-n">${n}</b></span>`;

describe("chapter 5, Why it works this way", () => {
  it("each rule is an h2 under the chapter's h1, with the id the rail links to", () => {
    const html = why();
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('<li id="why-nodata"><h2>Why no data never means safe</h2>');
    expect(html.match(/<li id="why-[a-z]+"><h2>/g)).toHaveLength(6);
  });

  it("states the no-data rule with the full sentence, and the live pharmacist line", () => {
    expect(why()).toContain(`so we say exactly that: ${NO_DATA_SENTENCE} Its pairs are marked &quot;not checked&quot;.`);
    expect(why()).toContain("on all 10 records, so none is public.");
    expect(why(pilotStats({ approved: [P.napa] }))).toMatch(/<span class="rv rv--approved">Approved by a pharmacist<\/span> on 1 of 10 records\./);
  });

  it("keeps the evidence lines in snapshot blocks", () => {
    const html = why(pilotStats({ withdrawn: [P.warfarin] }));
    expect(html).not.toContain("XM86W0");
    expect(html).not.toContain('<b class="sev-n">298</b>');
    expect(html).toContain("BDS-000008");
  });

  it("names Domperidone's coverage outside a snapshot block only while its example is usable (G3, §6.8)", () => {
    expect(why()).toContain("Domperidone has no DDInter 2.0 entry (coverage: none).");
    const html = why(pilotStats({ withdrawn: [P.domperidone] }));
    expect(html).not.toContain("Domperidone has no DDInter 2.0 entry");
    expect(html).toContain(`so we say exactly that: ${NO_DATA_SENTENCE} Its pairs are marked &quot;not checked&quot;.`);
  });

  it("states the pilot's record count and approval only while /v1/stats reports the pilot batch (§6.8 Approval-state sentences)", () => {
    const html = why(pilotStats({ batchId: "0002-other" }));
    expect(html).not.toContain("records, each with the raw DGDA row");
    expect(html).not.toContain("so none is public");
    expect(html).not.toContain("records.</p>");
    expect(html).toContain("<h2>Why only a pharmacist can publish</h2>");
  });
});

describe("chapter 6, Interactions explained", () => {
  it("counts the 28 pairs that apply to the pilot products (§1.6 items 5 and 11)", () => {
    const html = ints();
    expect(html).toContain("The counts are the 28 DDInter pairs that apply to the pilot products.");
    expect(html).toContain("<h2>The pairs that apply to the pilot products</h2>");
    expect(html).toContain(`Most serious first: ${chip("major", "Major", 4)}${chip("moderate", "Moderate", 6)}${chip("minor", "Minor", 2)}${chip("unclassified", "Severity not classified by DDInter", 16)}`);
    expect(html).toContain('<span class="cnt">16<small>pairs</small></span>');
    expect(html).toContain("They are not in the 28.");
    expect(html).not.toMatch(/\b35\b/);
    expect(html).not.toContain("Chloramphenicol +");
    expect(html).not.toContain("+ Chloramphenicol");
  });

  it("lists every pair by name in its severity group, with the action when DDInter gives one", () => {
    const html = ints();
    expect(html).toContain('<li>Warfarin + Acetylsalicylic acid <span class="small">synergy</span></li>');
    expect(html).toContain("<li>Metformin + Amoxicillin</li>");
    expect(html.match(/<li>[A-Z][a-z]+( acid)? \+ [^<]+(<span class="small">[a-z]+<\/span>)?<\/li>/g)).toHaveLength(28);
  });

  it("actions: synergy 3, metabolism 6, not given 16 with UNKNOWN_PAIR_LINE (§1.6 items 11 and 12)", () => {
    const html = ints();
    expect(html).toContain('<b>Warfarin + Acetylsalicylic acid</b><span class="small">3 pilot pairs</span>');
    expect(html).toContain('<b>Simvastatin + Clarithromycin</b><span class="small">6 pilot pairs</span>');
    expect(html).toContain('<b>Acetylsalicylic acid + Amlodipine</b><span class="small">1 pilot pair</span>');
    expect(html).toContain('<b>Acetaminophen + Amlodipine</b><span class="small">16 pilot pairs</span>');
    expect(html).toContain(`<p class="pair-source">${UNKNOWN_PAIR_LINE.replace(/"/g, "&quot;")}</p>`);
    expect(html).not.toContain("with no interaction or management text. It is not treated as low risk");
  });

  it("the per-substance table: Domperidone with the full no-data sentence, Chloramphenicol with its three entries", () => {
    const html = ints();
    expect(html).toMatch(new RegExp(`<td colspan="3"><div class="stack"><span class="sev sev--nodata">No interaction data</span><span>${NO_DATA_SENTENCE}</span></div></td>`, "i"));
    expect(html).toContain('<span><span class="mono">DDInter351</span> systemic</span><span><br/><span class="mono">DDInter352</span> ophthalmic</span>');
    expect(html).toContain('<div class="bar" role="img" aria-label="Warfarin drug–drug records: Major 138, Moderate 427, Minor 71, Severity not classified by DDInter 298, of 934.">');
    expect(html).toContain('style="--w:138"');
  });

  it("coverage: not run is its own state with NOT_RUN (§3.6)", () => {
    expect(ints()).toContain(`is a different state: &quot;${NOT_RUN}&quot;.`);
  });

  it("the worked check: one Major pair as a public PairCard, the no-data block, live pills, and the checker sentence", () => {
    const html = ints(pilotStats({ approved: [P.aspirin] }));
    expect(html).toContain('<span class="pair-names">Warfarin + Acetylsalicylic acid</span>');
    expect(html).toContain('<p class="pair-text open" id="chk-text">This combination, especially with analgesic/antipyretic aspirin doses');
    expect(html).toContain("Management, truncated. Full text from DDInter 2.0.");
    expect(html).toContain('<span class="sev sev--nodata">Domperidone + Warfarin</span>');
    expect(html).toMatch(/Aspirin <small>Tablet<\/small><span class="rv rv--approved">/);
    expect(html).toContain("The checker never says &quot;no interactions found&quot; for this list.");
  });

  it("the worked-check banner only while all three are not reviewed, with NOT_REVIEWED from its constant (Review Focus 5, §1.6 item 16)", () => {
    expect(ints()).toContain(`All three records are &quot;${NOT_REVIEWED}&quot;. A public check today would list them as not reviewed and check nothing.`);
    expect(ints()).not.toContain("All three records are not yet reviewed by a pharmacist.");
    for (const approved of [[P.aspirin], [P.warfarin, P.aspirin, P.domperidone]]) {
      const html = ints(pilotStats({ approved }));
      expect(html).not.toContain("All three records are");
      expect(html).not.toContain("A public check today would list them");
    }
  });

  it("the worked check's intro names the pilot products only inside its snapshot block", () => {
    expect(ints()).toContain("Three pilot products checked together: G Warfarin, Aspirin and Domperidone.");
    const html = ints(pilotStats({ withdrawn: [P.warfarin] }));
    expect(html).not.toContain("Three pilot products checked together");
    expect(html).not.toContain("One has DDInter data");
  });

  it("withdraws the aggregate blocks when any pilot record has an issue (fail closed)", () => {
    const html = ints(pilotStats({ withdrawn: [P.clarith] }));
    expect(html).not.toContain("Most serious first");
    expect(html).not.toContain("DDInter 2.0 records for each pilot substance");
    expect(html).not.toContain("The counts are the 28 DDInter pairs");
    expect(html).toContain("Severity chips are square-cornered");
    expect(html).toContain("This combination, especially with analgesic/antipyretic aspirin doses");
  });
});
