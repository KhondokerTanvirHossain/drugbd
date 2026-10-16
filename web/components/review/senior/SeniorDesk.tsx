"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
import TurnstileField from "@/components/TurnstileField";
import Banner from "@/components/ui/Banner";
import BotCheck from "@/components/ui/BotCheck";
import Button from "@/components/ui/Button";
import { DESK_NEW, P1C_COPY } from "@/lib/copy";
import { DESK_SETTINGS_EVENT } from "@/lib/desk-settings";
import { announce as announceTo } from "@/lib/live-region";
import { DESK } from "@/lib/review-copy";
import type { PairReview } from "@/lib/review-types";
import { logSeniorOpen, pairDecide } from "@/lib/senior-actions";
import { pairKey, type PairDecideResult, type PairOutcome, type PairRef, type PairVersion } from "@/lib/senior-types";
import { NOTE_MIN, noteLength } from "../desk/bar-state";
import { loadDraftAt, pairDraftKey, saveDraftAt } from "../desk/drafts";
import { signInHref } from "../desk/hrefs";
import { IS_MAC_RE } from "../desk/keys";
import { SeniorCtx, type RowView, type SeniorApi } from "./context";
import { seniorKeyAction, seniorTarget } from "./keys";
import { initialPairs, pairBusy, pairStep, rowStatus, type PairEffect, type PairEvent, type PairOp, type PairState } from "./pair-machine";
import SeniorSheet from "./SeniorSheet";
import styles from "./senior.module.css";

export type SeniorDeskProps = {
  role: "senior"; kind: "queue" | "substance"; target: { type: "pair_queue" | "substance"; id: string }; pairs: PairRef[];
  singleKeys: boolean; siteKey: string | null; nonce?: string; children: ReactNode;
};

const TOKEN_WAIT_MS = 10_000, TOKEN_MAX_AGE_MS = 270_000;
type Panel = { open: boolean; note: string; error: boolean };
const CLOSED: Panel = { open: false, note: "", error: false };
const rowId = (p: { ddinterA: string; ddinterB: string }) => `pair-${p.ddinterA}-${p.ddinterB}`;

/**
 * Island (§4.2): the keyboard model of the senior pages (J, K, M, R, ?, Esc), pair decisions with Turnstile and a
 * requestId, the pair-issue drafts, row-level 409 banners and the page's one polite live region. Its props carry ids,
 * versions and states only: the rows (clinical text, notes) are server-rendered children.
 */
