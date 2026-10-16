import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { applyP1cFixture, auditOutcomes, lastDecision, otherReviewerReports, pairReviews, sql } from "./db";
import { PILOT_IDS, deskReady, interceptActions, openRecord, shown, sourceLinkTargets } from "./review-helpers";
import { BASE_URL, signInAs } from "./session";
import { installTurnstileFake } from "./turnstile-fake";

/*
 * P1C end to end (§11.4, as amended by the P1C plan's Task 0): the senior review flow with Dismiss issue, the senior
 * pages, and the desk's cross-batch pairs. The fixture batch e2e-p1c is applied here, not seeded (Learn's live numbers).
 */
const B = "e2e-p1c";
const P1C = { ibufen: "901-0001-001--ibufen-400", cafergot: "901-0002-001--cafergot", warin: "900-0001-001--warin" } as const;
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
type Look = { name: string; theme: "light" | "dark"; forced: boolean };
const LOOKS: Look[] = [{ name: "light", theme: "light", forced: false }, { name: "dark", theme: "dark", forced: false },
  { name: "forced colours", theme: "light", forced: true }];

test.describe.configure({ timeout: 300_000 });
test.beforeAll(() => applyP1cFixture());

async function as(browser: Browser, role: "senior" | "pharmacist", look?: Look): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: BASE_URL,
    ...(look ? { colorScheme: look.theme, forcedColors: look.forced ? ("active" as const) : ("none" as const) } : {}) });
  if (look) await context.addCookies([{ name: "intellidrugs-theme", value: look.theme, url: BASE_URL }]);
  await signInAs(context, role, role === "senior" ? "E2E Senior" : "E2E Reviewer");
  const page = await context.newPage();
  await installTurnstileFake(page, "pass");
  return { context, page };
}
async function axe(page: Page, state: string): Promise<void> {
  await page.waitForTimeout(500);
  const found = (await new AxeBuilder({ page }).withTags(WCAG).exclude("iframe").analyze()).violations.map((v) => `${v.id}: ${v.nodes.length}`);
  expect(found, state).toEqual([]);
}
const botPassed = (page: Page) => expect(page.getByText("Bot check passed")).toBeVisible({ timeout: 20_000 });

test("desk: In other batches with both subgroups; text-missing notes split by partnerScope (§5.5.3, §5.6.2)", async ({ browser }) => {
  const { context, page } = await as(browser, "pharmacist");
  await openRecord(page, "0001-pilot", PILOT_IDS.napa);
  const ix = page.locator('section[aria-labelledby="sec-ix"]');
  await expect(ix.getByRole("heading", { level: 3, name: "With other medicines" })).toBeVisible();
  await expect(ix.getByRole("heading", { level: 4, name: "In batch 0001-pilot" })).toBeVisible();
  await expect(ix.getByRole("heading", { level: 4, name: "In other batches" })).toBeVisible();
  await expect(ix.getByRole("heading", { level: 5, name: "With approved medicines" })).toBeVisible();
  await expect(ix.getByRole("heading", { level: 5, name: "With medicines not yet approved" })).toBeVisible();
  await expect(ix.getByRole("heading", { level: 6, name: "Acetaminophen + Caffeine" })).toBeVisible();
  await expect(ix).toContainText("Cafergot (batch e2e-p1c)");
  await expect(ix).toContainText("Ibufen 400 (batch e2e-p1c)");
  await expect(ix).toContainText("From DDInter 2.0.");

  const checks = page.locator('section[aria-labelledby="sec-checks"]');
  await openRecord(page, B, P1C.ibufen);
  await expect(checks).toContainText("DDInter text not found for 1 pair with medicines outside this batch.");
  await expect(checks).not.toContainText("with other medicines in this batch");
  await openRecord(page, B, P1C.cafergot);
  await expect(checks).toContainText("DDInter text not found for 1 pair between ingredients of this product.");
  await context.close();
});

