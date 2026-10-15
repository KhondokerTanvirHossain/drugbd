import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { learnContext } from "@/components/learn/context";
import styles from "@/components/learn/learn.module.css";
import LearnShell from "@/components/learn/LearnShell";
import Banner from "@/components/ui/Banner";
import { buttonClass } from "@/components/ui/Button";
import { CHAPTER_BODIES } from "@/content/learn";
import { chapterBySlug } from "@/content/learn/chapters";
import { getStats } from "@/lib/api";
import { LEARN_FAIL } from "@/lib/copy";
import type { SiteStats } from "@/lib/stats";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ chapter: string }> };

export async function generateMetadata({ params }: Props) {
  const entry = chapterBySlug((await params).chapter);
  return entry ? { title: `${entry.title} | Learn IntelliDrugs` } : {};
}

/**
 * One Learn chapter (§2.1, §6.8). Only the ten exact slugs render; anything else is a 404. Live numbers come from
 * GET /v1/stats with public scope. If that read fails (down, timeout, malformed body), no chapter body renders, so no
 * frozen example ever shows without its live exampleUsable check (Review Focus 1); the reader gets the Learn shell,
 * the chapter title as <h1> and §6.8's "Stats unavailable" banner with a link that reloads the chapter. The banner has
 * no role: §10.2 allows no assertive region, and it is server-rendered, so it is read with the page.
 */
export default async function LearnChapterPage({ params }: Props) {
  const entry = chapterBySlug((await params).chapter);
  if (!entry) notFound();
  const [stats, jar] = await Promise.all([
    getStats().catch((e: unknown): SiteStats | null => {
      // No PHI here: the error is "API error 502", "API error: malformed stats" or a network message.
      console.error(`learn: GET /v1/stats failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }),
    cookies(),
  ]);
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  if (!stats) {
    return (
      <LearnShell slug={entry.slug} ctx={null} theme={theme}>
        <section className={styles.ch} id={entry.slug} aria-labelledby={`h-${entry.slug}`}>
          <div className={styles.chHead}>
            <h1 id={`h-${entry.slug}`}><span className={styles.chN}>{entry.n}</span>{" "}{entry.title}</h1>
          </div>
          <Banner tone="crit" title={LEARN_FAIL.failTitle} body={LEARN_FAIL.failBody}
            action={<a className={buttonClass("tonal", "sm")} href={`/learn/${entry.slug}`}>{LEARN_FAIL.retry}</a>} />
        </section>
      </LearnShell>
    );
  }
  const ctx = learnContext(stats);
  const Body = CHAPTER_BODIES[entry.slug];
  return (
    <LearnShell slug={entry.slug} ctx={ctx} theme={theme}>
      <Body ctx={ctx} />
    </LearnShell>
  );
}
