import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as copy from "@/lib/copy";

const WEB = fileURLToPath(new URL("..", import.meta.url));

/** The §1.7 table, copied from the spec row by row. */
const SPEC_ROWS = [
  "Decision sent but not confirmed (timeout, lost response, 5xx)",
  "Session expired during an undo window or at commit",
  "U pressed while the decision is saving",
  "Approval refused because a check failed or did not run",
  "A or R pressed while the evidence drawer is open",
  "Desk settings: undo window length and single-key shortcuts",
  "\"Don't include patient names or other personal health details.\" help on free-text fields",
  "DDInter mapping not run (product page, desk, checker)",
  "Product page: ingredient with no data or no entry for its route",
  "Record removed from the DGDA batch file (public stub)",
  "Maximum of 20 medicines reached in the checker",
  "Landing hero card while the hero product is not approved; its `aria-label` in both states",
  "Learn: snapshot-value date suffix \"as stored on {date}\"",
  "Decision saving (`committing`): promise and toast",
  "Desk: narrow-screen \"Back to list\", the no-JavaScript notices, loading and loaded announcements",
  "Desk: batch load error, batch not found",
  "History: role variants, the \"No longer counts\" suffix, shared-change entries",
  "Account menu item \"Keyboard shortcuts and settings\"",
  "Batch list and problem-report and partner-request lists (`/review`, `/review/flags`)",
  "Phase-0 `/batches` gate for non-reviewers",
  "Sign-in: not configured, session request failed, sign-in rate limit, engineer welcome step, \"Invite sent to another Google account\" placement",
  "Search: validation, page cap, substance hit with no data or not run",
  "Desk and product page: route-aware data line, chosen-entry statement, other not-checked reasons in the batch block",
  "Product not found",
  "Product page: \"Report a problem\" field label, \"No other approved brand\" line",
  "Checker: summary segments, \"Other not checked\" count, unknown id (404), check failed (5xx), scenario announcement",
  "Partner request sent",
  "Route assumed because the product has no route",
];

describe("§3.6 fixed safety strings", () => {
  it.each([
    ["NO_DATA_SENTENCE", "No interaction data in DDInter for this substance. This does not mean it is safe to combine."],
    ["NOT_REVIEWED", "Not yet reviewed by a pharmacist"],
    ["APPROVED", "Approved by a pharmacist"],
    ["BACK_IN_REVIEW", "Back in review"],
    ["ENGINEER_CHECKED", "Engineer checked"],
    ["ISSUE_REPORTED", "Issue reported"],
    ["SEVERITY_NOT_CLASSIFIED", "Severity not classified by DDInter"],
    ["STALE_TITLE", "This record changed \u2014 reload to review the latest data"],
    ["FULL_TEXT", "Full text from DDInter 2.0"],
    ["UNKNOWN_PAIR_LINE", 'DDInter 2.0 lists this pair with action "unknown" and no text. It is not treated as low risk.'],
    ["UNKNOWN_PAIRS_LINE", 'DDInter 2.0 lists these pairs with action "unknown" and no text. They are not treated as low risk.'],
    ["NO_MANAGEMENT", "DDInter 2.0 gives no management text for this pair."],
    ["NO_TEXT", "DDInter 2.0 has no interaction or management text for this pair."],
    ["DECISION_SUPPORT", "IntelliDrugs is decision support. It is not a substitute for clinical judgement. Severity levels and management text come from DDInter 2.0 and are shown truncated, never rewritten."],
    ["NO_PHI_HELP", "Don't include patient names or other personal health details."],
    ["NOT_RUN", "Not checked yet: DDInter mapping has not run"],
  ])("%s is exactly its literal", (name, literal) => {
    expect((copy as unknown as Record<string, unknown>)[name]).toBe(literal);
  });

  it("the decision-bar promises keep the bold lead and the body apart", () => {
    expect(copy.PROMISE_PHARMACIST.lead).toBe("You're reviewing as a pharmacist.");
    expect(copy.PROMISE_PHARMACIST.body(8)).toBe('"Looks correct" publishes this record after an 8-second undo window.');
    expect(copy.PROMISE_ENGINEER).toEqual({ lead: "You're reviewing as an engineer.",
      body: '"Looks correct" records your check. It does not publish; a pharmacist still needs to approve.' });
    expect(copy.PROMISE_PAUSED).toEqual({ lead: "Decisions are paused.",
      body: "This record changed after you opened it. Reload it to review the latest data." });
  });

  it("the em dash appears only in STALE_TITLE", () => {
    const src = readFileSync(join(WEB, "lib/copy.ts"), "utf8");
    expect(src.match(/\u2014/g)).toHaveLength(1);
  });
});

