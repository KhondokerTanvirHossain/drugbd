import "@/styles/tokens.css";
import "@/styles/fonts.css";
import { cookies, headers } from "next/headers";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { ONEST_URL } from "@/lib/fonts";
import { getSession } from "@/lib/session";
import { isReviewSurface } from "@/lib/surface";
import { THEME_COOKIE, htmlThemeAttr, parseTheme } from "@/lib/theme";
import styles from "./layout.module.css";

// Only the default component and `metadata` are exported: Next.js 15 fails `next build` on any other layout export
// ("… is not a valid Layout export field"), so ONEST_URL comes from `@/lib/fonts` (P1A Task 2). P1A's
// layout.test.tsx pins `Object.keys(layout)` to ["default", "metadata"].
export const metadata = { title: "IntelliDrugs", robots: { index: false, follow: false } };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  // /review/* brings its own toolbar, skip links and <main> (spec §5.1, §5.16).
  const review = isReviewSurface((await headers()).get("x-pathname") ?? "");
  const session = review ? null : await getSession();
  return (
    <html lang="en" data-theme={htmlThemeAttr(theme)}>
      <head>
        <link rel="preload" href={ONEST_URL} as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body>
        {review ? children : (
          <>
            <a className={styles.skipLink} href="#content">Skip to content</a>
            <Header session={session} theme={theme} />
            <main id="content" className={styles.main}>{children}</main>
            <Footer theme={theme} />
          </>
        )}
      </body>
    </html>
  );
}
