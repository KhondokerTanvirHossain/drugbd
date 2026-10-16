import ReviewStatus from "@/components/ui/ReviewStatus";
import { fmtDhakaOn } from "@/lib/format";
import type { PublicProduct } from "@/lib/public-types";
import { PRODUCT } from "@/lib/public-copy";
import styles from "./product.module.css";

/** §6.5 item 1: the first substance (linked), or the clinical drug for a combination product; nothing without a clinical drug. */
export function crumb(p: PublicProduct): { label: string; href: string | null } | null {
  const items = p.clinicalDrug?.ingredients ?? [];
  if (items.length === 1) return { label: items[0].name, href: `/substances/${encodeURIComponent(items[0].bdsId)}` };
  if (items.length > 1 && p.clinicalDrug) return { label: p.clinicalDrug.displayName, href: null };
  return null;
}

export default function ProductHeader({ product: p }: { product: PublicProduct }) {
  const c = crumb(p);
  return (
    <div>
      <nav aria-label={PRODUCT.crumbLabel}>
        <p className={styles["s-crumb"]}>
          <a href="/search">{PRODUCT.crumbRoot}</a><span aria-hidden="true">/</span>
          {c && <>{c.href ? <a href={c.href}>{c.label}</a> : <span>{c.label}</span>}<span aria-hidden="true">/</span></>}
          <span>{p.tradeName}</span>
        </p>
      </nav>
      <h1 className={styles.h1}>{p.tradeName}</h1>
      <p className={styles["s-prod-meta"]}><span>{p.dosageForm}</span><span>{p.company}</span><span className="mono">DAR {p.darNumber}</span></p>
      <p className={styles["s-verline"]}><ReviewStatus status="approved" />{p.verification.approvedAt && <span>{fmtDhakaOn(p.verification.approvedAt)}</span>}</p>
    </div>
  );
}
