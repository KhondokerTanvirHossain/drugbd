import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/session")>()), getSession: () => getSession() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ delete: vi.fn() }) }));

import SignInPage from "@/app/signin/page";

const configure = () => {
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "AIza-public-key");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "bddrug-kb.firebaseapp.com");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_APP_ID", "1:123:web:abc");
  vi.stubEnv("FIREBASE_PROJECT_ID", "bddrug-kb");
};
const render = async () => renderToStaticMarkup(await SignInPage());

beforeEach(() => { getSession.mockReset(); getSession.mockResolvedValue(null); });
afterEach(() => vi.unstubAllEnvs());

describe("sign-in page", () => {
  it("offers Google sign-in when Firebase is configured", async () => {
    configure();
    const html = await render();
    expect(html).toContain("Sign in with Google");
    expect(html).not.toContain("not configured");
  });

  it("says sign-in is disabled when the Firebase config is missing", async () => {
    for (const missing of ["NEXT_PUBLIC_FIREBASE_API_KEY", "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
      "NEXT_PUBLIC_FIREBASE_APP_ID", "FIREBASE_PROJECT_ID"]) {
      configure();
      vi.stubEnv(missing, "");
      const html = await render();
      expect(html).toContain("Reviewer sign-in is not configured.");
      expect(html).not.toContain("Sign in with Google");
    }
  });

  it("shows the role, not the email, when already signed in", async () => {
    configure();
    getSession.mockResolvedValue({ email: "eng@example.org", role: "engineer" });
    const html = await render();
    expect(html).toContain("Signed in as Engineer");
    expect(html).not.toContain("eng@example.org");
    expect(html).not.toContain("Sign in with Google");
  });

  it("explains that a non-reviewer account can flag but not review", async () => {
    configure();
    const html = await render();
    expect(html).toContain("Only listed pharmacists and engineers can review");
  });
});
