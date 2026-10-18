import { qaPath, qaUpstream } from "@/lib/api";
import { BDS_ID, fromUpstream, invalid, pageOf, pathIds, qaHandler, queryOf } from "@/lib/qa-api";
import { mapPairs } from "@/lib/qa-map";

export const dynamic = "force-dynamic";
const PATH = /^\/api\/qa\/v1\/substances\/([^/]+)\/pairs$/;

/**
 * §7.9.3: a substance's stored DDInter pairs, 50 a page, from the senior substance read (GET /v1/review/substances/{bdsId}
 * ?pairs=all) sent without X-Viewer-Email; review state and time only, never a note.
 */
export const GET = qaHandler("pairs", "/api/qa/v1/substances/[bdsId]/pairs", async (url) => {
  const p = pathIds(url, PATH, ["bdsId"]);
  if (!p.ok) return p.outcome;
  const [bdsId] = p.ids;
  if (!BDS_ID.test(bdsId)) return invalid("bdsId");
  const q = queryOf(url, ["page"]);
  if (!q.ok) return invalid(q.field);
  const page = pageOf(q.q.get("page"));
  if (page === null) return invalid("page");
  return fromUpstream(await qaUpstream(qaPath.pairs(bdsId, page)), ["bdsId"], (data) => mapPairs(data, bdsId, page));
});
