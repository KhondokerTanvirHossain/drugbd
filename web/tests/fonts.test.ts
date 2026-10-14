import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const path = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const FILES = ["public/fonts/onest-latin-wght-normal.woff2", "public/fonts/ibm-plex-mono-latin-400-normal.woff2",
  "public/fonts/ibm-plex-mono-latin-500-normal.woff2"];
const css = () => readFileSync(path("styles/fonts.css"), "utf8");
const faces = () => [...css().matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
const prop = (face: string, name: string) => face.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))?.[1].trim();

describe("self-hosted fonts (§3.2)", () => {
  it("ships WOFF2 files and both OFL licence texts", () => {
    for (const f of FILES) expect(readFileSync(path(f)).subarray(0, 4).toString("latin1")).toBe("wOF2");
    for (const f of ["public/fonts/OFL-Onest.txt", "public/fonts/OFL-IBM-Plex-Mono.txt"])
      expect(readFileSync(path(f), "utf8")).toContain("SIL Open Font License, Version 1.1");
  });

  it("keeps Onest variable plus Plex Mono 400 within the 90 KB font budget (§10.6)", () => {
    expect(statSync(path(FILES[0])).size + statSync(path(FILES[1])).size).toBeLessThanOrEqual(90 * 1024);
  });

  it("fonts.css holds only @font-face rules with the exact family names and font-display: swap", () => {
    expect(css().replace(/\/\*[\s\S]*?\*\//g, "").replace(/@font-face\s*\{[^}]*\}/g, "").trim()).toBe("");
    const all = faces().map((f) => [prop(f, "font-family"), prop(f, "font-weight"), prop(f, "font-display"), prop(f, "src")]);
    expect(all).toEqual([
      ['"Onest"', "400 700", "swap", 'url("/fonts/onest-latin-wght-normal.woff2") format("woff2")'],
      ['"IBM Plex Mono"', "400", "swap", 'url("/fonts/ibm-plex-mono-latin-400-normal.woff2") format("woff2")'],
      ['"IBM Plex Mono"', "500", "swap", 'url("/fonts/ibm-plex-mono-latin-500-normal.woff2") format("woff2")'],
    ]);
  });

  it("never loads Google Fonts", () => {
    expect(css()).not.toContain("fonts.googleapis.com");
    expect(readFileSync(path("app/layout.tsx"), "utf8")).not.toContain("fonts.googleapis.com");
  });
});
