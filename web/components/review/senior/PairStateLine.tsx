"use client";
import PairReviewState from "@/components/ui/PairReviewState";
import type { PairReview } from "@/lib/review-types";
import { pairKey } from "@/lib/senior-types";
import { useSenior } from "./context";

/** §5.17.2 item 5: the server's state line, replaced in place by the outcome of the senior's own decision. */
export default function PairStateLine({ ddinterA, ddinterB, review }: { ddinterA: string; ddinterB: string; review: PairReview }) {
  const s = useSenior();
  const shown = s?.row(pairKey(ddinterA, ddinterB)).review ?? review;
  return <PairReviewState state={shown.state} at={shown.at} mine={shown.mine} note={shown.note} surface="reviewer" />;
}
