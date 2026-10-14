"use client";
import Button, { buttonClass } from "@/components/ui/Button";
import Kbd from "@/components/ui/Kbd";
import { DESK } from "@/lib/review-copy";
import { useDesk, type RecordRegistration } from "./context";
import styles from "../desk.module.css";

/** §5.5.1 tools. Without JavaScript: links (Evidence opens the <details> fallback, DGDA source a new tab). */
export default function DetailTools({ reg }: { reg: RecordRegistration }) {
  const desk = useDesk();
  const k = desk.singleKeys;
  if (!desk.ready) {
    return (
      <div className={styles.tools}>
        <div className={styles.row}>
          <a className={buttonClass("tonal", "sm")} href="#evidence">{DESK.evidence}</a>
          <a className={buttonClass("tonal", "sm")} href={reg.sourceUrl} target="_blank" rel="noopener noreferrer">{DESK.dgdaSource}</a>
        </div>
        <div className={styles.row}>
          {reg.prevHref && <a className={buttonClass("tonal", "sm")} href={reg.prevHref}>{DESK.previous}</a>}
          {reg.nextHref && <a className={buttonClass("tonal", "sm")} href={reg.nextHref}>{DESK.next}</a>}
        </div>
      </div>
    );
  }
  return (
    <div className={styles.tools}>
      <div className={styles.row}>
        <Button variant="tonal" size="sm" data-fk="ev" aria-expanded={desk.drawerOpen} aria-controls="drawer"
          aria-keyshortcuts={k ? "E" : undefined} onClick={() => desk.toggleDrawer()}>
          <span className={`ico ${styles.icoCode}`} aria-hidden="true" />{DESK.evidence}{k && <> <Kbd keys="E" /></>}
        </Button>
        <Button variant="tonal" size="sm" data-fk="src" aria-keyshortcuts={k ? "S" : undefined} onClick={desk.openSource}>
          <span className={`ico ${styles.icoExternal}`} aria-hidden="true" />{DESK.dgdaSource}{k && <> <Kbd keys="S" /></>}
        </Button>
      </div>
      <div className={styles.row}>
        <Button variant="tonal" size="sm" data-fk="prev" aria-keyshortcuts={k ? "K" : undefined} onClick={() => desk.move(-1)}>
          <span className={`ico ${styles.icoUp}`} aria-hidden="true" />{DESK.previous}{k && <> <Kbd keys="K" /></>}
        </Button>
        <Button variant="tonal" size="sm" data-fk="next" aria-keyshortcuts={k ? "J" : undefined} onClick={() => desk.move(1)}>
          <span className={`ico ${styles.icoDown}`} aria-hidden="true" />{DESK.next}{k && <> <Kbd keys="J" /></>}
        </Button>
      </div>
    </div>
  );
}
