import CodeChip from "@/components/ui/CodeChip";
import ReviewStatus from "@/components/ui/ReviewStatus";
import Severity from "@/components/ui/Severity";
import { PUBLIC_NEW, fill } from "@/lib/copy";
import type { ClinicalItem, Counts, ProductStub, PublicProduct } from "@/lib/public-types";
import { LOOKUP } from "@/lib/public-copy";
import { formatStrength } from "@/lib/format";
import styles from "./hero.module.css";

const NARROW_CODES = ["ICD11_XM", "RXCUI", "ATC"];
const ALL_CODES = ["ICD11_XM", "RXCUI", "ATC", "DRUGBANK", "SNOMEDCT"];

/** §6.1: "{tradeName} {strengthValue}" for a single-ingredient product (Board P's "Napa 500"), "{tradeName}" otherwise. */
export function heroFieldText(p: PublicProduct): string {
  const items = p.clinicalDrug?.ingredients ?? [];
  return items.length === 1 && items[0].strengthValue !== null ? `${p.tradeName} ${items[0].strengthValue}` : p.tradeName;
}

const isApproved = (h: PublicProduct | ProductStub): h is PublicProduct => !("hidden" in h);

function Field({ text }: { text: string }) {
  return <div className={styles["s-look-field"]}><span className="ico" aria-hidden="true" /><span>{text}</span><span className={styles["s-caret"]} aria-hidden="true" /></div>;
}

/** One rail dot per step. `wide` drops the rail with a wide-only step; `lineWide` keeps its line only above 480 px. */
function Rail({ last = false, wide = false, lineWide = false }: { last?: boolean; wide?: boolean; lineWide?: boolean }) {
  return (
    <div className={wide ? `${styles["s-rail"]} wide` : styles["s-rail"]} aria-hidden="true">
      <i />{!last && <b className={lineWide ? "wide" : undefined} />}
    </div>
  );
}

function SubstanceStep({ item }: { item: ClinicalItem }) {
  const s = item.summary;
  const dgda = s?.names.find((n) => n.type === "dgda_content" && n.name.toLowerCase() !== item.name.toLowerCase())?.name;
  const codes = ALL_CODES.flatMap((system) => (s?.codes ?? []).filter((c) => c.system === system).slice(0, 1));
  return (
    <div className={styles["s-step"]}>
      <span className={styles["s-k"]}>{LOOKUP.substance}</span>
      <span className={styles["s-v"]}>{item.name}<span className="wide">{formatStrength(item) && `, ${formatStrength(item)}`}</span></span>
      <span className={styles["s-x"]}>
        <span className="mono">{item.bdsId}</span>
        {dgda && <><span className="wide">{fill(LOOKUP.alsoListed, { name: dgda })}</span><span className="narrow">{fill(LOOKUP.alsoNarrow, { name: dgda })}</span></>}
      </span>
      <div className="codes">
        {codes.map((c) => (
          <span key={c.system} className={NARROW_CODES.includes(c.system) ? undefined : "wide"}><CodeChip system={c.system} code={c.code} /></span>
        ))}
      </div>
    </div>
  );
}

/** The severity counts of the chosen DDInter entries; null when DDInter was not fully run for the substance. */
function countsOf(item: ClinicalItem): Counts | null {
  const s = item.summary;
  if (!s || s.coverage.coverage !== "full" || s.ddinter.chosen.length === 0) return null;
  const chosen = new Set(s.ddinter.chosen.map((c) => c.ddinterId));
  const sum: Counts = { major: 0, moderate: 0, minor: 0, unknown: 0, total: 0 };
  for (const e of s.ddinter.entries) if (chosen.has(e.ddinterId)) for (const k of Object.keys(sum) as (keyof Counts)[]) sum[k] += e.counts[k];
  return sum;
}

function CountsStep({ sum }: { sum: Counts }) {
  return (
    <div className={`${styles["s-step"]} wide`}>
      <span className={styles["s-k"]}>{fill(LOOKUP.interactions, { n: sum.total })}</span>
      <div className={styles["s-sevrow"]}>
        {(["major", "moderate", "minor", "unknown"] as const).filter((k) => sum[k] > 0).map((k) => <Severity key={k} level={k} count={sum[k]} />)}
      </div>
    </div>
  );
}

/** §6.1 lookup card. Not approved: trade name and NOT_REVIEWED only (§1.6 item 9). Approved: live data, no Example. */
export default function HeroCard({ hero }: { hero: PublicProduct | ProductStub }) {
  if (!isApproved(hero)) {
    return (
      <div className={styles["s-look"]} role="group" aria-label={fill(PUBLIC_NEW.hero.ariaLabel, { name: hero.tradeName })}>
        <Field text={hero.tradeName} />
        <div className={styles["s-look-body"]}>
          <h2 className={styles.heading}>{hero.tradeName}</h2>
          <p className={styles["s-x"]}>{PUBLIC_NEW.hero.pendingLine}</p>
        </div>
        <div className={styles["s-look-foot"]}><ReviewStatus status="pending" /></div>
      </div>
    );
  }
  const cd = hero.clinicalDrug;
  const items = cd?.ingredients ?? [];
  const field = heroFieldText(hero);
  return (
    <div className={styles["s-look"]} role="group" aria-label={fill(PUBLIC_NEW.hero.ariaLabel, { name: field })}>
      <Field text={field} />
      <div className={styles["s-look-body"]}>
        <div className={styles["s-chain"]}>
          <Rail />
          <div className={styles["s-step"]}>
            <span className={styles["s-k"]}><span className="wide">{LOOKUP.brand}</span><span className="narrow">{LOOKUP.brandNarrow}</span></span>
            <span className={styles["s-v"]}>{hero.tradeName}</span>
            <span className={styles["s-x"]}>{hero.dosageForm}, <span className="wide">{hero.company}, </span><span className="mono">DAR {hero.darNumber}</span></span>
            <span className={`${styles["s-x"]} wide`}>{LOOKUP.filedAs}<span className="raw">{hero.genericContentRaw}</span></span>
          </div>
          {cd && <>
            <Rail />
            <div className={styles["s-step"]}>
              <span className={styles["s-k"]}>{LOOKUP.clinical}</span>
              <span className={styles["s-v"]}>{cd.displayName}</span>
              <span className={styles["s-x"]}><span className="mono">{cd.bdcId}</span><span className="wide">{fill(LOOKUP.route, { route: cd.route })}</span></span>
            </div>
          </>}
          {items.map((item, i) => {
            const last = i === items.length - 1;
            const sum = countsOf(item);
            return (
              <div key={item.bdsId} className={styles.pair}>
                <Rail last={last && !sum} lineWide={last} />
                <SubstanceStep item={item} />
                {sum && <><Rail last={last} wide /><CountsStep sum={sum} /></>}
              </div>
            );
          })}
        </div>
      </div>
      <div className={styles["s-look-foot"]}><ReviewStatus status="approved" /></div>
    </div>
  );
}
