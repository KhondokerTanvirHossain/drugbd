"use client";
import { Fragment, useEffect, useRef, type KeyboardEvent, type MouseEvent } from "react";
import Button from "@/components/ui/Button";
import Kbd from "@/components/ui/Kbd";
import { DESK, SENIOR_SHEET_ROWS } from "@/lib/review-copy";

/** §5.17.5 shortcuts sheet: a modal dialog whose one control is Close, so Tab stays on it. */
export default function SeniorSheet({ open, onClose, sendKeys }: { open: boolean; onClose: () => void; sendKeys: string }) {
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) sheet.current?.querySelector<HTMLElement>('[data-sk="sheet-close"]')?.focus();
  }, [open]);
  if (!open) return null;
  const trap = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    sheet.current?.querySelector<HTMLElement>('[data-sk="sheet-close"]')?.focus();
  };
  const scrim = (e: MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget) { e.preventDefault(); onClose(); } };
  return (
    <div className="sheet-scrim" onMouseDown={scrim}>
      <div className="sheet" ref={sheet} role="dialog" aria-modal="true" aria-labelledby="senior-sheet-h" aria-describedby="senior-sheet-note"
        tabIndex={-1} onKeyDown={trap}>
        <div className="sheet-h"><h2 id="senior-sheet-h">{DESK.sheetTitle}</h2>
          <Button variant="plain" size="sm" data-sk="sheet-close" onClick={onClose}>{DESK.close} <Kbd keys="Esc" /></Button></div>
        <p className="sheet-note" id="senior-sheet-note">{DESK.sheetNote}</p>
        <dl>
          {SENIOR_SHEET_ROWS.map(([k, text]) => (
            <Fragment key={text}>
              <dt>{(k === "SEND" ? [sendKeys] : k.split(" ")).map((x) => <Kbd key={x} keys={x} />)}</dt>
              <dd>{text}</dd>
            </Fragment>
          ))}
        </dl>
      </div>
    </div>
  );
}
