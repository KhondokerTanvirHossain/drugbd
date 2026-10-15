/*
 * Product copy. The §3.6 safety strings are rendered from these constants and never retyped (copy.test.ts pins
 * each one and greps the tree for paraphrases). New copy for the states the boards do not draw (§1.7) lives in
 * NEW_COPY, keyed by the verbatim §1.7 row; each plan adds the keys for the states it builds.
 */

// ---- §3.6 fixed safety strings ----
export const NO_DATA_SENTENCE = "No interaction data in DDInter for this substance. This does not mean it is safe to combine.";
export const NOT_REVIEWED = "Not yet reviewed by a pharmacist";
export const APPROVED = "Approved by a pharmacist";
export const BACK_IN_REVIEW = "Back in review";
export const ENGINEER_CHECKED = "Engineer checked";
export const ISSUE_REPORTED = "Issue reported";
export const SEVERITY_NOT_CLASSIFIED = "Severity not classified by DDInter";
/** The only em dash in the product (§3.5). Keep the literal character: copy.test.ts counts it. */
export const STALE_TITLE = "This record changed — reload to review the latest data";
export const FULL_TEXT = "Full text from DDInter 2.0";
export const UNKNOWN_PAIR_LINE = 'DDInter 2.0 lists this pair with action "unknown" and no text. It is not treated as low risk.';
export const UNKNOWN_PAIRS_LINE = 'DDInter 2.0 lists these pairs with action "unknown" and no text. They are not treated as low risk.';
export const NO_MANAGEMENT = "DDInter 2.0 gives no management text for this pair.";
export const NO_TEXT = "DDInter 2.0 has no interaction or management text for this pair.";
export const DECISION_SUPPORT = "IntelliDrugs is decision support. It is not a substitute for clinical judgement. Severity levels and management text come from DDInter 2.0 and are shown truncated, never rewritten.";
/** Decision bar. `lead` renders in <b>; `{n}` is the reviewer's undo window in seconds (8 by default). */
export const PROMISE_PHARMACIST = {
  lead: "You're reviewing as a pharmacist.",
  body: (n: number) => `"Looks correct" publishes this record after an ${n}-second undo window.`,
} as const;
export const PROMISE_ENGINEER = {
  lead: "You're reviewing as an engineer.",
  body: '"Looks correct" records your check. It does not publish; a pharmacist still needs to approve.',
} as const;
export const PROMISE_PAUSED = {
  lead: "Decisions are paused.",
  body: "This record changed after you opened it. Reload it to review the latest data.",
} as const;
export const NO_PHI_HELP = "Don't include patient names or other personal health details.";
export const NOT_RUN = "Not checked yet: DDInter mapping has not run";

// ---- §3.6 P1C additions (each pinned by copy.test.ts) ----
/** Decision bar for role `senior` (§5.7). Same consequence as the pharmacist's: a senior's approval publishes (D49). */
export const PROMISE_SENIOR = {
  lead: "You're reviewing as a senior pharmacist.",
  body: PROMISE_PHARMACIST.body,
} as const;
/** The label on every pair card whose text or severity comes from DDInter (§5.6.2, §6.5, §6.6, §6.7.3). */
export const FROM_DDINTER = "From DDInter 2.0";
/** `{date}` = DD/MM/YYYY of the counting pair review, Dhaka (fmtDhakaDate). Plain text, never green (§3.4). */
export const PAIR_REVIEWED = "Pair reviewed by a senior pharmacist on {date}";
/** Never hides the pair or its text (G3); the copy test allows it next to NOT_REVIEWED: it is not a paraphrase of it. */
export const PAIR_NOT_REVIEWED = "Pair not yet reviewed by a senior pharmacist";

/** P0 (spec §12.1): what anonymous and `user` sessions see on /batches and /batches/[id]. Both pages import it. */
export const BATCHES_REVIEWERS_ONLY = "Only pharmacists and engineers can see batches.";

/**
 * Legacy: the pre-IntelliDrugs checker and substance pages still print this for a pair whose interaction text is
 * missing while management text exists. P2 rewrites both pages with NO_TEXT / NO_MANAGEMENT and deletes it.
 */
export const NO_INTERACTION_TEXT = "Interaction text not available from DDInter.";

// ---- Board copy used by P1A ----
export const SIGN_IN = {
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
} as const;
/** Board P footer line. */
export const FOOTER_LINE = "A drug knowledge base for Bangladesh. Decision support, not a substitute for clinical judgement.";
/** §9.3: every 429 from the middleware. */
export const TOO_MANY_REQUESTS = "Too many requests. Please slow down.";

