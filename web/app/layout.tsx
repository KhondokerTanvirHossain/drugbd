import Header from "@/components/Header";
import { getSession } from "@/lib/session";

export const metadata = { title: "BDDrug KB preview", robots: { index: false, follow: false } };
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: 960, margin: "0 auto", padding: 16 }}>
        <Header session={session} />
        <main>{children}</main>
      </body>
    </html>
  );
}
