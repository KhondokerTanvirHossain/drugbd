import { PUBLIC_NEW, fill } from "@/lib/copy";
import { fmtDhakaDate } from "@/lib/format";
import type { PublicPairReview } from "@/lib/public-types";

/** "(pair reviewed by a senior pharmacist on {date})" or "(pair not yet reviewed by a senior pharmacist)". Plain text (D53). */
export default function PairReviewBracket({ review }: { review: PublicPairReview }) {
  return <>{review.state === "reviewed" && review.reviewedAt
    ? fill(PUBLIC_NEW.otherApproved.reviewedBracket, { date: fmtDhakaDate(review.reviewedAt) })
    : PUBLIC_NEW.otherApproved.notReviewedBracket}</>;
}
