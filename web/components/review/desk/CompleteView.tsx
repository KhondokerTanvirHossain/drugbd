"use client";
import Button from "@/components/ui/Button";
import ReviewStatus from "@/components/ui/ReviewStatus";
import { fill } from "@/lib/copy";
import { DESK } from "@/lib/review-copy";
import { useDesk } from "./context";
import styles from "../desk.module.css";

/** §5.12 batch complete: no animation; "Open record 1". */
export default function CompleteView() {
  const desk = useDesk();
  return (
    <div className={styles.done}>
      <ReviewStatus status="approved" />
      <h2 className={styles.doneT}>{fill(DESK.doneTitle, { id: desk.batchId, n: desk.total })}</h2>
      <p>{DESK.doneBody}</p>
      <div><Button variant="tonal" data-fk="first" onClick={desk.openFirst}>{DESK.openRecord1}</Button></div>
    </div>
  );
}
