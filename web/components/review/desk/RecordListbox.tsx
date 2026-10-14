"use client";
import { useEffect, useRef } from "react";
import ReviewStatus from "@/components/ui/ReviewStatus";
import { fill } from "@/lib/copy";
import { DESK } from "@/lib/review-copy";
import type { RecordRegistration } from "./context";
import { useDesk } from "./context";
import { rowHint } from "./row-hint";
import styles from "../desk.module.css";

/**
 * §5.4: the server's <ul> of <a href> rows (works without JavaScript); once the desk runs it becomes a listbox of options
 * whose links leave the tab order and the accessibility tree, so no option holds a focusable element.
 */
export default function RecordListbox({ reg }: { reg: RecordRegistration }) {
  const desk = useDesk();
  const list = useRef<HTMLUListElement>(null);
  const up = desk.ready;
  const selected = reg.rows.find((r) => r.conceptId === reg.conceptId);
  useEffect(() => {
    if (selected) document.getElementById(`opt-${selected.index}`)?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);
  return (
    <ul className="rec-list" ref={list}
      {...(up ? { role: "listbox", tabIndex: 0, "aria-label": fill(DESK.listLabel, { id: reg.batchId }), "data-fk": "list",
        "aria-activedescendant": selected && !desk.complete ? `opt-${selected.index}` : undefined } : {})}>
      {reg.rows.map((row) => {
        const isOpen = row.conceptId === reg.conceptId && !desk.complete;
        const status = desk.statusFor(row.conceptId, row.displayStatus);
        const hint = rowHint(row.hint, { netErr: desk.netErrFor(row.conceptId), stale: isOpen && desk.staleFor(row.conceptId) !== null });
        return (
          <li key={row.conceptId} id={`opt-${row.index}`} className={`rec${isOpen ? " is-selected" : ""}`}
            {...(up ? { role: "option", "aria-selected": isOpen, onClick: () => { desk.navigate(row.href); list.current?.focus(); } } : {})}>
            <a href={row.href} className={styles.recLink} aria-current={!up && isOpen ? "page" : undefined}
              {...(up ? { tabIndex: -1, role: "presentation", onClick: (e: React.MouseEvent) => e.preventDefault() } : {})}>
              <span className="rec-ix">{row.index}</span>
              <span className="rec-name">{row.tradeName}</span>
              <span className="rec-status"><ReviewStatus status={status} compact /></span>
              <span className="rec-sub">{row.clinicalDisplayName ?? ""}</span>
              <span className={`rec-hint${hint.tone ? ` rec-hint--${hint.tone}` : ""}`}>{hint.text}</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