test("review flow (senior): badge and promise; A publishes; R withdraws; D dismisses and keeps the reporter's note (§5.10a)", async ({ browser }) => {
  const { context, page } = await as(browser, "senior");
  await openRecord(page, B, P1C.cafergot);
  await expect(page.locator(".role-badge").first()).toHaveText("Senior pharmacist");
  await expect(page.locator(".decision-promise")).toContainText("You're reviewing as a senior pharmacist.");
  await botPassed(page);
  await page.keyboard.press("a");
  await expect.poll(() => lastDecision(B, P1C.cafergot), { timeout: 30_000 }).toBe("ok|senior|");

  // Ibufen 400 and Warin are already approved, so this A approves the whole batch and the desk switches to the
  // complete view (§5.9 step 1), where R does nothing. Open the record again (no ?view=done) before reporting.
  await openRecord(page, B, P1C.cafergot);
  await deskReady(page);
  await botPassed(page);
  await page.keyboard.press("r");
  await expect(page.locator("#bar-report")).toBeVisible();
  await page.locator("#note").fill("Strength should read Ergotamine 1 mg");
  await page.keyboard.press("Control+Enter");
  await expect.poll(() => lastDecision(B, P1C.cafergot), { timeout: 30_000 }).toBe("issue|senior|Strength should read Ergotamine 1 mg");

  const ph = await as(browser, "pharmacist");
  await openRecord(ph.page, B, P1C.cafergot);
  await expect(ph.page.locator(".decision-promise")).toContainText("An issue is open on this record.");
  await expect(ph.page.locator('[data-fk="dismiss"]')).toHaveCount(0);
  await ph.page.keyboard.press("d");
  await expect(ph.page.locator("#bar-dismiss")).toHaveCount(0);
  await ph.context.close();

  await page.reload();
  await deskReady(page);
  await botPassed(page);
  await page.keyboard.press("d");
  const panel = page.locator("#bar-dismiss");
  await expect(panel).toContainText("Reported by you on");
  await expect(panel).toContainText("Strength should read Ergotamine 1 mg");
  await page.locator("#dismiss-note").fill("abcd");
  await page.keyboard.press("Control+Enter");
  await expect(panel.locator(".field-error")).toHaveText("Add at least 5 characters so the team knows why the report was dismissed.");
  await page.locator("#dismiss-note").fill("The register lists Ergotamine 1 mg; the report misread it");
  await page.keyboard.press("Control+Enter");
  await expect.poll(() => lastDecision(B, P1C.cafergot), { timeout: 30_000 })
    .toBe("dismiss|senior|The register lists Ergotamine 1 mg; the report misread it");
  await expect(panel).toHaveCount(0);
  await expect(page.locator('[data-fk="approve"]')).toBeFocused();
  await expect(page.locator("#record .rv").first()).toHaveText("Not yet reviewed by a pharmacist");
  const history = page.locator('section[aria-labelledby="sec-hist"]');
  await expect(history).toContainText("Strength should read Ergotamine 1 mg");
  await expect(history).toContainText("No longer counts: a senior pharmacist dismissed the issue after it.");
  await expect(history).toContainText("Issue dismissed (you). Note: The register lists Ergotamine 1 mg; the report misread it");
  expect(sql(`SELECT count(*) FROM ops.review_decision WHERE batch_id = '${B}' AND concept_id = '${P1C.cafergot}' AND decision = 'dismiss'`)).toBe("1");
  expect(auditOutcomes("decision", `${B}/${P1C.cafergot}`)).toBe("ok|senior,issue|senior,dismiss|senior");
  expect(await page.content()).not.toContain("other.pharmacist@e2e.test");
  await context.close();
});

