import "server-only";
import { headers } from "next/headers";

/** The per-request CSP nonce set by the middleware (§9.4); undefined outside a request (tests, build). */
export async function cspNonce(): Promise<string | undefined> {
  try {
    return (await headers()).get("x-nonce") ?? undefined;
  } catch {
    return undefined;
  }
}
