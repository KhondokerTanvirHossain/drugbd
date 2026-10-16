// Mints the e2e senior's session cookie (as lhci-session.cjs does for the pharmacist) before Lighthouse loads the senior
// pages (§10.6). tests/lhci-session.test.ts pins that lib/session-crypto decrypts it as role senior.
const { mintSession } = require("./lhci-session.cjs");

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

module.exports = async (browser) => {
  const page = await browser.newPage();
  await page.goto(`${BASE}/healthz`);
  await page.setCookie({ name: "__Host-intellidrugs_session", url: BASE, httpOnly: true, secure: true, sameSite: "Lax",
    value: await mintSession({ email: "senior@e2e.test", name: "E2E Senior", role: "senior" }) });
  await page.close();
};
