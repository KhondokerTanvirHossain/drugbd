import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/theme-actions", () => ({ setThemeAction: vi.fn() }));
import Footer from "@/components/Footer";

describe("Footer (§6.1)", () => {
  const html = renderToStaticMarkup(<Footer theme="system" />);
  it("has the line, the five links, the sources with their open licence markers, the legal line and the theme control", () => {
    expect(html).toContain("A drug knowledge base for Bangladesh. Decision support, not a substitute for clinical judgement.");
    for (const [href, label] of [["/search", "Medicines"], ["/check", "Interaction checker"], ["/learn", "Learn"], ["/partners", "For partners"], ["/privacy", "Privacy"]])
      expect(html).toContain(`<a href="${href}">${label}</a>`);
    expect(html).toContain("<b>RxNav and RxNorm</b>. This product uses publicly available data from the U.S. National Library of Medicine (NLM). NLM is not responsible for the product and does not endorse it.");
    expect(html).toContain('<span class="example">Licence line to confirm</span>');
    expect(html).toContain('<span class="example">Licence lines to confirm</span>');
    expect(html).toContain("<span>drugdb.eliooo.org</span><span>Severity levels and management text are DDInter 2.0&#x27;s, shown truncated, never rewritten.</span>");
    expect(html).toContain('aria-label="Colour theme"');
  });
});
