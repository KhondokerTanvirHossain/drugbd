"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import Banner from "@/components/ui/Banner";
import Button from "@/components/ui/Button";
import { DESK_NEW, fill } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import styles from "./review.module.css";

/**
 * Island (§4.2 ErrorBoundary): §5.12 "API error loading the batch". Nothing was changed; Try again re-renders.
 * §10.2: no assertive region. This boundary replaces the [batchId] layout, so the desk's live region is gone; the page owns
 * one polite region and announces the banner title through it.
 */
export default function ReviewError({ reset }: { error: Error; reset: () => void }) {
  const id = decodeURIComponent(usePathname()?.split("/")[2] ?? "");
  const t = DESK_NEW.deskLoad;
  const named = id !== "" && id !== "flags";
  const title = named ? fill(t.errorTitle, { id }) : t.errorBody;
  const live = useRef<HTMLDivElement>(null);
  useEffect(() => announce(live.current, title), [title]);
  return (
    <main id="content" className={styles.page}>
      <div ref={live} className="sr-only" aria-live="polite" aria-atomic="true" />
      <Banner tone="crit" title={title} body={named ? t.errorBody : undefined}
        action={<Button variant="tonal" size="sm" onClick={reset}>{DESK_NEW.reviewLists.tryAgain}</Button>} />
    </main>
  );
}