describe("§1.7 new copy", () => {
  it("NEW_COPY has exactly one entry per §1.7 row, keyed by the row text", () => {
    expect(Object.values(copy.NEW_COPY_ROWS).sort()).toEqual([...SPEC_ROWS].sort());
    expect(Object.keys(copy.NEW_COPY).sort()).toEqual([...SPEC_ROWS].sort());
  });

  it("pins the sign-in strings P1A ships (§6.2, §4.4, §9.3)", () => {
    expect(copy.NEW_COPY[copy.NEW_COPY_ROWS.signIn]).toEqual({
      notConfiguredTitle: "Sign-in is not available right now.",
      notConfiguredBody: "Searching and checking interactions don't need an account.",
      requestFailedTitle: "Couldn't sign you in.",
      requestFailedBody: "Nothing changed. Check your connection and try again.",
      rateLimited: "Too many sign-in attempts. Wait a few minutes and try again.",
      noScript: "Sign-in needs JavaScript for Google and the bot check.",
      unverifiedBody: "Your Google account email is not verified.",
      staleAuthBody: "Sign-in is too old. Please sign in again.",
      invalidBody: "Sign-in could not be verified. Please try again.",
    });
    expect(copy.NEW_COPY[copy.NEW_COPY_ROWS.noPhiHelp]).toEqual({ help: copy.NO_PHI_HELP });
    expect(copy.NEW_COPY[copy.NEW_COPY_ROWS.phase0Gate]).toEqual({ notReviewer: "Only pharmacists and engineers can see batches." });
  });

  it("keeps P0's BATCHES_REVIEWERS_ONLY export, which both /batches pages import", () => {
    expect(copy.BATCHES_REVIEWERS_ONLY).toBe("Only pharmacists and engineers can see batches.");
    expect(copy.NEW_COPY[copy.NEW_COPY_ROWS.phase0Gate].notReviewer).toBe(copy.BATCHES_REVIEWERS_ONLY);
  });

  it("pins the Board P sign-in strings", () => {
    expect(copy.SIGN_IN).toEqual({
      heading: "Sign in to IntelliDrugs",
      sub: "New here? The same button creates your account.",
      button: "Continue with Google",
      loading: "Opening Google",
      loadingHint: "Finish signing in in the Google window. This page updates when you're done.",
      captchaTitle: "We couldn't confirm you're a person.",
      captchaBody: "You weren't signed in. Retry the check. If it fails again, turn off extensions that block scripts on this page.",
      retry: "Retry check",
      cancelledTitle: "Sign-in cancelled.",
      cancelledBody: "You closed the Google window before finishing. Nothing changed. Continue with Google to try again.",
      blockedTitle: "Your browser blocked the Google window.",
      blockedBody: "Allow pop-ups for drugdb.eliooo.org, or continue in this tab instead.",
      continueInTab: "Continue in this tab",
    });
  });
});

// ---- Paraphrase guard (§3.6, §11.1) ----
function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* sources(p);
    else if (/\.(ts|tsx)$/.test(name)) yield relative(WEB, p).split("\\").join("/");
  }
}
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
/** The legacy checker page is rewritten in P2 (§12.2); P2 empties this list. */
const LEGACY_EXEMPT = ["app/check/page.tsx"];
/** Files that may hold the compact pill's short form (§3.4). */
const SHORT_FORM_ALLOWED = ["components/ui/ReviewStatus.tsx"];
const scanned = () => ["app", "components", "lib"].flatMap((d) => [...sources(join(WEB, d))])
  .filter((f) => f !== "lib/copy.ts" && !LEGACY_EXEMPT.includes(f));
const text = (f: string) => stripComments(readFileSync(join(WEB, f), "utf8"));

describe("no paraphrase or retyping of the safety sentences", () => {
  it("no source file retypes a safety sentence instead of importing it", () => {
    const safety = [copy.NO_DATA_SENTENCE, copy.NOT_REVIEWED, copy.SEVERITY_NOT_CLASSIFIED, copy.UNKNOWN_PAIR_LINE,
      copy.UNKNOWN_PAIRS_LINE, copy.NOT_RUN];
    const hits = scanned().flatMap((f) => safety.filter((s) => text(f).includes(s)).map((s) => `${f}: ${s}`));
    expect(hits).toEqual([]);
  });

  it("no source file retypes a NEW_COPY string (§11.1: page modules import them)", () => {
    const strings = Object.values(copy.NEW_COPY).flatMap((r) => Object.values(r)).filter((s) => s.length > 0);
    const hits = scanned().flatMap((f) => strings.filter((s) => text(f).includes(s)).map((s) => `${f}: ${s}`));
    expect(hits).toEqual([]);
  });

  it.each([
    [/\bno interactions\b/i, "no interactions"],
    [/No interaction data in DDInter/, "a NO_DATA_SENTENCE paraphrase"],
    [/low risk/i, "low risk outside the UNKNOWN_PAIR lines"],
    [/rv--approved[^>]*>[^<]*no data/i, "no data in green markup"],
  ])("no source file contains %s (%s)", (pattern) => {
    expect(scanned().filter((f) => pattern.test(text(f)))).toEqual([]);
  });

  it("the short form 'Not yet reviewed' appears only in the compact pill", () => {
    const short = /Not yet reviewed(?! by a pharmacist)/;
    expect(scanned().filter((f) => !SHORT_FORM_ALLOWED.includes(f) && short.test(text(f)))).toEqual([]);
  });
});
