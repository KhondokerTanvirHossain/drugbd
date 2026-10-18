"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import TurnstileField from "@/components/TurnstileField";
import { signInHref } from "@/components/review/desk/hrefs";
import Banner, { type BannerTone } from "@/components/ui/Banner";
import Button, { buttonClass } from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import { QA_COPY, fill } from "@/lib/copy";
import { fmtDhaka } from "@/lib/format";
import { NAV } from "@/lib/public-copy";
import { createQaKeyAction, revokeQaKeyAction } from "@/lib/qa-key-actions";
import { QA_ACTIVE_MAX, nameLength, validQaKeyName, type CreateQaKeyCode, type QaKeyStatus, type QaKeyView,
  type RevokeQaKeyCode } from "@/lib/qa-key-types";
import { DESK, SHARED_WORDS } from "@/lib/review-copy";
import CopyButton from "./CopyButton";
import { KEYS_HEADING_ID, announceQa } from "./live";
import styles from "@/app/review/qa/qa.module.css";

const K = QA_COPY.keys;
const NEW_KEY_ID = "qa-new-key";
const PANEL_HEADING_ID = "qa-new-key-heading";
const NAME_ID = "qa-key-name";
const CREATE_ID = "qa-key-create";
const TOKEN_WAIT_MS = 10_000;
const SIGN_IN = signInHref("/review/qa");

export type QaKeysProps = { keys: QaKeyView[]; siteKey: string | null; nonce?: string };

const STATUS_WORD: Record<QaKeyStatus, string> = { active: K.statusActive, expired: K.statusExpired, revoked: K.statusRevoked };
type Outcome = { tone: BannerTone; title: string; body: string; action?: "retry" | "signIn" | "tryAgain" | "reload" };
type CreateFailure = Exclude<CreateQaKeyCode, "created" | "invalid">;
type RevokeFailure = Exclude<RevokeQaKeyCode, "revoked" | "already_revoked">;

/** §5.18 "Create outcomes": tone, title, body and action of each refused or failed create. */
const CREATE_OUTCOME: Record<CreateFailure, Outcome> = {
  active_limit: { tone: "warn", title: K.activeLimitTitle, body: K.activeLimitBody },
  daily_limit: { tone: "warn", title: K.dailyLimitTitle, body: K.dailyLimitBody },
  captcha: { tone: "crit", title: K.captchaTitle, body: K.captchaCreateBody, action: "retry" },
  forbidden: { tone: "info", title: K.forbiddenTitle, body: K.forbiddenCreateBody },
  unauthenticated: { tone: "warn", title: K.unauthenticatedTitle, body: K.unauthenticatedCreateBody, action: "signIn" },
  failed: { tone: "crit", title: K.createFailedTitle, body: K.createFailedBody, action: "tryAgain" },
};
/** §5.18 "Revoke outcomes": the banners; `revoked` and `already_revoked` change the row instead. */
const REVOKE_OUTCOME: Record<RevokeFailure, Outcome> = {
  not_found: { tone: "warn", title: K.notFoundTitle, body: K.notFoundBody, action: "reload" },
  invalid: { tone: "warn", title: K.notFoundTitle, body: K.notFoundBody, action: "reload" },
  rate_limited: { tone: "warn", title: K.rateLimitedTitle, body: K.rateLimitedBody },
  captcha: { tone: "crit", title: K.captchaTitle, body: K.captchaRevokeBody, action: "retry" },
  forbidden: { tone: "info", title: K.forbiddenTitle, body: K.forbiddenRevokeBody },
  unauthenticated: { tone: "warn", title: K.unauthenticatedTitle, body: K.unauthenticatedRevokeBody, action: "signIn" },
  failed: { tone: "crit", title: K.revokeFailedTitle, body: K.revokeFailedBody, action: "tryAgain" },
};

/** Focus after React has committed the change (the target may only now exist, or be about to unmount its neighbour). */
const focusId = (id: string) => { window.setTimeout(() => document.getElementById(id)?.focus(), 0); };
const revokeButtonId = (id: number) => `qa-revoke-${id}`;
const confirmButtonId = (id: number) => `qa-revoke-confirm-${id}`;