// ---- §1.7 new copy ----
export const NEW_COPY_ROWS = {
  decisionUnconfirmed: "Decision sent but not confirmed (timeout, lost response, 5xx)",
  sessionExpired: "Session expired during an undo window or at commit",
  undoWhileSaving: "U pressed while the decision is saving",
  approvalRefused: "Approval refused because a check failed or did not run",
  drawerOpen: "A or R pressed while the evidence drawer is open",
  deskSettings: "Desk settings: undo window length and single-key shortcuts",
  noPhiHelp: "\"Don't include patient names or other personal health details.\" help on free-text fields",
  notRun: "DDInter mapping not run (product page, desk, checker)",
  productIngredientNoData: "Product page: ingredient with no data or no entry for its route",
  removedStub: "Record removed from the DGDA batch file (public stub)",
  checkerMax: "Maximum of 20 medicines reached in the checker",
  heroCard: "Landing hero card while the hero product is not approved; its `aria-label` in both states",
  learnSnapshotDate: "Learn: snapshot-value date suffix \"as stored on {date}\"",
  learnStatsFailed: "Learn: chapter not shown because the live numbers did not load",
  committing: "Decision saving (`committing`): promise and toast",
  deskMisc: "Desk: narrow-screen \"Back to list\", the no-JavaScript notices, loading and loaded announcements",
  deskLoad: "Desk: batch load error, batch not found",
  history: "History: role variants, the \"No longer counts\" suffix, shared-change entries; the carried-approval line \"Approval carried over from batch {batchId}: nothing it covered changed.\"",
  shortcutsMenuItem: "Account menu item \"Keyboard shortcuts and settings\"",
  reviewLists: "Batch list and problem-report and partner-request lists (`/review`, `/review/flags`)",
  phase0Gate: "Phase-0 `/batches` gate for non-reviewers",
  signIn: "Sign-in: not configured, session request failed, sign-in rate limit, engineer welcome step, \"Invite sent to another Google account\" placement",
  search: "Search: validation, page cap, substance hit with no data or not run",
  routeAware: "Desk and product page: route-aware data line, chosen-entry statement, other not-checked reasons in the batch block",
  productNotFound: "Product not found",
  productPage: "Product page: \"Report a problem\" field label, \"No other approved brand\" line",
  checker: "Checker: summary segments, \"Other not checked\" count, unknown id (404), check failed (5xx), scenario announcement",
  partnerSent: "Partner request sent",
  routeAssumed: "Route assumed because the product has no route",
  // P1C (the spec's "*(P1C)* " marker removed from each key: P1C plan rule)
  seniorRole: "Senior pharmacist role: role badge, promise (`PROMISE_SENIOR`), welcome step, invite role, account-menu and sidebar links",
  seniorReview: "Senior review: substance list, substance page, pair queue, the scope filter (\"All pairs\", \"Applies to our brands\"), pair row, the non-applying pair line, the brand list cap (\"and {n} more.\", \"All brands of {substance}\"), pair actions and their outcomes, pair history, keyboard sheet, empty, loading, error and not-authorised states, announcements",
  pairLines: "Pair label and pair review state lines: `FROM_DDINTER`, `PAIR_REVIEWED`, `PAIR_NOT_REVIEWED` (public and reviewer), and the reviewer-only \"changed\" and \"issue\" lines",
  deskOtherMedicines: "Desk: \"With other medicines\" groups, cross-batch partner lines, the partner `<details>` summaries (\"All {n} medicines\", \"{s} of {n} medicines\"), \"and {k} more.\" and \"See every brand of {partner substance}\", the outside-this-batch text-missing note, the same-product text-missing note, the no-data line for other batches, \"no other batches\" lines",
  dismissIssue: "Dismiss issue: control, panel, consequence sentence, hints, 409 outcomes, the not-saved and unconfirmed failure banners (report channel), announcements, history entries and the dismissal \"No longer counts\" suffix",
  sourceLinks: "Source links: link labels, \"fetched on {date}\", the ICD-11 search link, the evidence drawer's \"Sources\" section, the product page's \"Source\" column",
  productOtherApproved: "Product page \"With other approved medicines\" (cross-batch, grouped by partner substance) and its paging",
} as const;
export type NewCopyState = (typeof NEW_COPY_ROWS)[keyof typeof NEW_COPY_ROWS];

