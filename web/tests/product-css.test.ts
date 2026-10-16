import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// §10.4 / §11.4: no two-dimensional scrolling and no clipped text at 320 CSS px. Below 980 px the aside is
// 288 px wide at a 320 px viewport, and "Check {brand} with other medicines" is longer than that for any
// trade name of about 11 characters or more; .btn is nowrap + overflow:hidden, so the aside's primary link
// must be allowed to wrap.
const css = readFileSync(join(__dirname, "..", "components/public/product.module.css"), "utf8");

describe("product.module.css reflows the aside's primary link at 320 px (§10.4, WCAG 1.4.10)", () => {
  it(".s-aside > .btn wraps, centres and breaks a long word", () => {
    const m = css.match(/^\.s-aside > :global\(\.btn\)\s*\{([^}]*)\}/m);
    expect(m, ".s-aside > :global(.btn) rule").not.toBeNull();
    const body = m![1];
    expect(body).toMatch(/white-space:\s*normal/);
    expect(body).toMatch(/text-align:\s*center/);
    expect(body).toMatch(/line-height:\s*1\.3/);
    expect(body).toMatch(/padding-block:\s*8px/);
    expect(body).toMatch(/overflow-wrap:\s*anywhere/);
  });
});
