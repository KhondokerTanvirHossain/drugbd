// Mints the e2e pharmacist's session cookie the way lib/session-crypto.ts does (HKDF-SHA256 key, dir/A256GCM JWE) and
// sets it before Lighthouse loads /review/…. tests/lhci-session.test.ts pins that lib/session-crypto decrypts it.
const { hkdfSync } = require("node:crypto");

const SECRET = process.env.E2E_SESSION_SECRET ?? "e2e-session-secret-0123456789abcdef0123456789";   // = web/e2e/session.ts
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

async function mintSession(claims, secret = SECRET, now = Math.floor(Date.now() / 1000)) {
  const { EncryptJWT } = await import("jose");
  const key = new Uint8Array(hkdfSync("sha256", secret, new Uint8Array(0), "intellidrugs-session-v1", 32));
  return new EncryptJWT(claims).setProtectedHeader({ alg: "dir", enc: "A256GCM", typ: "JWT" })
    .setIssuedAt(now).setExpirationTime(now + 8 * 60 * 60).encrypt(key);
}

module.exports = async (browser) => {
  const page = await browser.newPage();
  await page.goto(`${BASE}/healthz`);
  await page.setCookie({ name: "__Host-intellidrugs_session", url: BASE, httpOnly: true, secure: true, sameSite: "Lax",
    value: await mintSession({ email: "pharm@e2e.test", name: "E2E Reviewer", role: "pharmacist" }) });
  await page.close();
};
module.exports.mintSession = mintSession;