// ---- P1C §1.7 rows. Each object is the NEW_COPY entry for its row; P1C_COPY (below) is the typed view. ----
const SENIOR_ROLE = {
  badge: "Senior pharmacist",
  seniorReview: "Senior review",
  pairQueue: "Pair queue",
  welcomeHeading: "You're a senior pharmacist reviewer for batch {id}",
  welcomeStep: "Senior review shows every interaction pair between the medicines we hold, from all batches. Mark each pair reviewed, or report a pair issue.",
  welcomeLink: "Open the pair queue",
  invite: "Role: Senior pharmacist. You review batches as a pharmacist, and the interaction pairs of every batch in Senior review. Sign in at drugdb.eliooo.org with this Google account.",
} as const;

const SENIOR_REVIEW = {
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
} as const;

const PAIR_LINES = {
  you: " (you)",
  changed: "Pair changed in DDInter after a senior pharmacist reviewed it on {date}.",
  issue: "Pair issue reported by a senior pharmacist on {date}{you}. Note:",
} as const;

const OTHER_MEDICINES = {
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
} as const;

const DISMISS = {
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
} as const;

const SOURCE_LINKS = {
  fetchedOn: " fetched on {date}",
  newTab: " (opens in a new tab)",
  sourcesNote: "Where each value came from. Links open the source's own page.",
  dgda: "DGDA register (OCL)",
  rxnav: "RxNav",
  who: "WHO ATC/DDD Index",
} as const;

/** Strings per §1.7 state. Empty records are filled by the plan that builds that state (P1B, P2, P3). */
export const NEW_COPY: Record<NewCopyState, Record<string, string>> = {
  [NEW_COPY_ROWS.decisionUnconfirmed]: {
    bannerTitle: "Couldn't confirm your decision.",
    bannerBody: "We couldn't confirm your decision was saved. Try again to find out; it will not be saved twice. Decision: Looks correct on {name}.",
    promiseLead: "Your decision may not have been saved.",
    promiseBody: "Use Try again above to find out.",
    rowHint: "Decision not confirmed",
    hint: "Your last decision on this record is not confirmed yet. Use Try again.",
    announce: "Couldn't confirm your decision. We couldn't confirm your decision was saved. Try again to find out; it will not be saved twice.",
  },
  [NEW_COPY_ROWS.sessionExpired]: {
    block: "Your sign-in expired. Your decision on {name} was not saved.",
    signInAgain: "Sign in again",
    hint: "Your sign-in expired. Sign in again to keep reviewing.",
  },
  [NEW_COPY_ROWS.undoWhileSaving]: { hint: "Too late to undo: {name} is saving. Use Report issue to withdraw it." },
  [NEW_COPY_ROWS.approvalRefused]: {
    promiseLead: "A check failed on this record.",
    promiseBody: "It returns to review after the fix and re-run.",
    hint: "A check failed on this record. It returns to review after the fix and re-run.",
    commitHint: "A check failed on this record. It returns to review after the fix and re-run. Nothing was saved.",
    removedHint: "This record was removed from the batch file. Nothing was saved.",
  },
  [NEW_COPY_ROWS.drawerOpen]: { hint: "Close the evidence first (Esc)." },
  [NEW_COPY_ROWS.deskSettings]: {
    heading: "Settings", undoLabel: "Undo window", undo8: "8 seconds", undo20: "20 seconds", undo60: "60 seconds",
    keysLabel: "Single-key shortcuts", on: "On", off: "Off", workspacePlain: "IntelliDrugs review workspace.",
  },
  [NEW_COPY_ROWS.noPhiHelp]: { help: NO_PHI_HELP },
  [NEW_COPY_ROWS.notRun]: {
    rowHint: "DDInter not run yet",
    notCheckedNotRun: "Not checked: DDInter mapping has not run for {substance} in {brand}.",
  },
  [NEW_COPY_ROWS.productIngredientNoData]: {},
  [NEW_COPY_ROWS.removedStub]: {},
  [NEW_COPY_ROWS.checkerMax]: {},
  [NEW_COPY_ROWS.heroCard]: {},
  [NEW_COPY_ROWS.learnSnapshotDate]: { asStored: "as stored on {date}" },
  [NEW_COPY_ROWS.learnStatsFailed]: {
    failTitle: "Couldn't load this chapter.",
    failBody: "The live pilot numbers did not load, so no example is shown. Nothing was changed.",
    retry: "Try again",
  },
  [NEW_COPY_ROWS.committing]: {
    lead: "Marked correct.", pharmacistBody: "Publishing now.", engineerBody: "Saving your check now.", toastSaving: "saving.",
  },
  [NEW_COPY_ROWS.deskMisc]: {
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
  },
  [NEW_COPY_ROWS.deskLoad]: {
    errorTitle: "Couldn't load batch {id}.",
    errorBody: "Nothing was changed. Check your connection and try again.",
    notFound: "No batch with the id {id}.",
  },
  [NEW_COPY_ROWS.history]: {
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
  },
  [NEW_COPY_ROWS.shortcutsMenuItem]: { item: "Keyboard shortcuts and settings" },
  [NEW_COPY_ROWS.reviewLists]: {
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
  },
  [NEW_COPY_ROWS.phase0Gate]: { notReviewer: BATCHES_REVIEWERS_ONLY },
  [NEW_COPY_ROWS.signIn]: {
    notConfiguredTitle: "Sign-in is not available right now.",
    notConfiguredBody: "Searching and checking interactions don't need an account.",
    requestFailedTitle: "Couldn't sign you in.",
    requestFailedBody: "Nothing changed. Check your connection and try again.",
    rateLimited: "Too many sign-in attempts. Wait a few minutes and try again.",
    noScript: "Sign-in needs JavaScript for Google and the bot check.",
    // The three 401 answers of POST /api/session (Task 19), shown under requestFailedTitle by the island.
    unverifiedBody: "Your Google account email is not verified.",
    staleAuthBody: "Sign-in is too old. Please sign in again.",
    invalidBody: "Sign-in could not be verified. Please try again.",
  },
  [NEW_COPY_ROWS.search]: {},
  [NEW_COPY_ROWS.routeAware]: {
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
  },
  [NEW_COPY_ROWS.productNotFound]: {},
  [NEW_COPY_ROWS.productPage]: {},
  [NEW_COPY_ROWS.checker]: {},
  [NEW_COPY_ROWS.partnerSent]: {},
  [NEW_COPY_ROWS.routeAssumed]: {
    noRouteStatement: "Route assumed: this product has no route on record, so the systemic entry {id} is used.",
  },
  [NEW_COPY_ROWS.seniorRole]: SENIOR_ROLE,
  [NEW_COPY_ROWS.seniorReview]: SENIOR_REVIEW,
  [NEW_COPY_ROWS.pairLines]: PAIR_LINES,
  [NEW_COPY_ROWS.deskOtherMedicines]: OTHER_MEDICINES,
  [NEW_COPY_ROWS.dismissIssue]: DISMISS,
  [NEW_COPY_ROWS.sourceLinks]: SOURCE_LINKS,
  [NEW_COPY_ROWS.productOtherApproved]: {},
};
/** Typed shortcut for the sign-in row. */
export const SIGN_IN_STATES = NEW_COPY[NEW_COPY_ROWS.signIn] as {
  notConfiguredTitle: string; notConfiguredBody: string; requestFailedTitle: string; requestFailedBody: string;
  rateLimited: string; noScript: string; unverifiedBody: string; staleAuthBody: string; invalidBody: string;
};

