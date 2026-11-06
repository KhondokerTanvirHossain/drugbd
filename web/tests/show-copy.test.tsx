import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PairRecordLine, ProblemLine, RecordLabel, UnreviewedCaution } from "@/components/ui";
import RecordHeader from "@/components/review/detail/RecordHeader";
import CompleteView from "@/components/review/desk/CompleteView";
import { DeskCtx, type DeskApi } from "@/components/review/desk/context";
import * as copy from "@/lib/copy";
import type { ReviewItem } from "@/lib/review-types";

const S = copy.SHOW_COPY;
const WEB = fileURLToPath(new URL("..", import.meta.url));

describe("SHOW_COPY (§6.10), verbatim", () => {
  it("pins the show-mode strings of the landing page, search, stubs, product page, checker and desk", () => {
    expect(S.landingH1).toBe("Bangladesh's medicines, traced from brand to substance, each marked with whether a pharmacist has approved it.");
    expect(S.landingLede).toBe('IntelliDrugs maps every DGDA-registered brand to its clinical drug and active substances, with ICD-11, RxNorm, ATC, DrugBank and SNOMED CT codes and DDInter 2.0 interactions. Records a pharmacist has not approved yet are shown, marked "Not yet reviewed by a pharmacist".');
    expect(S.promiseApproval).toBe("Every record shows whether a pharmacist has approved it");
    expect(S.stepPublic).toBe('Search, product pages, the checker and the partner API show the record, marked "Not yet reviewed by a pharmacist" before step 4 and "Approved by a pharmacist" after it.');
    expect(S.heroHidden).toBe("This record is withdrawn from public view.");
    expect(S.searchStub).toBe("This record is withdrawn from public view, so its substance, codes and interactions are hidden.");
    expect(S.stubNoBatch).toBe("This record is in no review batch yet, so IntelliDrugs hides its clinical drug, codes and interactions.");
    expect(S.notVerified).toBe("A pharmacist has not yet compared this record with the DGDA register.");
    expect(S.otherHeading).toBe("With other medicines");
    expect(S.otherEmpty).toBe("No other medicine on IntelliDrugs has an interaction with {substance} listed in DDInter 2.0 yet. Other medicines appear here as later batches load them.");
    expect(S.checkerWithdrawn).toBe(" · {nr} withdrawn {medicines} not checked");
    expect(S.withdrawnHeading).toBe("Withdrawn from public view, {k} {products}");
    expect(S.deskVisPending).toBe("Readers see this record marked “Not yet reviewed by a pharmacist” until a pharmacist approves it.");
    expect(S.learnApiPublicMode).toBe("Which records the public site shows: approved records only, or every record with its review label");
  });

  it("a string that contains a §3.6 constant is built from it, never retyped (the literal appears once in copy.ts)", () => {
    const src = readFileSync(`${WEB}lib/copy.ts`, "utf8");
    expect(src.split(`"${copy.NOT_REVIEWED}"`).length - 1).toBe(1);
    expect(src.split(`"${copy.PROBLEM_REPORTED}"`).length - 1).toBe(1);
    for (const v of Object.values(S)) expect(v).not.toMatch(/goes public only|leaves public view|stays hidden|Nothing is public until/);
  });

  it("PAIR_UNREVIEWED is allowed next to NOT_REVIEWED and is not its paraphrase", () => {
    expect(copy.PAIR_UNREVIEWED).not.toContain(copy.NOT_REVIEWED);
    expect(copy.PAIR_UNREVIEWED.toLowerCase()).toContain(copy.NOT_REVIEWED.toLowerCase());
  });
});

describe("ProblemLine, UnreviewedCaution, PairRecordLine (§3.4)", () => {
  it("are text, never green or the hatch; the caution is a role=note banner, not a live region", () => {
    expect(renderToStaticMarkup(<ProblemLine />)).toBe(`<p class="problem-line">${copy.PROBLEM_REPORTED}</p>`);
    const caution = renderToStaticMarkup(<UnreviewedCaution />);
    expect(caution).toBe(`<div class="banner banner--warn" role="note"><p class="banner-title">${copy.UNREVIEWED_CAUTION}</p></div>`);
    expect(caution).not.toContain("aria-live");
    expect(renderToStaticMarkup(<PairRecordLine review="unreviewed" />)).toBe(`<p class="pair-record">${copy.PAIR_UNREVIEWED}</p>`);
    expect(renderToStaticMarkup(<PairRecordLine review="problem" />)).toBe(`<p class="pair-record">${copy.PAIR_PROBLEM}</p>`);
    for (const html of [renderToStaticMarkup(<ProblemLine />), caution, renderToStaticMarkup(<PairRecordLine review="problem" />)])
      expect(html).not.toMatch(/rv--approved|--ok|hatch|nodata/);
    const css = readFileSync(`${WEB}components/ui/ProblemLine.css`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).toContain("color: var(--fg)");
    expect(css).not.toMatch(/--ok|hatch/);
  });

  it("RecordLabel: the approved pill, the not-reviewed pill, and the pill then the problem line", () => {
    expect(renderToStaticMarkup(<RecordLabel review="approved" />)).toContain(copy.APPROVED);
    expect(renderToStaticMarkup(<RecordLabel review="not_reviewed" />)).toBe(`<span class="rv rv--pending">${copy.NOT_REVIEWED}</span>`);
    expect(renderToStaticMarkup(<RecordLabel review="problem" />)).toBe(`<span class="rv rv--pending">${copy.NOT_REVIEWED}</span><p class="problem-line">${copy.PROBLEM_REPORTED}</p>`);
    expect(renderToStaticMarkup(<RecordLabel review="problem" inline />)).toContain(`<span class="problem-line">`);
  });
});

describe("the desk's reader-visibility lines (§5.2, §5.12)", () => {
  const item = { batchId: "B", index: 1, total: 2, conceptId: "C", displayStatus: "pending", brand: null } as unknown as ReviewItem;
  it(".d-vis follows the API's mode and is left out when the mode read failed", () => {
    expect(renderToStaticMarkup(<RecordHeader item={item} tools={null} backHref="/" mode="approved_only" />)).toContain("Hidden from readers until a pharmacist approves it.");
    expect(renderToStaticMarkup(<RecordHeader item={item} tools={null} backHref="/" mode="show_unreviewed" />)).toContain(S.deskVisPending);
    const none = renderToStaticMarkup(<RecordHeader item={item} tools={null} backHref="/" mode={null} />);
    expect(none).not.toContain("Hidden from readers");
    expect(none).not.toContain("Readers see this record");
  });
  it("the complete view's second sentence in show mode", () => {
    const desk = { batchId: "B", total: 2, openFirst: () => {} } as unknown as DeskApi;
    const html = (m: "show_unreviewed" | "approved_only") => renderToStaticMarkup(<DeskCtx.Provider value={desk}><CompleteView publicMode={m} /></DeskCtx.Provider>);
    expect(html("show_unreviewed")).toContain("readers see it marked “Not yet reviewed by a pharmacist” until a pharmacist approves it again.");
    expect(html("approved_only")).toContain("leaves public view until a pharmacist approves it again.");
  });
});
