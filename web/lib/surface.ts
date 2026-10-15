/** Which surface a path belongs to, and the routing rules of spec §2.3. Pure; used by the middleware and the root layout. */

export function isReviewSurface(pathname: string): boolean {
  return pathname === "/review" || pathname.startsWith("/review/");
}

const BATCH = /^\/batches\/([^/]+)\/?$/;

/** §2.3 (308): /batches → /review, /batches/{id}[?item={c}] → /review/{id}[/{c}] (outcome query dropped), /flags → /review/flags. */
export function legacyRedirect(url: URL): string | null {
  const path = url.pathname;
  if (path === "/batches" || path === "/batches/") return "/review";
  if (path === "/flags" || path === "/flags/") return "/review/flags";
  const m = BATCH.exec(path);
  if (!m) return null;
  const item = url.searchParams.get("item");
  return item ? `/review/${m[1]}/${encodeURIComponent(item)}` : `/review/${m[1]}`;
}

const VERSIONS = /^\/review\/[^/]+\/versions$/;

/**
 * §2.3: anonymous access to any /review page redirects (307) to sign-in with the full return path. POSTs (server actions)
 * answer `unauthenticated` themselves, and the versions route answers 401, so the desk can show the signed-out block.
 */
export function reviewGate(pathname: string, search: string, method: string, signedIn: boolean): string | null {
  if (signedIn || !isReviewSurface(pathname) || VERSIONS.test(pathname)) return null;
  if (method !== "GET" && method !== "HEAD") return null;
  return `/signin?${new URLSearchParams({ returnTo: pathname + search })}`;
}
