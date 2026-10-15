/**
 * The app-wide 404 page (Review Focus 4, §4.4, §10.1). Next renders it, inside the root layout's skip link, header and
 * <main id="content">, for any path that matches no route, and the middleware sends an almost-right Learn chapter
 * ("/learn/Start") here too (lib/surface.ts isLearnMiss), so the chrome is in the server HTML. A page-level notFound()
 * also ends here, but only after hydration: Next 15 then serves a bare <html id="__next_error__">. The heading keeps
 * Next's own wording. /review/* has its own not-found.tsx.
 */
export default function NotFound() {
  return <h1>This page could not be found.</h1>;
}
