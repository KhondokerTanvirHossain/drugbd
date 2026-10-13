import ThemeSwitch from "@/components/ThemeSwitch";
import Wordmark from "@/components/ui/Wordmark";
import { FOOTER_LINE } from "@/lib/copy";
import type { Theme } from "@/lib/theme";
import styles from "./Footer.module.css";

/** Footer with the theme control (§3.3). P2 adds the §6.1 links, licence lines and legal line. */
export default function Footer({ theme }: { theme: Theme }) {
  return (
    <footer className={styles.footer}>
      <Wordmark size={16} />
      <p className={styles.line}>{FOOTER_LINE}</p>
      <ThemeSwitch value={theme} />
    </footer>
  );
}
