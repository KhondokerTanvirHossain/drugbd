"use server";
import { redirect } from "next/navigation";
import { submitPartnerRequest } from "./actions-core";
import { requestId } from "./request-id";
import { logRequest } from "./request-log";

/** §6.9. The only export: every export of a "use server" module is a callable endpoint. Logs the outcome, never a field (§9.7). */
export async function partnerRequestAction(formData: FormData): Promise<void> {
  const started = performance.now();
  const { status, code } = await submitPartnerRequest(formData);
  logRequest({ route: "action:partner", method: "POST", status, ms: performance.now() - started, requestId: await requestId() });
  redirect(`/partners?${new URLSearchParams({ partner: code })}#request`);
}
