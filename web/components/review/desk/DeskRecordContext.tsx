"use client";
import { useEffect, useMemo, type ReactNode } from "react";
import Button from "@/components/ui/Button";
import Kbd from "@/components/ui/Kbd";
import { fill } from "@/lib/copy";
import { DESK } from "@/lib/review-copy";
import CompleteView from "./CompleteView";
import { useDesk, type HeldRecord, type RecordRegistration } from "./context";
import DecisionBar from "./DecisionBar";
import { recordHref } from "./hrefs";
import ListSearch from "./ListSearch";
import RecordListbox from "./RecordListbox";
import StaleBanner from "./StaleBanner";
import styles from "../desk.module.css";

/**
 * Island (§4.2): hands the record page's data to the persistent ReviewDesk and renders the panes. While the open record is
 * stale it renders the detail and the evidence the desk holds for viewedVersion, never the refreshed ones (§5.11).
 */
export default function DeskRecordContext({ reg, filters, evidence, fallbackWidget, confirm, emptyText, pane, children }: {
  reg: RecordRegistration; filters: ReactNode; evidence: ReactNode; fallbackWidget: ReactNode; confirm: ReactNode;
  emptyText: string | null; pane: "list" | null; children: ReactNode;
}) {
  const desk = useDesk();
  const held = useMemo<HeldRecord>(() => ({ detail: children, evidence }), [children, evidence]);
  useEffect(() => { desk.register(reg, held); }, [reg, held]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = desk.subtree(reg.conceptId, reg.version, held);
  const stale = desk.staleFor(reg.conceptId);
  const count = reg.rows.length === reg.total ? fill(DESK.listCount, { n: reg.total }) : fill(DESK.listCountFiltered, { v: reg.rows.length, n: reg.total });
  return (
    <div className={styles.panes} data-pane={pane ?? "detail"}>
      <aside className={`side chrome-sidebar material ${styles.side}`} aria-label={DESK.sidebarLabel}>
        {desk.slots.batchesNav}{filters}{desk.slots.batchCard}
      </aside>
      <section className={styles.list} aria-label="Records">
        <div className={styles.listH}>
          <details className={styles.sideDisclosure}><summary>{DESK.sidebarLabel}</summary>{desk.slots.batchesNav}{filters}</details>
          <div className={styles.listT}><b>{reg.batchId}</b><span>{count}</span></div>
          <ListSearch batchId={reg.batchId} conceptId={reg.conceptId} show={reg.show} q={reg.q} />
        </div>
        <div className={styles.listBody}>
          <RecordListbox reg={reg} />
          {emptyText && (
            <div className={styles.empty}>
              <b>{emptyText}</b>
              <a className="btn btn--tonal btn--sm" href={recordHref(reg.batchId, reg.conceptId)} data-fk="show-all">
                {fill(DESK.showAll, { n: reg.total })}
              </a>
            </div>
          )}
        </div>
      </section>
      <section className={styles.detail} aria-label="Record" id="record" tabIndex={-1}>
        <div className={styles.dBody}>
          <div className={styles.dScroll} tabIndex={-1} inert={desk.drawerOpen || undefined}>
            {stale && <StaleBanner name={reg.tradeName} reason={stale} />}
            {confirm}
            {desk.complete ? <CompleteView /> : shown.detail}
            {!desk.ready && (
              <details id="evidence" className={styles.evidenceFallback}><summary>{DESK.evidence}</summary><div className="drawer-b">{shown.evidence}</div></details>
            )}
          </div>
          {desk.ready && (
            <aside className="drawer" id="drawer" aria-labelledby="drawer-h" hidden={!desk.drawerOpen}>
              <div className="drawer-h">
                <div><h2 id="drawer-h" className={styles.drawerH2}>{DESK.evidence}</h2>
                  <p>{fill(DESK.drawerSub, { name: reg.tradeName, k: reg.index, n: reg.total })}</p></div>
                <Button variant="plain" size="sm" data-fk="drawer-close" onClick={() => desk.toggleDrawer(false)}>{DESK.close} <Kbd keys="Esc" /></Button>
              </div>
              <div className="drawer-b">{shown.evidence}</div>
            </aside>
          )}
        </div>
        <DecisionBar reg={reg} fallbackWidget={fallbackWidget} />
      </section>
    </div>
  );
}
