import { headers } from "next/headers";
import Banner from "@/components/ui/Banner";
import { buttonClass } from "@/components/ui/Button";
import { P1C_COPY, fill } from "@/lib/copy";
import { SHARED_WORDS } from "@/lib/review-copy";
import styles from "@/app/review/review.module.css";

/** §5.17.5 unknown bdsId: "No substance with the id {id}." with "Open the substances list". No data. */
export default async function SubstanceNotFound() {
  const id = decodeURIComponent((await headers()).get("x-pathname")?.split("/")[3] ?? "");
  return (
    <main id="content" className={styles.page}>
      <h1>{SHARED_WORDS.substances}</h1>
      <Banner tone="info" title={fill(P1C_COPY.review.notFound, { id })}
        action={<a className={buttonClass("tonal", "sm")} href="/review/substances">{P1C_COPY.review.openSubstances}</a>} />
    </main>
  );
}
