import { describe, expect, it } from "vitest";
import { CHAPTER_SLUGS } from "@/content/learn/chapters";
import { isLearnMiss, isLearnSurface, isReviewSurface, legacyRedirect, reviewGate } from "@/lib/surface";

const u = (path: string) => new URL(`http://localhost${path}`);

describe("redirects from the current routes (§2.3)", () => {
  it.each([
    ["/batches", "/review"],
    ["/batches/", "/review"],
    ["/batches/0001-pilot", "/review/0001-pilot"],
    ["/batches/0001-pilot?review=saved&item=186-0030-006--napa", "/review/0001-pilot/186-0030-006--napa"],
    ["/batches/0001%20pilot?item=a%2Fb", "/review/0001%20pilot/a%2Fb"],
    ["/batches/0001-pilot?review=stale", "/review/0001-pilot"],
    ["/flags", "/review/flags"],
    ["/flags?resolve=resolved", "/review/flags"],
    ["/?q=napa", "/search?q=napa"],
    ["/?q=napa&page=2", "/search?q=napa&page=2"],
    ["/?q=a%20b&page=1&utm=x", "/search?q=a+b&page=1"],
  ])("%s → %s", (from, to) => expect(legacyRedirect(u(from))).toBe(to));

  it.each(["/", "/batchesx", "/batches/a/b", "/flagsx", "/review", "/products/x"])("%s is not redirected", (p) => {
    expect(legacyRedirect(u(p))).toBeNull();
  });
});

describe("the anonymous gate (§2.3)", () => {
  it("sends an anonymous GET or HEAD of any /review page to sign-in, with the full return path", () => {
    expect(reviewGate("/review", "", "GET", false)).toBe("/signin?returnTo=%2Freview");
    expect(reviewGate("/review/0001-pilot/napa", "?show=needs&q=a", "HEAD", false))
      .toBe("/signin?returnTo=%2Freview%2F0001-pilot%2Fnapa%3Fshow%3Dneeds%26q%3Da");
  });

  it("leaves signed-in requests, POSTs (server actions), the versions route and other paths alone", () => {
    expect(reviewGate("/review/0001-pilot/napa", "", "GET", true)).toBeNull();
    expect(reviewGate("/review/0001-pilot/napa", "", "POST", false)).toBeNull();
    expect(reviewGate("/review/0001-pilot/versions", "", "GET", false)).toBeNull();
    expect(reviewGate("/reviewers", "", "GET", false)).toBeNull();
  });

  it("knows the review surface", () => {
    for (const p of ["/review", "/review/", "/review/flags", "/review/0001-pilot/napa"]) expect(isReviewSurface(p)).toBe(true);
    for (const p of ["/", "/reviews", "/search", "", "/signin"]) expect(isReviewSurface(p)).toBe(false);
  });

  it("isLearnSurface accepts the ten exact chapter paths only (Review Focus 4)", () => {
    for (const slug of CHAPTER_SLUGS) expect(isLearnSurface(`/learn/${slug}`)).toBe(true);
    // The page decodes the [chapter] param, so an encoded unreserved character is the same chapter (RFC 3986).
    for (const p of ["/learn/st%61rt", "/learn/%73tart"]) expect(isLearnSurface(p)).toBe(true);
    for (const p of ["/learn", "/learn/", "/learn/Start", "/learn/START", "/learn/start%20", "/learn/start/", "/learn/start.html",
      "/learn/glossary/extra", "/learning/start", "/review/start", "/learn/startx", "", "/learn/start%2F", "/learn/start%2Fx",
      "/learn/%E0%A4%A"]) expect(isLearnSurface(p)).toBe(false);
  });

  it("isLearnMiss: a one-segment /learn/{x} that is not one of the ten chapters (Review Focus 4)", () => {
    for (const p of ["/learn/Start", "/learn/START", "/learn/start%20", "/learn/start.html", "/learn/nope", "/learn/startx",
      "/learn/start%2F", "/learn/start%2Fx", "/learn/%E0%A4%A"]) expect(isLearnMiss(p), p).toBe(true);
    for (const slug of CHAPTER_SLUGS) expect(isLearnMiss(`/learn/${slug}`)).toBe(false);
    // /learn redirects, a trailing slash is Next's own redirect, and two segments match no route already.
    for (const p of ["/learn/st%61rt", "/learn", "/learn/", "/learn/start/", "/learn/glossary/extra", "/learning/start", "/review/start"])
      expect(isLearnMiss(p), p).toBe(false);
  });
});
