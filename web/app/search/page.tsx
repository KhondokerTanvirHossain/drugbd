import BrowseList from "@/components/public/BrowseList";
import SearchResults from "@/components/public/SearchResults";
import styles from "@/components/public/search.module.css";
import { browseMedicines, getStats, searchMedicines } from "@/lib/api";
import { BROWSE_COPY, PUBLIC_NEW } from "@/lib/copy";
import { getPublicMode } from "@/lib/public-mode-read";
import { NAV } from "@/lib/public-copy";
import { parseLetter, parseQuery, parseSearchPage } from "@/lib/public-params";
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** "Search medicines · IntelliDrugs"; the medicine list (no query, §6.11.2) is "Medicines · IntelliDrugs". */
export async function generateMetadata({ searchParams }: Props) {
  const { q } = parseQuery((await searchParams).q);
  return { title: `${q === "" ? BROWSE_COPY.h1 : NAV.searchLabel} · IntelliDrugs` };
}

/**
 * §6.3, and §6.11.2 with no query: the A–Z medicine list. Public scope for every session (§2.2). A bad page reads as 0; past
 * index 9 reads 9 with the cap line (Review Focus 2).
 */
export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams;
  const { q, problem } = parseQuery(sp.q);
  const { page, capped } = parseSearchPage(sp.page);
  if (q === "") {
    const letter = parseLetter(sp.letter);
    const [r, mode] = await Promise.all([browseMedicines(letter, page), getPublicMode()]);
    if (!r.ok) throw new Error(`browse failed (${r.status})`);
    return <BrowseList result={r.data} letter={letter} page={page} mode={mode} />;
  }
  if (problem) {
    return (
      <section className={styles["s-page"]}>
        <h1 className={styles.h1}>{NAV.searchLabel}</h1>
        <p role="status">{problem === "short" ? PUBLIC_NEW.search.tooShort : PUBLIC_NEW.search.tooLong}</p>
      </section>
    );
  }
  const [r, mode] = await Promise.all([searchMedicines(q, page), getPublicMode()]);
  if (!r.ok) throw new Error(`search failed (${r.status})`);
  const stats = r.data.total === 0 ? await getStats().catch(() => null) : null;
  return <SearchResults result={r.data} q={q} page={page} capped={capped} inReview={stats?.inReviewProducts ?? 0} mode={mode} />;
}
