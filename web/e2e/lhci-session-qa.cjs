// Mints the e2e QA account's session cookie (as lhci-session.cjs does for the pharmacist) before Lighthouse loads /review/qa
// (§10.6, QA portal). tests/lhci-session.test.ts pins that lib/session-crypto decrypts it as role qa.
const { mintSession } = require("./lhci-session.cjs");

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

module.exports = async (browser) => {
  const page = await browser.newPage();
  await page.goto(`${BASE}/healthz`);
  await page.setCookie({ name: "__Host-intellidrugs_session", url: BASE, httpOnly: true, secure: true, sameSite: "Lax",
    value: await mintSession({ email: "qa@e2e.test", name: "E2E QA", role: "qa" }) });
  await page.close();
};