/** Board R, the closing line of the no-text pairs block when an unclassified pair is present (§5.6.2). */
export const UNCLASSIFIED_NOT_LOW_RISK = "A pair whose severity is not classified by DDInter is never treated as low risk.";

/** Substitutes `{key}` placeholders; a placeholder with no value stays as it is. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Typed views of the P1B rows, so review modules never index NEW_COPY by row text. */
export const DESK_NEW = {
  decisionUnconfirmed: NEW_COPY[NEW_COPY_ROWS.decisionUnconfirmed] as Record<
    "bannerTitle" | "bannerBody" | "promiseLead" | "promiseBody" | "rowHint" | "hint" | "announce", string>,
  sessionExpired: NEW_COPY[NEW_COPY_ROWS.sessionExpired] as Record<"block" | "signInAgain" | "hint", string>,
  undoWhileSaving: NEW_COPY[NEW_COPY_ROWS.undoWhileSaving] as Record<"hint", string>,
  approvalRefused: NEW_COPY[NEW_COPY_ROWS.approvalRefused] as Record<"promiseLead" | "promiseBody" | "hint" | "commitHint" | "removedHint", string>,
  drawerOpen: NEW_COPY[NEW_COPY_ROWS.drawerOpen] as Record<"hint", string>,
  deskSettings: NEW_COPY[NEW_COPY_ROWS.deskSettings] as Record<
    "heading" | "undoLabel" | "undo8" | "undo20" | "undo60" | "keysLabel" | "on" | "off" | "workspacePlain", string>,
  committing: NEW_COPY[NEW_COPY_ROWS.committing] as Record<"lead" | "pharmacistBody" | "engineerBody" | "toastSaving", string>,
  deskMisc: NEW_COPY[NEW_COPY_ROWS.deskMisc] as Record<"backToList" | "noScript" | "skipRecord" | "skipBar" | "staleOtherReviewer"
    | "reportFailedTitle" | "reportFailedBody" | "confirmTitle" | "confirmBody" | "confirmPharmacist" | "confirmEngineer" | "confirm"
    | "cancel" | "rawDgdaRecord", string>,
  deskLoad: NEW_COPY[NEW_COPY_ROWS.deskLoad] as Record<"errorTitle" | "errorBody" | "notFound", string>,
  history: NEW_COPY[NEW_COPY_ROWS.history] as Record<"run" | "sharedChange" | "engineerChecked" | "engineerCheckedMine"
    | "issuePharmacist" | "issueEngineer" | "noLongerCounts" | "backSharedChange" | "carriedOver" | "approvedSenior"
    | "approvedSeniorMine" | "issueSenior", string>,
  shortcutsMenuItem: NEW_COPY[NEW_COPY_ROWS.shortcutsMenuItem] as Record<"item", string>,
  reviewLists: NEW_COPY[NEW_COPY_ROWS.reviewLists] as Record<"waitingOne" | "waitingMany" | "noBatches" | "flagsLink" | "reportsHeading"
    | "partnerHeading" | "reported" | "resolve" | "resolving" | "reportResolved" | "requestResolved" | "noReports" | "noRequests"
    | "loadErrorTitle" | "loadErrorBody" | "tryAgain" | "nextPage" | "previousPage" | "noScriptResolve" | "interactionCheck", string>,
  routeAware: NEW_COPY[NEW_COPY_ROWS.routeAware] as Record<"dataFound" | "dataFoundNoRoute" | "routeAssumedSuffix" | "allEntries"
    | "noRouteEntry" | "noRouteEntryNoRoute" | "checkedAgainst" | "assumedStatement" | "mappingChecked" | "notCheckedNoRoute"
    | "notCheckedNoRouteNoRoute" | "notCheckedUnmapped" | "notCheckedSameProduct", string>,
  routeAssumed: NEW_COPY[NEW_COPY_ROWS.routeAssumed] as Record<"noRouteStatement", string>,
  notRun: NEW_COPY[NEW_COPY_ROWS.notRun] as Record<"rowHint" | "notCheckedNotRun", string>,
} as const;

