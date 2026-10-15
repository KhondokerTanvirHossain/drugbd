"use client";
import Banner from "@/components/ui/Banner";
import Button from "@/components/ui/Button";
import { DESK_NEW, STALE_TITLE, fill } from "@/lib/copy";
import { DESK } from "@/lib/review-copy";
import { useDesk } from "./context";
import DiffTable from "./DiffTable";

/** §5.11 stale banner: re-run or other-reviewer body; "See what changed" only for a re-run with a snapshot; Reload record. */
export default function StaleBanner({ name, reason }: { name: string; reason: "rerun" | "other" }) {
  const desk = useDesk();
  const body = reason === "rerun" ? fill(DESK.staleBodyRerun, { name }) : fill(DESK_NEW.deskMisc.staleOtherReviewer, { name });
  return (
    <div>
      <Banner tone="warn" title={STALE_TITLE} body={body} action={<>
        {reason === "rerun" && desk.diff && (
          <Button variant="tonal" size="sm" data-fk="diff" aria-expanded={desk.diffOpen} onClick={desk.toggleDiff}>
            {desk.diffOpen ? DESK.hideChanges : DESK.seeChanges}
          </Button>
        )}
        <Button variant="primary" size="sm" data-fk="reload" onClick={desk.reloadOpen}>{DESK.reload}</Button>
      </>} />
      {reason === "rerun" && desk.diffOpen && desk.diff && <DiffTable rows={desk.diff} />}
    </div>
  );
}
