import { SHOW_COPY } from "@/lib/copy";
import type { PublicMode } from "@/lib/public-mode";
import { LANDING, type Tick } from "@/lib/public-copy";

/** A sentence and the part of it that renders bold, as a Board P tick: [before, bold, after]. */
function tick(sentence: string, bold: string): Tick {
  const i = sentence.indexOf(bold);
  return [sentence.slice(0, i), bold, sentence.slice(i + bold.length)];
}

/**
 * The landing page's and /partners' band strings for the API's mode (§6.1, §6.9, §6.10): Board P's in approved-only mode,
 * SHOW_COPY's in show mode. Everything else on the page is the same in both modes.
 */
export function landingCopy(mode: PublicMode) {
  if (mode !== "show_unreviewed") return LANDING;
  const [doctors, pharmacists, partners] = LANDING.audiences;
  return {
    ...LANDING,
    h1: SHOW_COPY.landingH1,
    lede: SHOW_COPY.landingLede,
    ledeNarrow: SHOW_COPY.landingLedeNarrow,
    audSub: SHOW_COPY.audSub,
    audiences: [doctors,
      { ...pharmacists, ticks: [pharmacists.ticks[0], pharmacists.ticks[1], tick(SHOW_COPY.pharmacistTick, SHOW_COPY.pharmacistTickBold)] },
      { ...partners, ticks: [partners.ticks[0], partners.ticks[1], tick(SHOW_COPY.partnerTick3, SHOW_COPY.partnerTick3Bold)] }],
    howSub: SHOW_COPY.howSub,
    steps: LANDING.steps.map((s, i) => (i === 3 ? { ...s, body: SHOW_COPY.stepApproval } : i === 4 ? { ...s, body: SHOW_COPY.stepPublic } : s)),
    loopText: SHOW_COPY.loopText,
    promiseApproval: SHOW_COPY.promiseApproval,
    promiseApprovalNote: SHOW_COPY.promiseApprovalNote,
    partnersSub: SHOW_COPY.partnersSub,
    partnerTicks: [LANDING.partnerTicks[0], SHOW_COPY.partnerTick2, LANDING.partnerTicks[2]],
    responseNoneApproved: SHOW_COPY.responseNoneApproved,
  } as const;
}
export type LandingCopy = ReturnType<typeof landingCopy>;
