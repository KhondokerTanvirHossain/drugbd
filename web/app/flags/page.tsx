import legacy from "@/app/legacy.module.css";
import Turnstile from "@/components/Turnstile";
import { listFlags, type Flag } from "@/lib/api";
import { isReviewer } from "@/lib/reviewers";
import { flagReturnPath } from "@/lib/actions-core";
import { formatUtc } from "@/lib/format";
import { firstParam } from "@/lib/params";
import { resolveFlagAction } from "@/lib/review-actions";
import { cspNonce } from "@/lib/nonce";
import { getSession } from "@/lib/session";
export const dynamic = "force-dynamic";

/** Fixed messages for the resolve action's outcome codes; anything else in the URL is ignored. */
const RESOLVE_OUTCOME: Record<string, { text: string; ok: boolean }> = {
  resolved: { text: "The flag was resolved.", ok: true },
  forbidden: { text: "Only pharmacists and engineers can resolve flags.", ok: false },
  captcha: { text: "The verification check failed. Please try again.", ok: false },
  invalid: { text: "That flag is no longer open.", ok: false },
  failed: { text: "The flag could not be resolved. Please try again.", ok: false },
};

const FLAGGABLE = new Set(["product", "substance", "check"]);

function Target({ f }: { f: Flag }) {
  const label = `${f.targetType} ${f.targetId}`;
  return FLAGGABLE.has(f.targetType) ? <a href={flagReturnPath(f.targetType, f.targetId)}>{label}</a> : <>{label}</>;
}

/** Open flags, for pharmacists and engineers only. Shows no reporter emails (the API client drops them). */
export default async function FlagsPage({ searchParams }: { searchParams?: Promise<{ resolve?: string | string[] }> }) {
  const session = await getSession();
  const nonce = await cspNonce();
  if (!isReviewer(session)) {
    return (<><h1>Flags</h1><p role="alert">Only pharmacists and engineers can see flags.</p></>);
  }
  const outcome = RESOLVE_OUTCOME[firstParam((await searchParams)?.resolve)];
  const flags = await listFlags("open").catch(() => null);
  return (
    <>
      <h1>Open flags</h1>
      {outcome && <p role={outcome.ok ? "status" : "alert"}>{outcome.text}</p>}
      {flags === null && <p role="alert">The flag list is temporarily unavailable.</p>}
      {flags?.length === 0 && <p>No open flags.</p>}
      {flags && flags.length > 0 && (
        <ul>{flags.map((f) => (
          <li key={f.id}>
            <Target f={f} />{` · ${formatUtc(f.createdAt)}`}
            <p className={legacy.pre}>{f.message}</p>
            <form action={resolveFlagAction}>
              <input type="hidden" name="flagId" value={String(f.id)} />
              <Turnstile action="resolve" nonce={nonce} />
              <button type="submit">Resolve</button>
            </form>
          </li>))}</ul>)}
    </>
  );
}
