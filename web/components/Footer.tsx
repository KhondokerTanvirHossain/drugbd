import ThemeSwitch from "@/components/ThemeSwitch";
import Wordmark from "@/components/ui/Wordmark";
import { FOOTER_LINE } from "@/lib/copy";
import { FOOTER, NAV } from "@/lib/public-copy";
import type { Theme } from "@/lib/theme";
import styles from "./Footer.module.css";

/**
 * Footer (§6.1). The two "to confirm" markers are §13.1 Q1 (licence lines) and block the public launch until resolved;
 * they use Board P's .example marker class, never the Example word.
 */
export default function Footer({ theme }: { theme: Theme }) {
  return (
    <footer className={styles.footer}>
      <div>
        <Wordmark size={19} />
        <p className={styles.line}>{FOOTER_LINE}</p>
      </div>
      <div>
        <h2 className={styles.h}>{FOOTER.linksHeading}</h2>
        <ul className={styles.list}>
          <li><a href="/search">{NAV.medicines}</a></li><li><a href="/check">{NAV.checker}</a></li>
          <li><a href="/learn">{NAV.learn}</a></li><li><a href="/partners">{NAV.partners}</a></li>
          <li><a href="/privacy">{NAV.privacy}</a></li>
        </ul>
      </div>
      <div>
        <h2 className={styles.h}>{FOOTER.sourcesHeading}</h2>
        <ul className={styles.list}>
          {FOOTER.sources.map((s) => (
            <li key={s.name}><b>{s.name}</b>{s.text}{s.confirm && <> <span className="example">{s.confirm}</span></>}</li>
          ))}
        </ul>
      </div>
      <div className={styles.legal}><span>{FOOTER.host}</span><span>{FOOTER.legal}</span></div>
      <div className={styles.theme}><ThemeSwitch value={theme} /></div>
    </footer>
  );
}
