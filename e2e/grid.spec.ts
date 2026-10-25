/**
 * Step 10b, the Favorites grid (plan §1): a header sorts and turns around; Columns ▾ hides a factor, remembered after a
 * reload; the header row and the Name column stay put.
 */
import { expect, test } from "@playwright/test";
import type { FixtureSlug } from "../test/support/fixtures";
import { importParcels, openExplorer, reload, seedScreens, settled, visit } from "./flow";
import { replayHar } from "./replay";

const SLUGS: readonly FixtureSlug[] = [
  "grayson-mud-creek-6273",
  "macks-mountain-35-3",
  "ferney-creek-52-47A",
];

test("a header sorts and turns around; Columns ▾ hides a factor and remembers it; sticky header and name", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  await replayHar(context, "ferney-creek-52-47A");
  await openExplorer(page, "ferney-creek-52-47A");
  await importParcels(page, SLUGS);
  await seedScreens(page, SLUGS);
  await settled(page);
  await visit(page, "/library");
  await page.getByRole("tab", { name: "Shortlist" }).click();

  const grid = page.locator(".lib-grid");
  const sky = grid.locator("thead th").filter({ hasText: /^Sky/ });
  await expect(sky).toHaveAttribute("aria-sort", "none");
  await sky.getByRole("button").click();
  await expect(sky).toHaveAttribute("aria-sort", "ascending");
  // Best first: Mud Creek's A sky above the Bs.
  const first = grid.locator("tbody tr").first();
  await expect(first).toContainText("Mud Creek");
  await sky.getByRole("button").click();
  await expect(sky).toHaveAttribute("aria-sort", "descending");
  await expect(grid.locator("tbody tr").last()).toContainText("Mud Creek");
  // The Sort menu follows the header.
  await expect(page.getByLabel("Sort by")).toHaveValue("factor:sky");

  // Columns ▾: Night sky off, remembered after a reload.
  await page.getByRole("button", { name: "Columns ▾" }).click();
  await page.getByRole("group", { name: "Columns" }).getByLabel("Night sky").uncheck();
  await expect(sky).toHaveCount(0);
  await reload(page);
  await page.getByRole("tab", { name: "Shortlist" }).click();
  await expect(page.locator(".lib-grid thead th").filter({ hasText: /^Sky/ })).toHaveCount(0);

  // The header row and the Name column are sticky in the grid's own scroll box.
  expect(
    await page
      .locator(".lib-grid thead th")
      .first()
      .evaluate((el) => getComputedStyle(el).position),
  ).toBe("sticky");
  expect(
    await page
      .locator(".lib-grid tbody td.lib-name")
      .first()
      .evaluate((el) => getComputedStyle(el).position),
  ).toBe("sticky");
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test("each card has three lines and its top factors as chips; the legend behind ?; the Sort menu sorts by a factor", async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    await replayHar(context, "ferney-creek-52-47A");
    await openExplorer(page, "ferney-creek-52-47A");
    await importParcels(page, SLUGS);
    await seedScreens(page, SLUGS);
    await settled(page);
    await visit(page, "/library");
    await page.getByRole("tab", { name: "Shortlist" }).click();
    const cards = page.locator(".lib-cards .lib-card");
    await expect(cards).toHaveCount(3);
    // Z-7 (UX part 2 PR 7c2): three lines; the top four factors as chips, a Must that isn't a pass first.
    const mud = cards.filter({ hasText: "Mud Creek" });
    const chips = mud.locator(".lib-fchip");
    await expect(chips).toHaveText(["!Septic", "AElev", "ASun", "BRoom"]);
    await expect(mud.locator(".lib-fchips")).toHaveAttribute("aria-label", /^Septic !; /);
    await expect(mud.locator(".lib-card-money")).toHaveText(/ · build \$\d/);
    // What the marks mean is behind "?".
    await expect(page.locator(".lib-legend-foot")).toBeHidden();
    await page.getByRole("button", { name: "What the marks mean" }).click();
    await expect(page.locator(".lib-legend-top")).toContainText("✓ pass · ! check first");
    // No grid controls on a phone.
    await expect(page.getByRole("button", { name: "Columns ▾" })).toBeHidden();
    // Sort by a factor, best first: Mud Creek's A sky leads.
    await page.getByLabel("Sort by").selectOption({ label: "Night sky" });
    await expect(cards.first()).toContainText("Mud Creek");
  });
});
