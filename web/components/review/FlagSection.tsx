import { flagReturnPath } from "@/lib/actions-core";
import { DESK_NEW, fill } from "@/lib/copy";
import { fmtDhaka } from "@/lib/format";
import type { FlagItem, FlagPage } from "@/lib/review-types";
import ResolveButton from "./desk/ResolveButton";
import styles from "@/app/review/review.module.css";

export type FlagKind = "reports" | "partner";
export type FlagPaging = { rp: number; pp: number };
export const flagsHref = (p: FlagPaging) => `/review/flags?${new URLSearchParams({ rp: String(p.rp), pp: String(p.pp) })}`;

function Target({ f }: { f: FlagItem }) {
  if (f.targetType === "check") return <>{DESK_NEW.reviewLists.interactionCheck}</>;
  if (f.targetType === "product" || f.targetType === "substance") return <a href={flagReturnPath(f.targetType, f.targetId)}>{f.targetId}</a>;
  return <span className="mono">{f.targetId}</span>;
}

/** One §5.16 section: h2, the open flags (target, message in .raw, "Reported {Dhaka}", Resolve), paging links. */
export default function FlagSection({ kind, page, paging }: { kind: FlagKind; page: FlagPage; paging: FlagPaging }) {
  const t = DESK_NEW.reviewLists;
  const key = kind === "reports" ? "rp" : "pp";
  const at = (n: number) => flagsHref({ ...paging, [key]: n });
  const heading = kind === "reports" ? t.reportsHeading : t.partnerHeading;
  return (
    <section className={styles.section} aria-label={heading}>
      <h2>{heading}</h2>
      {page.items.length === 0 ? <p>{kind === "reports" ? t.noReports : t.noRequests}</p> : (
        <ul className={styles.list}>
          {page.items.map((f) => (
            <li key={f.id} className={styles.flag}>
              <div className={styles.flagHead}>
                <span><Target f={f} /></span>
                <ResolveButton flagId={f.id} kind={kind} />
              </div>
              <p className="raw">{f.message}</p>
              <p className={styles.flagWhen}>{fill(t.reported, { date: fmtDhaka(f.createdAt) })}</p>
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
