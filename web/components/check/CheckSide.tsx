import { buttonClass } from "@/components/ui/Button";
import ReviewStatus from "@/components/ui/ReviewStatus";
import { PUBLIC_NEW, fill } from "@/lib/copy";
import type { SuggestRow } from "@/lib/public-types";
import { CHECK } from "@/lib/public-copy";
import { CHECK_MAX, checkHref } from "@/lib/public-params";
import type { Scenario } from "@/content/check-scenarios";
import { suggestionSub } from "@/lib/check-summary";
import CheckerCombobox from "./CheckerCombobox";
import styles from "./check.module.css";

/** One selected medicine. The NOT_REVIEWED pill is shown only for not_reviewed (§3.6); unknown (a failed read) shows no status. */
export type Selected = { conceptId: string; tradeName: string; display: string | null; status: "approved" | "not_reviewed" | "unknown" };

/**
 * The side column: one GET form holding the current ids (hidden), the field, the no-JS matches (submit buttons named ids),
 * Clear all (aria-disabled when empty, never disabled), the selected list with a remove submit per medicine, and the
 * scenarios (links). The URL is the only store (§6.7.1).
 */
export default function CheckSide({ ids, selected, matches, q, scenarios }:
    { ids: string[]; selected: Selected[]; matches: SuggestRow[] | null; q: string; scenarios: Scenario[] }) {
  const empty = selected.length === 0;
  return (
    <form method="get" action="/check" className={styles["s-chk-side"]} data-check-form="">
      <h1 className={styles.h1}>{CHECK.h1}</h1>
      {ids.map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
      <CheckerCombobox ids={ids} max={CHECK_MAX} q={q} />
      {matches && (matches.length === 0 ? <p className={styles["s-med-empty"]}>{fill(PUBLIC_NEW.checker.noMatch, { q })}</p> : (
        <ul className={styles.matches}>
          {matches.map((m) => (
            <li key={m.conceptId}><button type="submit" name="ids" value={m.conceptId}>{m.tradeName}
              <span>{m.status === "approved" ? suggestionSub(m) : <ReviewStatus status="pending" />}</span></button></li>
          ))}
        </ul>
      ))}
      <div>
        <div className={styles["s-sel-h"]}>
          <p id="sel-h">{fill(CHECK.selected, { k: selected.length })}</p>
          <button type="submit" name="clear" value="1" className={buttonClass("plain", "sm")} aria-disabled={empty ? "true" : undefined} data-clear="">{CHECK.clearAll}</button>
        </div>
        <ul className={styles["s-sel"]} aria-labelledby="sel-h">
          {empty ? <li className={styles["s-med-empty"]}>{CHECK.none}</li> : selected.map((s) => (
            <li key={s.conceptId} className={styles["s-med"]}>
              <b>{s.tradeName}</b>
              <span>{s.status === "not_reviewed" ? <ReviewStatus status="pending" /> : s.display}</span>
              <button type="submit" name="remove" value={s.conceptId} className={`${buttonClass("tonal")} btn--icon`} data-remove={s.conceptId}>
                <svg width="14" height="14" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" /></svg>
                <span className="sr-only">{fill(CHECK.remove, { brand: s.tradeName })}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {scenarios.length > 0 && (
        <div>
          <p className={styles["s-group-h"]} id="pre-h">{CHECK.scenarios}</p>
          <div className={styles["s-presets"]} role="group" aria-labelledby="pre-h">
            {scenarios.map((s) => <a key={s.label} className={buttonClass("tonal", "sm")} href={checkHref(s.ids)} data-scenario={s.label}>{s.label}</a>)}
          </div>
        </div>
      )}
    </form>
  );
}
