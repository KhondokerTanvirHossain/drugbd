import { NextResponse, type NextRequest } from "next/server";
import { TOO_MANY_REQUESTS } from "@/lib/copy";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { nextWithSecurityHeaders } from "@/lib/security-headers";

// 10 requests/s per client with a burst of 30 (§9.3).
const limiter = createRateLimiter({ ratePerSecond: 10, burst: 30 });

export function middleware(request: NextRequest) {
  if (!limiter.allow(clientIp(request.headers))) {
    return new NextResponse(TOO_MANY_REQUESTS, {
      status: 429,
      headers: { "Retry-After": "1", "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
    });
  }
  return nextWithSecurityHeaders(request);
}

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/).*)"],
};
