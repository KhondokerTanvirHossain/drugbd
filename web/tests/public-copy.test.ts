import { describe, expect, it } from "vitest";
import * as copy from "@/lib/copy";
import { CHECK, FOOTER, LANDING, NAV, PRODUCT, SEARCH, SIGNIN_CARD, STUB, plural } from "@/lib/public-copy";

describe("Board P strings (verbatim)", () => {
  it("navigation, landing and footer", () => {
    expect([NAV.medicines, NAV.checker, NAV.learn, NAV.partners, NAV.searchPlaceholder])
      .toEqual(["Medicines", "Interaction checker", "Learn", "For partners", "Brand, substance or DAR number"]);
    expect(LANDING.h1).toBe("Bangladesh's medicines, traced from brand to substance and checked by a pharmacist.");
    expect(LANDING.pilot).toBe("Pilot: {n} medicines being reviewed by pharmacists");
    expect(LANDING.ledeNarrow).toBe("Every DGDA-registered brand mapped to its clinical drug, active substances, international codes and DDInter 2.0 interactions. Public only after a pharmacist approves it.");
    expect(FOOTER.legal).toBe("Severity levels and management text are DDInter 2.0's, shown truncated, never rewritten.");
  });
  it("the §1.6 corrections replace the board strings they name", () => {
    expect(SEARCH.dataFound).toBe("Interaction data found in DDInter 2.0, {ids}");
    expect(JSON.stringify({ ...SEARCH, ...PRODUCT })).not.toContain("pilot brand");
    expect(JSON.stringify(PRODUCT)).not.toContain("With the other pilot medicines");
    expect(JSON.stringify(PRODUCT)).not.toContain("If the pipeline re-runs");
  });
  it("stub, checker and sign-in card", () => {
    expect(STUB.pending).toBe("A pharmacist hasn't approved this record yet. Until then IntelliDrugs hides its clinical drug, codes and interactions, so nobody relies on data that hasn't been checked.");
    expect(STUB.notNotFound).toBe('This is not the same as "not found" or "no data". The record exists and is in review in batch {batchId}.');
    expect(CHECK.help).toBe("Up and down arrows to move, Enter to add, Esc to close. 2 to 20 medicines.");
    expect(CHECK.emptyResults).toBe("Add medicines with the field on the left, or start from a scenario. Pairs appear here, Major first.");
    expect(SIGNIN_CARD.privacy).toBe("We use your Google name and email address only to sign you in and, for reviewers, to record each decision. Public decision history shows roles, never emails. We never post to your Google account.");
  });
  it("plural words", () => {
    expect([plural(1, "pair", "pairs"), plural(0, "pair", "pairs"), plural(2, "pair", "pairs")]).toEqual(["pair", "pairs", "pairs"]);
  });
});

describe("P2 new copy (§1.7)", () => {
  it("pins the strings §6 quotes for the states the boards do not draw", () => {
    const N = copy.PUBLIC_NEW;
    expect(N.removed.removed).toBe("Removed from the DGDA batch file.");
    expect(N.checkerMax.help).toBe("20 medicines is the maximum. Remove one to add another.");
    expect(N.hero.pendingLine).toBe("Its clinical drug, codes and interactions appear here after a pharmacist approves it.");
    expect(N.hero.ariaLabel).toBe("Lookup for {name}");
    expect(N.search).toMatchObject({ tooShort: "Type at least 2 characters.", tooLong: "Use 100 characters or fewer.",
      pageCap: "Showing the first 200 results. Refine your search to see more." });
    expect(N.notFound.text).toBe("No medicine with the id {id}.");
    expect(N.productPage.reportLabel).toBe("What's wrong? The IntelliDrugs team reads this.");
    expect(N.productPage.verificationRerun).toBe("If the pipeline changes data this approval covered, {brand} goes back to review and leaves public view until it is approved again.");
    expect(N.checker.unknownId).toBe("One medicine in the link no longer exists, so it was removed.");
    expect(N.checker.failTitle).toBe("Couldn't check these medicines.");
    expect(N.partner.sent).toBe("Request sent. The IntelliDrugs team replies to {email}.");
    expect(N.otherApproved.heading).toBe("With other approved medicines");
    expect(N.otherApproved.empty).toBe("No other approved medicine has an interaction with {substance} listed in DDInter 2.0 yet. Other medicines appear here as pharmacists approve them.");
    expect(N.privacy.audit).toBe("Each reviewer decision and sign-in is recorded with the account and time, for the team's audit trail. These records are never public.");
  });
  it("the low-risk board strings live in copy.ts", () => {
    expect(copy.PUBLIC_BOARD).toEqual({ unknownPromise: "Unknown severity is never called low risk",
      legendUnclassified: "Never treated as low risk, never merged with Minor." });
  });
});
