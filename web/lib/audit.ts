import "server-only";
import { postAuditEvent } from "./api";
import { requestId } from "./request-id";
import type { Role } from "./reviewers";

export type WebAuditEvent = "sign_in" | "sign_in_denied" | "sign_out" | "review_open" | "evidence_open" | "decision_denied" | "senior_open";
export type AuditInput = {
  event: WebAuditEvent; outcome: string; actorEmail?: string | null; actorRole?: Role | null;
  targetType?: "batch_item" | "flag" | "substance" | "pair_queue" | null; targetId?: string | null;
};

/**
 * Writes one §5.15 audit row through the API. Best effort: it never throws and returns false on failure, so an
 * audit outage never blocks sign-in or sign-out. The failure log names the event, status and request id only.
 */
export async function recordAudit(e: AuditInput): Promise<boolean> {
  const rid = await requestId();
  const r = await postAuditEvent({
    event: e.event, actorEmail: e.actorEmail ?? null, actorRole: e.actorRole ?? null,
    targetType: e.targetType ?? null, targetId: e.targetId ?? null, outcome: e.outcome, requestId: rid,
  });
  if (!r.ok) console.error(`audit write failed: event=${e.event} status=${r.status} requestId=${rid}`);
  return r.ok;
}
