"use client";
import Button from "@/components/ui/Button";
import ReviewStatus from "@/components/ui/ReviewStatus";
import { SHOW_COPY, fill } from "@/lib/copy";
import type { PublicMode } from "@/lib/public-mode";
import { DESK } from "@/lib/review-copy";
import { useDesk } from "./context";
import styles from "../desk.module.css";

/** §5.12 batch complete: no animation; "Open record 1". In show mode the second sentence says readers see the record marked (D74). */
export default function CompleteView({ publicMode = null }: { publicMode?: PublicMode | null }) {
  const desk = useDesk();
  return (
    <div className={styles.done}>
      <ReviewStatus status="approved" />
      <h2 className={styles.doneT}>{fill(DESK.doneTitle, { id: desk.batchId, n: desk.total })}</h2>
      <p>{publicMode === "show_unreviewed" ? SHOW_COPY.deskDoneBody : DESK.doneBody}</p>
      <div><Button variant="tonal" data-fk="first" onClick={desk.openFirst}>{DESK.openRecord1}</Button></div>
    </div>
  );
}
