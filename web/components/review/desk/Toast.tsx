"use client";
import type { CSSProperties } from "react";
import Kbd from "@/components/ui/Kbd";
import { DESK_NEW, fill } from "@/lib/copy";
import { DESK, toastSub } from "@/lib/review-copy";
import type { Op } from "./commit-machine";
import styles from "../desk.module.css";

/**
 * §5.8.4 toast. Running: message, sub, Undo, and the countdown bar over the reviewer's window (the second allowed inline
 * custom property, §3.1). Saving: "{name} saving." with no Undo and no bar. It never takes focus.
 */
export default function Toast({ view, seconds, singleKeys, onUndo }:
    { view: { mode: "running" | "saving"; op: Op } | null; seconds: number; singleKeys: boolean; onUndo: () => void }) {
  if (!view) return null;
  const { op } = view;
  return (
    <div className={styles.toastWrap}>
      {view.mode === "running" ? (
        <div className="toast is-running" style={{ "--dur-commit": `${seconds * 1000}ms` } as CSSProperties}>
          <p className="toast-msg"><b>{op.name}</b> {DESK.toastMarked}
            <span className="toast-sub">{toastSub(op.role, seconds)}<span className={styles.reducedOnly}> {fill(DESK.reducedMotion, { n: seconds })}</span></span>
          </p>
          <button className="toast-undo" type="button" data-fk="undo" onClick={onUndo} aria-keyshortcuts={singleKeys ? "U" : undefined}>
            <span className="ico" aria-hidden="true" />{DESK.undo}{singleKeys && <> <Kbd keys="U" /></>}
          </button>
          <span className="toast-bar" aria-hidden="true"><i /></span>
        </div>
      ) : (
        <div className="toast"><p className="toast-msg"><b>{op.name}</b> {DESK_NEW.committing.toastSaving}</p></div>
      )}
    </div>
  );
}
