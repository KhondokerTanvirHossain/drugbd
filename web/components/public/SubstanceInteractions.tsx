import NoDataBlock from "@/components/ui/NoDataBlock";
import Severity from "@/components/ui/Severity";
import { DESK_NEW, NOT_RUN, fill } from "@/lib/copy";
import type { ClinicalItem } from "@/lib/public-types";
import { PRODUCT, plural } from "@/lib/public-copy";
import { entryBaseName } from "@/lib/ddinter-text";
import { DESK, fillNodes } from "@/lib/review-copy";
import styles from "./product.module.css";

const Mono = ({ id }: { id: string }) => <span className="mono">{id}</span>;

/** §5.6.4 statements (one per chosen entry, as the desk does), shown when the route is not systemic or the entry was assumed. */
function CheckedAgainst({ item, route }: { item: ClinicalItem; route: string | null }) {
  return (
    <>
      {item.summary!.ddinter.chosen.map((c) => {
        if (c.routeAssumed) return <p key={c.ddinterId} className={styles.sub}>{route
          ? fillNodes(DESK_NEW.routeAware.assumedStatement, { route, substance: item.name, id: <Mono id={c.ddinterId} /> })
          : fillNodes(DESK_NEW.routeAssumed.noRouteStatement, { id: <Mono id={c.ddinterId} /> })}</p>;
        if (route === "systemic") return null;
        return <p key={c.ddinterId} className={styles.sub}>{fillNodes(DESK_NEW.routeAware.checkedAgainst, { substance: item.name,
          id: <Mono id={c.ddinterId} />, ddinterName: entryBaseName(c.name, c.ddinterId, c.routeScope), route: c.routeScope })}</p>;
      })}
    </>
  );
}

/** §6.5 item 6, one block per substance. It never renders a count of 0 for missing data. */
export default function SubstanceInteractions({ item, route }: { item: ClinicalItem; route: string | null }) {
  const s = item.summary!;
  const head = <p className={styles.sub}>{fill(PRODUCT.interactionsSub, { name: item.name })}</p>;
  if (s.coverage.coverage === "none")
    return <div>{head}<NoDataBlock title={item.name} bdsId={item.bdsId} extra={<p className="nodata-text">{DESK.noDataLine}</p>} /></div>;
  if (s.coverage.coverage === "not_run") return <div>{head}<p>{NOT_RUN}</p></div>;
  if (s.ddinter.chosen.length === 0)
    return <div>{head}<p>{route ? fill(DESK_NEW.routeAware.noRouteEntry, { route }) : DESK_NEW.routeAware.noRouteEntryNoRoute}</p></div>;
  const chosen = new Set(s.ddinter.chosen.map((c) => c.ddinterId));
  const sum = { major: 0, moderate: 0, minor: 0, unknown: 0, total: 0, disease: 0, food: 0 };
  for (const e of s.ddinter.entries) {
    if (!chosen.has(e.ddinterId)) continue;
    for (const k of ["major", "moderate", "minor", "unknown", "total"] as const) sum[k] += e.counts[k];
    sum.disease += e.diseaseCount;
    sum.food += e.foodCount;
  }
  return (
    <div className={styles["s-psec"]}>
      {head}
      <h3 className={styles.h3}>{fill(PRODUCT.pairsHeading, { total: sum.total })}</h3>
      <div className={styles["s-sevrow"]}>
        {(["major", "moderate", "minor", "unknown"] as const).filter((k) => sum[k] > 0).map((k) => <Severity key={k} level={k} count={sum[k]} />)}
      </div>
      <div className={styles["s-kv"]}>
        <div><b>{sum.disease}</b>{plural(sum.disease, PRODUCT.diseaseOne, PRODUCT.diseaseMany)}</div>
        <div><b>{sum.food}</b>{plural(sum.food, PRODUCT.foodOne, PRODUCT.foodMany)}</div>
      </div>
      <CheckedAgainst item={item} route={route} />
    </div>
  );
}
