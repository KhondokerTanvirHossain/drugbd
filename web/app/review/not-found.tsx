import { headers } from "next/headers";
import Banner from "@/components/ui/Banner";
import { buttonClass } from "@/components/ui/Button";
import { DESK_NEW, fill } from "@/lib/copy";
import { DESK } from "@/lib/review-copy";
import styles from "./review.module.css";

/** §5.12 "Batch not found": "No batch with the id {id}." with "Open the review desk". No batch data. */
export default async function ReviewNotFound() {
  const id = decodeURIComponent((await headers()).get("x-pathname")?.split("/")[2] ?? "");
  return (
    <main id="content" className={styles.page}>
      <h1>{DESK.batchesHeading}</h1>
      <Banner tone="info" title={fill(DESK_NEW.deskLoad.notFound, { id })}
        action={<a className={buttonClass("tonal", "sm")} href="/review">{DESK.openDesk}</a>} />
    </main>
  );
}
