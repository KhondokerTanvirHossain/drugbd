import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NEW_COPY, NEW_COPY_ROWS, NOT_REVIEWED, P1C_COPY } from "@/lib/copy";
import { SHARED_WORDS } from "@/lib/review-copy";

const WEB = fileURLToPath(new URL("..", import.meta.url));

describe("the P1C rows of §1.7, verbatim", () => {
  it("each P1C row is a NEW_COPY entry, and P1C_COPY is the same object", () => {
    expect(NEW_COPY[NEW_COPY_ROWS.seniorRole]).toBe(P1C_COPY.senior);
    expect(NEW_COPY[NEW_COPY_ROWS.seniorReview]).toBe(P1C_COPY.review);
    expect(NEW_COPY[NEW_COPY_ROWS.pairLines]).toBe(P1C_COPY.pair);
    expect(NEW_COPY[NEW_COPY_ROWS.deskOtherMedicines]).toBe(P1C_COPY.other);
    expect(NEW_COPY[NEW_COPY_ROWS.dismissIssue]).toBe(P1C_COPY.dismiss);
    expect(NEW_COPY[NEW_COPY_ROWS.sourceLinks]).toBe(P1C_COPY.sources);
    expect(NEW_COPY[NEW_COPY_ROWS.productOtherApproved]).toMatchObject({ heading: "With other approved medicines" });   // P2 Task 16 filled it (§6.5)
  });

  it("senior role (§2.2, §5.1, §5.13, §6.2)", () => {
    expect(P1C_COPY.senior).toEqual({
      badge: "Senior pharmacist",
      seniorReview: "Senior review",
      pairQueue: "Pair queue",
      welcomeHeading: "You're a senior pharmacist reviewer for batch {id}",
      welcomeStep: "Senior review shows every interaction pair between the medicines we hold, from all batches. Mark each pair reviewed, or report a pair issue.",
      welcomeLink: "Open the pair queue",
      invite: "Role: Senior pharmacist. You review batches as a pharmacist, and the interaction pairs of every batch in Senior review. Sign in at drugdb.eliooo.org with this Google account.",
    });
  });

  it("senior review pages (§5.16, §5.17)", () => {
    expect(P1C_COPY.review).toEqual({
      pairsToReviewOne: "{t} pair to review",
      pairsToReviewMany: "{t} pairs to review",
      queueSub: "Every DDInter 2.0 pair between substances we hold, from all batches. Major first.",
      showTodo: "To review",
      showChanged: "Changed since review",
      showReviewed: "Reviewed",
      allPairs: "All pairs",
      emptyTodo: "No pairs to review.",
      emptyChanged: "No pair changed in DDInter since its review.",
      emptyIssue: "No pair issues reported.",
      emptyReviewed: "No pairs reviewed yet.",
      emptyAll: "No pairs between the substances we hold.",
      showAllPairs: "Show all pairs",
      applies: "Applies to our brands",
      range: "{from}–{to} of {total} pairs",
      notApplies: "Does not apply to the medicines we hold: none of them is checked against {id} for its route.",
      eitherId: "{a} or {b}",
      brandsLine: "{a} {brandsA} of {substanceA} and {b} {brandsB} of {substanceB}, in {k} {batches}.",
      brands: "Brands",
      andMore: "and {n} more.",
      allBrandsOf: "All brands of {substance}",
      markReviewed: "Mark reviewed",
      reportPairIssue: "Report pair issue",
      alreadyReviewed: "This pair is already reviewed.",
      noteLabel: "What's wrong with this pair? Pharmacists, engineers and senior pharmacists read this note.",
      notePlaceholder: "For example: the management text says to avoid the combination but the severity is Minor",
      noteError: "Add at least 5 characters so the team knows what to check.",
      changedSummary: "What changed in DDInter",
      atReview: "At review",
      historySummary: "Pair history",
      historyReviewed: "Reviewed by a senior pharmacist",
      historyReviewedMine: "Reviewed by a senior pharmacist (you)",
      historyChangedAfter: "DDInter data changed after this review",
      announceReviewed: "Pair {a} + {b} marked reviewed.",
      announceIssue: "Pair issue reported for {a} + {b}.",
      contentTitle: "This pair changed in DDInter after you opened the page.",
      contentBody: "Nothing was saved. Reload to review the latest text.",
      otherTitle: "Another senior pharmacist decided on this pair after you opened the page.",
      otherBody: "Nothing was saved. Reload to see their decision.",
      netTitle: "Couldn't save your pair review.",
      unconfirmedTitle: "Couldn't confirm your pair review.",
      unconfirmedBody: "Try again to find out; it will not be saved twice.",
      substancesSub: "Every substance carried by a medicine we hold, from all batches.",
      filterLabel: "Filter substances by name or BDS id",
      filterPlaceholder: "Filter by name or BDS id",
      noMatch: "No substances match “{q}”.",
      showAllSubstances: "Show all substances",
      substancesCaption: "Substances we hold",
      colPairsToReview: "Pairs to review",
      colMajorToReview: "Major pairs to review",
      substanceMeta: "{k} {brands} in {b} {batches}",
      brandsCaption: "Brands of {name} in every batch",
      colBrand: "Brand",
      colChecked: "Checked against",
      pairsHeading: "Pairs with substances we hold",
      pairsEmpty: "No stored DDInter pair links {name} with another substance we hold.",
      notChecked: "Pairs with {name} are not checked.",
      loading: "Loading senior review",
      errorTitle: "Couldn't load senior review.",
      notFound: "No substance with the id {id}.",
      openSubstances: "Open the substances list",
      notAuthTitle: "Senior review is for senior pharmacists.",
      notAuthBody: "Your account reviews batches. Ask the IntelliDrugs team if you need senior access.",
      regionPlain: "IntelliDrugs senior review.",
      regionLabel: "IntelliDrugs senior review. Shortcuts work while focus is inside. Press question mark for the list.",
      lastPair: "This is the last pair on this page.",
      firstPair: "This is the first pair on this page.",
      sheetNext: "Next and previous pair",
      sheetMark: "Mark the pair reviewed",
      sheetReport: "Report a pair issue",
      sheetClose: "Close the sheet or the note",
      sheetEnter: "Never marks a pair reviewed",
      enterBlocked: "Enter does not mark a pair reviewed. Press M, or Space on this button.",
      noScript: "Reviewing pairs needs JavaScript for the bot check.",
      flagsLine: "Pair issues reported by senior pharmacists: {k}",
    });
  });

  it("pair label and state lines (§3.6, §5.17)", () => {
    expect(P1C_COPY.pair).toEqual({
      you: " (you)",
      changed: "Pair changed in DDInter after a senior pharmacist reviewed it on {date}.",
      issue: "Pair issue reported by a senior pharmacist on {date}{you}. Note:",
    });
  });

  it("the desk's other medicines (§5.5.3, §5.6.1, §5.6.2)", () => {
    expect(P1C_COPY.other).toEqual({
      title: "With other medicines",
      inBatch: "In batch {batchId}",
      inOther: "In other batches",
      withApproved: "With approved medicines",
      withNotApproved: "With medicines not yet approved",
      chips: "Pairs with other batches by severity",
      partnerRef: "{name} (batch {batchId})",
      andMoreInline: "and {k} more",
      detailsAll: "All {n} medicines",
      detailsSome: "{s} of {n} medicines",
      andMoreList: "and {k} more.",
      seeEveryBrand: "See every brand of {substance}",
      noDataOther: "Not checked, {j} {pairs} with medicines in other batches:",
      noOtherBatches: "There are no other batches yet.",
      noneOther: "DDInter 2.0 lists no interaction between {name} and the medicines in other batches. This is not a guarantee that they are safe to combine.",
      textMissingSame: "DDInter text not found for {n} {pairs} between ingredients of this product.",
      textMissingOther: "DDInter text not found for {n} {pairs} with medicines outside this batch.",
    });
  });

  it("Dismiss issue (§5.6.5, §5.7, §5.8.4, §5.10a)", () => {
    expect(P1C_COPY.dismiss).toEqual({
      button: "Dismiss issue",
      keyRow: "dismiss issue",
      sheetRow: "Dismiss an open issue",
      title: "Dismiss this issue",
      quote: "Reported by {who} on {date}:",
      byPharmacist: "a pharmacist",
      bySenior: "a senior pharmacist",
      byEngineer: "an engineer",
      byYou: "you",
      consequence: `Dismissing records that the report was a mistake. The record goes back to “${NOT_REVIEWED}”, and a pharmacist approves it again. The report stays in the history.`,
      noteLabel: "Why was the report a mistake? Pharmacists and engineers read this note.",
      notePlaceholder: "For example: the strength matches the DGDA register; the report misread it",
      noteError: "Add at least 5 characters so the team knows why the report was dismissed.",
      busy: "Dismissing",
      paused: "Dismissing is paused until you reload the record. Your note is kept.",
      promiseSavingLead: "Dismissing the issue.",
      promiseSavingBody: "Saving now.",
      promiseSeniorIssueBody: "If the report was a mistake, dismiss it. Otherwise it returns to review after the fix and re-run.",
      hintNoIssue: "No issue is open on this record.",
      hintFinish: "Finish or undo your decision on this record first.",
      conflictNoIssue: "No issue is open on this record any more. Nothing was saved.",
      announceDismissed: "Issue dismissed for {name}. The record is back in review for a pharmacist.",
      failedTitle: "Couldn't send your dismissal.",
      unconfirmedTitle: "Couldn't confirm your dismissal.",
      unconfirmedBody: "We couldn't confirm your dismissal was saved. Try again to find out; it will not be saved twice.",
      historyDismissed: "Issue dismissed by a senior pharmacist. Note:",
      historyDismissedMine: "Issue dismissed (you). Note:",
      noLongerCountsDismiss: "No longer counts: a senior pharmacist dismissed the issue after it.",
    });
    expect(P1C_COPY.dismiss.consequence).toContain("“Not yet reviewed by a pharmacist”");
  });

  it("source links (§5.6.3, §5.6.6)", () => {
    expect(P1C_COPY.sources).toEqual({
      fetchedOn: " fetched on {date}",
      newTab: " (opens in a new tab)",
      sourcesNote: "Where each value came from. Links open the source's own page.",
      dgda: "DGDA register (OCL)",
      rxnav: "RxNav",
      who: "WHO ATC/DDD Index",
    });
  });

  it("the words other modules already print stay out of NEW_COPY (SHARED_WORDS)", () => {
    expect(SHARED_WORDS).toEqual({
      status: "Status", substance: "Substance", substances: "Substances", reload: "Reload", bdsId: "BDS id",
      ddinterEntries: "DDInter entries", sources: "Sources", names: "Names", codes: "Codes", route: "Route", strength: "Strength",
      all: "All", ddinter: "DDInter 2.0", drugbank: "DrugBank", icd11: "ICD-11", clinicalDrug: "Clinical drug", severity: "Severity",
    });
    const values = Object.values(NEW_COPY).flatMap((r) => Object.values(r));
    for (const w of Object.values(SHARED_WORDS)) expect(values).not.toContain(w);
  });
});

// The review modules import the P1C copy; a 16-character fragment of a P1C value in their code is a retyped string.
function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* sources(p);
    else if (/\.(ts|tsx)$/.test(name)) yield relative(WEB, p).split("\\").join("/");
  }
}

describe("review modules never retype P1C copy", () => {
  it("no literal fragment of a P1C row appears in app/review, components/review or components/ui", () => {
    const fragments = Object.values(P1C_COPY).flatMap((row) => Object.values(row))
      .map((v) => v.split(/\{\w+\}/).sort((a, b) => b.length - a.length)[0].trim())
      .filter((f) => f.length >= 16);
    const files = ["app/review", "components/review", "components/ui"].flatMap((d) => { try { return [...sources(join(WEB, d))]; } catch { return []; } });
    const hits = files.flatMap((f) => {
      const text = readFileSync(join(WEB, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
      return fragments.filter((frag) => text.includes(frag)).map((frag) => `${f}: ${frag}`);
    });
    expect(hits).toEqual([]);
  });
});
