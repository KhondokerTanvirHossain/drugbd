import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BatchList from "@/components/review/BatchList";
import ReviewToolbar from "@/components/review/ReviewToolbar";
import { newestInReview } from "@/components/review/ReviewAccount";
import { batchHref } from "@/components/review/desk/hrefs";
import { listReviewBatches } from "@/lib/api";
import { DESK_NEW } from "@/lib/copy";
import { KEYS_COOKIE, parseKeys } from "@/lib/desk-settings";
import { DESK } from "@/lib/review-copy";
import { isReviewer } from "@/lib/reviewers";
import { getSession } from "@/lib/session";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import styles from "./review.module.css";

export const dynamic = "force-dynamic";

/** §5.16 batch list; with exactly one batch in review, the desk opens straight away (§2.1). */
export default async function ReviewHome() {
  const session = await getSession();
  if (!session || !isReviewer(session)) return null;   // app/review/layout.tsx has already answered these
  const batches = await listReviewBatches();
  const inReview = batches.filter((b) => b.status === "in_review");
  if (inReview.length === 1) redirect(batchHref(inReview[0].batchId));
  const store = await cookies();
  return (
    <div className={styles.shell}>
      <ReviewToolbar session={session} theme={parseTheme(store.get(THEME_COOKIE)?.value)} batchId={newestInReview(batches)}
        keys={parseKeys(store.get(KEYS_COOKIE)?.value)} />
      <main id="content" className={styles.page}>
        <h1>{DESK.batchesHeading}</h1>
        <BatchList batches={batches} />
        <p><a href="/review/flags">{DESK_NEW.reviewLists.flagsLink}</a></p>
      </main>
    </div>
  );
}
