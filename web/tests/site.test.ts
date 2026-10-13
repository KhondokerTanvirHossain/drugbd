import { afterEach, describe, expect, it, vi } from "vitest";
import { assertSiteConfig, siteHost, siteHostname, siteOrigin } from "@/lib/site";

afterEach(() => vi.unstubAllEnvs());

describe("SITE_HOST (§9.2, §12.4)", () => {
  it("is required in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_HOST", "");
    expect(() => assertSiteConfig()).toThrow("SITE_HOST must be set (for example SITE_HOST=drugdb.eliooo.org)");
  });
  it("must be a plain host name, optionally with a port", () => {
    vi.stubEnv("SITE_HOST", "drugdb.eliooo.org/x");
    expect(() => assertSiteConfig()).toThrow("SITE_HOST must be a host name, optionally with a port");
    vi.stubEnv("SITE_HOST", "https://drugdb.eliooo.org");
    expect(() => assertSiteConfig()).toThrow();
  });
  it("refuses INTELLIDRUGS_E2E=1 together with the production host (§11.4)", () => {
    vi.stubEnv("INTELLIDRUGS_E2E", "1");
    vi.stubEnv("SITE_HOST", "drugdb.eliooo.org");
    expect(() => assertSiteConfig()).toThrow("INTELLIDRUGS_E2E=1 must never run with SITE_HOST=drugdb.eliooo.org");
  });
  it("passes for the production host and for the e2e host", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_HOST", "drugdb.eliooo.org");
    expect(() => assertSiteConfig()).not.toThrow();
    vi.stubEnv("INTELLIDRUGS_E2E", "1");
    vi.stubEnv("SITE_HOST", "localhost:3000");
    expect(() => assertSiteConfig()).not.toThrow();
  });

  it("siteOrigin is https for the real host and http only for localhost in development or e2e", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_HOST", "DrugDB.eliooo.org");
    expect(siteHost()).toBe("drugdb.eliooo.org");
    expect(siteOrigin()).toBe("https://drugdb.eliooo.org");
    vi.stubEnv("SITE_HOST", "localhost:3000");
    expect(siteOrigin()).toBe("https://localhost:3000");
    vi.stubEnv("INTELLIDRUGS_E2E", "1");
    expect(siteOrigin()).toBe("http://localhost:3000");
    expect(siteHostname()).toBe("localhost");
  });
  it("defaults to localhost:3000 outside production", () => {
    vi.stubEnv("SITE_HOST", "");
    expect(siteOrigin()).toBe("http://localhost:3000");
  });
});
