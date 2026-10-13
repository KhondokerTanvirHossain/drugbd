import { afterEach, describe, expect, it, vi } from "vitest";
import { isReviewer, parseReviewers, roleFor } from "../lib/reviewers";

afterEach(() => vi.unstubAllEnvs());

describe("parseReviewers", () => {
  it("maps each email (lower-cased) to its role", () => {
    const m = parseReviewers("Pharm@Example.org:pharmacist, eng@example.org:engineer");
    expect([...m.entries()]).toEqual([["pharm@example.org", "pharmacist"], ["eng@example.org", "engineer"]]);
  });

  it("accepts the role in any case and tolerates whitespace", () => {
    const m = parseReviewers("  a@x.org : PHARMACIST ,b@x.org:Engineer  ");
    expect(m.get("a@x.org")).toBe("pharmacist");
    expect(m.get("b@x.org")).toBe("engineer");
  });

  it("ignores malformed entries and keeps the valid ones", () => {
    const m = parseReviewers(
      "no-colon@x.org,:pharmacist,noat:pharmacist,c@x.org:admin,c2@x.org:user,d@x.org:,,a@b:c:pharmacist,ok@x.org:engineer");
    expect([...m.entries()]).toEqual([["ok@x.org", "engineer"]]);
  });

  it("keeps the first entry when an email is listed twice", () => {
    expect(parseReviewers("a@x.org:pharmacist,A@x.org:engineer").get("a@x.org")).toBe("pharmacist");
  });

  it("returns an empty map for an unset or empty list", () => {
    expect(parseReviewers(undefined).size).toBe(0);
    expect(parseReviewers("").size).toBe(0);
  });
});

describe("roleFor", () => {
  it("matches the email case-insensitively", () => {
    expect(roleFor("PHARM@example.ORG", "pharm@example.org:pharmacist")).toBe("pharmacist");
  });

  it("gives role user to an email that is not on the list", () => {
    expect(roleFor("someone@gmail.com", "pharm@example.org:pharmacist")).toBe("user");
  });

  it("reads REVIEWERS from the environment by default", () => {
    vi.stubEnv("REVIEWERS", "eng@example.org:engineer");
    expect(roleFor("eng@example.org")).toBe("engineer");
    expect(roleFor("other@example.org")).toBe("user");
  });

  it("gives role user when REVIEWERS is unset", () => {
    vi.stubEnv("REVIEWERS", undefined as unknown as string);
    expect(roleFor("eng@example.org")).toBe("user");
  });
});

describe("isReviewer", () => {
  it("is true for pharmacists and engineers only", () => {
    expect(isReviewer({ role: "pharmacist" })).toBe(true);
    expect(isReviewer({ role: "engineer" })).toBe(true);
    expect(isReviewer({ role: "user" })).toBe(false);
    expect(isReviewer(null)).toBe(false);
    expect(isReviewer(undefined)).toBe(false);
  });
});
