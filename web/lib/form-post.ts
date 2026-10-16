import "server-only";
import type { ActionResult } from "./actions-core";
import { requestId } from "./request-id";
import { logRequest } from "./request-log";
import { siteOrigin } from "./site";

const NO_STORE = "private, no-store";

/**
 * A public write form's native POST (§4.4 "Form POST, then reload", as /signout does): the Origin must be the site's
 * (CSRF; the session cookie is SameSite=Lax too), `run` makes every check in actions-core, the outcome is logged as its
 * `action:` line (status and request id, never a field, §9.7), and the answer is 303 to the page with the outcome code
 * and its #anchor. The browser follows that as a full navigation with or without JavaScript, so it keeps the fragment
 * and lands on the outcome line. A server action would answer with a soft navigation that drops the fragment and
 * unmounts the focused submit button, and the page has no island to announce the outcome (§10.2).
 */
export async function formPost<C extends string>(request: Request, action: string, run: (fd: FormData) => Promise<ActionResult<C>>,
    location: (fd: FormData, code: C) => string): Promise<Response> {
  if (request.headers.get("origin") !== siteOrigin()) {
    return new Response("Forbidden", { status: 403, headers: { "Cache-Control": NO_STORE } });
  }
  const fd = await request.formData().catch(() => new FormData());
  const started = performance.now();
  const { status, code } = await run(fd);
  logRequest({ route: action, method: "POST", status, ms: performance.now() - started, requestId: await requestId() });
  return new Response(null, { status: 303, headers: { Location: location(fd, code), "Cache-Control": NO_STORE } });
}
