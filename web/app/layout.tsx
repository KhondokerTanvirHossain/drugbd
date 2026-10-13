import "@/styles/tokens.css";
import "@/styles/fonts.css";
import { cookies } from "next/headers";
import Header from "@/components/Header";
import { ONEST_URL } from "@/lib/fonts";
import { getSession } from "@/lib/session";
import { THEME_COOKIE, htmlThemeAttr, parseTheme } from "@/lib/theme";
import styles from "./layout.module.css";

export const metadata = { title: "IntelliDrugs", robots: { index: false, follow: false } };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="en" data-theme={htmlThemeAttr(theme)}>
      <head>
        <link rel="preload" href={ONEST_URL} as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body>
        <a className={styles.skipLink} href="#content">Skip to content</a>
        <Header session={session} />
        <main id="content" className={styles.main}>{children}</main>
      </body>
    </html>
  );
}
