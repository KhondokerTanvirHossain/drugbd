import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { decryptSession } from "@/lib/session-crypto";

const require = createRequire(import.meta.url);
const { mintSession } = require("../e2e/lhci-session.cjs") as { mintSession: (c: object, secret?: string) => Promise<string> };
const SECRET = "e2e-session-secret-0123456789abcdef0123456789";

describe("the Lighthouse CI session (§10.6 /review budget)", () => {
  it("mints a cookie that lib/session-crypto accepts as the e2e pharmacist", async () => {
    const token = await mintSession({ email: "pharm@e2e.test", name: "E2E Reviewer", role: "pharmacist" }, SECRET);
    expect(await decryptSession(token, SECRET)).toMatchObject({ email: "pharm@e2e.test", role: "pharmacist" });
  });
});
