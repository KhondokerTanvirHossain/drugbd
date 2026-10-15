"use server";
import { redirect } from "next/navigation";
import { recordHref, signInHref } from "@/components/review/desk/hrefs";
import { decideStatus, diffRows, logAction, logOpen, runDecide, runDecideLogged, type DecideInput, type DecideResult } from "./desk-core";
import type { DiffRow } from "./review-types";

/*
 * Server actions of the review desk. Every export of a "use server" module is a callable endpoint, so this file exports
 * only these five. The checks live in desk-core (server-only); this module has no "server-only" import of its own, so
 * the desk island may import it (scripts/check-client-islands.mjs).
 */

/** The island's commit and report, sent when the undo window closes (§5.8.1) or when a report is sent (§5.10). */
export async function decide(input: DecideInput): Promise<DecideResult> {
  return runDecideLogged("action:decide", input);
}

const field = (fd: FormData, name: string) => {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
};

/**
 * §5.8.6, when the island did not load: the first POST (the button, or Enter) never saves; it redirects to a confirm
 * page that carries the version the reviewer submitted from. Only a second POST with commit=confirmed (or the island's
 * commit=deferred) saves, with the x, d and r values that page carried.
 */
export async function decideFormAction(formData: FormData): Promise<void> {
  const started = performance.now();   // one action:decide-form log line per POST (§5.15, §9.7)
  const batchId = field(formData, "batchId"), conceptId = field(formData, "conceptId");
  if (!batchId || !conceptId || batchId.length > 200 || conceptId.length > 200) {
    await logAction("action:decide-form", 400, started);
    redirect("/review");
  }
  const back = recordHref(batchId, conceptId);
  const x = field(formData, "extractedAt"), d = field(formData, "expectedLastDecisionId"), r = field(formData, "requestId");
  const confirmUrl = (e?: string) => `${back}?${new URLSearchParams({ confirm: conceptId, x, d, r, ...(e ? { e } : {}) })}`;
  const commit = field(formData, "commit");
  if (commit !== "confirmed" && commit !== "deferred") {
    await logAction("action:decide-form", 303, started);
    redirect(confirmUrl());
  }
  const result = await runDecide({ batchId, conceptId, decision: "ok", note: "", extractedAt: x || null,
    expectedLastDecisionId: /^[1-9][0-9]{0,14}$/.test(d) ? Number(d) : d === "" ? null : -1, requestId: r,
    turnstileToken: field(formData, "cf-turnstile-response") });
  await logAction("action:decide-form", decideStatus(result), started);
  if (result.ok) redirect(back);
  if (result.code === "unauthenticated") redirect(signInHref(back));
  redirect(confirmUrl(result.code));
}

export async function logRecordOpen(batchId: string, conceptId: string): Promise<void> {
  await logOpen("review_open", batchId, conceptId);
}

export async function logEvidence(batchId: string, conceptId: string): Promise<void> {
  await logOpen("evidence_open", batchId, conceptId);
}

export async function loadDiff(batchId: string, conceptId: string, from: string): Promise<DiffRow[] | null> {
  return diffRows(batchId, conceptId, from);
}
