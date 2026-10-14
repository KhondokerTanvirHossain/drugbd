"use server";
import { redirect } from "next/navigation";
import { batchPath, flagReturnPath, submitFlag, submitResolve, submitReview } from "./actions-core";
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
 * Server actions behind the plain <form>s on batch, product, substance, check and /flags pages. They work without
 * client JS. Next.js checks the Origin header on every action call (CSRF), the session cookie is SameSite=Lax, and
 * every check lives in actions-core. Each action ends in a redirect back to the page with an outcome code that the
 * page maps to a fixed message (never echoed input). Only these three functions are exported: every export of a
 * "use server" module is a callable endpoint.
 */

export async function reviewAction(formData: FormData): Promise<void> {
  const { code } = await logged("action:review", () => submitReview(formData));
  const batchId = formData.get("batchId"), conceptId = formData.get("conceptId");
  if (typeof batchId !== "string" || !batchId) redirect("/batches");
  const item = typeof conceptId === "string" ? conceptId : "";
  const query = new URLSearchParams({ review: code, item });
  redirect(`${batchPath(batchId)}?${query}${item ? `#${encodeURIComponent(item)}` : ""}`);
}

export async function flagAction(formData: FormData): Promise<void> {
  const { code } = await logged("action:flag", () => submitFlag(formData));
  const path = flagReturnPath(String(formData.get("targetType") ?? ""), String(formData.get("targetId") ?? ""));
  redirect(`${path}${path.includes("?") ? "&" : "?"}flag=${code}#flag`);
}

export async function resolveFlagAction(formData: FormData): Promise<void> {
  const { code } = await logged("action:resolve", () => submitResolve(formData));
  const kind = formData.get("kind") === "partner" ? "partner" : "reports";
  redirect(`/review/flags?${new URLSearchParams({ resolve: code, kind })}`);
}
