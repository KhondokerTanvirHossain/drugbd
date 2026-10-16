import CodeChip from "@/components/ui/CodeChip";
import NoDataChip from "@/components/ui/NoDataChip";
import SourceLink from "@/components/ui/SourceLink";
import { DESK_NEW, NOT_RUN, PUBLIC_NEW, fill } from "@/lib/copy";
import type { ChosenEntry, ClinicalItem, Coverage, Source } from "@/lib/public-types";
import { PRODUCT } from "@/lib/public-copy";
import { fillNodes } from "@/lib/review-copy";
import styles from "./product.module.css";

export const SYSTEMS = ["ICD11_XM", "RXCUI", "ATC", "DRUGBANK", "SNOMEDCT", "DDINTER"] as const;
type Code = { system: string; code: string; routeScope: string; method: string; confidence: number; source: Source | null };
const conf = (c: number) => c.toFixed(1);
/** Board P prints the system's name in the row header, so only RxNorm's code chip names its type ("RxCUI"). */
const Chip = ({ c }: { c: Code }) => (c.system === "RXCUI" ? <CodeChip system="RXCUI" code={c.code} /> : <span className="code">{c.code}</span>);

/**
 * The codes rows (§6.5 item 5, §6.6). chosen: the DDInter row lists only these entries (product page); null lists every
 * DDInter code with its route (substance page). The hatch is only for coverage none (§3.4).
 */
export function CodesRows({ codes, chosen, coverage, route }: { codes: Code[]; chosen: ChosenEntry[] | null; coverage: Coverage; route: string | null }) {
  return (
    <>
      {SYSTEMS.map((system) => {
        const [label, what] = PRODUCT.systems[system];
        let rows = codes.filter((c) => c.system === system);
        if (system !== "DDINTER") {
          if (rows.length === 0) return null;
          return (
            <tr key={system}>
              <th scope="row">{label}</th>
              <td><span className="codes">{rows.map((c) => <Chip key={c.code} c={c} />)}</span></td>
              <td className={styles["s-what"]}>{what}</td>
              <td className={styles["s-what"]}>{fill(PRODUCT.how, { method: rows[0].method, confidence: conf(rows[0].confidence) })}</td>
              <td>{rows.filter((c) => c.source).map((c) => <span key={c.code} className={styles.link}><SourceLink url={c.source!.url} label={c.source!.label} fetchedAt={c.source!.fetchedAt} /></span>)}</td>
            </tr>
          );
        }
        if (coverage === "none")
          return <tr key={system}><th scope="row">{label}</th><td><NoDataChip label="No data" /></td><td className={styles["s-what"]}>{what}</td><td /><td /></tr>;
        if (coverage === "not_run")
          return <tr key={system}><th scope="row">{label}</th><td>{NOT_RUN}</td><td className={styles["s-what"]}>{what}</td><td /><td /></tr>;
        if (chosen !== null) {
          const ids = new Set(chosen.map((c) => c.ddinterId));
          rows = rows.filter((c) => ids.has(c.code));
          if (rows.length === 0)
            return (
              <tr key={system}><th scope="row">{label}</th>
                <td>{route ? fill(PUBLIC_NEW.ingredient.codesNoEntry, { route }) : PUBLIC_NEW.ingredient.codesNoEntryNoRoute}</td>
                <td className={styles["s-what"]}>{what}</td><td /><td /></tr>
            );
        }
        const assumed = chosen?.some((c) => c.routeAssumed) ?? false;
        return (
          <tr key={system}>
            <th scope="row">{label}</th>
            <td><span className="codes">{rows.map((c) => <Chip key={c.code} c={c} />)}</span></td>
            <td className={styles["s-what"]}>{what}</td>
            <td className={styles["s-what"]}>
              {rows.map((c, i) => <span key={c.code}>{i > 0 && "; "}{fill(PRODUCT.how, { method: c.method, confidence: conf(c.confidence) })}, {c.routeScope}{assumed && DESK_NEW.routeAware.routeAssumedSuffix}</span>)}
            </td>
            <td>{rows.filter((c) => c.source).map((c) => <span key={c.code} className={styles.link}><SourceLink url={c.source!.url} label={c.source!.label} fetchedAt={c.source!.fetchedAt} /></span>)}</td>
          </tr>
        );
      })}
    </>
  );
}

export function CodesTable({ item, route }: { item: ClinicalItem; route: string | null }) {
  const s = item.summary!;
  const k = new Set(s.codes.filter((c) => c.system !== "DDINTER").map((c) => c.system)).size;
  return (
    <>
      <p className={styles.sub}>{fillNodes(PRODUCT.codesSub, { k, name: item.name, bdsId: <span className="mono">{item.bdsId}</span> })}</p>
      <div className={styles["s-tw"]} tabIndex={0} role="region" aria-label={fill(PRODUCT.codesRegion, { name: item.name })}>
        <table className={styles["s-table"]}>
          <caption className="sr-only">{fill(PRODUCT.codesCaption, { name: item.name })}</caption>
          <thead><tr>
            <th scope="col">{PRODUCT.colSystem}</th><th scope="col">{PRODUCT.colCode}</th><th scope="col">{PRODUCT.colWhat}</th>
            <th scope="col">{PRODUCT.colHow}</th><th scope="col">{PRODUCT.colSource}</th>
          </tr></thead>
          <tbody><CodesRows codes={s.codes} chosen={s.ddinter.chosen} coverage={s.coverage.coverage} route={route} /></tbody>
        </table>
      </div>
    </>
  );
}
