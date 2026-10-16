import SearchResults from "@/components/public/SearchResults";
import styles from "@/components/public/search.module.css";
import { getStats, searchMedicines } from "@/lib/api";
import { PUBLIC_NEW } from "@/lib/copy";
import { NAV } from "@/lib/public-copy";
import { parseQuery, parseSearchPage } from "@/lib/public-params";
export const dynamic = "force-dynamic";
export const metadata = { title: "Search medicines · IntelliDrugs" };

/** §6.3. Public scope for every session (§2.2). A bad page reads as 0; past index 9 reads 9 with the cap line (Review Focus 2). */
export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { q, problem } = parseQuery(sp.q);
  if (problem) {
    return (
      <section className={styles["s-page"]}>
        <h1 className={styles.h1}>{NAV.searchLabel}</h1>
        <p role="status">{problem === "short" ? PUBLIC_NEW.search.tooShort : PUBLIC_NEW.search.tooLong}</p>
      </section>
    );
  }
  const { page, capped } = parseSearchPage(sp.page);
  const r = await searchMedicines(q, page);
  if (!r.ok) throw new Error(`search failed (${r.status})`);
  const stats = r.data.total === 0 ? await getStats().catch(() => null) : null;
  return <SearchResults result={r.data} q={q} page={page} capped={capped} inReview={stats?.inReviewProducts ?? 0} />;
}
