"use client";
import { Fragment, useEffect, useRef, type KeyboardEvent, type MouseEvent } from "react";
import Button from "@/components/ui/Button";
import Kbd from "@/components/ui/Kbd";
import Segmented from "@/components/ui/Segmented";
import { DESK_NEW } from "@/lib/copy";
import { UNDO_SECONDS } from "@/lib/desk-settings";
import { setDeskSettingAction } from "@/lib/desk-settings-actions";
import { DESK, SHEET_ROWS } from "@/lib/review-copy";

/** §5.14 shortcuts sheet: a modal dialog, Tab trapped, with the two desk settings (forms that the desk enhances). */
export default function ShortcutsSheet({ open, onClose, undoSeconds, singleKeys, sendKeys, onUndo, onKeys }: {
  open: boolean; onClose: () => void; undoSeconds: number; singleKeys: boolean; sendKeys: string;
  onUndo: (n: number) => void; onKeys: (on: boolean) => void;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) sheet.current?.querySelector<HTMLElement>('[data-fk="sheet-close"]')?.focus();
  }, [open]);
  if (!open) return null;
  const s = DESK_NEW.deskSettings;
  function trap(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab" || !sheet.current) return;
    const items = [...sheet.current.querySelectorAll<HTMLElement>("button, [href], [tabindex]:not([tabindex='-1'])")];
    if (items.length === 0) return;
    const first = items[0], last = items[items.length - 1];
    if (!items.includes(document.activeElement as HTMLElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  const scrim = (e: MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget) { e.preventDefault(); onClose(); } };
  return (
    <div className="sheet-scrim" onMouseDown={scrim}>
      <div className="sheet" ref={sheet} role="dialog" aria-modal="true" aria-labelledby="sheet-h" aria-describedby="sheet-note" tabIndex={-1} onKeyDown={trap}>
        <div className="sheet-h"><h2 id="sheet-h">{DESK.sheetTitle}</h2>
          <Button variant="plain" size="sm" data-fk="sheet-close" onClick={onClose}>{DESK.close} <Kbd keys="Esc" /></Button></div>
        <p className="sheet-note" id="sheet-note">{DESK.sheetNote}</p>
        <dl>
          {SHEET_ROWS(undoSeconds).map(([k, text]) => (
            <Fragment key={text}>
              <dt>{(k === "SEND" ? [sendKeys] : k.split(" ")).map((x) => <Kbd key={x} keys={x} />)}</dt>
              <dd>{text}</dd>
            </Fragment>
          ))}
        </dl>
        <h3>{s.heading}</h3>
        <form action={setDeskSettingAction}>
          <p>{s.undoLabel}</p>
          <Segmented ariaLabel={s.undoLabel} name="undo" value={String(undoSeconds)}
            options={UNDO_SECONDS.map((n) => ({ value: String(n), label: n === 8 ? s.undo8 : n === 20 ? s.undo20 : s.undo60 }))}
            onSelect={(e, v) => { e.preventDefault(); onUndo(Number(v)); }} />
        </form>
        <form action={setDeskSettingAction}>
          <p>{s.keysLabel}</p>
          <Segmented ariaLabel={s.keysLabel} name="keys" value={singleKeys ? "on" : "off"}
            options={[{ value: "on", label: s.on }, { value: "off", label: s.off }]}
            onSelect={(e, v) => { e.preventDefault(); onKeys(v === "on"); }} />
        </form>
      </div>
    </div>
  );
}
