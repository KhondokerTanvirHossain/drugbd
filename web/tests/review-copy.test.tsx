import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DESK_NEW, NEW_COPY, NEW_COPY_ROWS, NOT_REVIEWED, fill } from "@/lib/copy";
import { DESK, ROLE_LABEL_DESK, fillNodes, historyText, plural, savedText, toastSub } from "@/lib/review-copy";

const WEB = fileURLToPath(new URL("..", import.meta.url));

describe("P1B rows of the §1.7 table", () => {
  it("pin the new copy verbatim", () => {
    expect(NEW_COPY[NEW_COPY_ROWS.decisionUnconfirmed]).toEqual({
      bannerTitle: "Couldn't confirm your decision.",
      bannerBody: "We couldn't confirm your decision was saved. Try again to find out; it will not be saved twice. Decision: Looks correct on {name}.",
      promiseLead: "Your decision may not have been saved.",
      promiseBody: "Use Try again above to find out.",
      rowHint: "Decision not confirmed",
      hint: "Your last decision on this record is not confirmed yet. Use Try again.",
      announce: "Couldn't confirm your decision. We couldn't confirm your decision was saved. Try again to find out; it will not be saved twice.",
    });
    expect(NEW_COPY[NEW_COPY_ROWS.sessionExpired]).toEqual({
      block: "Your sign-in expired. Your decision on {name} was not saved.",
      signInAgain: "Sign in again",
      hint: "Your sign-in expired. Sign in again to keep reviewing.",
    });
    expect(NEW_COPY[NEW_COPY_ROWS.undoWhileSaving]).toEqual({ hint: "Too late to undo: {name} is saving. Use Report issue to withdraw it." });
    expect(NEW_COPY[NEW_COPY_ROWS.approvalRefused]).toEqual({
      promiseLead: "A check failed on this record.",
      promiseBody: "It returns to review after the fix and re-run.",
      hint: "A check failed on this record. It returns to review after the fix and re-run.",
      commitHint: "A check failed on this record. It returns to review after the fix and re-run. Nothing was saved.",
      removedHint: "This record was removed from the batch file. Nothing was saved.",
    });
    expect(NEW_COPY[NEW_COPY_ROWS.drawerOpen]).toEqual({ hint: "Close the evidence first (Esc)." });
    expect(NEW_COPY[NEW_COPY_ROWS.deskSettings]).toEqual({
      heading: "Settings", undoLabel: "Undo window", undo8: "8 seconds", undo20: "20 seconds", undo60: "60 seconds",
      keysLabel: "Single-key shortcuts", on: "On", off: "Off", workspacePlain: "IntelliDrugs review workspace.",
    });
    expect(NEW_COPY[NEW_COPY_ROWS.committing]).toEqual({
      lead: "Marked correct.", pharmacistBody: "Publishing now.", engineerBody: "Saving your check now.", toastSaving: "saving.",
    });
    expect(NEW_COPY[NEW_COPY_ROWS.deskMisc]).toEqual({
      backToList: "Back to list",
      noScript: "Reviewing needs JavaScript for the bot check. You can still read this record.",
      skipRecord: "Skip to record",
      skipBar: "Skip to decision bar",
      staleOtherReviewer: "Another reviewer decided on {name} after you opened it. Decisions are paused and nothing was saved. Any note you were writing is kept.",
      reportFailedTitle: "Couldn't send your report.",
      reportFailedBody: "Nothing was saved. Check your connection and try again.",
      confirmTitle: "Confirm your decision on {name}.",
      confirmBody: "Your browser didn't load the undo window, so nothing is saved until you confirm.",
      confirmPharmacist: "Confirming publishes this record.",
      confirmEngineer: "Confirming records your check. It does not publish.",
      confirm: "Confirm",
      cancel: "Cancel",
      rawDgdaRecord: "Raw DGDA record",
    });
    expect(NEW_COPY[NEW_COPY_ROWS.deskLoad]).toEqual({
      errorTitle: "Couldn't load batch {id}.", errorBody: "Nothing was changed. Check your connection and try again.",
      notFound: "No batch with the id {id}.",
    });
    expect(NEW_COPY[NEW_COPY_ROWS.history]).toEqual({
      run: "Batch {id} run started",
      sharedChange: "Shared substance data for this record changed",
      engineerChecked: "Engineer checked. Not published.",
      engineerCheckedMine: "Engineer checked (you). Not published.",
      issuePharmacist: "Issue reported by a pharmacist. Note:",
      issueEngineer: "Issue reported by an engineer. Note:",
      noLongerCounts: "No longer counts: the record was re-run after it.",
      backSharedChange: `Shared substance data for this record changed after a pharmacist approved it. Readers see “${NOT_REVIEWED}” until a pharmacist approves it again.`,
      carriedOver: "Approval carried over from batch {batchId}: nothing it covered changed.",
      approvedSenior: "Approved by a senior pharmacist. Published.",
      approvedSeniorMine: "Approved by a senior pharmacist (you). Published.",
      issueSenior: "Issue reported by a senior pharmacist. Note:",
    });
    expect(NEW_COPY[NEW_COPY_ROWS.shortcutsMenuItem]).toEqual({ item: "Keyboard shortcuts and settings" });
    expect(NEW_COPY[NEW_COPY_ROWS.reviewLists]).toEqual({
      waitingOne: "Batch {id} has 1 record waiting for a pharmacist.",
      waitingMany: "Batch {id} has {w} records waiting for a pharmacist.",
      noBatches: "No batches are in review.",
      flagsLink: "Problem reports and partner requests",
      reportsHeading: "Problem reports",
      partnerHeading: "Partner access requests",
      reported: "Reported {date}",
      resolve: "Resolve",
      resolving: "Resolving",
      reportResolved: "Report resolved.",
      requestResolved: "Request resolved.",
      noReports: "No open problem reports.",
      noRequests: "No open partner requests.",
      loadErrorTitle: "Couldn't load the reports.",
      loadErrorBody: "Nothing was changed. Check your connection and try again.",
      tryAgain: "Try again",
      nextPage: "Next page",
      previousPage: "Previous page",
      noScriptResolve: "Resolving needs JavaScript for the bot check.",
      interactionCheck: "Interaction check",
    });
    expect(NEW_COPY[NEW_COPY_ROWS.routeAware]).toEqual({
      dataFound: "Interaction data found for this product's route ({route}): {ids}",
      dataFoundNoRoute: "Interaction data found: {ids}, route assumed",
      routeAssumedSuffix: ", route assumed",
      allEntries: "All DDInter entries for {name}: {ids}, {total} drug pairs.",
      noRouteEntry: "No DDInter entry for this product's route ({route}). Its pairs are not checked.",
      noRouteEntryNoRoute: "No DDInter entry fits this product, which has no route on record. Its pairs are not checked.",
      checkedAgainst: "{substance} is checked against {id} {ddinterName} ({route}).",
      assumedStatement: "Route assumed: this product's route is {route} and DDInter has no {route} entry for {substance}, so the systemic entry {id} is used.",
      mappingChecked: "Checked against {id} ({route})",
      notCheckedNoRoute: "Not checked: {brand}'s route is {route} and DDInter has no entry for {substance} on that route.",
      notCheckedNoRouteNoRoute: "Not checked: {brand} has no route on record and DDInter has no systemic entry for {substance}.",
      notCheckedUnmapped: "Not checked: {ingredient} in {brand} has no substance mapping yet.",
      notCheckedSameProduct: "Not checked: {a} + {b} are ingredients of this product.",
    });
    expect(NEW_COPY[NEW_COPY_ROWS.routeAssumed]).toEqual({
      noRouteStatement: "Route assumed: this product has no route on record, so the systemic entry {id} is used.",
    });
    expect(NEW_COPY[NEW_COPY_ROWS.notRun]).toEqual({
      rowHint: "DDInter not run yet",
      notCheckedNotRun: "Not checked: DDInter mapping has not run for {substance} in {brand}.",
    });
    expect(DESK_NEW.deskMisc.noScript).toBe(NEW_COPY[NEW_COPY_ROWS.deskMisc].noScript);
  });

  it("fill substitutes every placeholder and leaves unknown ones alone", () => {
    expect(fill(DESK_NEW.sessionExpired.block, { name: "Napa" })).toBe("Your sign-in expired. Your decision on Napa was not saved.");
    expect(fill("{a} and {b}", { a: 1 })).toBe("1 and {b}");
  });

  it("fillNodes keeps nodes in place, for mono ids", () => {
    const html = renderToStaticMarkup(<p>{fillNodes(DESK_NEW.routeAware.checkedAgainst, {
      substance: "Chloramphenicol", id: <span className="mono">DDInter352</span>, ddinterName: "Chloramphenicol", route: "ophthalmic" })}</p>);
    expect(html).toBe('<p>Chloramphenicol is checked against <span class="mono">DDInter352</span> Chloramphenicol (ophthalmic).</p>');
  });

  it("Board R strings that carry a count", () => {
    expect(plural(1, "pair", "pairs")).toBe("pair");
    expect(plural(2, "pair", "pairs")).toBe("pairs");
    expect(fill(DESK.showAll, { n: 10 })).toBe("Show all 10 records");
    expect(savedText("pharmacist", "Napa")).toBe("Saved. Napa is approved by a pharmacist and published.");
    expect(savedText("engineer", "Napa")).toBe("Saved. Your check on Napa is recorded. It does not publish.");
  });

  it("history entries read as §5.6.5 says, with (you) and the no-longer-counts suffix", () => {
    const at = "2026-10-12T09:00:00Z";
    expect(historyText({ kind: "run", at }, "0001-pilot")).toBe("Batch 0001-pilot run started");
    expect(historyText({ kind: "extract", at, reason: "run" }, "b")).toBe("Pipeline extracted this record");
    expect(historyText({ kind: "extract", at, reason: "rerun" }, "b")).toBe("Pipeline re-ran this record");
    expect(historyText({ kind: "extract", at, reason: "shared_change" }, "b")).toBe("Shared substance data for this record changed");
    expect(historyText({ kind: "decision", at, decision: "ok", role: "pharmacist", counts: true, mine: false }, "b"))
      .toBe("Approved by a pharmacist. Published.");
    expect(historyText({ kind: "decision", at, decision: "ok", role: "pharmacist", counts: true, mine: true }, "b"))
      .toBe("Approved by a pharmacist (you). Published.");
    expect(historyText({ kind: "decision", at, decision: "ok", role: "engineer", counts: false, mine: false }, "b"))
      .toBe("Engineer checked. Not published. No longer counts: the record was re-run after it.");
    expect(historyText({ kind: "decision", at, decision: "ok", role: "engineer", counts: true, mine: true }, "b"))
      .toBe("Engineer checked (you). Not published.");
    expect(historyText({ kind: "decision", at, decision: "issue", role: "pharmacist", counts: true, mine: false }, "b"))
      .toBe("Issue reported by a pharmacist. Note:");
    expect(historyText({ kind: "decision", at, decision: "issue", role: "engineer", counts: true, mine: false }, "b"))
      .toBe("Issue reported by an engineer. Note:");
    expect(historyText({ kind: "decision", at, decision: "issue", role: "engineer", counts: true, mine: true }, "b"))
      .toBe("Issue reported (you). Note:");
  });

  it("P1C: a senior's lines are a pharmacist's, never an engineer's (§5.6.5, §5.13)", () => {
    const at = "2026-10-15T09:00:00Z";
    expect(ROLE_LABEL_DESK.senior).toBe("Senior pharmacist");
    expect(toastSub("senior", 8)).toBe("Publishes in 8 seconds.");
    expect(savedText("senior", "Napa")).toBe("Saved. Napa is approved by a pharmacist and published.");
    expect(historyText({ kind: "decision", at, decision: "ok", role: "senior", counts: true, mine: false }, "b"))
      .toBe("Approved by a senior pharmacist. Published.");
    expect(historyText({ kind: "decision", at, decision: "ok", role: "senior", counts: true, mine: true }, "b"))
      .toBe("Approved by a senior pharmacist (you). Published.");
    expect(historyText({ kind: "decision", at, decision: "issue", role: "senior", counts: true, mine: false }, "b"))
      .toBe("Issue reported by a senior pharmacist. Note:");
    expect(historyText({ kind: "decision", at, decision: "dismiss", role: "senior", counts: true, mine: false }, "b"))
      .toBe("Issue dismissed by a senior pharmacist. Note:");
    expect(historyText({ kind: "decision", at, decision: "dismiss", role: "senior", counts: true, mine: true }, "b"))
      .toBe("Issue dismissed (you). Note:");
  });

  it("P1C: the complete view says what re-opens a record now (§1.6 item 17, §5.12, D54)", () => {
    expect(DESK.doneBody).toBe("Each record was approved by a pharmacist. If the pipeline changes data a record's approval covered, it goes back in review and leaves public view until a pharmacist approves it again.");
  });

  it("P1C: the dismissal's No longer counts suffix, and the re-run suffix when both apply (§5.6.5)", () => {
    const at = "2026-10-15T09:00:00Z";
    expect(historyText({ kind: "decision", at, decision: "issue", role: "pharmacist", counts: false, uncountedBy: "dismiss", mine: false }, "b"))
      .toBe("Issue reported by a pharmacist. Note: No longer counts: a senior pharmacist dismissed the issue after it.");
    expect(historyText({ kind: "decision", at, decision: "ok", role: "pharmacist", counts: false, uncountedBy: "rerun", mine: false }, "b"))
      .toBe("Approved by a pharmacist. Published. No longer counts: the record was re-run after it.");
    expect(historyText({ kind: "decision", at, decision: "ok", role: "pharmacist", counts: false, mine: false }, "b"))
      .toBe("Approved by a pharmacist. Published. No longer counts: the record was re-run after it.");
  });
});

