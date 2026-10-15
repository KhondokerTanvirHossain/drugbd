"use client";
import { useState, type MouseEvent } from "react";
import { DESK_NEW } from "@/lib/copy";

/**
 * Island: "Resolve" (tonal sm, busy "Resolving", §5.16). It submits the page's one form (`#resolve-form`, which holds the
 * shared Turnstile widget) and first writes its kind into the form's hidden `kind` field so the outcome names it.
 */
export default function ResolveButton({ flagId, kind }: { flagId: number; kind: "reports" | "partner" }) {
  const [busy, setBusy] = useState(false);
  const t = DESK_NEW.reviewLists;
  function onClick(e: MouseEvent<HTMLButtonElement>) {
    if (busy) { e.preventDefault(); return; }
    const input = document.getElementById("resolve-kind");
    if (input instanceof HTMLInputElement) input.value = kind;
    setBusy(true);
  }
  return (
    <button type="submit" form="resolve-form" name="flagId" value={String(flagId)} className="btn btn--tonal btn--sm"
      aria-disabled={busy || undefined} onClick={onClick}>
      {busy ? t.resolving : t.resolve}
    </button>
  );
}
