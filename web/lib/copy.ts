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
  committing: "Decision saving (`committing`): promise and toast",
  deskMisc: "Desk: narrow-screen \"Back to list\", the no-JavaScript notices, loading and loaded announcements",
  deskLoad: "Desk: batch load error, batch not found",
  history: "History: role variants, the \"No longer counts\" suffix, shared-change entries",
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
} as const;
export type NewCopyState = (typeof NEW_COPY_ROWS)[keyof typeof NEW_COPY_ROWS];

/** Strings per §1.7 state. Empty records are filled by the plan that builds that state (P1B, P2, P3). */
export const NEW_COPY: Record<NewCopyState, Record<string, string>> = {
  [NEW_COPY_ROWS.decisionUnconfirmed]: {},
  [NEW_COPY_ROWS.sessionExpired]: {},
  [NEW_COPY_ROWS.undoWhileSaving]: {},
  [NEW_COPY_ROWS.approvalRefused]: {},
  [NEW_COPY_ROWS.drawerOpen]: {},
  [NEW_COPY_ROWS.deskSettings]: {},
  [NEW_COPY_ROWS.noPhiHelp]: { help: NO_PHI_HELP },
  [NEW_COPY_ROWS.notRun]: {},
  [NEW_COPY_ROWS.productIngredientNoData]: {},
  [NEW_COPY_ROWS.removedStub]: {},
  [NEW_COPY_ROWS.checkerMax]: {},
  [NEW_COPY_ROWS.heroCard]: {},
  [NEW_COPY_ROWS.learnSnapshotDate]: {},
  [NEW_COPY_ROWS.committing]: {},
  [NEW_COPY_ROWS.deskMisc]: {},
  [NEW_COPY_ROWS.deskLoad]: {},
  [NEW_COPY_ROWS.history]: {},
  [NEW_COPY_ROWS.shortcutsMenuItem]: {},
  [NEW_COPY_ROWS.reviewLists]: {},
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
  [NEW_COPY_ROWS.routeAware]: {},
  [NEW_COPY_ROWS.productNotFound]: {},
  [NEW_COPY_ROWS.productPage]: {},
  [NEW_COPY_ROWS.checker]: {},
  [NEW_COPY_ROWS.partnerSent]: {},
  [NEW_COPY_ROWS.routeAssumed]: {},
};
/** Typed shortcut for the sign-in row. */
export const SIGN_IN_STATES = NEW_COPY[NEW_COPY_ROWS.signIn] as {
  notConfiguredTitle: string; notConfiguredBody: string; requestFailedTitle: string; requestFailedBody: string;
  rateLimited: string; noScript: string; unverifiedBody: string; staleAuthBody: string; invalidBody: string;
};
