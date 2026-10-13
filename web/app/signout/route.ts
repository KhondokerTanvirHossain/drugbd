import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { safeReturnTo } from "@/lib/return-to";
import { LEGACY_SESSION_COOKIE, getSession, sessionCookieName, sessionCookieOptions } from "@/lib/session";
import { siteOrigin } from "@/lib/site";

export const dynamic = "force-dynamic";
const NO_STORE = "private, no-store";

/**
 * The only sign-out (§9.6). A route handler, so it can send Clear-Site-Data: "storage" (which drops sessionStorage
 * note drafts and leaves cookies alone). Requires Origin = https://SITE_HOST; rate-limited in middleware.ts.
 */
export async function POST(request: Request) {
  const origin = siteOrigin();
  if (request.headers.get("origin") !== origin) {
    return new NextResponse("Forbidden", { status: 403, headers: { "Cache-Control": NO_STORE } });
  }
  const form = await request.formData().catch(() => null);
  const raw = form?.get("returnTo");
  const returnTo = typeof raw === "string" ? safeReturnTo(raw, origin) : null;

  const session = await getSession();
  if (session) {
    await recordAudit({ event: "sign_out", actorEmail: session.email, actorRole: session.role, outcome: "ok" }).catch(() => false);
  }

  const res = new NextResponse(null, {
    status: 303,
    headers: {
      Location: returnTo ? `/signin?returnTo=${encodeURIComponent(returnTo)}` : "/",
      "Clear-Site-Data": '"storage"',
      "Cache-Control": NO_STORE,
    },
  });
  res.cookies.set(sessionCookieName(), "", { ...sessionCookieOptions(), maxAge: 0 });
  res.cookies.set(LEGACY_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
