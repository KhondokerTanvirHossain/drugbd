import { buttonClass } from "@/components/ui/Button";
import ReviewStatus from "@/components/ui/ReviewStatus";
import SourceLink from "@/components/ui/SourceLink";
import { PUBLIC_NEW, fill } from "@/lib/copy";
import { fmtDhakaDate, fmtDhakaTime } from "@/lib/format";
import type { ClinicalDrugView, PublicProduct } from "@/lib/public-types";
import { PRODUCT } from "@/lib/public-copy";
import { fillNodes } from "@/lib/review-copy";
import type { Session } from "@/lib/session";
import ReportProblem from "./ReportProblem";
import styles from "./product.module.css";

const enc = encodeURIComponent;

/** §6.5 aside: verification, other brands of the clinical drug, where the record comes from, the checker link, Report a problem. */
export default function ProductAside({ product: p, brands, session, flag, siteKey, nonce }: {
  product: PublicProduct; brands: ClinicalDrugView["products"] | null; session: Session | null; flag?: string; siteKey: string | null; nonce?: string;
}) {
  // The card says "on {DD/MM/YYYY}" (§6.5); the line under the h1 keeps the time.
  const approvedDate = p.verification.approvedAt ? fmtDhakaDate(p.verification.approvedAt) : null;
  const others = (brands ?? []).filter((b) => b.conceptId !== p.conceptId);
  const stages = p.provenance.stages;
  const ok = stages.filter((s) => s.status === "ok").length, w = stages.filter((s) => s.status === "warn").length;
  return (
    <aside className={styles["s-aside"]} aria-label={PRODUCT.asideLabel}>
      <div className={styles["s-card"]}>
        <h2>{PRODUCT.verification}</h2>
        <span className={styles.fit}><ReviewStatus status="approved" /></span>
        {approvedDate && <p>{fill(PRODUCT.verifiedText, { date: approvedDate })}</p>}
        <p>{fill(PUBLIC_NEW.productPage.verificationRerun, { brand: p.tradeName })}</p>
      </div>
      {p.clinicalDrug && (
        <div className={styles["s-card"]}>
          <h2>{fill(PRODUCT.otherBrands, { name: p.clinicalDrug.displayName })}</h2>
          {others.length > 0 ? (
            <ul className={styles.brandList}>
              {others.map((b) => <li key={b.conceptId}><a href={`/products/${enc(b.conceptId)}`}>{b.tradeName}</a> {b.company} <span className="mono">DAR {b.darNumber}</span></li>)}
            </ul>
          ) : (
            <p>{fillNodes(PUBLIC_NEW.productPage.noOtherBrand, { bdcId: <span className="mono">{p.clinicalDrug.bdcId}</span> })}</p>
          )}
        </div>
      )}
      <div className={styles["s-card"]}>
        <h2>{PRODUCT.whereFrom}</h2>
        <dl>
          <dt>{PRODUCT.dlSource}</dt>
          <dd>{p.provenance.sourceLink
            ? <SourceLink url={p.provenance.sourceLink.url} label={p.provenance.sourceLink.label} fetchedAt={p.provenance.sourceLink.fetchedAt} />
            : PRODUCT.dgdaRegister}</dd>
          <dt>{PRODUCT.dlConcept}</dt><dd className="mono">{p.conceptId}</dd>
          {p.provenance.extractedAt && <><dt>{PRODUCT.dlExtracted}</dt><dd>{fmtDhakaTime(p.provenance.extractedAt)}</dd></>}
          {p.provenance.batchId && <><dt>{PRODUCT.dlBatch}</dt><dd className="mono">{p.provenance.batchId}</dd></>}
          <dt>{PRODUCT.dlChecks}</dt><dd>{fill(PRODUCT.checksValue, { ok, w })}</dd>
        </dl>
      </div>
      <a className={buttonClass("primary")} href={`/check?${new URLSearchParams({ ids: p.conceptId })}`}>{fill(PRODUCT.checkWith, { brand: p.tradeName })}</a>
      <ReportProblem conceptId={p.conceptId} session={session} outcome={flag} siteKey={siteKey} nonce={nonce} />
    </aside>
  );
}
