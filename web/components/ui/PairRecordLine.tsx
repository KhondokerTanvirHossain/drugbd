import { PAIR_PROBLEM, PAIR_UNREVIEWED } from "@/lib/copy";
import type { PairRecord } from "@/lib/public-mode";
import "./ProblemLine.css";

/** §3.4 PairRecordLine (D74): PAIR_UNREVIEWED or PAIR_PROBLEM, plain text after the FROM_DDINTER · pair-review-state line. */
export default function PairRecordLine({ review }: { review: PairRecord }) {
  return <p className="pair-record">{review === "problem" ? PAIR_PROBLEM : PAIR_UNREVIEWED}</p>;
}