/**
 * Island (§4.2, §5.18): the "Your keys" section of /review/qa. The create and revoke forms call the server actions with the
 * one shared Turnstile token (action qakey); the one-time key panel (focus, copy, "I've saved it", a beforeunload guard while
 * it is open); the inline revoke confirmation; field errors, outcome banners and announcements through the page's live
 * region. Props carry the viewer's own keys without any email or hash. The new key is never a prop: it arrives once in the
 * create action's result and lives only in this state until "I've saved it" or the page unloads.
 */
export default function QaKeys({ keys, siteKey, nonce }: QaKeysProps) {
  const [ready, setReady] = useState(false);
  const [added, setAdded] = useState<QaKeyView[]>([]);
  const [changed, setChanged] = useState<Record<number, QaKeyView>>({});
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createOutcome, setCreateOutcome] = useState<Outcome | null>(null);
  const [panel, setPanel] = useState<{ name: string; key: string } | null>(null);
  const [confirmFor, setConfirmFor] = useState<number | null>(null);
  const [revoking, setRevoking] = useState<number | null>(null);
  const [revokeOutcome, setRevokeOutcome] = useState<(Outcome & { id: number }) | null>(null);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const token = useRef<string | null>(null);
  const waiters = useRef<((t: string | null) => void)[]>([]);

  useEffect(() => setReady(true), []);

  // The rows: keys created here first (newest), then the page's rows; a row changed here (revoked) wins over the prop.
  const rows = useMemo(() => {
    const seen = new Set<number>();
    const out: QaKeyView[] = [];
    for (const r of [...added, ...keys]) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(changed[r.id] ?? r);
    }
    return out;
  }, [added, keys, changed]);
  const atLimit = rows.filter((r) => r.status === "active").length >= QA_ACTIVE_MAX;

  // While the one-time panel is open, leaving the page (a link, the account menu, a reload) asks first (§5.18).
  useEffect(() => {
    if (!panel) return;
    const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [panel]);
  useEffect(() => { if (panel) focusId(PANEL_HEADING_ID); }, [panel]);
  useEffect(() => { if (confirmFor !== null) focusId(confirmButtonId(confirmFor)); }, [confirmFor]);

  // ---- the one shared Turnstile token: single use, at most 10 s to get a fresh one
  function onToken(t: string | null) {
    if (t === null) { token.current = null; return; }
    const w = waiters.current.shift();
    if (w) w(t); else token.current = t;
  }
  function onWidgetError() {
    token.current = null;
    for (const w of waiters.current.splice(0)) w(null);
  }
  function takeToken(): Promise<string | null> {
    if (!siteKey) return Promise.resolve(null);
    const held = token.current;
    token.current = null;
    if (held) return Promise.resolve(held);
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => { waiters.current = waiters.current.filter((x) => x !== w); resolve(null); }, TOKEN_WAIT_MS);
      const w = (t: string | null) => { window.clearTimeout(timer); resolve(t); };
      waiters.current.push(w);
    });
  }
  const spent = () => setResetKey((k) => k + 1);   // a token is single-use: ask the widget for the next one

  const say = (o: Outcome) => announceQa(`${o.title} ${o.body}`);

  // ---- create
  async function create() {
    if (creating) return;
    if (atLimit) { announceQa(K.activeLimitHelp); return; }   // aria-disabled: the press sends nothing (§5.18)
    const valid = validQaKeyName(name);
    if (valid === null) {
      setNameError(true);
      announceQa(K.nameError);
      document.getElementById(NAME_ID)?.focus();
      return;
    }
    setNameError(false);
    setCreating(true);
    const t = await takeToken();
    let code: CreateQaKeyCode;
    if (t === null) {
      code = "captcha";
    } else {
      const fd = new FormData();
      fd.set("name", valid);
      fd.set("cf-turnstile-response", t);
      try {
        const r = await createQaKeyAction(fd);
        code = r.code;
        if (r.code === "created") {
          spent();
          setCreating(false);
          setCreateOutcome(null);
          setName("");
          if (r.row) setAdded((a) => [r.row as QaKeyView, ...a]);
          setPanel({ name: valid, key: r.key });
          announceQa(fill(K.createdAnnounce, { name: valid }));
          return;
        }
      } catch {
        code = "failed";
      }
      spent();
    }
    setCreating(false);
    if (code === "invalid") {
      setNameError(true);
      announceQa(K.nameError);
      document.getElementById(NAME_ID)?.focus();
      return;
    }
    const o = CREATE_OUTCOME[code as CreateFailure];
    setCreateOutcome(o);
    say(o);
  }
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void create();
  }
  function saved() {
    setPanel(null);   // the key leaves the DOM and this state
    focusId(KEYS_HEADING_ID);
  }

  // ---- revoke
  function openConfirm(id: number) {
    setRevokeOutcome(null);
    setStatusLine(null);
    setConfirmFor(id);
  }
  function closeConfirm(id: number) {
    setConfirmFor(null);
    focusId(revokeButtonId(id));
  }
  async function revoke(row: QaKeyView) {
    if (revoking !== null) return;
    setRevoking(row.id);
    const t = await takeToken();
    let code: RevokeQaKeyCode;
    let updated: QaKeyView | undefined;
    if (t === null) {
      code = "captcha";
    } else {
      const fd = new FormData();
      fd.set("keyId", String(row.id));
      fd.set("cf-turnstile-response", t);
      try {
        const r = await revokeQaKeyAction(fd);
        code = r.code;
        updated = r.row;
      } catch {
        code = "failed";
      }
      spent();
    }
    setRevoking(null);
    if (code === "revoked" || code === "already_revoked") {
      setChanged((c) => ({ ...c, [row.id]: updated ?? { ...row, status: "revoked" } }));
      setConfirmFor(null);
      setRevokeOutcome(null);
      const text = fill(code === "revoked" ? K.revokedAnnounce : K.alreadyRevoked, { name: row.name });
      setStatusLine(code === "already_revoked" ? text : null);
      announceQa(text);
      focusId(KEYS_HEADING_ID);   // the row's action cell is empty now
      return;
    }
    const o = { ...REVOKE_OUTCOME[code as RevokeFailure], id: row.id };
    setRevokeOutcome(o);
    say(o);   // the confirmation stays open, focus stays on "Revoke key"
  }

  // ---- banner actions
  function retryCheck(control: string) {
    setCreateOutcome(null);
    setRevokeOutcome(null);
    token.current = null;
    spent();
    focusId(control);
  }
  function action(o: Outcome, kind: "create" | "revoke"): ReactNode {
    const control = kind === "create" ? CREATE_ID : revokeOutcome ? confirmButtonId(revokeOutcome.id) : KEYS_HEADING_ID;
    switch (o.action) {
      case "retry":
        return <Button variant="tonal" size="sm" onClick={() => retryCheck(control)}>{DESK.retryCheck}</Button>;
      case "signIn":
        return <a className={buttonClass("tonal", "sm")} href={SIGN_IN}>{NAV.signIn}</a>;
      case "reload":
        return <a className={buttonClass("tonal", "sm")} href="/review/qa">{SHARED_WORDS.reload}</a>;
      case "tryAgain":
        return <Button variant="tonal" size="sm" onClick={() => {
          if (kind === "create") { setCreateOutcome(null); focusId(CREATE_ID); void create(); return; }
          const row = rows.find((r) => r.id === revokeOutcome?.id);
          if (row) { focusId(confirmButtonId(row.id)); void revoke(row); }
        }}>{K.tryAgain}</Button>;
      default:
        return undefined;
    }
  }

  const help = atLimit ? <>{K.nameHelp} {K.activeLimitHelp}</> : K.nameHelp;
  return (
    <div className={styles.keys}>
      <p>{K.lead}</p>
      {panel && (
        <section className={styles.panel} aria-labelledby={PANEL_HEADING_ID}>
          <h3 id={PANEL_HEADING_ID} tabIndex={-1}>{K.panelHeading}</h3>
          <p>{K.panelBody}</p>
          <p className={styles.label}>{fill(K.panelLabel, { name: panel.name })}</p>
          <code id={NEW_KEY_ID} className={styles.newKey}>{panel.key}</code>
          <div className={styles.row}>
            <CopyButton target={NEW_KEY_ID} label={K.copyKey} />
            <Button variant="tonal" size="sm" onClick={saved}>{K.saved}</Button>
          </div>
        </section>
      )}
      {createOutcome && <Banner tone={createOutcome.tone} title={createOutcome.title} body={createOutcome.body}
        action={action(createOutcome, "create")} />}
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <Field id={NAME_ID} label={K.nameLabel} help={help} error={nameError ? K.nameError : undefined}
          counter={fill(K.nameCounter, { n: nameLength(name) })}
          control={<input className="input" name="name" type="text" maxLength={40} autoComplete="off" value={name}
            onChange={(e) => { setName(e.target.value); if (nameError) setNameError(false); }} />} />
        {siteKey && <TurnstileField siteKey={siteKey} action="qakey" nonce={nonce} size="auto" resetKey={resetKey}
          onToken={onToken} onError={onWidgetError} />}
        <div className={styles.row}>
          <Button id={CREATE_ID} type="submit" variant="primary" busy={creating} busyLabel={K.creating} hidden={!ready}
            aria-disabled={atLimit ? "true" : undefined}>{K.create}</Button>
        </div>
        <noscript><p>{K.noScript}</p></noscript>
      </form>
      {revokeOutcome && <Banner tone={revokeOutcome.tone} title={revokeOutcome.title} body={revokeOutcome.body}
        action={action(revokeOutcome, "revoke")} />}
      {statusLine && <p className={styles.statusLine}>{statusLine}</p>}
      {rows.length === 0 ? <p>{K.empty}</p> : (
        <div className={styles.scroll} role="region" aria-label={K.listLabel} tabIndex={0}>
          <table className={styles.table}>
            <caption className="sr-only">{K.listLabel}</caption>
            <thead>
              <tr>
                <th scope="col">{SHARED_WORDS.name}</th>
                <th scope="col">{K.colCreated}</th>
                <th scope="col">{K.colExpires}</th>
                <th scope="col">{K.colLastUsed}</th>
                <th scope="col">{SHARED_WORDS.status}</th>
                <th scope="col"><span className="sr-only">{SHARED_WORDS.actions}</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className={styles.name}>{r.name}</td>
                  <td>{fmtDhaka(r.createdAt)}</td>
                  <td>{fmtDhaka(r.expiresAt)}</td>
                  <td>{r.lastUsedAt ? fmtDhaka(r.lastUsedAt) : K.never}</td>
                  <td>{STATUS_WORD[r.status]}</td>
                  <td className={styles.actionCell}>
                    {r.status === "active" && (confirmFor === r.id ? (
                      <div className={styles.confirm} onKeyDown={(e: KeyboardEvent) => {
                        if (e.key === "Escape") { e.preventDefault(); closeConfirm(r.id); }
                      }}>
                        <p>{fill(K.confirm, { name: r.name })}</p>
                        <div className={styles.row}>
                          <Button id={confirmButtonId(r.id)} variant="destructive" size="sm" busy={revoking === r.id}
                            busyLabel={K.revoking}
                            onKeyDown={(e) => { if (e.key === "Enter" && e.repeat) e.preventDefault(); }}
                            onClick={() => void revoke(r)}>{K.revokeKey}</Button>
                          <Button variant="plain" size="sm" onClick={() => closeConfirm(r.id)}>{K.cancel}</Button>
                        </div>
                      </div>
                    ) : (
                      <Button id={revokeButtonId(r.id)} variant="destructive" size="sm" hidden={!ready}
                        onClick={() => openConfirm(r.id)}>
                        {K.revoke}<span className="sr-only">{fill(K.revokeSr, { name: r.name })}</span>
                      </Button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
