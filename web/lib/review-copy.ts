import { Fragment, createElement, type ReactNode } from "react";
import { APPROVED, DESK_NEW, P1C_COPY, QA_COPY, UNCLASSIFIED_NOT_LOW_RISK, fill } from "./copy";
import { actsAsPharmacist, type DisplayStatus, type HistoryEntry, type ReviewerRole, type StageKey } from "./review-types";

/*
 * Board R wording for the review workspace (docs/artifacts/2026-10-12-intellidrugs-reviewer.html). Client-safe.
 * New copy (§1.7) is in NEW_COPY / DESK_NEW, never here.
 */
export const DESK = {
  batchPrefix: "Batch",
  approvedOf: "{a} of {n} approved",
  recordOf: "Record {k} of {n}",
  batchApproved: "Batch approved",
  batchesHeading: "Batches",
  showHeading: "Show",
  sidebarLabel: "Batches and filters",
  cardTitleRest: "approved by a pharmacist",
  cardMeter: "{a} approved, {i} with an issue, {needs} need review",
  cardApproved: "Approved",
  cardIssue: "Issue reported",
  cardNeeds: "Needs review",
  cardStatus: "Batch status:",
  inReview: "In review",
  approvedStatus: "Approved",
  approvedWhen: "Approved when all {n} records are approved by a pharmacist.",
  run: "Run {date}",
  filters: { all: "All records", needs: "Needs review", warn: "Warnings", issue: "Issue reported", approved: "Approved", nodata: "No DDInter data" },
  empty: { all: "", needs: "No records need review.", warn: "No records have a check warning.", issue: "No records with an issue reported.",
    approved: "No records are approved yet.", nodata: "No records without DDInter data." },
  noMatch: "No records match “{q}”.",
  showAll: "Show all {n} records",
  listCount: "{n} records, by DAR number",
  listCountFiltered: "{v} of {n} records",
  loadingCount: "Loading",
  searchLabel: "Filter records by name, substance or DAR number",
  searchPlaceholder: "Filter by name, substance or DAR",
  listLabel: "Records in {id}",
  // Strings that contain a NEW_COPY value are built from it: P1A's copy.test fails on a retyped NEW_COPY string (§11.1).
  workspaceLabel: `${DESK_NEW.deskSettings.workspacePlain} Shortcuts work while focus is inside. Press question mark for the list.`,
  hintNotSaved: "Decision not saved",
  hintChanged: "Changed since you opened it",
  hintNoData: "No DDInter data",
  hintAllOk: "All checks OK",
  crumb: "{id}, record {k} of {n}",
  visApproved: "Published. Readers can see this record.",
  visHidden: "Hidden from readers until a pharmacist approves it.",
  evidence: "Evidence",
  dgdaSource: "DGDA source",
  previous: "Previous",
  next: "Next",
  cmpTitle: "DGDA source against the extraction",
  cmpSub: "Each relation compares the two values on its row. Fields copied from the register have no verdict.",
  cmpCaption: "{name}: DGDA register compared with the pipeline extraction",
  cmpField: "Field", cmpSource: "DGDA source", cmpRelation: "Relation", cmpExtracted: "Extracted by the pipeline",
  copied: "Copied from the register",
  notInRegister: "Not in the register",
  parserPart: "Parser's part of the DGDA text",
  parsed: "{k} {ingredients} parsed",
  noMatchingSubstance: "No matching substance",
  names: "Names: {names}",
  codesFor: "{k} codes for {name}",
  dataFound: "Interaction data found",
  clinicalSub: ", route {route}, dose form {form}",
  checksTitle: "Automated checks",
  checksRun: "Pipeline run {date}",
  textMissing: "DDInter text not found for {n} {pairs} with other medicines in this batch.",
  hidePair: "Hide the pair", showPair: "Show the pair", hidePairs: "Hide the {n} pairs", showPairs: "Show the {n} pairs",
  interactionsTitle: "Interactions",
  interactionsSub: "From DDInter 2.0, by substance",
  noDataLine: "Drug, disease and food interactions: no data in DDInter 2.0.",
  notCheckedWithBatch: "Not checked, {k} pairs with this batch:",
  severityGroup: "Drug pairs in DDInter 2.0 by severity",
  totals: "{total} drug pairs in total. {d} drug and disease {dWord}, {f} drug and food {fWord}.",
  batchTitle: "With the other medicines in this batch",
  batchFound: "{p} {pairs} found in DDInter 2.0.",
  batchNotChecked: " {nc} {pairs} not checked.",
  batchChips: "Batch pairs by severity",
  noneInvolve: "None of the {n} batch pairs from DDInter 2.0 involve {name}.",
  pairWith: "With {partners}. ",
  record: "{name} (record {k})",
  managementTruncated: "Management, truncated.",
  managementFull: "Management, in full.",
  interactionTruncated: "Interaction description, truncated.",
  interactionFull: "Interaction description, in full.",
  noManagementForPair: " DDInter has no management text for this pair.",
  noTextHeading: "{k} {pairs} with no text in DDInter 2.0",
  noTextWith: "with {records}",
  noTextClosing: "{actions}DDInter 2.0 has no interaction or management text for {this}.",
  noTextUnknown: ` ${UNCLASSIFIED_NOT_LOW_RISK}`,
  actionIn: "Action in DDInter: {actions}. ",
  notCheckedLead: "Not checked.",
  historyTitle: "History",
  historySub: "Oldest first",
  approvedHistory: "Approved by a pharmacist. Published.",
  approvedHistoryMine: "Approved by a pharmacist (you). Published.",
  issueMine: "Issue reported (you). Note:",
  extracted: "Pipeline extracted this record",
  reran: "Pipeline re-ran this record",
  drawerSub: "{name}, record {k} of {n}",
  close: "Close",
  rawBrandRow: "Raw brand row",
  rawBrandNote: "The DGDA register fields with the pipeline's parse fields, exactly as stored.",
  dgdaCodes: "DGDA ingredient codes",
  pipelineNotes: "Pipeline notes",
  noNote: "No note",
  pipeline: "Pipeline",
  conceptId: "Concept id",
  signature: "Clinical signature",
  extractedAt: "Extracted at",
  batchRun: "Batch run",
  batchRunSub: "{id}, {n} items",
  evidenceShown: "Evidence shown for {name}. The record behind it is paused until you close it.",
  staleBodyRerun: "The pipeline re-ran {name} after you opened it. Decisions are paused and nothing was saved. Any note you were writing is kept.",
  seeChanges: "See what changed", hideChanges: "Hide changes", reload: "Reload record",
  diffCaption: "Cells that changed in the re-run", diffBefore: "You were reviewing", diffNow: "Now",
  diffFooter: "Cells that are not listed did not change.",
  reloaded: "Record reloaded. Decisions are available again.",
  backRerun: "This record was re-run after a pharmacist approved it. Readers see “{notReviewed}” until a pharmacist approves it again.",
  netTitle: "Couldn't save your decision.",
  netBody: "Nothing was published. Check your connection and try again. Decision: Looks correct on {name}.",
  netAnnounce: "Couldn't save your decision. Nothing was published. Check your connection and try again.",
  tryAgain: DESK_NEW.reviewLists.tryAgain, saving: "Saving",
  noAuthTitle: "Your account can't review this batch.",
  noAuthBody: "Ask the IntelliDrugs team for a reviewer invite, then sign in with the invited Google account. You can still read this record.",
  noAuthPageBody: "Ask the IntelliDrugs team for a reviewer invite, then sign in with the invited Google account.",
  // The bot-check title is QA_COPY's (§5.18 uses the same sentence alone), so the retyping guard sees it once.
  botError: `${QA_COPY.keys.captchaTitle} Your decision is kept. Retry the check to continue.`,
  retryCheck: "Retry check", checking: "Checking",
  reportIssue: "Report issue", looksCorrect: "Looks correct",
  noteLabel: "What's wrong with this record? An engineer reads this note.",
  notePlaceholder: "For example: strength should read Warfarin Sodium 5 mg",
  noteHelp: "5 to 1000 characters.",
  noteError: "Add at least 5 characters so the engineer knows what to fix.",
  noteCount: "{len} / 1000",
  cancel: DESK_NEW.deskMisc.cancel, sendReport: "Send report", sending: "Sending",
  reportPaused: "Sending is paused until you reload the record. Your note is kept.",
  reported: "Issue reported for {name}. An engineer will see your note.",
  promiseLoading: "Loading batch {id}.", promiseLoadingBody: "Decisions open when the record loads.",
  promiseComplete: "Batch {id} is approved.", promiseCompleteBody: "Open any record to read it.",
  promiseNotSaved: "Your decision was not saved.", promiseNotSavedBody: "Use Try again above.",
  promiseMarked: DESK_NEW.committing.lead,
  promiseMarkedPharmacist: "Publishes when the undo window closes. Press U to undo.",
  promiseMarkedEngineer: "Your check saves when the undo window closes. Press U to undo.",
  promiseApproved: "Approved by a pharmacist.", promiseApprovedBody: "This record is public.",
  promiseIssue: "An issue is open on this record.", promiseIssueBody: DESK_NEW.approvalRefused.promiseBody,
  promiseChecked: "Your check is recorded.", promiseCheckedBody: "A pharmacist still needs to approve.",
  toastMarked: "marked correct.",
  undo: "Undo",
  announceMarked: "{name} marked correct. {sub} Press U to undo.",
  undone: "Undone. {name} was not saved.",
  nothingToUndo: "Nothing to undo.",
  paused: "Decisions are paused. Reload the record first.",
  otherWindow: "{name} is still in its undo window. Press U to undo it, or wait until it saves.",
  thisWindow: "This record is already in its undo window. Press U to undo.",
  alreadyApproved: "This record is already approved by a pharmacist.",
  issueOpen: `An issue is open on this record. ${DESK_NEW.approvalRefused.promiseBody}`,
  alreadyChecked: "Your check is already recorded for this record.",
  reportOpen: "Send or cancel the report first.",
  notSavedHint: "Your last decision on this record was not saved. Use Try again.",
  botFirst: "Retry the bot check first. Your earlier decision is kept.",
  completeHint: "Every record is approved. Open a record to read it.",
  enterBlocked: "Enter does not approve. Press A, or Space on this button.",
  advanceGuard: "Record changed to {name}. Press A again to approve it.",
  botFailedAnnounce: "Bot check failed. Your decision is kept. Retry the check to continue.",
  botPassedAnnounce: "Bot check passed.",
  allApproved: "Every record in batch {id} is approved.",
  opened: "Opened {name}, record {k} of {n}.",
  noneLeft: "No other record needs your review.",
  lastInView: "This is the last record in this view.",
  firstInView: "This is the first record in this view.",
  emptyView: "No records in this view. Show all {n} records to move.",
  noAuthAnnounce: "Your account can't review this batch. Your decision on {name} was not saved.",
  doneTitle: "Batch {id} approved. {n} records are now public.",
  doneBody: "Each record was approved by a pharmacist. If the pipeline changes data a record's approval covered, it goes back in review and leaves public view until a pharmacist approves it again.",
  openRecord1: "Open record 1",
  loadingStatus: "Loading batch {id}",
  loaded: "Batch {id} loaded.",
  sheetTitle: "Keyboard shortcuts",
  sheetNote: "Shortcuts work while focus is in the workspace. They pause while you type in a field, and ignore Ctrl, Cmd and Alt combinations.",
  reducedMotion: "Saves in {n} seconds",
  notAuthWarnTitle: "This Google account isn't on the reviewer list.",
  notAuthWarnBody: "You're signed in as {email}. Reviewer tools need the account your invite was sent to. You can still search and check interactions.",
  useAnother: "Use another Google account",
  searchMedicines: "Search medicines",
  openDesk: "Open the review desk",
  reviewDesk: "Review desk",
} as const;

