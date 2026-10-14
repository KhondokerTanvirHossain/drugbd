"use client";
import { usePathname } from "next/navigation";
import Banner from "@/components/ui/Banner";
import Button from "@/components/ui/Button";
import { DESK_NEW, fill } from "@/lib/copy";
import styles from "./review.module.css";

/** Island (§4.2 ErrorBoundary): §5.12 "API error loading the batch". Nothing was changed; Try again re-renders. */
export default function ReviewError({ reset }: { error: Error; reset: () => void }) {
  const id = decodeURIComponent(usePathname()?.split("/")[2] ?? "");
  const t = DESK_NEW.deskLoad;
  return (
    <main id="content" className={styles.page}>
      <Banner tone="crit" role="alert" title={fill(t.errorTitle, { id })} body={t.errorBody}
        action={<Button variant="tonal" size="sm" onClick={reset}>{DESK_NEW.reviewLists.tryAgain}</Button>} />
    </main>
  );
}
