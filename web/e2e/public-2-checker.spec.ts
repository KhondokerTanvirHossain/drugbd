import { expect, test, type Page } from "@playwright/test";
import { publish, resetPublic } from "./public-helpers";
import { PILOT_IDS as P } from "./review-helpers";

/* The checker end to end (§6.7, §11.4 "Checker"). G Warfarin, Aspirin, Domperidone and the eye drop are public; Napa is not. */
test.describe.configure({ mode: "serial", timeout: 120_000 });
test.beforeAll(() => publish(P.warfarin, P.aspirin, P.domperidone, P.chloramphenicol));
test.afterAll(() => resetPublic());

const input = (page: Page) => page.getByRole("combobox", { name: "Add a medicine" });
const live = (page: Page) => page.locator("#check-live");
const selected = (page: Page) => page.locator('ul[aria-labelledby="sel-h"] > li');
const SCENARIO_1 = "3 medicines · 1 of 3 pairs checked · 1 with an interaction listed · 2 pairs not checked because Domperidone has no interaction data";

async function add(page: Page, typed: string, option: RegExp): Promise<void> {
  await input(page).fill(typed);
  await expect(page.getByRole("option", { name: option })).toBeVisible();
  // The list opens with its first option active (aria-activedescendant); move down only until ours is the active one.
  for (let i = 0; i < 10 && !(await page.getByRole("option", { name: option, selected: true }).count()); i++)
    await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { name: option, selected: true })).toBeVisible();
  await page.keyboard.press("Enter");
}

test("keyboard: add three medicines, each announced; the summary sentence; Major first; the no-data block (§6.7.1–§6.7.3)", async ({ page }) => {
  await page.goto("/check");
  await expect(input(page)).toBeVisible();
  await add(page, "warf", /^G Warfarin/);
  await expect(live(page)).toHaveText("G Warfarin added. Add at least 2 medicines to check them against each other.");
  await add(page, "aspi", /^Aspirin/);
  await expect(live(page)).toHaveText("Aspirin added. 2 medicines · 1 of 1 pair checked · 1 with an interaction listed");
  await add(page, "domp", /^Domperidone/);
  await expect(live(page)).toHaveText(`Domperidone added. ${SCENARIO_1}`);
  await expect(page).toHaveURL(new RegExp(`ids=${P.warfarin}.*ids=${P.aspirin}.*ids=${P.domperidone}`));
  await expect(selected(page)).toHaveCount(3);
  await expect(page.getByRole("heading", { level: 2, name: SCENARIO_1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Major, 1 pair$/ })).toBeVisible();
  await expect(page.locator(".nodata-block.hatch")).toHaveCount(1);
  // The legend (Board P, §6.7.3 item 8) repeats the sentence; this one is the block's own.
  await expect(page.locator(".nodata-block.hatch").getByText("No interaction data in DDInter for this substance. This does not mean it is safe to combine.")).toBeVisible();
  await expect(page.getByText("From DDInter 2.0", { exact: true }).first()).toBeVisible();
});

test("the alert card shows management, then DDInter's interaction description, each behind its own Expander (§6.7.3, D64)", async ({ page }) => {
  await page.goto(`/check?ids=${P.warfarin}&ids=${P.aspirin}`);
  const card = page.locator("article.pair", { has: page.getByRole("heading", { level: 4, name: "G Warfarin + Aspirin" }) });
  const management = card.locator('p.pair-text[id$="-text"]'), description = card.locator('p.pair-text[id$="-desc"]');
  // the seed's DDInter texts for DDInter1951 + DDInter20, both over 200 characters
  await expect(description).toContainText("Aspirin, even in small doses, may increase the risk of bleeding");
  await expect(management).toContainText("should generally be avoided unless the potential benefit outweighs the risk");
  expect((await management.boundingBox())!.y).toBeLessThan((await description.boundingBox())!.y);
  await expect(card).not.toContainText("DDInter 2.0 gives no management text for this pair.");
  await expect(card.getByText("From DDInter 2.0", { exact: true })).toBeVisible();

  const buttons = card.getByRole("button", { name: "Show full text" });
  await expect(buttons).toHaveCount(2);
  const [mgButton, descButton] = [buttons.nth(0), buttons.nth(1)];
  await expect(mgButton).toHaveAttribute("aria-controls", (await management.getAttribute("id"))!);
  await expect(descButton).toHaveAttribute("aria-controls", (await description.getAttribute("id"))!);
  await expect(mgButton).toHaveAccessibleDescription("Management, truncated. Full text from DDInter 2.0.");
  await expect(descButton).toHaveAccessibleDescription("Interaction description, truncated. Full text from DDInter 2.0.");

  // with the management text clamped, the description opens and its own label reads "full text"
  await descButton.click();
  await expect(card.getByText("Interaction description, full text from DDInter 2.0.", { exact: true })).toBeVisible();
  await expect(card.getByText("Interaction description, truncated. Full text from DDInter 2.0.", { exact: true })).toBeHidden();
  await expect(card.getByText("Management, truncated. Full text from DDInter 2.0.", { exact: true })).toBeVisible();
  await expect(card.getByText("Management, full text from DDInter 2.0.", { exact: true })).toBeHidden();
  await expect(card.getByRole("button", { name: "Show less" })).toHaveCount(1);
});

