import { Fragment } from "react";
import { fill } from "@/lib/copy";
import { formatStrength } from "@/lib/format";
import type { ClinicalItem, IngredientSummary, PublicProduct } from "@/lib/public-types";
import { PRODUCT, SYSTEM_NAMES } from "@/lib/public-copy";
import styles from "./product.module.css";

const SOURCE_ORDER = ["dgda_content", "rxnorm", "icd11", "ddinter"];
const sourceLabel = (type: string) => (type === "dgda_content" ? PRODUCT.dgdaRegister : SYSTEM_NAMES[type] ?? type);

/** §6.5 item 4: one entry per name with its sources ("Acetaminophen — ICD-11, DDInter"), DGDA register first. */
export function groupNames(names: IngredientSummary["names"]): [string, string][] {
  const groups = new Map<string, string[]>();
  for (const n of names) groups.set(n.name, [...(groups.get(n.name) ?? []), n.type]);
  const rank = (types: string[]) => Math.min(...types.map((t) => (SOURCE_ORDER.includes(t) ? SOURCE_ORDER.indexOf(t) : SOURCE_ORDER.length)));
  return [...groups.entries()]
    .map(([name, types]) => [name, [...new Set(types)].sort((a, b) => SOURCE_ORDER.indexOf(a) - SOURCE_ORDER.indexOf(b))] as [string, string[]])
    .sort((a, b) => rank(a[1]) - rank(b[1]))
    .map(([name, types]) => [name, types.map(sourceLabel).join(", ")]);
}

/** The DGDA register's name for the substance, when it differs from the preferred one. */
export function dgdaName(item: ClinicalItem): string | null {
  const n = item.summary?.names.find((x) => x.type === "dgda_content" && x.name.toLowerCase() !== item.name.toLowerCase());
  return n?.name ?? null;
}

export default function WhatsInIt({ product: p }: { product: PublicProduct }) {
  const cd = p.clinicalDrug;
  const items = cd?.ingredients ?? [];
  return (
    <section className={styles["s-psec"]} aria-labelledby="whats-in">
      <div className={styles["s-psec-h"]}><h2 id="whats-in" className={styles.h2}>{PRODUCT.whatsIn}</h2><span>{PRODUCT.whatsInSub}</span></div>
      <div className={styles["s-trace"]}>
        <div>
          <span className={styles["s-k"]}>{PRODUCT.traceBrand}</span><span className={styles["s-v"]}>{p.tradeName}</span>
          <span className={styles["s-x"]}><span className="raw">{p.genericContentRaw}</span></span><span className={styles["s-x"]}>{p.dosageForm}</span>
        </div>
        {cd && (
          <div>
            <span className={styles["s-k"]}>{PRODUCT.traceClinical}</span><span className={styles["s-v"]}>{cd.displayName}</span>
            <span className={`${styles["s-x"]} mono`}>{cd.bdcId}</span>
            <span className={styles["s-x"]}>{fill(PRODUCT.clinicalForm, { form: cd.doseForm, route: cd.route })}</span>
          </div>
        )}
        {items.length > 0 && (
          <div>
            <span className={styles["s-k"]}>{PRODUCT.traceSubstance}</span>
            {items.map((i) => {
              const strength = formatStrength(i);
              const dgda = dgdaName(i);
              return (
                <Fragment key={i.bdsId}>
                  <span className={styles["s-v"]}>{strength ? `${i.name}, ${strength}` : i.name}</span>
                  <span className={`${styles["s-x"]} mono`}>{i.bdsId}</span>
                  {dgda && <span className={styles["s-x"]}>{fill(PRODUCT.alsoListed, { name: dgda })}</span>}
                </Fragment>
              );
            })}
          </div>
        )}
      </div>
      {items.filter((i) => i.summary && i.summary.names.length > 0).map((i) => (
        <ul key={i.bdsId} className={styles["s-names"]} aria-label={items.length > 1 ? `${PRODUCT.namesLabel}: ${i.name}` : PRODUCT.namesLabel}>
          {groupNames(i.summary!.names).map(([name, sources]) => <li key={name}>{name} <span>{sources}</span></li>)}
        </ul>
      ))}
    </section>
  );
}
