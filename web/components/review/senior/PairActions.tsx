"use client";
import Banner from "@/components/ui/Banner";
import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import Kbd from "@/components/ui/Kbd";
import { DESK_NEW, NO_PHI_HELP, P1C_COPY, fill } from "@/lib/copy";
import { DESK, SHARED_WORDS } from "@/lib/review-copy";
import { pairKey } from "@/lib/senior-types";
import { noteLength } from "../desk/bar-state";
import { useSenior } from "./context";
import styles from "./senior.module.css";

/**
 * §5.17.2 items 7 and 8, and the row-level outcomes: Mark reviewed (M), Report pair issue (R) with its note panel, the warn
 * banner of a 409 and the crit banner of a failed send. Nothing until the island has hydrated (§5.17.5 "No JavaScript").
 */
export default function PairActions({ ddinterA, ddinterB }: { ddinterA: string; ddinterB: string }) {
  const s = useSenior();
  if (!s || !s.ready) return null;
  const r = P1C_COPY.review;
  const key = pairKey(ddinterA, ddinterB), id = `${ddinterA}-${ddinterB}`;
  const v = s.row(key), st = v.status, k = s.singleKeys;
  const paused = st.kind === "paused";
  const sending = st.kind === "sending" ? st.op.decision : null;
  return (
    <div className={styles.actions}>
      {st.kind === "paused" && (
        <Banner tone="warn" title={st.reason === "content" ? r.contentTitle : r.otherTitle} body={st.reason === "content" ? r.contentBody : r.otherBody}
          action={<Button variant="tonal" size="sm" data-sk={`reload-${id}`} onClick={() => s.reload(key)}>{SHARED_WORDS.reload}</Button>} />
      )}
      {st.kind === "netErr" && (
        <Banner tone="crit" title={st.saved === "no" ? r.netTitle : r.unconfirmedTitle}
          body={st.saved === "no" ? DESK_NEW.deskMisc.reportFailedBody : r.unconfirmedBody}
          action={<Button variant="tonal" size="sm" busyLabel={DESK.saving} onClick={() => s.tryAgain(key)}>{DESK.tryAgain}</Button>} />
      )}
      {s.auth === "ok" && (
        <div className={styles.buttons}>
          <Button variant="primary" size="sm" data-senior="mark" data-sk={`mark-${id}`}
            aria-disabled={v.state === "reviewed" || st.kind !== "idle"} busy={sending === "reviewed"} busyLabel={DESK.saving}
            aria-keyshortcuts={k ? "M" : undefined} onClick={() => s.mark(key)}>
            {r.markReviewed}{k && <> <Kbd keys="M" /></>}
          </Button>
          <Button variant="tonal" size="sm" data-sk={`report-${id}`} aria-expanded={v.panelOpen} aria-controls={`pair-issue-${id}`}
            aria-keyshortcuts={k ? "R" : undefined} onClick={() => s.clickReport(key)}>
            {r.reportPairIssue}{k && <> <Kbd keys="R" /></>}
          </Button>
        </div>
      )}
      {v.panelOpen && s.auth === "ok" && (
        <div className={styles.panel} id={`pair-issue-${id}`}>
          <Field id={`pair-note-${id}`} label={r.noteLabel}
            control={<textarea className="textarea" maxLength={1000} placeholder={r.notePlaceholder} value={v.note} data-senior="note"
              data-pair={key} onChange={(e) => s.setNote(key, e.target.value)} />}
            help={<>{!v.noteError && `${DESK.noteHelp} `}{NO_PHI_HELP}</>}
            error={v.noteError ? r.noteError : undefined}
            counter={fill(DESK.noteCount, { len: noteLength(v.note) })} />
          <div className={styles.panelActs}>
            {paused && <span className={styles.paused}>{DESK.reportPaused}</span>}
            <Button variant="tonal" size="sm" onClick={() => s.closeNote(key, true, true)}>{DESK.cancel} <Kbd keys="Esc" /></Button>
            <Button variant="primary" size="sm" aria-disabled={paused} busy={sending === "issue"} busyLabel={DESK.sending}
              onClick={() => s.sendNote(key)}>{DESK.sendReport} <Kbd keys={s.sendKeys} /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
