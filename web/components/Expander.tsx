"use client";
import { useEffect, useState } from "react";
import { FULL_TEXT } from "@/lib/copy";
import styles from "./ui/PairCard.module.css";

const LABELS = {
  reviewer: { closed: FULL_TEXT, open: "Show less" },
  public: { closed: "Show full text", open: "Show less" },
} as const;

/** Island (§4.2): line-clamp toggle for server-rendered DDInter text. Renders nothing until hydrated. */
export default function Expander({ targetId, label }: { targetId: string; label: "reviewer" | "public" }) {
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el) return;
    el.classList.remove(styles.open);
    setReady(true);
  }, [targetId]);

  if (!ready) return null;
  const toggle = () => {
    const next = !open;
    document.getElementById(targetId)?.classList.toggle(styles.open, next);
    setOpen(next);
  };
  return (
    <button type="button" className="btn btn--plain btn--sm" aria-controls={targetId} aria-expanded={open} onClick={toggle}>
      {open ? LABELS[label].open : LABELS[label].closed}
    </button>
  );
}
