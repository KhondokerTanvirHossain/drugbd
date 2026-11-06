import UnreviewedCaution from "@/components/ui/UnreviewedCaution";
import { PRODUCT } from "@/lib/public-copy";
import { rendersUnreviewed, type PublicMode } from "@/lib/public-mode";
import type { Session } from "@/lib/session";
import type { ClinicalDrugView, ProductInteractions, PublicProduct } from "@/lib/public-types";
import AutomatedChecks from "./AutomatedChecks";
import { CodesTable } from "./CodesTable";
import OtherApproved from "./OtherApproved";
import ProductAside from "./ProductAside";
import ProductHeader, { crumb } from "./ProductHeader";
import SubstanceInteractions from "./SubstanceInteractions";
import WhatsInIt from "./WhatsInIt";
import styles from "./product.module.css";

export type ProductViewProps = {
  product: PublicProduct; interactions: ProductInteractions | null; ix: number; brands: ClinicalDrugView["products"] | null;
  session: Session | null; flag: string | undefined; siteKey: string | null; nonce?: string;
  /** D74: the API's public mode; approved-only renders exactly as before. */
  mode?: PublicMode;
};

/** §6.5 approved product page. Task 24 adds the header and the trace, Task 25 the interactions, Task 26 the checks and the aside. */
export default function ProductView(props: ProductViewProps) {
  const { product } = props;
  const mode = props.mode ?? "approved_only";
  const items = (product.clinicalDrug?.ingredients ?? []).filter((i) => i.summary);
  // §6.5 show mode: the caution when this product, a brand of "Other brands of …" or a partner brand is not approved
  const caution = rendersUnreviewed(mode, [product.review, ...(props.brands ?? []).filter((b) => b.conceptId !== product.conceptId)
    .map((b) => b.review), ...(props.interactions?.partners ?? []).map((p) => p.partnerReview),
    ...(props.interactions?.notChecked ?? []).map((n) => n.partnerReview)]);
  return (
    <>
    {caution && <UnreviewedCaution />}
    <div className={styles["s-prod"]}>
      <div className={styles["s-prod-main"]}>
        <ProductHeader product={product} mode={mode} />
        <WhatsInIt product={product} />
        {items.length > 0 && (
          <section className={styles["s-psec"]} aria-labelledby="codes">
            <div className={styles["s-psec-h"]}><h2 id="codes" className={styles.h2}>{PRODUCT.codes}</h2></div>
            {items.map((i) => <CodesTable key={i.bdsId} item={i} route={product.clinicalDrug?.route ?? null} />)}
          </section>
        )}
        {items.length > 0 && (
          <section className={styles["s-psec"]} aria-labelledby="interactions">
            <div className={styles["s-psec-h"]}><h2 id="interactions" className={styles.h2}>{PRODUCT.interactions}</h2></div>
            {items.map((i) => <SubstanceInteractions key={i.bdsId} item={i} route={product.clinicalDrug?.route ?? null} />)}
            {props.interactions && <OtherApproved data={props.interactions} ix={props.ix} conceptId={product.conceptId}
              subject={crumb(product)?.label ?? product.tradeName} brand={product.tradeName} mode={mode} review={product.review} />}
          </section>
        )}
        <AutomatedChecks stages={product.provenance.stages} withheld={mode === "show_unreviewed" && product.review === "problem"} />
      </div>
      <ProductAside product={product} brands={props.brands} session={props.session} flag={props.flag} siteKey={props.siteKey} nonce={props.nonce}
        mode={mode} />
    </div>
    </>
  );
}