export const ROLE_LABEL_DESK: Record<ReviewerRole, string> = { pharmacist: "Pharmacist", engineer: "Engineer", senior: P1C_COPY.senior.badge };
export const STAGE_NAME: Record<StageKey, string> = { dgda: "DGDA load", substances: "Substances", clinical: "Clinical drug", ddinter: "DDInter" };

/** The key row under the decision bar (Board R), as [keys, words] pairs. */
export const KEY_ROW: [string[], string][] = [
  [["J", "K"], "next, previous"], [["A"], "looks correct"], [["U"], "undo"], [["R"], "report"], [["E"], "evidence"],
  [["S"], "DGDA source"], [["?"], "all keys"],
];

/** §5.7 item 8: for a senior on an `issue` record, "D dismiss issue" follows "R report". */
export function keyRow(role: ReviewerRole, status: DisplayStatus | undefined): [string[], string][] {
  if (role !== "senior" || status !== "issue") return KEY_ROW;
  const at = KEY_ROW.findIndex(([keys]) => keys[0] === "R") + 1;
  return [...KEY_ROW.slice(0, at), [["D"], P1C_COPY.dismiss.keyRow], ...KEY_ROW.slice(at)];
}

const THIS_SHEET = "This sheet";
const SEND_IN_FIELD = "Send the report, inside the note field";
/** The shortcuts sheet rows (Board R); the first uses the reviewer's undo window. A senior also gets D (§5.14 P1C). */
export const SHEET_ROWS = (n: number, role: ReviewerRole = "pharmacist"): [string, string][] => [
  ["A", `Looks correct, then an ${n}-second undo window`], ["U", "Undo during the window"], ["R", "Report an issue"],
  ...(role === "senior" ? [["D", P1C_COPY.dismiss.sheetRow] as [string, string]] : []),
  ["J K", "Next and previous record"], ["E", "Evidence: raw DGDA row and pipeline notes"], ["S", "Open the DGDA source"],
  ["?", THIS_SHEET], ["Esc", "Close the sheet, the evidence or the note"], ["SEND", SEND_IN_FIELD],
  ["Enter", "Never approves"],
];

