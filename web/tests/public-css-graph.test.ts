import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * §10.6 CSS budget (gzip ≤ 20 KB on the public pages). Next merges every CSS module that two or more routes share into
 * one chunk, so a single value import of a review, desk or Learn module from the root layout or a public page (even of
 * a plain function that lives beside a stylesheet import) loads that whole merged chunk on every public page. This walks
 * the static value imports (type-only imports never reach the bundle) and names the CSS modules each entry reaches.
 */
const WEB = fileURLToPath(new URL("..", import.meta.url));
const IMPORT = /\bimport\s+(type\s+)?(?:[^'"()]*?\sfrom\s+)?["']([^"']+)["']|\bexport\s+(type\s+)?[^'";]*?\sfrom\s+["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g;

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(WEB, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")])
    if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}

/** Every CSS module reachable from `entry` through value imports, as web-relative paths. */
function cssModulesFrom(entry: string): string[] {
  const seen = new Set<string>([join(WEB, entry)]);
  const queue = [...seen];
  const css = new Set<string>();
  while (queue.length) {
    const file = queue.shift()!;
    if (file.endsWith(".css")) { if (file.endsWith(".module.css")) css.add(relative(WEB, file)); continue; }
    for (const m of readFileSync(file, "utf8").matchAll(IMPORT)) {
      if (m[1] || m[3]) continue;
      const target = resolveImport(file, m[2] ?? m[4] ?? m[5]);
      if (target && !seen.has(target)) { seen.add(target); queue.push(target); }
    }
  }
  return [...css].sort();
}

const NOT_PUBLIC = /^(app\/review\/|app\/learn\/|components\/review\/|components\/learn\/)/;

describe("public CSS stays within §10.6: no review, desk or Learn stylesheet reaches a public page", () => {
  it("the root layout reaches only its own chrome's CSS modules", () => {
    expect(cssModulesFrom("app/layout.tsx")).toEqual([
      "app/layout.module.css",
      "components/AccountMenu.module.css",
      "components/Footer.module.css",
      "components/Header.module.css",
      "components/ui/Button.module.css",
      "components/ui/Wordmark.module.css",
    ]);
  });

  it.each(["app/page.tsx", "app/search/page.tsx", "app/products/[id]/page.tsx", "app/substances/[id]/page.tsx", "app/check/page.tsx"])(
    "%s reaches no review, desk or Learn CSS module", (page) => {
      expect(cssModulesFrom(page).filter((f) => NOT_PUBLIC.test(f))).toEqual([]);
    });

  it("Next's CSS chunk merging is off, so a route loads only the CSS modules it reaches (§10.6)", () => {
    // `cssChunking: true` (Next 15's default) and "strict" merge modules of unrelated routes until a chunk reaches 30 KB,
    // which put the Learn, desk and review CSS (10 KB gzip) on every public page (Task 40 Lighthouse run).
    expect(readFileSync(join(WEB, "next.config.ts"), "utf8")).toMatch(/experimental:\s*\{\s*cssChunking:\s*false\s*\}/);
  });
});
