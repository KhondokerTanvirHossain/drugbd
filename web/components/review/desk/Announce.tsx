"use client";
import { useEffect, useRef } from "react";
import { announce } from "@/lib/live-region";

/**
 * Island: the page's one polite status line (§10.2). It is in the server HTML (it reads without JavaScript) and is
 * announced once on load through P1A's announce(): cleared, then written after ANNOUNCE_DELAY_MS (60 ms).
 */
export default function Announce({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => announce(ref.current, text), [text]);   // the cleanup cancels a pending write
  return <p ref={ref} role="status" className={className}>{text}</p>;
}
