import type { ReactNode } from "react";
import ThemeSwitch from "@/components/ThemeSwitch";
import BrandIcon from "@/components/ui/BrandIcon";
import ExampleMarker from "@/components/ui/ExampleMarker";
import Wordmark from "@/components/ui/Wordmark";
import { CHAPTERS, chapterBySlug, type ChapterSlug } from "@/content/learn/chapters";
import { PILOT_SNAPSHOT } from "@/content/learn/pilot-snapshot";
import { LEARN_NEW, fill } from "@/lib/copy";
import { PRODUCTION_HOST } from "@/lib/site";
import type { Theme } from "@/lib/theme";
import type { LearnContext } from "./context";
import { LEARN_LIVE_ATTR } from "./glossary-filter";
import LearnRail from "./LearnRail";
import learn from "./learn.module.css";
import { BatchNote } from "./parts";
import styles from "./LearnShell.module.css";

/**
 * The Learn shell (Board L, §6.8): skip link, sticky material toolbar (lockup to /learn/start, the site label, the
 * theme control), the chapter nav (links with aria-current="page" and the live nav note), one reading column ending in
 * Board L's footer, and the "On this page" rail with the LearnRail island. The root layout adds no chrome here, so the
 * shell also renders the page's one polite, sr-only live region (§10.2). With `ctx` null (§6.8 "Stats unavailable")
 * it leaves out the nav note and the rail, the two parts that need /v1/stats or a chapter body; the nav note is also
 * left out while /v1/stats does not report the pilot batch.
 */
export default function LearnShell({ slug, ctx, theme, children }: { slug: ChapterSlug; ctx: LearnContext | null; theme: Theme; children: ReactNode }) {
  const chapter = chapterBySlug(slug)!;
  return (
    <div className={styles.shell}>
      <a className={styles.skip} href="#main">Skip to content</a>
      <div className="sr-only" aria-live="polite" aria-atomic="true" {...{ [LEARN_LIVE_ATTR]: "" }} />
      <header className={`material chrome-toolbar ${styles.bar}`}>
        <a className={styles.brand} href="/learn/start" aria-label="IntelliDrugs Learn">
          <BrandIcon size={24} />
          <span aria-hidden="true"><Wordmark size={17} sub="Learn" /></span>
        </a>
        <span className={styles.site}>{PRODUCTION_HOST}</span>
        <div className={styles.theme}><ThemeSwitch value={theme} /></div>
      </header>
      <div className={styles.layout}>
        <nav className={`material chrome-sidebar ${styles.nav}`} aria-label="Chapters" data-learn-nav="">
          <p className="chrome-heading">Learn IntelliDrugs</p>
          <ol>
            {CHAPTERS.map((c) => (
              <li key={c.slug}>
                <a className={styles.nl} href={`/learn/${c.slug}`} aria-current={c.slug === slug ? "page" : undefined}>
                  <span className={styles.n}>{c.n}</span><span>{c.nav}</span>
                </a>
              </li>
            ))}
          </ol>
          {/* §6.8 "Approval-state sentences": the note states the batch's count and state, so only while /v1/stats reports it. */}
          {ctx?.batch && <div className={styles.navNote}><BatchNote ctx={ctx} /></div>}
        </nav>
        <main id="main" className={styles.main} tabIndex={-1}>
          <div className={styles.col}>
            {children}
            <footer className={learn.foot}>
              <p>Sources: the DGDA register (OCL concepts), NLM RxNav, DDInter 2.0, and batch <span className="mono">{PILOT_SNAPSHOT.batchId}</span> {fill(LEARN_NEW.asStored, { date: PILOT_SNAPSHOT.storedOn })}. Endpoint paths come from the API controllers; example response bodies are illustrative.</p>
              <p>Anything marked <ExampleMarker /> is an illustration, not a stored record, and carries no clinical meaning. IntelliDrugs is decision support and does not replace a clinician's judgement.</p>
            </footer>
          </div>
        </main>
        {ctx && (
          <aside className={styles.rail} aria-label="On this page" data-learn-rail="">
            <h2>On this page</h2>
            <p className={styles.railCh}>{chapter.title}</p>
            <ol>
              {/* No aria-current here: LearnRail's scroll-spy sets it on mount, so without JavaScript nothing is wrongly "current". */}
              {chapter.sections.map((s) => <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>)}
            </ol>
            <LearnRail />
          </aside>
        )}
      </div>
    </div>
  );
}
