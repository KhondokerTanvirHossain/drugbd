"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import TurnstileField from "@/components/TurnstileField";
import ProgressMeter from "@/components/ui/ProgressMeter";
import Wordmark from "@/components/ui/Wordmark";
import { DESK_NEW, P1C_COPY, STALE_TITLE, fill } from "@/lib/copy";
import { decide, loadDiff, logEvidence, logRecordOpen } from "@/lib/desk-actions";
import { announce as announceTo } from "@/lib/live-region";
import { DESK_SETTINGS_EVENT, KEYS_COOKIE, UNDO_COOKIE, deskCookieString, type UndoSeconds } from "@/lib/desk-settings";
import { DESK, ROLE_LABEL_DESK, savedText } from "@/lib/review-copy";
import { sameVersion, type DiffRow, type DisplayStatus, type ReviewerRole, type Version } from "@/lib/review-types";
import { advance, type AdvanceRow } from "./desk/advance";
import { NOTE_MIN, approveHint, dismissHint, noteLength, reportHint, sendDismissHint, sendHint, type BarCtx } from "./desk/bar-state";
import {
  TOKEN_WAIT_MS, blocksUnload, initialMachine, staleReason, step, toOutcome, toastView, tokenPlan, unconfirmedOn, windowOn,
  type Effect, type Event, type MachineState, type Op,
} from "./desk/commit-machine";
import { DeskCtx, type DeskApi, type HeldRecord, type RecordRegistration, type RowRef } from "./desk/context";
import { clearDraft, dismissDraftKey, loadDraft, loadDraftAt, saveDraft, saveDraftAt } from "./desk/drafts";
import { batchHref, isDeskPath, recordHref, versionsHref } from "./desk/hrefs";
import { IS_MAC_RE, keyAction, targetKind } from "./desk/keys";
import { POLL_MS, compareRows, pollVerdict } from "./desk/poll";
import ShortcutsSheet from "./desk/ShortcutsSheet";
import Toast from "./desk/Toast";
import styles from "./desk.module.css";

export type ReviewDeskProps = {
  batchId: string; role: ReviewerRole; total: number; counts: { approved: number; issue: number };
  undoSeconds: UndoSeconds; singleKeys: boolean; siteKey: string | null; nonce?: string;
  account: ReactNode; batchesNav: ReactNode; batchCard: ReactNode; children: ReactNode;
};

const TRANSITION_MS = 300;
const TIMEOUT = Symbol("timeout");
const NO_HELD: HeldRecord = { detail: null, evidence: null };

/**
 * Island (§4.2), in app/review/[batchId]/layout.tsx: batch-level props only. It survives record navigation, so the undo
 * window always commits for its own record (§5.8.1). Long-lived listeners call through `self`, the latest render's API.
 */
