import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

/*
 * The app-wide 404 page (Review Focus 4, §4.4, §10.1): Next renders it inside the root layout's chrome for unmatched
 * paths and for the middleware's /_not-found rewrite of an almost-right Learn chapter. e2e/learn.spec.ts checks the
 * server HTML without JavaScript.
 */
const file = fileURLToPath(new URL("../app/not-found.tsx", import.meta.url));

describe("app/not-found.tsx", () => {
  it("exists, so the 404 has an h1 of its own and not Next's default page", () => {
    expect(existsSync(file)).toBe(true);
  });

  it("is a server component with one h1 and no <main> of its own (the root layout supplies it)", async () => {
    const { default: NotFound } = await import("@/app/not-found");
    const html = renderToStaticMarkup(<NotFound />);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("<h1>This page could not be found.</h1>");
    expect(html).not.toContain("<main");
  });
});
