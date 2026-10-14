import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

type Rgb = [number, number, number];
const hex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
const channel = (c: number) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const luminance = ([r, g, b]: Rgb) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const ratio = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The body of the first rule that starts with `opener` (no nested braces in these rules). */
function block(css: string, opener: string): string {
  const start = css.indexOf(opener);
  if (start < 0) throw new Error(`${opener} not found`);
  const open = css.indexOf("{", start + opener.length - 1);
  return css.slice(open + 1, css.indexOf("}", open));
}
function tokens(body: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const [, name, value] of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6}|rgba\([^)]*\))/g)) m.set(name, value);
  return m;
}
/** Material (rgba) composited over an opaque ground, rounded per channel as Board DS does. */
function composite(rgba: string, under: Rgb): Rgb {
  const [r, g, b, a] = rgba.slice(5, -1).split(",").map(Number);
  return [r, g, b].map((c, i) => Math.round(c * a + under[i] * (1 - a))) as Rgb;
}

// Board DS "Colour tokens and contrast": 9 text tokens on 14 grounds = 126 pairs per theme.
const TEXT = ["fg", "fg-2", "fg-3", "accent", "crit", "warn", "ok", "info", "nodata"];
const GROUNDS = ["bg", "canvas", "surface", "surface-2", "surface-3", "accent-soft", "crit-soft", "warn-soft", "ok-soft",
  "info-soft", "nodata-soft", "nodata-hatch"];

function contrast(t: Map<string, string>) {
  const c = (n: string) => {
    const v = t.get(n);
    if (!v) throw new Error(`--${n} missing`);
    return hex(v);
  };
  const grounds = [...GROUNDS.map(c), composite(t.get("material")!, c("canvas")), composite(t.get("material")!, c("surface-3"))];
  const pairs = TEXT.flatMap((n) => grounds.map((g) => ratio(c(n), g)));
  const boundary = Math.min(...grounds.map((g) => ratio(c("line-ctl"), g)));
  return { pairs, boundary };
}

const web = read("../styles/tokens.css");
const docs = read("../../docs/design/intellidrugs/tokens.css");

describe("tokens.css", () => {
  it("is a byte-identical copy of docs/design/intellidrugs/tokens.css (SHA-256)", () => {
    expect(sha(web)).toBe(sha(docs));
  });

  it("light theme: 126 of 126 text pairs pass 4.5:1, lowest 4.69; lowest control boundary 3.33", () => {
    const light = tokens(block(web, ":root{"));
    const { pairs, boundary } = contrast(light);
    expect(pairs).toHaveLength(126);
    expect(pairs.filter((r) => r >= 4.5)).toHaveLength(126);
    expect(round2(Math.min(...pairs))).toBe(4.69);
    expect(round2(boundary)).toBe(3.33);
  });

  it("dark theme: 126 of 126 text pairs pass 4.5:1, lowest 5.18; lowest control boundary 3.20", () => {
    const light = tokens(block(web, ":root{"));
    const dark = new Map([...light, ...tokens(block(web, ':root[data-theme="dark"]{'))]);
    const { pairs, boundary } = contrast(dark);
    expect(pairs).toHaveLength(126);
    expect(pairs.filter((r) => r >= 4.5)).toHaveLength(126);
    expect(round2(Math.min(...pairs))).toBe(5.18);
    expect(round2(boundary)).toBe(3.2);
  });

  it("the system-dark block and the data-theme=dark block hold the same values", () => {
    expect(tokens(block(web, ':root:not([data-theme="light"]){'))).toEqual(tokens(block(web, ':root[data-theme="dark"]{')));
  });
});