export default function ReviewDesk(props: ReviewDeskProps) {
  const { batchId, role } = props;
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [undoSeconds, setUndoSeconds] = useState<number>(props.undoSeconds);
  const [singleKeys, setSingleKeys] = useState(props.singleKeys);
  const [machine, setMachine] = useState<MachineState>(() => initialMachine(props.undoSeconds));
  const m = useRef(machine);
  const [open, setOpen] = useState<RecordRegistration | null>(null);
  const openRef = useRef<RecordRegistration | null>(null);
  const viewed = useRef(new Map<string, { version: Version; held: HeldRecord }>());
  const latest = useRef(new Map<string, { version: Version; held: HeldRecord }>());
  const [stale, setStale] = useState<Record<string, "rerun" | "other">>({});
  const staleRef = useRef(stale);
  const [overrides, setOverrides] = useState<Record<string, DisplayStatus>>({});
  const overridesRef = useRef(overrides);
  const savedAt = useRef(new Map<string, Version>());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerReturn = useRef<Element | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetReturn = useRef<Element | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const reportRef = useRef(false);
  const [note, setNoteText] = useState("");
  const [noteError, setNoteError] = useState(false);
  const [dismissOpen, setDismissOpen] = useState(false);
  const dismissRef = useRef(false);
  const [dismissNote, setDismissNoteText] = useState("");
  const [dismissError, setDismissError] = useState(false);
  const [hint, setHintText] = useState<string | null>(null);
  const hintTimer = useRef<number | undefined>(undefined);
  /** The page's one polite live region (§10.2). P1A's announce() clears it and writes after ANNOUNCE_DELAY_MS (60 ms). */
  const liveRef = useRef<HTMLDivElement>(null);
  const cancelLive = useRef<() => void>(() => {});
  const [complete, setComplete] = useState(false);
  const completeRef = useRef(false);
  const [guard, setGuard] = useState<{ conceptId: string; at: number } | null>(null);
  /** The record auto-advance is opening; its 1000 ms guard starts when that record registers (§5.9 "after arriving"). */
  const pendingGuard = useRef<string | null>(null);
  const [diff, setDiff] = useState<DiffRow[] | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const token = useRef<{ value: string; at: number } | null>(null);
  /** Sends waiting in freshToken for a token, oldest first. Each takes one single-use token (§5.8.5). */
  const waiters = useRef<{ resolve: (t: string | null) => void; timer: number }[]>([]);
  const retrying = useRef(false);
  const [retryBusy, setRetryBusy] = useState(false);
  const retryFocus = useRef(false);
  const [resetKey, setResetKey] = useState(0);
  const [botState, setBotState] = useState<"checking" | "passed" | "failed">(props.siteKey ? "checking" : "failed");
  const navStart = useRef<number | null>(null);
  /** §5.12: a transition longer than TRANSITION_MS announces "Loading batch {id}"; register() cancels it when the record arrives. */
  const loadTimer = useRef<number | undefined>(undefined);
  /** The navigation in flight already has its own announcement (the auto-advance's "{saved} Opened {name}…", §5.9), so it
   *  announces neither "Loading batch {id}" nor "Batch {id} loaded.": the one polite region keeps the save confirmation (§10.2). */
  const navAnnounced = useRef(false);
  /** A record navigation is in flight: the bar is "loading" and A does nothing (§5.7, §5.8.4) until the record registers. */
  const navigating = useRef(false);
  const [, setNavTick] = useState(0);   // a ref alone does not render: this puts the bar into its loading state while the record loads
  /** Reload record was pressed before the refreshed props arrived (the poll found the change); see register(). */
  const reloading = useRef(new Set<string>());
  /** The version that made a record stale, so the reviewer's own save that it turns out to be can clear it (D45). */
  const staleSeen = useRef(new Map<string, Version>());
  const focusAfterNav = useRef<string | null>(null);
  const [focusReq, setFocusReq] = useState<{ key: string; n: number } | null>(null);
  const searchClear = useRef<(() => void) | null>(null);

  // ---- small helpers
  const requestFocus = (key: string) => setFocusReq({ key, n: (focusReq?.n ?? 0) + 1 });
  // A newer message cancels a pending write, so a quick second announcement never lands under the first one.
  const announce = (text: string) => { cancelLive.current(); cancelLive.current = announceTo(liveRef.current, text); };
  const showHint = (text: string) => {
    setHintText(text);
    window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHintText(null), 5000);
    announce(text);
  };
  const statusOf = (id: string, fallback: DisplayStatus) => overridesRef.current[id] ?? fallback;
  const setReport = (v: boolean) => { reportRef.current = v; setReportOpen(v); };
  const setDismiss = (v: boolean) => { dismissRef.current = v; setDismissOpen(v); };
  const setDone = (v: boolean) => { completeRef.current = v; setComplete(v); };
  const inBatch = (pathname: string) => isDeskPath(pathname, batchId) || pathname === batchHref(batchId);

  function barNow(): BarCtx {
    const o = openRef.current;
    return { loading: navigating.current, complete: completeRef.current, role, batchId,
      record: o ? { conceptId: o.conceptId, name: o.tradeName, status: statusOf(o.conceptId, o.displayStatus), stagesBlocked: o.stagesBlocked } : null,
      stale: o ? staleRef.current[o.conceptId] !== undefined : false, drawerOpen, reportOpen: reportRef.current, dismissOpen: dismissRef.current, machine: m.current,
      undoSeconds, advanceGuard: guard, now: performance.now() };
  }

  // ---- the machine
  function fire(e: Event) {
    const r = step(m.current, e);
    m.current = r.state;
    setMachine(r.state);
    for (const fx of r.effects) effect(fx);
  }

  function effect(fx: Effect) {
    if (fx.type === "send") void sendOp(fx.channel, fx.op);
    else if (fx.type === "announce") announce(fx.text);
    else if (fx.type === "hint") showHint(fx.text);
    else if (fx.type === "saved") onSaved(fx);
    else if (fx.type === "stale") markStale(fx.conceptId, fx.reason, fx.cancelled);
    else router.refresh();
  }

  function markStale(id: string, reason: "rerun" | "other", cancelled: boolean) {
    staleRef.current = { ...staleRef.current, [id]: reason };
    setStale(staleRef.current);
    announce(cancelled ? `${STALE_TITLE}. ${DESK.promiseNotSaved}` : STALE_TITLE);
    if (reason === "rerun" && openRef.current?.conceptId === id) loadDiffFor(id);
  }

  function clearStale(id: string) {
    staleSeen.current.delete(id);
    if (staleRef.current[id] === undefined) return;
    const { [id]: _gone, ...rest } = staleRef.current;
    staleRef.current = rest;
    setStale(rest);
  }

  function loadDiffFor(id: string) {
    setDiff(null);
    setDiffOpen(false);
    const from = viewed.current.get(id)?.version.extractedAt;
    if (from) void loadDiff(batchId, id, from).then((rows) => { if (openRef.current?.conceptId === id) setDiff(rows && rows.length ? rows : null); });
  }

  /** A version for the record that differs from what the reviewer was shown (§5.11). */
  function checkStale(id: string, current: Version | null) {
    if (staleRef.current[id]) return;
    const v = viewed.current.get(id)?.version;
    if (!v) return;
    // unconfirmedOn covers a commit or report still in flight too: the server may already hold the reviewer's own save.
    const reason = current === null ? "rerun" : staleReason(v, current, unconfirmedOn(m.current, id));
    if (!reason) return;
    if (current) staleSeen.current.set(id, current);
    fire({ type: "STALE", conceptId: id, reason });
  }

  function freshToken(): Promise<string | null> {
    const held = token.current;
    if (held && tokenPlan(held.at, performance.now()) === "use") {
      token.current = null;
      return Promise.resolve(held.value);
    }
    token.current = null;
    setResetKey((k) => k + 1);
    setBotState("checking");
    return new Promise((resolve) => {
      const w = {
        resolve,
        // 10 s without a token is a bot failure (§5.8.5). The entry leaves the queue first, so a later token is
        // never handed to a send that already gave up.
        timer: window.setTimeout(() => { waiters.current = waiters.current.filter((x) => x !== w); resolve(null); }, TOKEN_WAIT_MS),
      };
      waiters.current.push(w);
    });
  }

  async function sendOp(channel: "commit" | "report", op: Op) {
    const t = await freshToken();
    if (t === null) { fire({ type: "RESULT", channel, result: { type: "CAPTCHA" } }); return; }
    let timer: number | undefined;
    const timeout = new Promise<typeof TIMEOUT>((resolve) => { timer = window.setTimeout(() => resolve(TIMEOUT), TOKEN_WAIT_MS); });
    let result: Parameters<typeof toOutcome>[0];
    try {
      const r = await Promise.race([decide({ batchId, conceptId: op.conceptId, decision: op.decision, note: op.note,
        extractedAt: op.viewedVersion.extractedAt, expectedLastDecisionId: op.viewedVersion.lastDecisionId, requestId: op.requestId,
        turnstileToken: t }), timeout]);
      result = r === TIMEOUT ? "timeout" : r;
    } catch {
      result = "network";
    } finally {
      window.clearTimeout(timer);
    }
    setResetKey((k) => k + 1);   // a token is single-use (§5.8.5)
    setBotState((s) => (s === "failed" ? s : "checking"));   // re-executing, no token held: "Checking" (§5.8.5)
    fire({ type: "RESULT", channel, result: toOutcome(result) });
  }

  /** Immediately before an armed window commits (§5.11). A 429 or a failure never blocks the commit. */
  async function precheck(op: Op): Promise<boolean> {
    const res = await fetch(versionsHref(batchId), { cache: "no-store" }).catch(() => null);
    const v = await pollVerdict(res);
    if (v.kind === "signedOut") { fire({ type: "UNAUTHENTICATED" }); return false; }
    if (v.kind === "forbidden") { fire({ type: "FORBIDDEN" }); return false; }
    if (v.kind !== "rows") return true;
    const row = v.rows.find((r) => r.conceptId === op.conceptId);
    const reason = row ? staleReason(op.viewedVersion, row, false) : "rerun";
    if (reason) { fire({ type: "STALE", conceptId: op.conceptId, reason }); return false; }
    return true;
  }

  async function poll() {
    if (m.current.auth !== "ok") return;
    const res = await fetch(versionsHref(batchId), { cache: "no-store" }).catch(() => null);
    const v = await pollVerdict(res);
    if (v.kind === "signedOut") { fire({ type: "UNAUTHENTICATED" }); return; }
    if (v.kind === "forbidden") { fire({ type: "FORBIDDEN" }); return; }
    if (v.kind !== "rows") return;
    const o = openRef.current;
    if (!o) return;
    const known = o.all.map((r) => ({ conceptId: r.conceptId, version: r.version, displayStatus: r.displayStatus }));
    const { open: row, othersChanged } = compareRows(known, v.rows, o.conceptId);
    checkStale(o.conceptId, row ? { extractedAt: row.extractedAt, lastDecisionId: row.lastDecisionId } : null);
    if (othersChanged) router.refresh();
  }

  function onSaved(fx: Extract<Effect, { type: "saved" }>) {
    const id = fx.op.conceptId;
    viewed.current.set(id, { version: fx.outcome.version, held: viewed.current.get(id)?.held ?? NO_HELD });
    savedAt.current.set(id, fx.outcome.version);
    // Own saves never make the record stale (§5.8.2): a check that saw this very save as "another reviewer" is undone.
    const seen = staleSeen.current.get(id);
    if (staleRef.current[id] === "other" && seen && sameVersion(seen, fx.outcome.version)) clearStale(id);
    overridesRef.current = { ...overridesRef.current, [id]: fx.outcome.displayStatus };
    setOverrides(overridesRef.current);
    const o = openRef.current;
    if (fx.channel === "report") {
      if (fx.op.decision === "dismiss") {
        // §5.10a on success: draft cleared, panel closed, focus to Looks correct (the Dismiss button is gone), no auto-advance.
        saveDraftAt(dismissDraftKey(batchId, id), "");
        if (o?.conceptId === id) { setDismissNoteText(""); setDismissError(false); setDismiss(false); requestFocus("approve"); }
      } else {
        clearDraft(batchId, id);
        if (o?.conceptId === id) { setNoteText(""); setNoteError(false); setReport(false); requestFocus("report"); }
      }
      router.refresh();
      return;
    }
    const rows = (list: RowRef[]): AdvanceRow[] => list.map((r) => ({ conceptId: r.conceptId, name: r.tradeName, index: r.index,
      status: r.conceptId === id ? fx.outcome.displayStatus : statusOf(r.conceptId, r.displayStatus) }));
    const a = advance({ role, committedId: id, openId: completeRef.current ? null : o?.conceptId ?? null, reportOpen: reportRef.current,
      visible: rows(o?.rows ?? []), all: rows(o?.all ?? []), batchId, saved: savedText(fx.op.role, fx.op.name) });
    announce(a.announce);
    router.refresh();
    if (a.kind === "complete" && a.switchView) { setDone(true); setDrawerOpen(false); }
    if (a.kind === "open" && o) {
      const target = o.all.find((r) => r.conceptId === a.target.conceptId)!;
      pendingGuard.current = target.conceptId;   // the guard starts on arrival, in register()
      // a.announce already says "Opened {name}": this navigation adds no loading or loaded message over it (§10.2).
      navigate(a.clearFilter ? recordHref(batchId, target.conceptId) : (o.rows.find((r) => r.conceptId === target.conceptId)?.href ?? target.href), undefined, true);
    }
    if (retryFocus.current) {
      retryFocus.current = false;
      if (o?.conceptId === id && a.kind !== "open") requestFocus("approve"); else root.current?.focus();
    }
  }

  // ---- Turnstile (§5.8.5)
  function onToken(t: string | null) {
    if (t === null) { token.current = null; setBotState((s) => (s === "failed" ? s : "checking")); return; }
    const w = waiters.current.shift();
    if (w) {
      // One single-use token per send: the first waiter takes it, and the widget re-executes for anyone still waiting.
      window.clearTimeout(w.timer);
      w.resolve(t);
      if (waiters.current.length > 0) { setResetKey((k) => k + 1); setBotState("checking"); }
      else setBotState("passed");
      return;
    }
    setBotState("passed");
    token.current = { value: t, at: performance.now() };
    if (retrying.current) {
      retrying.current = false;
      setRetryBusy(false);
      fire({ type: "RETRY_OK", now: performance.now() });
      return;
    }
    if (m.current.commit.kind === "awaitingToken") fire({ type: "TOKEN", now: performance.now() });
  }

  function onWidgetError() {
    token.current = null;
    setBotState("failed");
    const ws = waiters.current;
    waiters.current = [];
    for (const w of ws) window.clearTimeout(w.timer);
    for (const w of ws) w.resolve(null);
    if (retrying.current) { retrying.current = false; setRetryBusy(false); fire({ type: "RETRY_FAIL" }); return; }
    if (m.current.commit.kind === "awaitingToken") fire({ type: "WIDGET_ERROR" });
  }

  // ---- records
  function register(reg: RecordRegistration, held: HeldRecord) {
    navigating.current = false;
    window.clearTimeout(loadTimer.current);
    latest.current.set(reg.conceptId, { version: reg.version, held });
    const entry = viewed.current.get(reg.conceptId);
    if (!entry) viewed.current.set(reg.conceptId, { version: reg.version, held });
    else if (sameVersion(entry.version, reg.version)) entry.held = held;
    else if (reloading.current.has(reg.conceptId)) {
      // §5.11 Reload record: the refreshed record has arrived. It becomes the viewed version, and stale clears for good.
      reloading.current.delete(reg.conceptId);
      viewed.current.set(reg.conceptId, { version: reg.version, held });
      finishReload(reg.conceptId);
    } else checkStale(reg.conceptId, reg.version);
    let cleared = false;
    const next = { ...overridesRef.current };
    for (const r of reg.all) {
      const saved = savedAt.current.get(r.conceptId);
      if (saved && next[r.conceptId] !== undefined && sameVersion(saved, r.version)) { delete next[r.conceptId]; cleared = true; }
    }
    if (cleared) { overridesRef.current = next; setOverrides(next); }
    const prev = openRef.current;
    openRef.current = reg;
    setOpen(reg);
    // §5.8.2: SEND_DISMISS is allowed only while the record is `issue`. When a refresh shows it no longer is (another senior
    // dismissed it, a 409 no_issue, a re-run), the panel closes and its draft stays; focus leaves the closed panel.
    if (dismissRef.current && statusOf(reg.conceptId, reg.displayStatus) !== "issue") {
      const inPanel = document.getElementById("bar-dismiss")?.contains(document.activeElement) ?? false;
      setDismiss(false);
      setDismissError(false);
      if (inPanel) requestFocus("approve");
    }
    if (prev?.conceptId === reg.conceptId) {
      // Same record, new filter or search (Show all): the list is what changed, so focus goes where navigate() asked.
      announceLoaded();
      if (focusAfterNav.current !== null && navStart.current !== null) { requestFocus(focusAfterNav.current || "desk"); focusAfterNav.current = null; }
      navStart.current = null;
      return;
    }
    reloading.current.clear();
    setDone(reg.complete);
    if (pendingGuard.current === reg.conceptId) setGuard({ conceptId: reg.conceptId, at: performance.now() });
    pendingGuard.current = null;
    setReport(false);
    setNoteError(false);
    setNoteText(loadDraft(batchId, reg.conceptId));
    setDismiss(false);
    setDismissError(false);
    setDismissNoteText(loadDraftAt(dismissDraftKey(batchId, reg.conceptId)));
    setDiff(null);
    setDiffOpen(false);
    if (staleRef.current[reg.conceptId] === "rerun") loadDiffFor(reg.conceptId);
    void logRecordOpen(batchId, reg.conceptId);
    announceLoaded();
    navStart.current = null;
    if (focusAfterNav.current !== null) { requestFocus(focusAfterNav.current || "desk"); focusAfterNav.current = null; }
  }

  /** §5.12: a transition longer than TRANSITION_MS ends with "Batch {id} loaded.", unless it was already announced. */
  function announceLoaded() {
    if (!navAnnounced.current && navStart.current !== null && performance.now() - navStart.current > TRANSITION_MS) announce(fill(DESK.loaded, { id: batchId }));
    navAnnounced.current = false;
  }

  function navigate(href: string, focusKey?: string, announced = false) {
    setDone(false);   // "Open any record to read it" (§5.7): any navigation leaves the complete view
    const url = new URL(href, window.location.href);
    if (`${url.pathname}${url.search}` === `${window.location.pathname}${window.location.search}`) {
      if (focusKey) requestFocus(focusKey);
      return;   // the open record itself: no new props would arrive, so no loading state
    }
    const a = document.activeElement;
    focusAfterNav.current = focusKey ?? (a && root.current?.contains(a) ? (a.getAttribute("data-fk") ?? "") : null);
    navStart.current = performance.now();
    navigating.current = true;
    navAnnounced.current = announced;
    window.clearTimeout(loadTimer.current);
    if (!announced) loadTimer.current = window.setTimeout(() => { if (navigating.current) announce(fill(DESK.loadingStatus, { id: batchId })); }, TRANSITION_MS);
    setNavTick((n) => n + 1);
    if (url.pathname === window.location.pathname) {
      // Same record, new filter or search (a filter, Show all): Next 15.5's router drops the answer to a push that changes only
      // the query string (it patches the page segment as `__PAGE__?{…}` but seeds `__PAGE__`), so the URL is set directly,
      // which Next adopts as its own, and the server components are refetched for it. Found by the review e2e.
      window.history.pushState(null, "", href);
      window.setTimeout(() => router.refresh(), 0);   // after Next has taken the new URL as its canonical one
    } else router.push(href, { scroll: false });
  }

  function move(delta: 1 | -1 | "first" | "last") {
    const o = openRef.current;
    if (!o) return;
    if (o.rows.length === 0) { showHint(fill(DESK.emptyView, { n: o.total })); return; }
    if (completeRef.current) { setDone(false); navigate(o.rows[0].href); return; }
    const k = o.rows.findIndex((r) => r.conceptId === o.conceptId);
    const j = delta === "first" ? 0 : delta === "last" ? o.rows.length - 1 : Math.min(o.rows.length - 1, Math.max(0, (k < 0 ? 0 : k) + delta));
    if (o.rows[j].conceptId === o.conceptId) {
      if (delta === 1) showHint(DESK.lastInView);
      if (delta === -1) showHint(DESK.firstInView);
      return;
    }
    navigate(o.rows[j].href);
  }

  function newOp(o: RecordRegistration, decision: "ok" | "issue" | "dismiss", text: string): Op {
    return { conceptId: o.conceptId, name: o.tradeName, role, decision, note: text,
      viewedVersion: viewed.current.get(o.conceptId)?.version ?? o.version, requestId: crypto.randomUUID() };
  }
  const tokenState = () => (token.current ? "held" : botState === "failed" ? "failed" : "pending") as "held" | "pending" | "failed";

  function pressApprove() {
    const o = openRef.current;
    const h = approveHint(barNow());
    if (h.block || !o) { if (h.text) showHint(h.text); return; }
    fire({ type: "PRESS_A", op: newOp(o, "ok", ""), token: tokenState(), now: performance.now() });
  }

  function keyReport() {
    const o = openRef.current;
    if (reportRef.current) { requestFocus("note"); return; }
    const h = reportHint(barNow());
    if (h.block || !o) { if (h.text) showHint(h.text); return; }
    if (dismissRef.current) setDismiss(false);   // one panel at a time; the dismiss draft stays (§5.7)
    setNoteText(loadDraft(batchId, o.conceptId));
    setNoteError(false);
    setReport(true);
    requestFocus("note");
  }

  function closeReport(focusBack: boolean, discard: boolean) {
    const o = openRef.current;
    if (discard && o) { clearDraft(batchId, o.conceptId); setNoteText(""); }
    setReport(false);
    setNoteError(false);
    if (focusBack) requestFocus("report");
  }

  function setNote(v: string) {
    setNoteText(v);
    const o = openRef.current;
    if (o) saveDraft(batchId, o.conceptId, v);
    if (noteLength(v) >= NOTE_MIN) setNoteError(false);
  }

  function sendReport() {
    const o = openRef.current;
    if (!o) return;
    const h = sendHint(barNow());
    if (h) { showHint(h); return; }
    if (noteLength(note) < NOTE_MIN) { setNoteError(true); announce(DESK.noteError); requestFocus("note"); return; }
    fire({ type: "SEND_REPORT", op: newOp(o, "issue", note.trim()), token: tokenState() });
  }

  /** D and the Dismiss issue button (§5.10a). For any role but senior, D does nothing and shows no hint. */
  function keyDismiss() {
    const o = openRef.current;
    if (role !== "senior") return;
    if (dismissRef.current) { requestFocus("dismiss-note"); return; }
    const h = dismissHint(barNow());
    if (h.block || !o) { if (h.text) showHint(h.text); return; }
    if (reportRef.current) setReport(false);   // opening Dismiss closes Report; its draft stays in storage
    setDismissNoteText(loadDraftAt(dismissDraftKey(batchId, o.conceptId)));
    setDismissError(false);
    setDismiss(true);
    requestFocus("dismiss-note");
  }

  function closeDismiss(focusBack: boolean, discard: boolean) {
    const o = openRef.current;
    if (discard && o) { saveDraftAt(dismissDraftKey(batchId, o.conceptId), ""); setDismissNoteText(""); }
    setDismiss(false);
    setDismissError(false);
    if (focusBack) requestFocus("dismiss");
  }

  function setDismissNote(v: string) {
    setDismissNoteText(v);
    const o = openRef.current;
    if (o) saveDraftAt(dismissDraftKey(batchId, o.conceptId), v);
    if (noteLength(v) >= NOTE_MIN) setDismissError(false);
  }

  function sendDismiss() {
    const o = openRef.current;
    if (!o) return;
    if (barNow().record?.status !== "issue") {
      // §5.8.2: a dismissal only for an `issue` record; the reducer cannot see the status. The draft stays.
      showHint(P1C_COPY.dismiss.hintNoIssue);
      setDismiss(false);
      setDismissError(false);
      requestFocus("approve");
      return;
    }
    const h = sendDismissHint(barNow());
    if (h) { showHint(h); return; }
    if (noteLength(dismissNote) < NOTE_MIN) {
      setDismissError(true);
      announce(P1C_COPY.dismiss.noteError);
      requestFocus("dismiss-note");
      return;
    }
    fire({ type: "SEND_DISMISS", op: newOp(o, "dismiss", dismissNote.trim()), token: tokenState() });
  }

  function toggleDrawer(on = !drawerOpen) {
    const o = openRef.current;
    if (on) {
      if (!o || completeRef.current) return;
      drawerReturn.current = document.activeElement;
      setDrawerOpen(true);
      announce(fill(DESK.evidenceShown, { name: o.tradeName }));
      void logEvidence(batchId, o.conceptId);
      requestFocus("drawer-close");
      return;
    }
    setDrawerOpen(false);
    const r = drawerReturn.current;
    drawerReturn.current = null;
    if (r instanceof HTMLElement && root.current?.contains(r) && r !== root.current && !r.closest("#drawer") && r.getAttribute("data-fk"))
      requestFocus(r.getAttribute("data-fk")!);
    else requestFocus("ev");
  }

  function openSheet() { sheetReturn.current = document.activeElement; setSheetOpen(true); }
  function closeSheet() {
    setSheetOpen(false);
    const r = sheetReturn.current;
    sheetReturn.current = null;
    requestFocus(r instanceof HTMLElement && r.getAttribute("data-fk") ? r.getAttribute("data-fk")! : "desk");
  }

  function chooseUndo(n: number) {
    document.cookie = deskCookieString(UNDO_COOKIE, String(n), window.location.protocol === "https:");
    setUndoSeconds(n);
    fire({ type: "SET_UNDO", seconds: n });
  }
  function chooseKeys(on: boolean) {
    document.cookie = deskCookieString(KEYS_COOKIE, on ? "on" : "off", window.location.protocol === "https:");
    setSingleKeys(on);
  }

  /**
   * §5.11 Reload record. When newer props already arrived (a refresh landed first), they become the viewed version now.
   * When only the poll saw the change, the record stays paused until router.refresh() delivers it (register()); taking
   * `latest` then would re-adopt the old version and the record would go stale again as soon as the refresh lands.
   */
  function reloadOpen() {
    const o = openRef.current;
    if (!o) return;
    const id = o.conceptId;
    const l = latest.current.get(id);
    const v = viewed.current.get(id);
    setDiff(null);
    setDiffOpen(false);
    router.refresh();
    if (l && v && !sameVersion(l.version, v.version)) {
      viewed.current.set(id, { ...l });
      finishReload(id);
      return;
    }
    reloading.current.add(id);
  }

  function finishReload(id: string) {
    clearStale(id);
    if (openRef.current?.conceptId !== id) return;
    announce(DESK.reloaded);
    requestFocus(reportRef.current ? "note" : dismissRef.current ? "dismiss-note" : "approve");
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const action = keyAction(e, { singleKeys, sheetOpen, target: targetKind(target), drawerOpen, reportOpen: reportRef.current,
      dismissOpen: dismissRef.current, searchHasText: target instanceof HTMLInputElement && target.value.length > 0 });
    if (!action) return;
    e.preventDefault();
    switch (action) {
      case "approve": pressApprove(); break;
      case "undo": fire({ type: "PRESS_U" }); break;
      case "report": keyReport(); break;
      case "next": move(1); break;
      case "prev": move(-1); break;
      case "first": move("first"); break;
      case "last": move("last"); break;
      case "evidence": toggleDrawer(); break;
      case "source": if (openRef.current && !completeRef.current) window.open(openRef.current.sourceUrl, "_blank", "noopener"); break;
      case "sheet": openSheet(); break;
      case "closeSheet": closeSheet(); break;
      case "closeDrawer": toggleDrawer(false); break;
      case "closeReport": closeReport(true, false); break;
      case "clearSearch": searchClear.current?.(); break;
      case "sendReport": sendReport(); break;
      case "dismiss": keyDismiss(); break;
      case "closeDismiss": closeDismiss(true, false); break;
      case "sendDismiss": sendDismiss(); break;
      case "enterBlocked": showHint(DESK.enterBlocked); break;
    }
  }

  function onClick(e: MouseEvent<HTMLDivElement>) {
    const item = (e.target as Element).closest?.('[data-desk-open="sheet"]');
    if (item) { item.closest("details")?.removeAttribute("open"); openSheet(); return; }
    // §5.8.1: links inside the batch (Show filters, "Show all", the current batch in "Batches", Back to list, Cancel) are
    // plain <a href> for the no-JavaScript page. With the desk they navigate in place, so the desk (and an open undo window)
    // survives; a document navigation would unmount it. "Show all" then focuses the list (§5.3).
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
    const raw = a?.getAttribute("href") ?? "";
    if (!a || a.target || a.hasAttribute("download") || raw.startsWith("#")) return;
    const url = new URL(raw, window.location.href);
    if (url.origin !== window.location.origin || !inBatch(url.pathname)) return;
    e.preventDefault();
    navigate(`${url.pathname}${url.search}`, a.getAttribute("data-fk") === "show-all" ? "list" : undefined);
  }

  // ---- effects
  const self = useRef({ fire, poll, showHint });
  self.current = { fire, poll, showHint };

  useEffect(() => {
    setReady(true);
    root.current?.querySelectorAll<HTMLElement>("[data-desk-open]").forEach((el) => { el.hidden = false; });
  }, []);

  useEffect(() => {
    if (!focusReq) return;
    const el = focusReq.key === "desk" ? root.current
      : focusReq.key === "note" || focusReq.key === "dismiss-note" ? document.getElementById(focusReq.key)
      : root.current?.querySelector<HTMLElement>(`[data-fk="${focusReq.key}"]`) ?? root.current;
    el?.focus();
  }, [focusReq]);

  useEffect(() => {
    const c = machine.commit;
    if (c.kind === "armed") {
      const t = window.setTimeout(() => {
        void precheck(c.op).then((ok) => { if (ok) self.current.fire({ type: "DEADLINE", now: Math.max(performance.now(), c.deadline) }); });
      }, Math.max(0, c.deadline - performance.now()));
      return () => window.clearTimeout(t);
    }
    if (c.kind === "awaitingToken") {
      const t = window.setTimeout(() => self.current.fire({ type: "TOKEN_TIMEOUT", now: performance.now() }), TOKEN_WAIT_MS);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [machine.commit]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready) return;
    const tick = () => { if (document.visibilityState === "visible") void self.current.poll(); };
    const id = window.setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [ready]);

  useEffect(() => {
    if (!blocksUnload(machine)) return;
    const before = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    const click = (e: globalThis.MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank") return;
      const url = new URL(a.getAttribute("href") ?? "", window.location.href);
      if (url.origin === window.location.origin && inBatch(url.pathname)) return;   // handled in place by onClick
      e.preventDefault();
      e.stopPropagation();
      const c = m.current.commit;
      const name = windowOn(m.current)?.name ?? (c.kind === "netErr" ? c.op.name : "");
      self.current.showHint(fill(DESK.otherWindow, { name }));
    };
    const hide = () => self.current.fire({ type: "PAGE_UNLOAD" });
    window.addEventListener("beforeunload", before);
    document.addEventListener("click", click, true);
    window.addEventListener("pagehide", hide);
    return () => {
      window.removeEventListener("beforeunload", before);
      document.removeEventListener("click", click, true);
      window.removeEventListener("pagehide", hide);
    };
  }, [machine, batchId]);

  useEffect(() => {
    // §5.1, WCAG 2.4.11: scroll-padding-bottom follows the sticky decision bar's height (0 when the viewport is under
    // 480 px tall and the bar is not sticky). The value is a measured custom property on <html> (§3.1).
    const el = document.getElementById("decision-bar");
    const html = document.documentElement;
    if (!el || typeof ResizeObserver === "undefined") return;
    const set = () => html.style.setProperty("--bar-h", window.innerHeight < 480 ? "0px" : `${Math.ceil(el.getBoundingClientRect().height)}px`);
    const ro = new ResizeObserver(set);
    ro.observe(el);
    window.addEventListener("resize", set);
    set();
    return () => { ro.disconnect(); window.removeEventListener("resize", set); html.style.removeProperty("--bar-h"); };
  }, [open, ready]);

  useEffect(() => {
    const onSettings = (e: globalThis.Event) => {
      const d = (e as CustomEvent<{ keys?: "on" | "off"; undo?: number }>).detail ?? {};
      if (d.keys) setSingleKeys(d.keys === "on");
      if (d.undo) { setUndoSeconds(d.undo); self.current.fire({ type: "SET_UNDO", seconds: d.undo }); }
    };
    window.addEventListener(DESK_SETTINGS_EVENT, onSettings);
    return () => window.removeEventListener(DESK_SETTINGS_EVENT, onSettings);
  }, []);

  useEffect(() => {
    if (!open) return;
    const k = open.rows.findIndex((r) => r.conceptId === open.conceptId);
    for (const r of [open.rows[k - 1], open.rows[k + 1]]) if (r) router.prefetch(r.href);
  }, [open, router]);

  // ---- render
  const o = open;
  const bar = barNow();
  const commitErr = machine.commit.kind === "netErr" ? machine.commit : null;
  const reportErr = machine.report.kind === "netErr" ? machine.report : null;
  const api: DeskApi = {
    ready, batchId, role, total: props.total, singleKeys, undoSeconds, machine, bar, complete, hint, botState, retryBusy,
    drawerOpen, sheetOpen, reportOpen, note, noteError, dismissOpen, dismissNote, dismissError, diff, diffOpen, slots: { batchesNav: props.batchesNav, batchCard: props.batchCard },
    staleFor: (id) => stale[id] ?? null,
    netErrFor: (id) => (commitErr?.op.conceptId === id ? commitErr.saved : reportErr?.op.conceptId === id ? reportErr.saved : null),
    statusFor: (id, fallback) => overrides[id] ?? fallback,
    register, reloadOpen, navigate, move, toggleDrawer, pressApprove, announce,
    subtree: (id, version, held) => {
      const e = viewed.current.get(id);
      return e && !sameVersion(e.version, version) ? e.held : held;
    },
    clickReport: () => (reportRef.current ? setReport(false) : keyReport()),
    closeReport, setNote, sendReport,
    clickDismiss: () => (dismissRef.current ? setDismiss(false) : keyDismiss()), closeDismiss, setDismissNote, sendDismiss,
    undo: () => {
      const inToast = document.activeElement?.closest(".toast");
      fire({ type: "PRESS_U" });
      if (inToast) root.current?.focus();
    },
    tryAgain: () => { retryFocus.current = true; fire({ type: "TRY_AGAIN", channel: m.current.commit.kind === "netErr" ? "commit" : "report" }); },
    retryCheck: () => { retrying.current = true; setRetryBusy(true); token.current = null; setBotState("checking"); setResetKey((k) => k + 1); },
    toggleDiff: () => setDiffOpen((v) => !v),
    openSource: () => { if (openRef.current) window.open(openRef.current.sourceUrl, "_blank", "noopener"); },
    openFirst: () => { setDone(false); if (openRef.current?.all[0]) navigate(openRef.current.all[0].href); },
    registerSearchClear: (fn) => { searchClear.current = fn; },
  };
  const label = singleKeys ? DESK.workspaceLabel : DESK_NEW.deskSettings.workspacePlain;
  const sendKeys = ready && IS_MAC_RE.test(`${navigator.platform} ${navigator.userAgent}`) ? "⌘ Enter" : "Ctrl Enter";
  return (
    <DeskCtx.Provider value={api}>
      <div className={styles.app} id="desk" role="region" tabIndex={0} aria-label={label} ref={root} onKeyDown={onKeyDown} onClick={onClick}>
        <a className={styles.skip} href="#record">{DESK_NEW.deskMisc.skipRecord}</a>
        <a className={styles.skip} href="#decision-bar">{DESK_NEW.deskMisc.skipBar}</a>
        <div className={`chrome-toolbar material ${styles.toolbar}`} inert={sheetOpen || undefined}>
          <a href="/review" className={styles.wordmark}><Wordmark size={17} sub="Review" /></a>
          <div className={styles.center}>
            <span>{DESK.batchPrefix} <b className="mono">{batchId}</b></span>
            <ProgressMeter approved={props.counts.approved} issue={props.counts.issue} total={props.total} />
            <span className="num">{fill(DESK.approvedOf, { a: props.counts.approved, n: props.total })}</span>
            <span className={styles.sep} aria-hidden="true" />
            <span className="num">{complete ? DESK.batchApproved : o ? fill(DESK.recordOf, { k: o.index, n: o.total }) : ""}</span>
          </div>
          <div className={styles.right}>
            <span className="role-badge">{ROLE_LABEL_DESK[role]}</span>
            {props.account}
          </div>
        </div>
        <div className={styles.body} inert={sheetOpen || undefined}>{props.children}</div>
        <div inert={sheetOpen || undefined}>
          <Toast view={toastView(machine)} seconds={machine.undoMs / 1000} singleKeys={singleKeys} onUndo={api.undo} />
        </div>
        <ShortcutsSheet open={sheetOpen} onClose={closeSheet} undoSeconds={undoSeconds} singleKeys={singleKeys} sendKeys={sendKeys}
          onUndo={chooseUndo} onKeys={chooseKeys} role={role} />
        {props.siteKey && (
          <div className={styles.turnstile}>
            <TurnstileField siteKey={props.siteKey} action="decision" nonce={props.nonce} resetKey={resetKey} appearance="interaction-only"
              refreshExpired="auto" hideStatus onToken={onToken} onError={onWidgetError} />
          </div>
        )}
        {/* No React children: lib/live-region's announce() owns this node's text. */}
        <div ref={liveRef} className="sr-only" aria-live="polite" aria-atomic="true" data-desk="live" />
      </div>
    </DeskCtx.Provider>
  );
}
