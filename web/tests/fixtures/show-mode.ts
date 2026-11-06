import * as copy from "@/lib/copy";
import { LANDING, SEARCH, STUB } from "@/lib/public-copy";

/** §6.10 "Show-mode claim guard": the approved-only claims no page may carry in show mode (outside a hidden record's stub). */
export const CLAIM_REGEX = /Nothing is public until|goes public only after|Public only after|pharmacist-approved (records|data) only|leaves public view|hidden from the public|stays hidden|Approved records only|before they go public/;

/** The left column of §6.10's tables that a show-mode page must not render (strings that are prefixes of their show variant excluded). */
export const APPROVED_ONLY_STRINGS: string[] = [
  LANDING.h1, LANDING.lede, LANDING.ledeNarrow, LANDING.audSub, LANDING.howSub, LANDING.steps[3].body, LANDING.loopText,
  LANDING.promiseApproval, LANDING.promiseApprovalNote, LANDING.partnersSub, LANDING.partnerTicks[1], LANDING.responseNoneApproved,
  "Their approval publishes them.", "pharmacist-approved data only",
  copy.PUBLIC_NEW.hero.pendingLine, SEARCH.stubLine, STUB.pending, STUB.substancePending,
  copy.PUBLIC_NEW.productPage.verificationRerun, copy.PUBLIC_NEW.productPage.noOtherBrand,
  copy.PUBLIC_NEW.otherApproved.heading, copy.PUBLIC_NEW.otherApproved.empty, copy.PUBLIC_NEW.checker.notReviewedNote,
];

/** The page's text with the entities renderToStaticMarkup writes decoded, so copy compares as written. */
export const text = (html: string) => html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

/** Every approved-only claim the rendered page still carries (empty in show mode, §11.1 show-mode claim guard). */
export function claims(html: string): string[] {
  const t = text(html);
  // A template counts when every literal segment of it (12 or more characters) is on the page.
  const out = APPROVED_ONLY_STRINGS.filter((s) => {
    const parts = s.split(/\{\w+\}/).filter((p) => p.length >= 12);
    return parts.length > 0 && parts.every((p) => t.includes(p));
  });
  const m = CLAIM_REGEX.exec(t);
  return m ? [...out, m[0]] : out;
}
