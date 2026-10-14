import "server-only";
import { headers } from "next/headers";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The middleware's per-request id (§9.4), for logs and audit rows; a fresh UUID outside a request. */
export async function requestId(): Promise<string> {
  try {
    const id = (await headers()).get("x-request-id");
    if (id && UUID.test(id)) return id;
  } catch {
    // outside a request scope
  }
  return crypto.randomUUID();
}
