import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findLeaks, needlesFrom, TEST_TOKEN_VALUES } from "../scripts/check-client-bundle.mjs";

const tree = (files: Record<string, string>) => {
  const dir = mkdtempSync(join(tmpdir(), "bundle-scan-"));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  return dir;
};

describe("client bundle scan (runs after every next build)", () => {
  it("looks for the secret env names, their current values and the test token values", () => {
    const needles: string[] = needlesFrom({ INTERNAL_API_TOKEN: "prod-token-value-0123456789abcdef0123", SESSION_SECRET: "" });
    expect(needles).toEqual(expect.arrayContaining(["INTERNAL_API_TOKEN", "SESSION_SECRET", "TURNSTILE_SECRET_KEY",
      "prod-token-value-0123456789abcdef0123", ...TEST_TOKEN_VALUES]));
    expect(needles).not.toContain("");
    expect(TEST_TOKEN_VALUES).toContain("test-internal-token-0123456789abcdef");
  });

  it("finds a leaked token name or value in any static chunk, and nothing in a clean tree", () => {
    const needles: string[] = needlesFrom({});
    expect(findLeaks(tree({ "chunks/a.js": "console.log(1)", "css/b.css": "body{}" }), needles)).toEqual([]);
    const leaky = tree({ "chunks/app/page-1.js": 'headers:{"X-Internal-Token":process.env.INTERNAL_API_TOKEN}',
      "chunks/c.js": 'x="test-internal-token-0123456789abcdef"' });
    expect(findLeaks(leaky, needles)).toEqual([
      { file: join("chunks", "app", "page-1.js"), needle: "INTERNAL_API_TOKEN" },
      { file: join("chunks", "c.js"), needle: "test-internal-token-0123456789abcdef" },
    ]);
  });

  it("fails loudly when the static directory is missing (no build to check)", () => {
    expect(() => findLeaks(join(tmpdir(), "does-not-exist-bundle-scan"), ["X"])).toThrow(/not found/);
  });
});
