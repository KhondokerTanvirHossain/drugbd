"use client";
import { useEffect, useState } from "react";
import { fill } from "@/lib/copy";
import { DESK } from "@/lib/review-copy";

/** §5.5.3 toggle for the text-missing pair list: open by default; renders nothing until hydrated (the list stays open). */
export default function StagePairs({ targetId, count, fk = "pairs" }: { targetId: string; count: number; fk?: string }) {
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(true);
  useEffect(() => setReady(true), []);
  if (!ready) return null;
  const label = count === 1 ? (open ? DESK.hidePair : DESK.showPair) : fill(open ? DESK.hidePairs : DESK.showPairs, { n: count });
  const toggle = () => {
    const next = !open;
    const list = document.getElementById(targetId);
    if (list) list.hidden = !next;
    setOpen(next);
  };
  return (
    <button type="button" className="btn btn--plain btn--sm" data-fk={fk} aria-expanded={open} aria-controls={targetId} onClick={toggle}>
      {label}
    </button>
  );
}
