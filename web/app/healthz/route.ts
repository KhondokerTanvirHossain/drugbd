export const dynamic = "force-dynamic";

/** Liveness for the container healthcheck (§2.1, §12.4). middleware.ts never rate-limits it. */
export function GET(): Response {
  return new Response("ok", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
