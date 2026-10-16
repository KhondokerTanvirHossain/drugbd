import { P1C_COPY, PAIR_NOT_REVIEWED, PAIR_REVIEWED, fill } from "@/lib/copy";
import { fmtDhakaDate } from "@/lib/format";
import type { PairReviewStateName } from "@/lib/review-types";

/**
 * §3.4, §5.17: a pair's senior-review state as one plain-text line. A senior's review of a pair is not a pharmacist's
 * approval of a record, so it is never green, never a pill, never a chip. Public shows `reviewed` and `not_reviewed`
 * only (D53); `changed` and `issue` read as not reviewed there, with no note.
 */
export default function PairReviewState({ state, at, mine, note, surface }: {
  state: PairReviewStateName; at: string | null; mine: boolean; note: string | null; surface: "reviewer" | "public";
}) {
  const p = P1C_COPY.pair;
  const date = at ? fmtDhakaDate(at) : "";
  const you = surface === "reviewer" && mine ? p.you : "";
  if (state === "reviewed" && at) return <p className="pair-review">{`${fill(PAIR_REVIEWED, { date })}${you}`}</p>;
  if (surface === "reviewer" && state === "changed" && at) return <p className="pair-review">{fill(p.changed, { date })}</p>;
  if (surface === "reviewer" && state === "issue" && at)
    return <p className="pair-review">{fill(p.issue, { date, you })}{note ? <> <span className="raw">{note}</span></> : null}</p>;
  return <p className="pair-review">{PAIR_NOT_REVIEWED}</p>;
}
