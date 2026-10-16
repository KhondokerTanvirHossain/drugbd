import { redirect } from "next/navigation";
import CheckResults, { CheckLegend, CheckSummary } from "@/components/check/CheckResults";
import CheckSide, { type Selected } from "@/components/check/CheckSide";
import styles from "@/components/check/check.module.css";
import Banner from "@/components/ui/Banner";
import { buttonClass } from "@/components/ui/Button";
import { checkPublic, getPublicProduct, isStub, suggestProducts } from "@/lib/api";
import { availableScenarios } from "@/lib/check-scenarios";
import { DESK_NEW, PUBLIC_NEW } from "@/lib/copy";
import type { CheckResult, PublicProduct, SuggestRow } from "@/lib/public-types";
import { CHECK } from "@/lib/public-copy";
import { CHECK_MAX, checkHref, parseCheckIds, parseQuery } from "@/lib/public-params";
export const dynamic = "force-dynamic";
export const metadata = { title: "Check interactions · IntelliDrugs" };

/** §6.7. Public scope for every session (§2.2); the selection lives only in the URL (§6.7.1). */
export default async function CheckPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const sel = parseCheckIds(sp);
  const query = parseQuery(sp.q);
  if (sel.changed && (sp.q === undefined || sp.remove !== undefined || sp.clear !== undefined)) redirect(checkHref(sel.ids));

  const reads = await Promise.all(sel.ids.map((id) => getPublicProduct(id).catch(() => ({ ok: false as const, status: 0 }))));
  const unknown = sel.ids.filter((_, i) => !reads[i].ok && reads[i].status === 404);
  const selected: Selected[] = [];
  sel.ids.forEach((id, i) => {
    const r = reads[i];
    if (!r.ok) { if (r.status !== 404) selected.push({ conceptId: id, tradeName: id, display: null }); return; }
    selected.push(isStub(r.data) ? { conceptId: id, tradeName: r.data.tradeName, display: null }
      : { conceptId: id, tradeName: (r.data as PublicProduct).tradeName, display: (r.data as PublicProduct).clinicalDrug?.displayName ?? null });
  });
  let ids = selected.map((s) => s.conceptId);
  let result: CheckResult | null = null, failed = false, dropped = unknown.length > 0;
  if (ids.length >= 2) {
    let r = await checkPublic(ids);
    if (!r.ok && r.status === 404 && r.unknownId) {   // gone between the two reads
      dropped = true;
      const gone = r.unknownId;   // r is reassigned below, so the closure must not read it (TS2339 under next build)
      ids = ids.filter((id) => id !== gone);
      r = ids.length >= 2 ? await checkPublic(ids) : { ok: false, status: 0, unknownId: null };
    }
    if (r.ok) result = r.data; else failed = ids.length >= 2;
  }
  const matches: SuggestRow[] | null = !query.problem && ids.length < CHECK_MAX
    ? await suggestProducts(query.q, ids).then((r) => (r.ok ? r.data : [])).catch(() => []) : null;
  const scenarios = await availableScenarios();
  const shown = selected.filter((s) => ids.includes(s.conceptId));
  return (
    <div className={styles["s-chk"]}>
      <CheckSide ids={ids} selected={shown} matches={matches} q={query.q} scenarios={scenarios} />
      <div className={styles["s-chk-main"]}>
        {dropped && <Banner tone="info" role="status" title={PUBLIC_NEW.checker.unknownId} />}
        <CheckSummary result={result} m={ids.length} failed={failed} />
        {failed && <Banner tone="crit" role="alert" title={PUBLIC_NEW.checker.failTitle} body={PUBLIC_NEW.checker.failBody}
          action={<a className={buttonClass("tonal", "sm")} href={checkHref(ids)}>{DESK_NEW.reviewLists.tryAgain}</a>} />}
        {ids.length < 2 && <p className={styles["s-chk-empty"]}>{CHECK.emptyResults}</p>}
        {result && <CheckResults result={result} />}
        <CheckLegend />
      </div>
      <p id="check-live" className="sr-only" aria-live="polite" aria-atomic="true" />
    </div>
  );
}
