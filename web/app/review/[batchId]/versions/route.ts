import { NextResponse } from "next/server";
import { getReviewVersions } from "@/lib/api";
import { withRequestLog } from "@/lib/request-log";
import { isReviewer } from "@/lib/reviewers";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };
const error = (code: string, status: number) => NextResponse.json({ errors: [{ code }] }, { status, headers: NO_STORE });
const PATH = /^\/review\/([^/]+)\/versions\/?$/;

/** The [batchId] segment, decoded; null when the path is not this route or its encoding is malformed. */
function batchIdOf(request: Request): string | null {
  const m = PATH.exec(new URL(request.url).pathname);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

/** Version tokens for stale detection (§5.11): reviewers only, the four fields of each current item, nothing else (§4.3). */
async function handle(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return error("UNAUTHORIZED", 401);
  if (!isReviewer(session)) return error("FORBIDDEN", 403);
  const batchId = batchIdOf(request);
  if (batchId === null) return error("NOT_FOUND", 404);
  try {
    const rows = await getReviewVersions(batchId);
    if (rows === null) return error("NOT_FOUND", 404);
    return NextResponse.json(rows.map((r) => ({ conceptId: r.conceptId, extractedAt: r.extractedAt, lastDecisionId: r.lastDecisionId,
      displayStatus: r.displayStatus })), { headers: NO_STORE });
  } catch {
    return error("UNAVAILABLE", 502);
  }
}

// P1A Task 25: every route handler logs one line (route template, method, status, duration, request id).
export const GET = withRequestLog("/review/[batchId]/versions", handle);
