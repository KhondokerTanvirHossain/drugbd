import { expect, test } from "@playwright/test";
import { PILOT_IDS } from "./review-helpers";
import { signInAs } from "./session";

const NAPA = `/review/0001-pilot/${PILOT_IDS.napa}`;

test("anonymous: every review page is a 307 to sign-in with returnTo; versions is a 401 (§2.3)", async ({ request }) => {
  const r = await request.get(`${NAPA}?show=needs`, { maxRedirects: 0 });
  expect(r.status()).toBe(307);
  expect(r.headers().location).toBe(`/signin?returnTo=${encodeURIComponent(`${NAPA}?show=needs`)}`);
  expect((await request.get("/review/0001-pilot/versions")).status()).toBe(401);
});

test("legacy URLs answer 308 to the review surface (§2.3)", async ({ request }) => {
  const at = async (p: string) => (await request.get(p, { maxRedirects: 0 })).headers().location;
  expect(await at("/batches")).toMatch(/\/review$/);
  expect(await at(`/batches/0001-pilot?item=${PILOT_IDS.napa}&review=saved`)).toMatch(new RegExp(`/review/0001-pilot/${PILOT_IDS.napa}$`));
  expect(await at("/flags?resolve=resolved")).toMatch(/\/review\/flags$/);
});

test("a reader gets the not-authorised page with status 200 and no batch data (§5.12)", async ({ context, page }) => {
  await signInAs(context, "user", "Some Reader");
  const res = await page.goto(NAPA);
  expect(res?.status()).toBe(200);
  await expect(page.getByText("This Google account isn't on the reviewer list.")).toBeVisible();
  await expect(page.getByText("Napa", { exact: true })).toHaveCount(0);
  expect((await page.request.get("/review/0001-pilot/versions")).status()).toBe(403);
});

test("a reviewer reads the pilot batch: Board R's record header, the route statement and the 28 batch pairs", async ({ context, page }) => {
  await signInAs(context, "pharmacist", "Farhana Islam");
  await page.goto(`/review/0001-pilot/${PILOT_IDS.chloramphenicol}`);
  await expect(page.getByRole("heading", { level: 1, name: "Chloramphenicol" })).toBeVisible();
  await expect(page.getByText("None of the 28 batch pairs from DDInter 2.0 involve Chloramphenicol.")).toBeVisible();
  await expect(page.locator("#record")).not.toContainText("@e2e.test");
});

test("/review/0001-pilot opens the first record that needs review", async ({ context, page }) => {
  await signInAs(context, "pharmacist");
  await page.goto("/review/0001-pilot");
  await expect(page).toHaveURL(new RegExp(`/review/0001-pilot/${PILOT_IDS.amlodipine}$`));
});
