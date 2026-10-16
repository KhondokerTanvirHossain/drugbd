"use server";
import { redirect } from "next/navigation";
import { submitResolve } from "./actions-core";
import { requestId } from "./request-id";
import { logRequest } from "./request-log";

/** §5.15 log line for a server action: its name, status and duration, never its form fields. Not exported. */
async function logged<T extends { status: number }>(route: string, run: () => Promise<T>): Promise<T> {
  const started = performance.now();
  const result = await run();
  logRequest({ route, method: "POST", status: result.status, ms: performance.now() - started, requestId: await requestId() });
  return result;
}

/*
 * The server action behind the plain resolve <form> on /review/flags. It works without client JS. Next.js checks the
 * Origin header on every action call (CSRF), the session cookie is SameSite=Lax, and every check lives in actions-core.
 * It ends in a redirect back to the page with an outcome code that the page maps to a fixed message (never echoed
 * input). It is the only export: every export of a "use server" module is a callable endpoint. The public "Report a
 * problem" form posts natively to app/flag/route.ts instead, so the browser keeps its #flag fragment (lib/form-post.ts).
 */

export async function resolveFlagAction(formData: FormData): Promise<void> {
  const { code } = await logged("action:resolve", () => submitResolve(formData));
  const kind = formData.get("kind") === "partner" ? "partner" : "reports";
  redirect(`/review/flags?${new URLSearchParams({ resolve: code, kind })}`);
}
