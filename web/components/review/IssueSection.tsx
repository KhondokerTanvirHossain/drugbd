import { DESK_NEW, fill } from "@/lib/copy";
import { fmtDhaka } from "@/lib/format";
import type { IssueEntry, IssuesPage } from "@/lib/review-types";
import { recordHref } from "./desk/hrefs";
import { flagsHref, type FlagPaging } from "./FlagSection";
import styles from "@/app/review/review.module.css";

/** The desk history's own wording for who reported it (§5.6.5): by role, never an email. */
function who(i: IssueEntry): string {
  const h = DESK_NEW.history;
  return i.role === "senior" ? h.issueSenior : i.role === "pharmacist" ? h.issuePharmacist : h.issueEngineer;
}

/**
 * §5.16 (D76): records with an issue reported by a reviewer, from every batch, oldest open issue first. Each links to its
 * record in the desk under the "Issue reported" filter, where an engineer re-runs it or a pharmacist dismisses the issue;
 * there is no Resolve here. Notes are reviewer text, shown to signed-in reviewers only, in `.raw`.
 */
export default function IssueSection({ page, paging }: { page: IssuesPage; paging: FlagPaging }) {
  const t = DESK_NEW.reviewLists;
  const heading = fill(t.issuesHeading, { n: page.total });
  const at = (n: number) => flagsHref({ ...paging, ip: n });
  return (
    <section className={styles.section} aria-label={heading}>
      <h2>{heading}</h2>
      {page.items.length === 0 ? <p>{t.noIssues}</p> : (
        <ul className={styles.list}>
          {page.items.map((r) => (
            <li key={`${r.batchId}/${r.conceptId}`} className={styles.flag}>
              <div className={styles.flagHead}>
                <span>
                  <a href={recordHref(r.batchId, r.conceptId, { show: "issue" })}><b>{r.tradeName}</b></a>
                  {r.clinicalDisplayName && <> · {r.clinicalDisplayName}</>}
                </span>
                <span className="mono">{fill(t.issuesBatch, { id: r.batchId })}</span>
              </div>
              {r.issues.map((i, k) => (
                <div key={k}>
                  <p>{who(i)}</p>
                  {i.note && <p className="raw">{i.note}</p>}
                  <p className={styles.flagWhen}>{fill(t.reported, { date: fmtDhaka(i.at) })}</p>
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
      {(page.page > 0 || page.hasMore) && (
        <p className={styles.paging}>
          {page.page > 0 && <a href={at(page.page - 1)}>{t.previousPage}</a>}
          {page.hasMore && <a href={at(page.page + 1)}>{t.nextPage}</a>}
        </p>
      )}
    </section>
  );
}
