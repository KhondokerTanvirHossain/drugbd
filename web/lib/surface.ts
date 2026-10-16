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

/**
 * A one-segment /learn/{x} that is not a chapter ("/learn/Start", "/learn/start.html"): a 404 (Review Focus 4). The
 * middleware sends it to Next's own /_not-found page, because a page-level notFound() aborts Next 15's server-rendered
 * shell and answers with a bare <html id="__next_error__"> whose chrome appears only after hydration (§4.4, §10.1).
 * Two or more segments already match no route and get the same page from Next.
 */
export function isLearnMiss(pathname: string): boolean {
  return LEARN.test(pathname) && !isLearnSurface(pathname);
}

const BATCH = /^\/batches\/([^/]+)\/?$/;

/** §2.3 (308): /?q= → /search, /batches → /review, /batches/{id}[?item={c}] → /review/{id}[/{c}] (outcome query dropped), /flags → /review/flags. */
export function legacyRedirect(url: URL): string | null {
  const path = url.pathname;
  // §2.3: /?q=X&page=N → /search?q=X&page=N (308); only q and page are carried.
  if (path === "/" && url.searchParams.has("q")) {
    const out = new URLSearchParams({ q: url.searchParams.get("q") ?? "" });
    const page = url.searchParams.get("page");
    if (page !== null) out.set("page", page);
    return `/search?${out}`;
  }
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
