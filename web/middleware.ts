import { NextResponse, type NextRequest } from "next/server";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";

// 10 requests/s per client with a burst of 30 (Global Constraints: rate-limited public traffic).
const limiter = createRateLimiter({ ratePerSecond: 10, burst: 30 });

export function middleware(request: NextRequest) {
  if (!limiter.allow(clientIp(request.headers))) {
    return new NextResponse("Too many requests. Please slow down.", {
      status: 429,
      headers: { "Retry-After": "1", "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return NextResponse.next();
}

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
