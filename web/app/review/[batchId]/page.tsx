import { notFound, redirect } from "next/navigation";
import { needsFor } from "@/components/review/desk/advance";
import { recordHref } from "@/components/review/desk/hrefs";
import { parseShow } from "@/components/review/record-helpers";
import { getReviewItems } from "@/lib/api";
import { firstParam } from "@/lib/params";
import { isReviewer } from "@/lib/reviewers";
import { getSession } from "@/lib/session";
import { qaAccountView } from "@/components/review/QaAccount";

export const dynamic = "force-dynamic";

/**
 * §2.1: 307 to the first record in the current filter that needs review for the viewer's role, otherwise record 1. When
 * every current record is approved, record 1 opens with `?view=done`: the desk starts in the complete view (§5.12).
 */
export default async function BatchPage({ params, searchParams }:
    { params: Promise<{ batchId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { batchId } = await params;
  const sp = await searchParams;
  const show = parseShow(firstParam(sp.show));
  const q = firstParam(sp.q);
  // The page checks the role itself: on a client navigation only this segment renders, so no layout gate runs (§2.3).
  const session = await getSession();
  // §5.12 (QA portal, D66): a qa session gets the QA account view here too, before any read.
  if (session?.role === "qa") return qaAccountView(session);
  if (!session || !isReviewer(session)) notFound();
  const page = await getReviewItems(batchId, { show, q });
  if (!page) notFound();
  const needed = page.items.find((r) => needsFor(session.role, r.displayStatus));
  if (needed) redirect(recordHref(batchId, needed.conceptId, { show, q }));
  const all = show === "all" && !q ? page : await getReviewItems(batchId);
  const first = page.items[0] ?? all?.items[0];
  if (!first) redirect("/review");
  // Done only from a read of the whole batch: a short read must never claim the unread records are approved.
  const done = !!all && all.items.length > 0 && all.items.length === all.total && all.items.every((r) => r.displayStatus === "approved");
  redirect(done ? `${recordHref(batchId, first.conceptId)}?view=done` : recordHref(batchId, first.conceptId, { show, q }));
}
