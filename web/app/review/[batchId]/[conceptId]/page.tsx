import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Turnstile from "@/components/Turnstile";
import ShowFilters from "@/components/review/ShowFilters";
import AutomatedChecks from "@/components/review/detail/AutomatedChecks";
import BackInReviewCard from "@/components/review/detail/BackInReviewCard";
import ComparisonTable from "@/components/review/detail/ComparisonTable";
import ConfirmPanel from "@/components/review/detail/ConfirmPanel";
import EvidenceContent from "@/components/review/detail/EvidenceContent";
import History from "@/components/review/detail/History";
import Interactions from "@/components/review/detail/Interactions";
import RecordHeader from "@/components/review/detail/RecordHeader";
import DeskRecordContext from "@/components/review/desk/DeskRecordContext";
import DetailTools from "@/components/review/desk/DetailTools";
import type { RecordRegistration, RowRef } from "@/components/review/desk/context";
import { batchHref, recordHref } from "@/components/review/desk/hrefs";
import { parseShow, stagesBlocked } from "@/components/review/record-helpers";
import { getReviewDiff, getReviewItem, getReviewItems } from "@/lib/api";
import { fill } from "@/lib/copy";
import { logOpenOnRender } from "@/lib/desk-core";
import { cspNonce } from "@/lib/nonce";
import { firstParam } from "@/lib/params";
import { DESK } from "@/lib/review-copy";
import type { ItemRow } from "@/lib/review-types";
import { isReviewer } from "@/lib/reviewers";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** The workspace record page (§2.1, §5.8.1): filters, list and detail, registered with the desk through DeskRecordContext. */
export default async function RecordPage({ params, searchParams }: {
  params: Promise<{ batchId: string; conceptId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { batchId, conceptId } = await params;
  const sp = await searchParams;
  const show = parseShow(firstParam(sp.show));
  const q = [...firstParam(sp.q).trim()].slice(0, 100).join("");
  const pane = firstParam(sp.pane) === "list" ? "list" : null;
  // Before any API call: on a client navigation only this segment renders, so the layouts' gates do not run (§2.3, G3).
  const session = await getSession();
  if (!session || !isReviewer(session)) notFound();
  const filtered = show !== "all" || q !== "";
  const [visible, everything, item] = await Promise.all([
    getReviewItems(batchId, { show, q }), filtered ? getReviewItems(batchId) : Promise.resolve(null),
    getReviewItem(batchId, conceptId, session.email),
  ]);
  if (!visible) notFound();
  if (!item) redirect(batchHref(batchId));
  if (visible.items.length > 0 && !visible.items.some((r) => r.conceptId === conceptId))
    redirect(recordHref(batchId, visible.items[0].conceptId, { show, q, ...(pane ? { pane } : {}) }));

  const toRow = (keepFilter: boolean) => (r: ItemRow): RowRef => ({ ...r, href: recordHref(batchId, r.conceptId, keepFilter ? { show, q } : {}) });
  const rows = visible.items.map(toRow(true));
  const whole = everything ?? visible;
  const all = whole.items.map(toRow(false));
  const k = rows.findIndex((r) => r.conceptId === conceptId);
  const reg: RecordRegistration = {
    batchId, conceptId, tradeName: item.brand?.tradeName ?? conceptId, index: item.index, total: item.total,
    displayStatus: item.displayStatus, version: item.version, stagesBlocked: stagesBlocked(item), sourceUrl: item.sourceUrl,
    show, q, rows, all, requestId: randomUUID(), prevHref: rows[k - 1]?.href ?? null, nextHref: rows[k + 1]?.href ?? null,
    complete: firstParam(sp.view) === "done" && all.length > 0 && all.length === whole.total && all.every((r) => r.displayStatus === "approved"),
    openIssues: item.openIssues,
  };
  const emptyText = rows.length === 0 ? (q ? fill(DESK.noMatch, { q }) : DESK.empty[show]) : null;
  const diff = item.displayStatus === "back_in_review" && item.reopen?.diffAvailable
    ? (await getReviewDiff(batchId, conceptId, item.reopen.previousExtractedAt).catch(() => null))?.rows ?? null : null;
  const nonce = await cspNonce();
  const confirming = firstParam(sp.confirm) === conceptId;
  await logOpenOnRender(batchId, conceptId, await headers());
  return (
    <DeskRecordContext reg={reg} pane={pane} emptyText={emptyText}
      filters={<ShowFilters batchId={batchId} conceptId={conceptId} show={show} q={q} counts={visible.filterCounts} />}
      evidence={<EvidenceContent item={item} />}
      fallbackWidget={<Turnstile action="decision" nonce={nonce} />}
      confirm={confirming ? <ConfirmPanel item={item} role={session.role} x={firstParam(sp.x)}
        d={firstParam(sp.d)} r={firstParam(sp.r)} error={firstParam(sp.e) || null} nonce={nonce} /> : null}>
      <RecordHeader item={item} tools={<DetailTools reg={reg} />} backHref={recordHref(batchId, conceptId, { show, q, pane: "list" })} />
      {item.displayStatus === "back_in_review" && <BackInReviewCard item={item} diff={diff} />}
      <ComparisonTable item={item} />
      <AutomatedChecks item={item} />
      <Interactions item={item} />
      <History item={item} />
    </DeskRecordContext>
  );
}
