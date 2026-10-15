"use client";
import type { ReactNode } from "react";
import Banner from "@/components/ui/Banner";
import BotCheck from "@/components/ui/BotCheck";
import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import Kbd from "@/components/ui/Kbd";
import { DESK_NEW, NO_PHI_HELP, fill } from "@/lib/copy";
import { decideFormAction } from "@/lib/desk-actions";
import { DESK, KEY_ROW } from "@/lib/review-copy";
import { approveDisabled, noteLength, promise, reportDisabled, sendDisabled } from "./bar-state";
import { barFromRegistration, useDesk, type RecordRegistration } from "./context";
import { signInHref } from "./hrefs";
import { IS_MAC_RE } from "./keys";
import styles from "../desk.module.css";

/**
 * §5.7 decision bar. Before the desk runs (no JavaScript, or the island failed to load) it is the native form of §5.8.6:
 * "Looks correct" submits to decideFormAction without commit=deferred, which only redirects to the confirm step.
 */
export default function DecisionBar({ reg, fallbackWidget }: { reg: RecordRegistration; fallbackWidget: ReactNode }) {
  const desk = useDesk();
  if (!desk.ready) return <FallbackBar reg={reg} fallbackWidget={fallbackWidget} />;
  const ctx = desk.bar.record?.conceptId === reg.conceptId ? desk.bar : barFromRegistration(reg, desk.role, desk.undoSeconds);
  const m = desk.machine, k = desk.singleKeys;
  const p = promise(ctx);
  const commitErr = m.commit.kind === "netErr" && m.commit.op.conceptId === reg.conceptId ? m.commit : null;
  const reportErr = m.report.kind === "netErr" && m.report.op.conceptId === reg.conceptId ? m.report : null;
  const botHold = m.commit.kind === "botHold" || m.report.kind === "botHold";
  const sendKeys = typeof navigator !== "undefined" && IS_MAC_RE.test(`${navigator.platform} ${navigator.userAgent}`) ? "⌘ Enter" : "Ctrl Enter";
  const here = typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "/review";
  return (
    <div className="decision-bar" id="decision-bar" tabIndex={-1} data-state={ctx.stale ? "paused" : "ready"}>
      {commitErr && (
        <Banner tone="crit"
          title={commitErr.saved === "no" ? DESK.netTitle : DESK_NEW.decisionUnconfirmed.bannerTitle}
          body={fill(commitErr.saved === "no" ? DESK.netBody : DESK_NEW.decisionUnconfirmed.bannerBody, { name: commitErr.op.name })}
          action={<Button variant="tonal" size="sm" busyLabel={DESK.saving} onClick={desk.tryAgain}>{DESK.tryAgain}</Button>} />
      )}
      {!commitErr && reportErr && (
        <Banner tone="crit" title={DESK_NEW.deskMisc.reportFailedTitle} body={DESK_NEW.deskMisc.reportFailedBody}
          action={<Button variant="tonal" size="sm" busyLabel={DESK.sending} onClick={desk.tryAgain}>{DESK.tryAgain}</Button>} />
      )}
      {desk.reportOpen && m.auth === "ok" && (
        <div className={styles.report} id="bar-report">
          <Field id="note" label={DESK.noteLabel}
            control={<textarea className="textarea" maxLength={1000} placeholder={DESK.notePlaceholder} value={desk.note} data-desk="note"
              onChange={(e) => desk.setNote(e.target.value)} />}
            help={<>{!desk.noteError && `${DESK.noteHelp} `}{NO_PHI_HELP}</>}
            error={desk.noteError ? DESK.noteError : undefined}
            counter={fill(DESK.noteCount, { len: noteLength(desk.note) })} />
          <div className={styles.reportActs}>
            {ctx.stale && <span className={styles.reportPaused}>{DESK.reportPaused}</span>}
            <Button variant="tonal" size="sm" onClick={() => desk.closeReport(true, true)}>{DESK.cancel} <Kbd keys="Esc" /></Button>
            <Button variant="primary" size="sm" aria-disabled={sendDisabled(ctx)} busy={m.report.kind === "sending"} busyLabel={DESK.sending}
              onClick={desk.sendReport}>{DESK.sendReport} <Kbd keys={sendKeys} /></Button>
          </div>
        </div>
      )}
      {m.auth === "signedOut" && (
        <div className={styles.noauth}>
          <span className={`ico ${styles.icoInfo}`} aria-hidden="true" />
          <p className={styles.noauthT}>{fill(DESK_NEW.sessionExpired.block, { name: reg.tradeName })}</p>
          <p className={styles.noauthB}><a href={signInHref(here)}>{DESK_NEW.sessionExpired.signInAgain}</a></p>
        </div>
      )}
      {m.auth === "forbidden" && (
        <div className={styles.noauth}>
          <span className={`ico ${styles.icoInfo}`} aria-hidden="true" />
          <p className={styles.noauthT}>{DESK.noAuthTitle}</p>
          <p className={styles.noauthB}>{DESK.noAuthBody}</p>
        </div>
      )}
      {m.auth === "ok" && (
        <div className="decision-main">
          <p className="decision-promise"><b>{p.lead}</b> {p.body}</p>
          <div className="decision-actions">
            <BotCheck state={desk.botState} />
            <Button variant="tonal" data-fk="report" data-desk="report" aria-disabled={reportDisabled(ctx)} aria-expanded={desk.reportOpen}
              aria-controls="bar-report" aria-keyshortcuts={k ? "R" : undefined} onClick={desk.clickReport}>
              {DESK.reportIssue}{k && <> <Kbd keys="R" /></>}
            </Button>
            <Button variant="primary" data-fk="approve" data-desk="approve" aria-disabled={approveDisabled(ctx)}
              aria-keyshortcuts={k ? "A" : undefined} onClick={desk.pressApprove}>
              {DESK.looksCorrect}{k && <> <Kbd keys="A" /></>}
            </Button>
          </div>
        </div>
      )}
      {botHold && m.auth === "ok" && (
        <div className={styles.bot}>
          <p className="field-error">{DESK.botError}</p>
          <Button variant="tonal" size="sm" busy={desk.retryBusy} busyLabel={DESK.checking} onClick={desk.retryCheck}>{DESK.retryCheck}</Button>
        </div>
      )}
      <p className="decision-hint" hidden={!desk.hint}>{desk.hint}</p>
      {k && m.auth === "ok" && (
        <div className="decision-keys" aria-hidden="true">
          {KEY_ROW.map(([keys, words]) => <span key={words}>{keys.map((x) => <Kbd key={x} keys={x} />)} {words}</span>)}
        </div>
      )}
    </div>
  );
}

