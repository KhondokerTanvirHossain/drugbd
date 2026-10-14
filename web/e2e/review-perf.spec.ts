import { expect, test } from "@playwright/test";
import { PILOT_IDS, openRecord } from "./review-helpers";
import { signInAs } from "./session";
import { installTurnstileFake } from "./turnstile-fake";

test("J paints the next record within 300 ms once it is prefetched (§10.6)", async ({ context, page }) => {
  await installTurnstileFake(page, "pass");   // Cloudflare's live widget keeps a blob request open, so "networkidle" would never come
  await signInAs(context, "pharmacist");
  await openRecord(page, "0001-pilot", PILOT_IDS.metformin);
  await page.waitForLoadState("networkidle");   // the desk prefetches the previous and next records (§5.4)
  const ms = await page.evaluate(async () => {
    const title = () => document.querySelector("#record h1")?.textContent ?? "";
    const before = title();
    const t0 = performance.now();
    document.getElementById("desk")!.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
    await new Promise<void>((resolve) => { const tick = () => (title() !== before ? resolve() : requestAnimationFrame(tick)); tick(); });
    return performance.now() - t0;
  });
  expect(ms).toBeLessThanOrEqual(300);
  await expect(page).toHaveURL(new RegExp(`/review/0001-pilot/${PILOT_IDS.napa}$`));
});
