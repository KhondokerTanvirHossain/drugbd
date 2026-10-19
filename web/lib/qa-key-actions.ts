"use server";
import { createStatus, revokeStatus, runCreateQaKey, runRevokeQaKey } from "./qa-key-core";
import type { CreateQaKeyResult, RevokeQaKeyResult } from "./qa-key-types";
import { requestId } from "./request-id";
import { logRequest } from "./request-log";

/*
 * The server actions of /review/qa (spec §5.18, §7.10.5). Every export of a "use server" module is a callable endpoint, so
 * this file exports only these two. The checks live in qa-key-core (server-only); this module has no "server-only" import,
 * so the QaKeys island may import it (scripts/check-client-islands.mjs). Each writes one log line: the action name, status,
 * duration and web request id, never a form field, a key or a name (§9.7).
 */
export async function createQaKeyAction(formData: FormData): Promise<CreateQaKeyResult> {
  const started = performance.now();
  const result = await runCreateQaKey(formData);
  logRequest({ route: "action:qa-key-create", method: "POST", status: createStatus(result), ms: performance.now() - started,
    requestId: await requestId() });
  return result;
}

export async function revokeQaKeyAction(formData: FormData): Promise<RevokeQaKeyResult> {
  const started = performance.now();
  const result = await runRevokeQaKey(formData);
  logRequest({ route: "action:qa-key-revoke", method: "POST", status: revokeStatus(result), ms: performance.now() - started,
    requestId: await requestId() });
  return result;
}