export default function SeniorDesk(props: SeniorDeskProps) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);
  const cancelLive = useRef<() => void>(() => {});
  const [ready, setReady] = useState(false);
  const [singleKeys, setSingleKeys] = useState(props.singleKeys);
  const [machine, setMachine] = useState<PairState>(initialPairs);
  const m = useRef(machine);
  const [current, setCurrent] = useState(-1);
  const [overrides, setOverrides] = useState<Record<string, { review: PairReview; version: PairVersion }>>({});
  const overridesRef = useRef(overrides);
  const [panels, setPanels] = useState<Record<string, Panel>>({});
  const panelsRef = useRef(panels);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetReturn = useRef<Element | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = useRef<number | undefined>(undefined);
  const token = useRef<{ value: string; at: number } | null>(null);
  const waiters = useRef<{ resolve: (t: string | null) => void; timer: number }[]>([]);
  const retrying = useRef(false);
  const [retryBusy, setRetryBusy] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [botState, setBotState] = useState<"checking" | "passed" | "failed">(props.siteKey ? "checking" : "failed");
  const [focusReq, setFocusReq] = useState<{ sel: string; n: number } | null>(null);
  const pairs = props.pairs;

  // ---- helpers
  const announce = (text: string) => { cancelLive.current(); cancelLive.current = announceTo(liveRef.current, text); };
  const showHint = (text: string) => {
    setHint(text);
    window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHint(null), 5000);
    announce(text);
  };
  const focus = (sel: string) => setFocusReq((f) => ({ sel, n: (f?.n ?? 0) + 1 }));
  const refOf = (key: string) => pairs.find((p) => pairKey(p.ddinterA, p.ddinterB) === key) ?? null;
  const stateOf = (key: string) => overridesRef.current[key]?.review.state ?? refOf(key)?.state ?? "not_reviewed";
  const versionOf = (ref: PairRef) => overridesRef.current[pairKey(ref.ddinterA, ref.ddinterB)]?.version ?? ref.version;
  const panelOf = (key: string) => panelsRef.current[key] ?? CLOSED;
  const setPanel = (key: string, p: Partial<Panel>) => {
    panelsRef.current = { ...panelsRef.current, [key]: { ...panelOf(key), ...p } };
    setPanels(panelsRef.current);
  };
  /** The row marked aria-current (set by J/K or focus entering a row), or null: M and R never act on an implicit row. */
  const currentKey = () => {
    const ref = current >= 0 ? pairs[current] : undefined;
    return ref ? pairKey(ref.ddinterA, ref.ddinterB) : null;
  };
  /** After a banner's button unmounts (Try again, Reload), focus the row's closest control: its open note, else Mark reviewed. */
  const focusRow = (key: string) => {
    const ref = refOf(key);
    if (!ref) return;
    focus(panelOf(key).open ? `#pair-note-${ref.ddinterA}-${ref.ddinterB}` : `[data-sk="mark-${ref.ddinterA}-${ref.ddinterB}"]`);
  };

  // ---- the machine
  function fire(e: PairEvent) {
    const before = m.current.auth;
    const r = pairStep(m.current, e);
    m.current = r.state;
    setMachine(r.state);
    // §5.17.5: an auth stop unmounts the row buttons and the note panel; focus the sign-in link, else the region.
    if (before === "ok" && r.state.auth !== "ok") focus(r.state.auth === "signedOut" ? '[data-senior="sign-in"]' : "#senior");
    for (const fx of r.effects) effect(fx);
  }
  function effect(fx: PairEffect) {
    if (fx.type === "send") void send(fx.op);
    else if (fx.type === "announce") announce(fx.text);
    else if (fx.type === "hint") showHint(fx.text);
    else onSaved(fx.op, fx.outcome);
  }
  /** The row stays in place and in order (§5.17.2 "Outcomes"): its state line and version change, nothing is refetched. */
  function onSaved(op: PairOp, outcome: PairOutcome) {
    overridesRef.current = { ...overridesRef.current, [op.key]: { review: outcome.review, version: outcome.version } };
    setOverrides(overridesRef.current);
    if (op.decision === "issue") {
      saveDraftAt(pairDraftKey(op.ddinterA, op.ddinterB), "");
      setPanel(op.key, CLOSED);
      focus(`[data-sk="report-${op.ddinterA}-${op.ddinterB}"]`);
    }
  }

  // ---- Turnstile (§5.8.5, §5.17.5): one widget per page, a single-use token per send, at most 10 s to get one
  function freshToken(): Promise<string | null> {
    const held = token.current;
    if (held && performance.now() - held.at < TOKEN_MAX_AGE_MS) { token.current = null; return Promise.resolve(held.value); }
    token.current = null;
    setResetKey((k) => k + 1);
    setBotState("checking");
    return new Promise((resolve) => {
      const w = { resolve, timer: window.setTimeout(() => { waiters.current = waiters.current.filter((x) => x !== w); resolve(null); }, TOKEN_WAIT_MS) };
      waiters.current.push(w);
    });
  }
  function onToken(t: string | null) {
    if (t === null) { token.current = null; setBotState((s) => (s === "failed" ? s : "checking")); return; }
    const w = waiters.current.shift();
    if (w) { window.clearTimeout(w.timer); w.resolve(t); setBotState("passed"); return; }
    setBotState("passed");
    token.current = { value: t, at: performance.now() };
    if (retrying.current) { retrying.current = false; setRetryBusy(false); retryOk(); }
  }
  /** §5.17.5: RETRY_OK unmounts the Retry check button; focus the held row's closest control, else the region. */
  function retryOk() {
    const held = Object.entries(m.current.rows).find(([, x]) => x.kind === "botHold")?.[0];
    fire({ type: "RETRY_OK" });
    if (held && refOf(held)) focusRow(held); else focus("#senior");
  }
  function onWidgetError() {
    token.current = null;
    setBotState("failed");
    const ws = waiters.current;
    waiters.current = [];
    for (const w of ws) { window.clearTimeout(w.timer); w.resolve(null); }
    if (retrying.current) { retrying.current = false; setRetryBusy(false); fire({ type: "RETRY_FAIL" }); }
  }
  async function send(op: PairOp) {
    const t = await freshToken();
    if (t === null) { fire({ type: "RESULT", key: op.key, result: { ok: false, code: "captcha" } }); return; }
    let timer: number | undefined;
    const timeout = new Promise<"timeout">((resolve) => { timer = window.setTimeout(() => resolve("timeout"), TOKEN_WAIT_MS); });
    let result: PairDecideResult | "network" | "timeout";
    try {
      result = await Promise.race([pairDecide({ ddinterA: op.ddinterA, ddinterB: op.ddinterB, decision: op.decision, note: op.note,
        expectedContentHash: op.version.contentHash, expectedLastPairReviewId: op.version.lastPairReviewId, requestId: op.requestId,
        turnstileToken: t }), timeout]);
    } catch {
      result = "network";
    } finally {
      window.clearTimeout(timer);
    }
    setResetKey((k) => k + 1);   // a token is single-use
    setBotState((s) => (s === "failed" ? s : "checking"));
    fire({ type: "RESULT", key: op.key, result });
  }
  const tokenState = () => (token.current ? "held" : botState === "failed" ? "failed" : "pending") as "held" | "pending" | "failed";
  const newOp = (ref: PairRef, decision: "reviewed" | "issue", note: string): PairOp => ({
    key: pairKey(ref.ddinterA, ref.ddinterB), ddinterA: ref.ddinterA, ddinterB: ref.ddinterB, a: ref.nameA, b: ref.nameB,
    decision, note, version: versionOf(ref), requestId: crypto.randomUUID() });

  /** Why no decision may start on this row now (§5.17.2 outcomes, §5.8.2 handling), or null. */
  function blocked(key: string): string | null {
    const s = m.current, st = rowStatus(s, key);
    if (s.auth === "forbidden") return P1C_COPY.review.notAuthTitle;
    if (s.auth === "signedOut") return DESK_NEW.sessionExpired.hint;
    if (st.kind === "paused") return st.reason === "content" ? P1C_COPY.review.contentTitle : P1C_COPY.review.otherTitle;
    if (st.kind === "netErr") return st.saved === "no" ? DESK.notSavedHint : DESK_NEW.decisionUnconfirmed.hint;
    if (Object.values(s.rows).some((x) => x.kind === "botHold")) return DESK.botFirst;
    return null;
  }

  // ---- actions
  function mark(key: string) {
    const ref = refOf(key);
    if (!ref) return;
    const why = blocked(key);
    if (why) { showHint(why); return; }
    if (stateOf(key) === "reviewed") { showHint(P1C_COPY.review.alreadyReviewed); return; }
    if (pairBusy(m.current)) return;
    fire({ type: "SEND", op: newOp(ref, "reviewed", ""), token: tokenState() });
  }
  function openNote(key: string) {
    const ref = refOf(key);
    if (!ref) return;
    if (m.current.auth !== "ok") { showHint(blocked(key)!); return; }
    if (!panelOf(key).open) setPanel(key, { open: true, note: loadDraftAt(pairDraftKey(ref.ddinterA, ref.ddinterB)), error: false });
    focus(`#pair-note-${ref.ddinterA}-${ref.ddinterB}`);
  }
  function closeNote(key: string, focusBack: boolean, discard: boolean) {
    const ref = refOf(key);
    if (!ref) return;
    if (discard) { saveDraftAt(pairDraftKey(ref.ddinterA, ref.ddinterB), ""); setPanel(key, CLOSED); }
    else setPanel(key, { open: false, error: false });
    if (focusBack) focus(`[data-sk="report-${ref.ddinterA}-${ref.ddinterB}"]`);
  }
  function setNote(key: string, v: string) {
    const ref = refOf(key);
    if (!ref) return;
    saveDraftAt(pairDraftKey(ref.ddinterA, ref.ddinterB), v);
    setPanel(key, noteLength(v) >= NOTE_MIN ? { note: v, error: false } : { note: v });
  }
  function sendNote(key: string) {
    const ref = refOf(key);
    if (!ref) return;
    if (rowStatus(m.current, key).kind === "paused") { showHint(DESK.reportPaused); return; }
    const why = blocked(key);
    if (why) { showHint(why); return; }
    const note = panelOf(key).note;
    if (noteLength(note) < NOTE_MIN) {
      setPanel(key, { error: true });
      announce(P1C_COPY.review.noteError);
      focus(`#pair-note-${ref.ddinterA}-${ref.ddinterB}`);
      return;
    }
    if (pairBusy(m.current)) return;
    fire({ type: "SEND", op: newOp(ref, "issue", note.trim()), token: tokenState() });
  }
  /** Reload (§5.17.2 409 banners): the latest pair from the server, and the row's decisions resume. The draft stays. */
  function reload(key: string) {
    const { [key]: _gone, ...rest } = overridesRef.current;
    overridesRef.current = rest;
    setOverrides(rest);
    fire({ type: "RELOADED", key });
    if (rowStatus(m.current, key).kind !== "paused") focusRow(key);
    router.refresh();
  }
  function move(delta: 1 | -1) {
    if (pairs.length === 0) return;
    const at = current + delta;
    if (at >= pairs.length) { showHint(P1C_COPY.review.lastPair); return; }
    if (at < 0) { showHint(P1C_COPY.review.firstPair); return; }
    setCurrent(at);
    focus(`#${rowId(pairs[at])}-h`);
  }
  function closeSheet() {
    setSheetOpen(false);
    const r = sheetReturn.current;
    sheetReturn.current = null;
    if (r instanceof HTMLElement) r.focus(); else root.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement;
    const key = currentKey();
    const action = seniorKeyAction(e, { singleKeys, sheetOpen, target: seniorTarget(t), noteOpen: key ? panelOf(key).open : false });
    if (!action) return;
    e.preventDefault();
    switch (action) {
      case "next": move(1); break;
      case "prev": move(-1); break;
      case "mark": if (key) mark(key); break;
      case "report": if (key) openNote(key); break;
      case "sheet": sheetReturn.current = document.activeElement; setSheetOpen(true); break;
      case "closeSheet": closeSheet(); break;
      case "closeNote": { const k = t.getAttribute("data-pair") ?? key; if (k) closeNote(k, true, false); break; }
      case "sendNote": { const k = t.getAttribute("data-pair"); if (k) sendNote(k); break; }
      case "enterBlocked": showHint(P1C_COPY.review.enterBlocked); break;
    }
  }
  /** Tab or a click into a row makes it the current one, so M and R act where the senior is. */
  function onFocusIn(e: FocusEvent<HTMLDivElement>) {
    const article = (e.target as Element).closest?.("article.pair-row");
    if (!article) return;
    const at = pairs.findIndex((p) => rowId(p) === article.id);
    if (at >= 0 && at !== current) setCurrent(at);
  }

  // ---- effects
  useEffect(() => { setReady(true); void logSeniorOpen(props.target.type, props.target.id); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!focusReq) return;
    document.querySelector<HTMLElement>(focusReq.sel)?.focus();
  }, [focusReq]);
  useEffect(() => {
    root.current?.querySelectorAll("article.pair-row[aria-current]").forEach((el) => el.removeAttribute("aria-current"));
    if (current >= 0 && pairs[current]) document.getElementById(rowId(pairs[current]))?.setAttribute("aria-current", "true");
  }, [current, pairs]);
  useEffect(() => {
    const onSettings = (e: globalThis.Event) => {
      const d = (e as CustomEvent<{ keys?: "on" | "off" }>).detail ?? {};
      if (d.keys) setSingleKeys(d.keys === "on");
    };
    window.addEventListener(DESK_SETTINGS_EVENT, onSettings);
    return () => window.removeEventListener(DESK_SETTINGS_EVENT, onSettings);
  }, []);

  // ---- render
  const sendKeys = ready && IS_MAC_RE.test(`${navigator.platform} ${navigator.userAgent}`) ? "⌘ Enter" : "Ctrl Enter";
  const api: SeniorApi = {
    ready, singleKeys, auth: machine.auth, sendKeys,
    row: (key): RowView => {
      const p = panels[key] ?? CLOSED;
      return { status: rowStatus(machine, key), review: overrides[key]?.review ?? null,
        state: overrides[key]?.review.state ?? refOf(key)?.state ?? "not_reviewed", panelOpen: p.open, note: p.note, noteError: p.error };
    },
    mark, clickReport: (key) => (panelOf(key).open ? setPanel(key, { open: false }) : openNote(key)), closeNote, setNote, sendNote,
    tryAgain: (key) => { fire({ type: "TRY_AGAIN", key }); if (rowStatus(m.current, key).kind !== "netErr") focusRow(key); }, reload,
  };
  const r = P1C_COPY.review;
  // A senior page with no pair row (an empty filter, a page past the end, a substance with no pair or with coverage none):
  // the island only logs senior_open (§5.15). No row region, no bot check and no Turnstile widget, since no decision can start.
  if (pairs.length === 0) return <>{props.children}</>;
  const botHold = Object.values(machine.rows).some((x) => x.kind === "botHold");
  const here = typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "/review/pairs";
  return (
    <SeniorCtx.Provider value={api}>
      <div className={styles.region} id="senior" role="region" tabIndex={0} aria-label={singleKeys ? r.regionLabel : r.regionPlain}
        ref={root} onKeyDown={onKeyDown} onFocus={onFocusIn}>
        {machine.auth === "signedOut" && (
          <Banner tone="info" title={DESK_NEW.sessionExpired.hint} body={<a href={signInHref(here)} data-senior="sign-in">{DESK_NEW.sessionExpired.signInAgain}</a>} />
        )}
        {machine.auth === "forbidden" && <Banner tone="info" title={r.notAuthTitle} body={r.notAuthBody} />}
        {ready && (
          <div className={styles.bar}>
            <BotCheck state={botState} />
            {botHold && <>
              <p className="field-error">{DESK.botError}</p>
              <Button variant="tonal" size="sm" busy={retryBusy} busyLabel={DESK.checking} onClick={() => {
                retrying.current = true; setRetryBusy(true); token.current = null; setBotState("checking"); setResetKey((k) => k + 1);
              }}>{DESK.retryCheck}</Button>
            </>}
          </div>
        )}
        <div inert={sheetOpen || undefined}>{props.children}</div>
        <p className={styles.hint} data-senior="hint" hidden={!hint}>{hint}</p>
        <SeniorSheet open={sheetOpen} onClose={closeSheet} sendKeys={sendKeys} />
        {props.siteKey && (
          <div className={styles.turnstile}>
            <TurnstileField siteKey={props.siteKey} action="decision" nonce={props.nonce} resetKey={resetKey} appearance="interaction-only"
              refreshExpired="auto" hideStatus onToken={onToken} onError={onWidgetError} />
          </div>
        )}
        {/* No React children: lib/live-region's announce() owns this node's text. The page's one polite region (§10.2). */}
        <div ref={liveRef} className="sr-only" aria-live="polite" aria-atomic="true" data-senior="live" />
      </div>
    </SeniorCtx.Provider>
  );
}
