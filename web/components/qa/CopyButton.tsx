"use client";
import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import { QA_COPY } from "@/lib/copy";
import { announceQa } from "./live";

/** Selects the element's text, so the visitor can copy it with the keyboard when the clipboard refuses. */
function selectText(el: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * Island (§4.2, §5.18): copies the text of a server-rendered element (read from the DOM at press time; the text is never
 * a prop) and announces "Copied.". When the clipboard is unavailable or refused, it selects the text and announces the
 * fallback. Hidden until it mounts: without JavaScript every text stays selectable and no dead button shows.
 * `context` (QA API reference, §4.2): sr-only text after the visible label (" for GET /api/qa/v1/batches"), so the
 * reference's many "Copy command" and "Copy example" buttons have distinct names. Never the target's text.
 */
export default function CopyButton({ target, label, context }: { target: string; label: string; context?: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  async function copy() {
    const el = document.getElementById(target);
    if (!el) return;
    try {
      if (typeof navigator.clipboard?.writeText !== "function") throw new Error("no clipboard");
      await navigator.clipboard.writeText(el.textContent ?? "");
      announceQa(QA_COPY.page.copied);
    } catch {
      selectText(el);
      announceQa(QA_COPY.page.copyFailed);
    }
  }
  return <Button variant="plain" size="sm" hidden={!ready} onClick={() => void copy()}>
    {label}{context ? <span className="sr-only">{context}</span> : null}
  </Button>;
}
