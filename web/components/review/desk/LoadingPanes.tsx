"use client";
import { useEffect, useRef } from "react";
import { fill } from "@/lib/copy";
import { DESK } from "@/lib/review-copy";
import { useDesk } from "./context";
import desk from "../desk.module.css";
import s from "../sidebar.module.css";

/**
 * §5.12 loading: 7 skeleton rows, a detail skeleton and a disabled decision bar. "Loading batch {id}" is shown and
 * announced through the desk's live region: §10.2 allows one polite region per page, so this part has no role="status".
 *
 * Not mounted by a route. A `loading.tsx` makes Next stream the record page: the whole desk then sits in React's hidden
 * Suspense container (`<div hidden id="S:n">`) that only a script reveals, so with scripting off nothing but this skeleton
 * is visible and §5.8.6/§4.4 (the record reads without JavaScript) fails. In-island transitions announce "Loading batch
 * {id}" from ReviewDesk.navigate() instead; the bar shows the loading state. Kept for an in-island skeleton (§5.12).
 */
export default function LoadingPanes() {
  const { batchId, announce } = useDesk();
  const text = fill(DESK.loadingStatus, { id: batchId });
  const said = useRef("");
  // Once per text: `announce` is a new function on every desk render.
  useEffect(() => { if (said.current !== text) { said.current = text; announce(text); } }, [announce, text]);
  return (
    <div className={desk.panes} data-pane="list">
      <aside className={`side chrome-sidebar material ${desk.side}`} aria-label={DESK.sidebarLabel} />
      <section className={desk.list} aria-label="Records">
        <div className={desk.listH}><div className={desk.listT}><b>{batchId}</b><span>{DESK.loadingCount}</span></div></div>
        <div className={desk.listBody} aria-hidden="true">
          {Array.from({ length: 7 }, (_, i) => (
            <div className={s.skRow} key={i}><span className={`${s.sk} ${s.skW14}`} /><span className={`${s.sk} ${s.skW60}`} /><span className={s.sk} /></div>
          ))}
        </div>
      </section>
      <section className={desk.detail} aria-label="Record">
        <div className={desk.dBody}>
          <div className={desk.dScroll}>
            <p data-desk="loading">{text}</p>
            <span className={`${s.sk} ${s.skW40}`} /><span className={`${s.sk} ${s.skW80}`} /><span className={`${s.sk} ${s.skBlock}`} />
          </div>
        </div>
        <div className="decision-bar" data-state="ready">
          <div className="decision-main">
            <p className="decision-promise"><b>{fill(DESK.promiseLoading, { id: batchId })}</b> {DESK.promiseLoadingBody}</p>
            <div className="decision-actions">
              <button type="button" className="btn btn--tonal" aria-disabled="true">{DESK.reportIssue}</button>
              <button type="button" className="btn btn--primary" aria-disabled="true">{DESK.looksCorrect}</button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