/** Typed views of the P1C rows (§1.7), so modules never index NEW_COPY by row text. */
export const P1C_COPY = {
  senior: SENIOR_ROLE, review: SENIOR_REVIEW, pair: PAIR_LINES, other: OTHER_MEDICINES, dismiss: DISMISS, sources: SOURCE_LINKS,
} as const;

/** Learn (§6.8): the date suffix after a snapshot-only value, and the footer's batch line. */
export const LEARN_NEW = NEW_COPY[NEW_COPY_ROWS.learnSnapshotDate] as Record<"asStored", string>;

/** Learn (§6.8 "Stats unavailable"): the banner shown in place of a chapter when GET /v1/stats fails. */
export const LEARN_FAIL = NEW_COPY[NEW_COPY_ROWS.learnStatsFailed] as Record<"failTitle" | "failBody" | "retry", string>;

/** §1.6 item 14's parenthetical, held once: the glossary prints it alone, the gate table and keys inside `undoWindow`. */
const UNDO_WINDOW_DETAIL = "(8 seconds by default; 20 or 60 in desk settings)";

/**
 * Board L sentences that name a phrase the paraphrase guard bans elsewhere ("low risk", "no interactions"), and §1.6
 * item 14's undo-window wording, which Learn repeats in five places. Learn imports them; copy.test.ts pins them.
 */
export const LEARN_BOARD = {
  unclassifiedLegend: "DDInter lists the pair but gives no grade. It is not low risk and is never counted with Minor.",
  unclassifiedGlossary: "DDInter lists the pair without a grade. Not low risk, never merged with Minor.",
  unclassifiedMust: 'Never "low risk", never merged with Minor.',
  checkerNeverSays: 'The checker never says "no interactions found" for this list. It reports one Major pair and two pairs it could not check. Chapter 8 shows the same check as an API response.',
  undoWindowDetail: UNDO_WINDOW_DETAIL,
  undoWindow: `undo window ${UNDO_WINDOW_DETAIL}`,
  /** The FAQ's shorter form of the same window (§1.6 item 14). */
  undoWindowFaq: "(8 seconds unless you lengthened it)",
} as const;