/** §5.8.6 native form: hidden version fields, a server-rendered implicit Turnstile widget, and a <noscript> notice. */
function FallbackBar({ reg, fallbackWidget }: { reg: RecordRegistration; fallbackWidget: ReactNode }) {
  const desk = useDesk();
  const p = promise(barFromRegistration(reg, desk.role, desk.undoSeconds));
  return (
    <div className="decision-bar" id="decision-bar" tabIndex={-1} data-state="ready">
      <noscript>
        <p className={styles.noscript}>{DESK_NEW.deskMisc.noScript}</p>
        <style>{`.${styles.fallbackForm}{display:none}`}</style>
      </noscript>
      <form action={decideFormAction} className={`decision-main ${styles.fallbackForm}`}>
        <p className="decision-promise"><b>{p.lead}</b> {p.body}</p>
        <input type="hidden" name="batchId" value={reg.batchId} />
        <input type="hidden" name="conceptId" value={reg.conceptId} />
        <input type="hidden" name="decision" value="ok" />
        <input type="hidden" name="extractedAt" value={reg.version.extractedAt ?? ""} />
        <input type="hidden" name="expectedLastDecisionId" value={reg.version.lastDecisionId === null ? "" : String(reg.version.lastDecisionId)} />
        <input type="hidden" name="requestId" value={reg.requestId} />
        <div className="decision-actions">
          {fallbackWidget}
          <button type="submit" className="btn btn--primary">{DESK.looksCorrect}</button>
        </div>
      </form>
    </div>
  );
}
