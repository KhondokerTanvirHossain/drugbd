import { NextResponse } from "next/server";
import { suggestProducts } from "@/lib/api";
import { listParam } from "@/lib/params";
import { CHECK_MAX, isPathId, parseQuery } from "@/lib/public-params";
import { withRequestLog } from "@/lib/request-log";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

/** §4.3: at most 10 rows, q of 2 or more characters, approved products' clinical names only. Rate-limited in the middleware. */
async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const { q, problem } = parseQuery(url.searchParams.get("q") ?? undefined);   // controls read as spaces (final review finding 2)
  if (problem) return NextResponse.json([], { headers: NO_STORE });
  const ids = listParam(url.searchParams.getAll("ids")).filter(isPathId).slice(0, CHECK_MAX);
  const r = await suggestProducts(q, ids).catch(() => ({ ok: false as const, status: 0 }));
  if (!r.ok) return NextResponse.json([], { status: 502, headers: NO_STORE });
  return NextResponse.json(r.data.slice(0, 10).map((x) => ({ conceptId: x.conceptId, tradeName: x.tradeName, status: x.status,
    clinicalDisplayName: x.status === "approved" ? x.clinicalDisplayName : null, matched: x.status === "approved" ? x.matched : null })),
    { headers: NO_STORE });
}

export const GET = withRequestLog("/check/suggest", handle);
