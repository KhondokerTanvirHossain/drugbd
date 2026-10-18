import { afterEach, describe, expect, it, vi } from "vitest";
import { ROLES, ROLE_LABEL, actsAsPharmacist, canUseQa, isReviewer, parseReviewers, roleFor } from "../lib/reviewers";

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

describe("the senior pharmacist role (§5.13, P1C)", () => {
  it("parses as a role, in any case, and is in ROLES with its label", () => {
    expect([...parseReviewers("s@x.org:Senior,p@x.org:pharmacist").entries()]).toEqual([["s@x.org", "senior"], ["p@x.org", "pharmacist"]]);
    expect(ROLES).toEqual(["pharmacist", "engineer", "senior", "qa", "user"]);
    expect(ROLE_LABEL.senior).toBe("Senior pharmacist");
    expect(roleFor("s@x.org", "s@x.org:senior")).toBe("senior");
  });
  it("any other role token is still skipped", () => {
    expect(parseReviewers("a@x.org:seniorpharmacist,b@x.org:admin,c@x.org:senior ").size).toBe(1);
  });
  it("isReviewer accepts it; actsAsPharmacist is true for pharmacist and senior only", () => {
    expect(isReviewer({ role: "senior" })).toBe(true);
    expect(actsAsPharmacist("senior")).toBe(true);
    expect(actsAsPharmacist("pharmacist")).toBe(true);
    for (const r of ["engineer", "user", null, undefined]) expect(actsAsPharmacist(r)).toBe(false);
  });
});

describe("the qa role (§5.13, QA portal, D66)", () => {
  it("parses as a role, in any case, is in ROLES and has the label QA", () => {
    expect([...parseReviewers("q@x.org:qa,Q2@x.org: QA ,p@x.org:pharmacist").entries()])
      .toEqual([["q@x.org", "qa"], ["q2@x.org", "qa"], ["p@x.org", "pharmacist"]]);
    expect(ROLES).toContain("qa");
    expect(ROLE_LABEL.qa).toBe("QA");
    expect(roleFor("Q@X.org", "q@x.org:qa")).toBe("qa");
  });
  it("a qa account is not a reviewer and does not act as a pharmacist", () => {
    expect(isReviewer({ role: "qa" })).toBe(false);
    expect(actsAsPharmacist("qa")).toBe(false);
  });
  it("canUseQa is the one test for QA tools: qa, engineer and senior only", () => {
    for (const r of ["qa", "engineer", "senior"]) expect(canUseQa(r)).toBe(true);
    for (const r of ["pharmacist", "user", "QA", "", null, undefined]) expect(canUseQa(r)).toBe(false);
  });
  it("other tokens near qa are still skipped", () => {
    expect(parseReviewers("a@x.org:qa-team,b@x.org:quality,c@x.org:qa:x").size).toBe(0);
  });
});
