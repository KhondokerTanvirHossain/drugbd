import type { Session } from "@/lib/session";
import type { ClinicalDrugView, ProductInteractions, PublicProduct } from "@/lib/public-types";
import styles from "./product.module.css";

export type ProductViewProps = {
  product: PublicProduct; interactions: ProductInteractions | null; ix: number; brands: ClinicalDrugView["products"] | null;
  session: Session | null; flag: string | undefined; siteKey: string | null; nonce?: string;
};

/** §6.5 approved product page. Task 24 adds the header and the trace, Task 25 the interactions, Task 26 the checks and aside. */
export default function ProductView({ product }: ProductViewProps) {
  return <div className={styles["s-prod"]}><div className={styles["s-prod-main"]}><h1 className={styles.h1}>{product.tradeName}</h1></div></div>;
}
