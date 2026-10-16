"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import Banner from "@/components/ui/Banner";
import Button from "@/components/ui/Button";
import { announce } from "@/lib/live-region";
import { PAGE_ERROR } from "@/lib/page-error-copy";
import layout from "./layout.module.css";

/** A Learn chapter path (lib/surface.ts isLearnSurface without the chapter list, which this every-route island must not ship). */
const LEARN_CHAPTER = /^\/learn\/[^/]+$/;

/**
 * Island (§4.2 ErrorBoundary): the public pages throw on an API 5xx or timeout (/search, /products/[id], /substances/[id]).
 * Inside the root layout, so the skip link, header and <main id="content"> stay (§10.1); a Learn chapter brings its own
 * shell, so here the boundary brings the skip link and <main>. A crit Banner whose title is the page's one h1 (§10.5) says
 * nothing was changed (§3.5); Try again calls reset(). §10.2: the page's one polite region announces the title.
 * It imports PAGE_ERROR, not lib/copy.ts: this boundary loads with every route (§10.6).
 */
export default function PublicError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const ownShell = LEARN_CHAPTER.test(usePathname() ?? "");
  const live = useRef<HTMLDivElement>(null);
  useEffect(() => announce(live.current, PAGE_ERROR.title), []);
  const body = (
    <>
      <div ref={live} className="sr-only" aria-live="polite" aria-atomic="true" />
      <Banner tone="crit" titleAs="h1" title={PAGE_ERROR.title} body={PAGE_ERROR.body}
        action={<Button variant="tonal" size="sm" onClick={reset}>{PAGE_ERROR.tryAgain}</Button>} />
    </>
  );
  if (!ownShell) return body;
  return (
    <>
      <a className={layout.skipLink} href="#content">Skip to content</a>
      <main id="content" className={layout.main}>{body}</main>
    </>
  );
}
