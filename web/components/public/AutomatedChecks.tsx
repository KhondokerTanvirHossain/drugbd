import StageCheck from "@/components/ui/StageCheck";
import { SHOW_COPY, fill } from "@/lib/copy";
import type { PublicStage } from "@/lib/public-types";
import { PRODUCT, plural } from "@/lib/public-copy";
import { STAGE_NAME } from "@/lib/review-copy";
import styles from "./product.module.css";

const ORDER = ["dgda", "substances", "clinical", "ddinter"] as const;

/**
 * §6.5 item 7. Notes are the pipeline's own; the text-missing list holds public pairs only (Review Focus 1, P2a Task 3).
 * `withheld` (show mode, a `problem` record, §6.10): the API sends no stage results (§7.4.1 Privacy), and the section says
 * so instead of rendering counts or cards, whatever stages arrive.
 */
export default function AutomatedChecks({ stages, withheld = false }: { stages: PublicStage[]; withheld?: boolean }) {
  if (withheld) return (
    <section className={styles["s-psec"]} aria-labelledby="checks">
      <div className={styles["s-psec-h"]}>
        <h2 id="checks" className={styles.h2}>{PRODUCT.checks}</h2>
        <span>{SHOW_COPY.checksWithheld}</span>
      </div>
    </section>
  );
  const ordered = ORDER.flatMap((k) => stages.filter((s) => s.stage === k));
  const ok = ordered.filter((s) => s.status === "ok").length, w = ordered.filter((s) => s.status === "warn").length;
  return (
    <section className={styles["s-psec"]} aria-labelledby="checks">
      <div className={styles["s-psec-h"]}>
        <h2 id="checks" className={styles.h2}>{PRODUCT.checks}</h2>
        <span>{fill(PRODUCT.checksSub, { ok, w, warnings: plural(w, PRODUCT.warningOne, PRODUCT.warningMany) })}</span>
      </div>
      <div className={styles["s-stages"]}>
        {ordered.map((s) => (
          <StageCheck key={s.stage} name={STAGE_NAME[s.stage]} status={s.status}>
            {s.notes.map((n, i) => <p key={i} className="stage-note">{n.text}</p>)}
            {s.status === "ok" && s.notes.length === 0 && <p className="stage-note">{PRODUCT.noNote}</p>}
            {s.textMissing.length > 0 && <>
              <p className="stage-note">{fill(PRODUCT.textMissing, { n: s.textMissing.length, pairs: plural(s.textMissing.length, PRODUCT.pairOne, PRODUCT.pairMany) })}</p>
              <ul className="stage-pairs">
                {s.textMissing.map((t) => <li key={`${t.ddinterA}|${t.ddinterB}`} className="stage-pair">{t.nameA} + {t.nameB} <span className="mono">{t.ddinterA}/{t.ddinterB}</span></li>)}
              </ul>
            </>}
          </StageCheck>
        ))}
      </div>
    </section>
  );
}
