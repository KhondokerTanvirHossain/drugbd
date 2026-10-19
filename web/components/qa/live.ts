import { announce } from "@/lib/live-region";

/** §5.18, §10.2: the id of /review/qa's one polite live region, rendered by the page; both QA islands announce through it. */
export const QA_LIVE_ID = "qa-live";
/** The "Your keys" <h2> the page renders (tabindex -1): focus returns there after "I've saved it" and a revoke (§5.18). */
export const KEYS_HEADING_ID = "keys";

let cancel: () => void = () => {};

/** Writes `text` to the page's live region (cleared, then written after 60 ms); a newer message cancels a pending one. */
export function announceQa(text: string): void {
  cancel();
  cancel = announce(document.getElementById(QA_LIVE_ID), text);
}