/** §5.17.5 senior shortcuts sheet. "SEND" is the platform's Ctrl/Cmd Enter. */
export const SENIOR_SHEET_ROWS: [string, string][] = [
  ["J K", P1C_COPY.review.sheetNext], ["M", P1C_COPY.review.sheetMark], ["R", P1C_COPY.review.sheetReport], ["?", THIS_SHEET],
  ["Esc", P1C_COPY.review.sheetClose], ["SEND", SEND_IN_FIELD], ["Enter", P1C_COPY.review.sheetEnter],
];

export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** A senior's toast and saved text are a pharmacist's (§5.13): a senior's approval publishes. */
export const toastSub = (role: ReviewerRole, n: number) =>
  actsAsPharmacist(role) ? `Publishes in ${n} seconds.` : `Your check saves in ${n} seconds. It does not publish.`;

export const savedText = (role: ReviewerRole, name: string) =>
  actsAsPharmacist(role) ? `Saved. ${name} is approved by a pharmacist and published.` : `Saved. Your check on ${name} is recorded. It does not publish.`;

/** Substitutes placeholders with nodes (mono ids), keeping the text around them. */
export function fillNodes(template: string, values: Record<string, ReactNode>): ReactNode[] {
  return template.split(/(\{\w+\})/).filter((p) => p !== "").map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part);
    return createElement(Fragment, { key: i }, m && m[1] in values ? values[m[1]] : part);
  });
}

