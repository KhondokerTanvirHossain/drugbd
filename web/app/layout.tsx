import "@/styles/tokens.css";
import "@/styles/fonts.css";
import { cookies, headers } from "next/headers";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { newestInReview } from "@/components/review/ReviewAccount";
import { listReviewBatches } from "@/lib/api";
import { ONEST_URL } from "@/lib/fonts";
import { isReviewer } from "@/lib/reviewers";
import { getSession } from "@/lib/session";
import { isLearnSurface, isReviewSurface } from "@/lib/surface";
import { THEME_COOKIE, htmlThemeAttr, parseTheme } from "@/lib/theme";
import styles from "./layout.module.css";

// Only the default component and `metadata` are exported: Next.js 15 fails `next build` on any other layout export
// ("… is not a valid Layout export field"), so ONEST_URL comes from `@/lib/fonts` (P1A Task 2). P1A's
// layout.test.tsx pins `Object.keys(layout)` to ["default", "metadata"].
export const metadata = { title: "IntelliDrugs", robots: { index: false, follow: false } };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  // /review/* and the Learn chapters bring their own toolbar, skip links and <main> (spec §5.1, §5.16, §6.8).
  const path = (await headers()).get("x-pathname") ?? "";
  const ownShell = isReviewSurface(path) || isLearnSurface(path);
  const session = ownShell ? null : await getSession();
  // The account menu names the newest batch in review (§6.2); a failed read only leaves the name out.
  const batchId = isReviewer(session) ? newestInReview(await listReviewBatches().catch(() => [])) : null;
  return (
    <html lang="en" data-theme={htmlThemeAttr(theme)}>
      <head>
        {/* Low priority: the preload must not take bandwidth from the render-blocking CSS on Slow 4G (at default
            priority Learn's LCP was 2505–2512 ms, §10.6). With font-display: optional a late Onest only means the
            fallback font on that first view; later views use the cached font (§3.2, PO 16/10/2026). */}
        <link rel="preload" href={ONEST_URL} as="font" type="font/woff2" crossOrigin="" fetchPriority="low" />
      </head>
      <body>
        {ownShell ? children : (
          <>
            <a className={styles.skipLink} href="#content">Skip to content</a>
            <Header session={session} theme={theme} batchId={batchId} />
            <main id="content" className={styles.main}>{children}</main>
            <Footer theme={theme} />
          </>
        )}
      </body>
    </html>
  );
}
