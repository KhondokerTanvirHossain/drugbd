import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import BatchCard from "@/components/review/BatchCard";
import BatchesNav from "@/components/review/BatchesNav";
import ReviewAccount, { newestInReview } from "@/components/review/ReviewAccount";
import ReviewDesk from "@/components/review/ReviewDesk";
import { listReviewBatches } from "@/lib/api";
import { KEYS_COOKIE, UNDO_COOKIE, parseKeys, parseUndo } from "@/lib/desk-settings";
import { cspNonce } from "@/lib/nonce";
import { isReviewer } from "@/lib/reviewers";
import { getSession } from "@/lib/session";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { turnstileSiteKey } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

/**
 * The batch layout (§5.8.1, D44): toolbar, the sidebar's Batches list and batch card, and ReviewDesk with batch-level props
 * only. It receives no searchParams and no child params, so record-level data comes from the record page.
 */
export default async function BatchLayout({ children, params }: { children: ReactNode; params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const session = await getSession();
  if (!session || !isReviewer(session)) return null;   // app/review/layout.tsx has already answered these
  const batches = await listReviewBatches();
  const batch = batches.find((b) => b.batchId === batchId);
  if (!batch) notFound();
  const store = await cookies();
  const theme = parseTheme(store.get(THEME_COOKIE)?.value);
  const keys = parseKeys(store.get(KEYS_COOKIE)?.value);
  return (
    <main id="content">
      <ReviewDesk batchId={batchId} role={session.role} total={batch.itemCount}
        counts={{ approved: batch.counts.approved, issue: batch.counts.issue }}
        undoSeconds={parseUndo(store.get(UNDO_COOKIE)?.value)} singleKeys={keys === "on"} siteKey={turnstileSiteKey()} nonce={await cspNonce()}
        account={<ReviewAccount session={session} theme={theme} batchId={newestInReview(batches)} keys={keys} shortcutsItem />}
        batchesNav={<BatchesNav batches={batches} current={batchId} />} batchCard={<BatchCard batch={batch} />}>
        {children}
      </ReviewDesk>
    </main>
  );
}