/** One history line (§5.6.5). The note itself is rendered separately, in .raw; a carried approval's line by History. */
export function historyText(e: HistoryEntry, batchId: string): string {
  const h = DESK_NEW.history, d = P1C_COPY.dismiss;
  let text: string;
  if (e.kind === "run") return fill(h.run, { id: batchId });
  if (e.kind === "extract") return e.reason === "shared_change" ? h.sharedChange : e.reason === "rerun" ? DESK.reran : DESK.extracted;
  if (e.decision === "dismiss") {
    text = e.mine ? d.historyDismissedMine : d.historyDismissed;
  } else if (e.decision === "ok") {
    if (e.role === "senior") text = e.mine ? h.approvedSeniorMine : h.approvedSenior;
    else if (e.role === "pharmacist") text = e.mine ? DESK.approvedHistoryMine : DESK.approvedHistory;
    else text = e.mine ? h.engineerCheckedMine : h.engineerChecked;
  } else {
    text = e.mine ? DESK.issueMine : e.role === "senior" ? h.issueSenior : e.role === "pharmacist" ? h.issuePharmacist : h.issueEngineer;
  }
  if (e.counts !== false) return text;
  // §5.6.5: when a decision is at or before both a dismissal and the current stamp, the re-run suffix wins (the API sends "rerun").
  return `${text} ${e.uncountedBy === "dismiss" ? d.noLongerCountsDismiss : h.noLongerCounts}`;
}

/** The approved pill's wording, for the "done" view (rendered through ReviewStatus elsewhere). */
export const APPROVED_TEXT = APPROVED;

/** §5.16 Board DS copy that Board R does not draw: the batch banner body. New §1.7 copy lives in NEW_COPY (Task 9). */
export const REVIEW_LISTS = {
  batchBannerBody: "The batch is approved when every record is approved by a pharmacist.",
} as const;

/**
 * Short labels the P1C surfaces need that other modules already print as literals (the substance page, Learn, CodeChip,
 * the desk). As NEW_COPY values they would fail P1A's retyping guard on those modules, so they are shared words here.
 */
export const SHARED_WORDS = {
  status: "Status", substance: "Substance", substances: "Substances", reload: "Reload", bdsId: "BDS id",
  ddinterEntries: "DDInter entries", sources: "Sources", names: "Names", codes: "Codes", route: "Route", strength: "Strength",
  all: "All", ddinter: "DDInter 2.0", drugbank: "DrugBank", icd11: "ICD-11", clinicalDrug: "Clinical drug", severity: "Severity",
  // QA portal (§5.18): the key list's headers and the API section's "Example", printed already by Learn and ExampleMarker.
  name: "Name", actions: "Actions", example: "Example",
} as const;
