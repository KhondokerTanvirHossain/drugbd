/** Which surface a path belongs to, and the routing rules of spec §2.3. Pure; used by the middleware and the root layout. */
import { CHAPTER_SLUGS } from "@/content/learn/chapters";

export function isReviewSurface(pathname: string): boolean {
  return pathname === "/review" || pathname.startsWith("/review/");
}

const LEARN = /^\/learn\/([^/]+)$/;

/**
 * A Learn chapter page (§2.1): it brings its own toolbar, skip link and <main> (§6.8). /learn itself only redirects.
 * The layout must decide exactly as the page does, or a chapter renders inside the site chrome (two <main>, two skip
 * links). Next decodes the [chapter] param from the raw segment, so this decodes only the slug segment of the raw path
 * and checks it against the ten exact slugs: '/learn/st%61rt' is chapter 1, while '/learn/start%2Fx' (one segment that
 * decodes to a slash) and a malformed escape are not chapters. The whole path is never decoded: '/learn%2Fstart' is one
 * segment to Next and a 404, which must keep the site chrome.
 */
export function isLearnSurface(pathname: string): boolean {
  const m = LEARN.exec(pathname);
  if (!m) return false;
  let slug: string;
  try {
    slug = decodeURIComponent(m[1]);
  } catch {
    return false;
  }
  return (CHAPTER_SLUGS as readonly string[]).includes(slug);
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