// Review modules import new copy instead of retyping it (§11.1 "page modules import those strings").
function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* sources(p);
    else if (/\.(ts|tsx)$/.test(name)) yield relative(WEB, p).split("\\").join("/");
  }
}
const REVIEW_DIRS = ["app/review", "components/review"];
const P1B_ROWS = ["decisionUnconfirmed", "sessionExpired", "undoWhileSaving", "approvalRefused", "drawerOpen", "deskSettings",
  "committing", "deskMisc", "deskLoad", "history", "shortcutsMenuItem", "reviewLists", "routeAware", "routeAssumed", "notRun"] as const;

describe("review modules never retype new copy", () => {
  it("no literal fragment of a P1B row appears in app/review or components/review", () => {
    const fragments = P1B_ROWS.flatMap((row) => Object.values(NEW_COPY[NEW_COPY_ROWS[row]]))
      .map((v) => v.split(/\{\w+\}/).sort((a, b) => b.length - a.length)[0].trim())
      .filter((f) => f.length >= 16);
    const files = REVIEW_DIRS.flatMap((d) => { try { return [...sources(join(WEB, d))]; } catch { return []; } });
    const hits = files.flatMap((f) => {
      // Comments may quote the copy they describe (as P1A's copy.test allows): only code counts.
      const text = readFileSync(join(WEB, f), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      return fragments.filter((frag) => text.includes(frag)).map((frag) => `${f}: ${frag}`);
    });
    expect(hits).toEqual([]);
  });
});
