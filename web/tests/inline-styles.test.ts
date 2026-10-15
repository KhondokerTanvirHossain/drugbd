import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const WEB = fileURLToPath(new URL("..", import.meta.url));
function* tsx(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* tsx(p);
    else if (name.endsWith(".tsx")) yield relative(WEB, p).split("\\").join("/");
  }
}

describe("§3.1 inline styles", () => {
  /** The only two inline custom properties §3.1 allows: a measured value (--w on meters) and --dur-commit (desk toast). */
  const bad = /style=\{(?!\{\s*["']--(w|dur-commit)["']\s*:)/;

  it("only --w and --dur-commit are set inline (style={{ \"--w\": … }})", () => {
    const files = ["app", "components", "content"].filter((d) => existsSync(join(WEB, d))).flatMap((d) => [...tsx(join(WEB, d))]);
    expect(files.filter((f) => bad.test(readFileSync(join(WEB, f), "utf8")))).toEqual([]);
  });

  it("the guard refuses any other custom property and any style object", () => {
    for (const src of ['style={{ "--wm-size": "20px" }}', "style={{ color: \"red\" }}", "style={box}", 'style={{ "--width": "1px" }}'])
      expect(bad.test(src)).toBe(true);
    for (const src of ['style={{ "--w": pct(1, 2) } as CSSProperties}', 'style={{ "--dur-commit": `${n}ms` } as CSSProperties}'])
      expect(bad.test(src)).toBe(false);
  });
});
