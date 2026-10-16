import { PRODUCT } from "@/lib/public-copy";
import type { Session } from "@/lib/session";
import type { ClinicalDrugView, ProductInteractions, PublicProduct } from "@/lib/public-types";
import { CodesTable } from "./CodesTable";
import ProductHeader from "./ProductHeader";
import WhatsInIt from "./WhatsInIt";
import styles from "./product.module.css";

export type ProductViewProps = {
  product: PublicProduct; interactions: ProductInteractions | null; ix: number; brands: ClinicalDrugView["products"] | null;
  session: Session | null; flag: string | undefined; siteKey: string | null; nonce?: string;
};

/** §6.5 approved product page. Task 24 adds the header and the trace, Task 25 the interactions, Task 26 the checks and aside. */
export default function ProductView(props: ProductViewProps) {
  const { product } = props;
  const items = (product.clinicalDrug?.ingredients ?? []).filter((i) => i.summary);
  return (
    <div className={styles["s-prod"]}>
      <div className={styles["s-prod-main"]}>
        <ProductHeader product={product} />
        <WhatsInIt product={product} />
        {items.length > 0 && (
          <section className={styles["s-psec"]} aria-labelledby="codes">
            <div className={styles["s-psec-h"]}><h2 id="codes" className={styles.h2}>{PRODUCT.codes}</h2></div>
            {items.map((i) => <CodesTable key={i.bdsId} item={i} route={product.clinicalDrug?.route ?? null} />)}
          </section>
        )}
      </div>
    </div>
  );
}
