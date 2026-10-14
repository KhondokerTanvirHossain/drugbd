import { describe, expect, it } from "vitest";
import { GET } from "@/app/healthz/route";
import robots from "@/app/robots";

describe("/healthz (§2.1)", () => {
  it("answers 200 ok as uncached plain text", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("robots.txt (§9.2)", () => {
  it("disallows everything while the site is in pilot", () => {
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });
});