test("remove and Clear all: announced, and focus lands on the field, never on <body> (§6.7.1, §10.2)", async ({ page }) => {
  await page.goto(`/check?ids=${P.warfarin}&ids=${P.aspirin}&ids=${P.domperidone}`);
  await page.getByRole("button", { name: "Remove Domperidone" }).click();
  await expect(live(page)).toHaveText("Domperidone removed. 2 medicines · 1 of 1 pair checked · 1 with an interaction listed");
  await expect(selected(page)).toHaveCount(2);
  await expect(page).not.toHaveURL(new RegExp(P.domperidone));
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(live(page)).toHaveText("All medicines removed.");
  await expect(input(page)).toBeFocused();
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
  await expect(page.getByText("No medicines yet.")).toBeVisible();
});

test("a scenario link loads its products; a not-reviewed product is listed by name, not checked (§6.7.1, §6.7.3 item 6)", async ({ page }) => {
  await page.goto("/check");
  await page.getByRole("link", { name: "G Warfarin + Aspirin + Domperidone" }).click();
  await expect(live(page)).toHaveText(`Scenario loaded: G Warfarin + Aspirin + Domperidone. ${SCENARIO_1}`);
  await page.goto(`/check?ids=${P.warfarin}&ids=${P.napa}`);
  await expect(page.getByText(/Not yet reviewed by a pharmacist, 1 product/)).toBeVisible();
  await expect(page.locator("main")).toContainText("Napa");
  await expect(page.getByText("These products were not checked. A pharmacist hasn't approved them yet.")).toBeVisible();
});

test("the eye drop: no interaction listed with G Warfarin, and What was checked names DDInter352 (§1.5, §6.7.3 item 7)", async ({ page }) => {
  await page.goto(`/check?ids=${P.chloramphenicol}&ids=${P.warfarin}`);
  await expect(page.getByRole("heading", { name: "No interaction listed in DDInter 2.0, 1 pair" })).toBeVisible();
  await expect(page.getByText("DDInter 2.0 lists no interaction for these pairs. This is not a guarantee that they are safe to combine.")).toBeVisible();
  const checked = page.locator("details", { has: page.locator("summary", { hasText: "What was checked" }) });
  await expect(checked).toHaveAttribute("open", "");
  await expect(checked).toContainText("DDInter352");
  await expect(checked).not.toContainText("DDInter351");
});

test("a shared link with repeats, blanks and an unknown id is cleaned, with the info banner (Review Focus 3)", async ({ page }) => {
  await page.goto(`/check?ids=${P.warfarin}&ids=&ids=${P.warfarin}&ids=gone-id&ids=${P.aspirin}`);
  // the server redirects once to the de-duplicated, blank-free link; the unknown id is then dropped with the banner
  const ids = new URL(page.url()).searchParams.getAll("ids");
  expect(ids.filter((id) => id === P.warfarin)).toHaveLength(1);
  expect(ids).not.toContain("");
  await expect(page.getByText("One medicine in the link no longer exists, so it was removed.")).toBeVisible();
  await expect(selected(page)).toHaveCount(2);
  await expect(page.getByRole("heading", { level: 2, name: "2 medicines · 1 of 1 pair checked · 1 with an interaction listed" })).toBeVisible();
});

test("without JavaScript: Find lists matches, Add and Remove work by GET, and the results render (§4.4, §6.7.1)", async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto("/check");
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await page.getByLabel("Add a medicine").fill("warf");
  await page.getByRole("button", { name: "Find" }).click();
  await expect(page).toHaveURL(/\/check\?q=warf/);
  await page.getByRole("button", { name: /^G Warfarin/ }).click();
  await page.getByLabel("Add a medicine").fill("aspi");
  await page.getByRole("button", { name: "Find" }).click();
  await page.getByRole("button", { name: /^Aspirin/ }).click();
  await expect(page).toHaveURL(new RegExp(`ids=${P.warfarin}.*ids=${P.aspirin}`));
  await expect(page.getByRole("heading", { level: 2, name: "2 medicines · 1 of 1 pair checked · 1 with an interaction listed" })).toBeVisible();
  // no Expander without JavaScript: both DDInter texts render in full, each label reading "full text" (§4.4, §6.7.3)
  await expect(page.getByRole("button", { name: "Show full text" })).toHaveCount(0);
  await expect(page.getByText("Management, full text from DDInter 2.0.", { exact: true })).toBeVisible();
  await expect(page.getByText("Interaction description, full text from DDInter 2.0.", { exact: true })).toBeVisible();
  await expect(page.getByText("Management, truncated. Full text from DDInter 2.0.", { exact: true })).toBeHidden();
  await expect(page.getByText("Interaction description, truncated. Full text from DDInter 2.0.", { exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Remove Aspirin" }).click();
  await expect(selected(page)).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 2, name: "Add at least 2 medicines to check them against each other." })).toBeVisible();
  await ctx.close();
});
