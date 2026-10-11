export const metadata = { title: "BDDrug KB preview", robots: { index: false, follow: false } };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: 960, margin: "0 auto", padding: 16 }}>
        <header><a href="/"><strong>BDDrug KB</strong></a> <a href="/batches">Batches</a> <a href="/check">Check</a> <small>preview: data may be incomplete</small></header>
        <main>{children}</main>
      </body>
    </html>
  );
}