test("senior pages: M marks a cross-batch pair reviewed, a DDInter change brings it back, a pair issue keeps the text public (§5.17)", async ({ browser }) => {
  const ph = await as(browser, "pharmacist");
  const res = await ph.page.goto("/review/pairs");
  expect(res?.status()).toBe(200);
  await expect(ph.page.getByText("Senior review is for senior pharmacists.")).toBeVisible();
  await expect(ph.page.locator(".pair-row")).toHaveCount(0);
  await ph.context.close();

  const { context, page } = await as(browser, "senior");
  await page.goto("/review/pairs");
  const row = page.locator("#pair-DDInter1951-DDInter926");
  await expect(row.getByRole("heading", { level: 2 })).toHaveText("Warfarin + Ibuprofen");
  await expect(row).toContainText("Pair not yet reviewed by a senior pharmacist");
  await botPassed(page);
  await row.getByRole("heading", { level: 2 }).focus();
  await page.keyboard.press("m");
  await expect(row.locator(".pair-review")).toHaveText(/^Pair reviewed by a senior pharmacist on \d{2}\/\d{2}\/\d{4} \(you\)$/);
  expect(pairReviews("DDInter1951", "DDInter926")).toBe(1);

  sql("UPDATE curated.ddinter_interaction_text SET management = management || ' Re-check the INR within 3 days.' WHERE interaction_id = '19990'");
  await page.goto("/review/pairs?show=changed");
  const changed = page.locator("#pair-DDInter1951-DDInter926");
  await expect(changed.locator(".pair-review")).toHaveText(/^Pair changed in DDInter after a senior pharmacist reviewed it on /);
  expect(sql(`SELECT review FROM ops.batch_item WHERE batch_id = '${B}' AND concept_id = '${P1C.ibufen}'`)).toBe("ok");

  await botPassed(page);
  await changed.getByRole("button", { name: /^Report pair issue/ }).click();
  await page.locator("#pair-note-DDInter1951-DDInter926").fill("The management text reads stronger than the severity");
  await page.keyboard.press("Control+Enter");
  await expect(changed.locator(".pair-review")).toHaveText(/^Pair issue reported by a senior pharmacist on .* \(you\)\. Note: The management text/);
  await expect(changed).toContainText("Re-check the INR within 3 days.");
  expect(pairReviews("DDInter1951", "DDInter926")).toBe(2);

  await page.goto(`/check?ids=${P1C.ibufen}&ids=${P1C.warin}`);
  // §6.7.3: the public pair card shows DDInter's management text when the pair has one (the interaction description only
  // without it), so the changed management text, issue reported, is what stays public (G3).
  await expect(page.locator("main").getByText("Re-check the INR within 3 days.")).toBeVisible();
  await context.close();
});

test("senior pages: source links outside the pair meta line are 24 × 24 px targets (§10.4, WCAG 2.5.8)", async ({ browser }) => {
  const { context, page } = await as(browser, "senior");
  for (const url of ["/review/substances/BDS-000003", "/review/pairs?show=all"]) {
    await page.goto(url);
    const links = await sourceLinkTargets(page);
    expect(links.measured, url).toBeGreaterThan(0);
    expect(links.small, url).toEqual([]);
  }
  await context.close();
});

for (const look of LOOKS) {
  test(`axe (${look.name}): the dismiss panel, the senior pages and the not-authorised banner (§11.4)`, async ({ browser }) => {
    otherReviewerReports(B, P1C.cafergot, "Strength looks wrong on the pack");
    const { context, page } = await as(browser, "senior", look);
    await openRecord(page, B, P1C.cafergot);
    await botPassed(page);
    await page.keyboard.press("d");
    await expect(page.locator("#bar-dismiss")).toBeVisible();
    await axe(page, "dismiss panel");
    await page.locator("#dismiss-note").fill("abc");
    await page.keyboard.press("Control+Enter");
    await expect(page.locator("#bar-dismiss .field-error")).toBeVisible();
    await axe(page, "dismiss error");
    const release = await interceptActions(page, B, "hold");
    await page.locator("#dismiss-note").fill("The pack and the register agree");
    await page.keyboard.press("Control+Enter");
    await expect(page.locator('#bar-dismiss [aria-busy="true"]')).toBeVisible();
    await axe(page, "dismiss sending");
    await release();
    await expect(shown(page, "Couldn't confirm your dismissal.")).toBeVisible({ timeout: 25_000 });

    for (const show of ["todo", "changed", "issue", "reviewed", "all"]) {
      await page.goto(`/review/pairs?show=${show}`);
      await axe(page, `queue ${show}`);
    }
    await page.goto("/review/pairs?show=all");
    await botPassed(page);
    const row = page.locator("#pair-DDInter272-DDInter700");
    await row.getByRole("button", { name: /^Report pair issue/ }).click();
    await expect(page.locator("#pair-note-DDInter272-DDInter700")).toBeVisible();
    await axe(page, "pair issue panel");
    sql("UPDATE curated.ddinter_pair SET actions = array_append(actions, 'others') WHERE ddinter_a = 'DDInter272' AND ddinter_b = 'DDInter700'");
    await row.getByRole("button", { name: /^Mark reviewed/ }).click();
    await expect(row.getByText("This pair changed in DDInter after you opened the page.")).toBeVisible({ timeout: 20_000 });
    await axe(page, "row 409 banner");
    await page.goto("/review/substances/BDS-000003");
    await axe(page, "substance page");
    await page.goto("/review/substances");
    await axe(page, "substances");
    await context.close();

    const ph = await as(browser, "pharmacist", look);
    await ph.page.goto("/review/pairs");
    await expect(ph.page.getByText("Senior review is for senior pharmacists.")).toBeVisible();
    await axe(ph.page, "not authorised");
    await ph.context.close();
  });
}
