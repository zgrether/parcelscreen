/**
 * The household's list (WF2b, docs/plans/parcel-workflow.md §5): the app opens to it once there are parcels; each
 * row's name (cut short, whole on hover), state, status, household verdict and both grades; archiving from a parcel's
 * detail drops it from the default view and a filter brings it back, remembered after a reload; ticked rows open in
 * Compare; Open on the map. On a phone: cards, and a long press shows a whole name.
 */
import { expect, test } from "@playwright/test";
import { importParcels, openExplorer, seedScreens } from "./flow";
import { replayHar } from "./replay";

const FERNEY = "ferney-creek-52-47A" as const;
const MACKS = "macks-mountain-35-3" as const;
const MACKS_NAME = "Macks Mountain, Floyd County VA, parcel 35-3";

test("the list: opens there, rows and verdicts, archive and the filter, Compare, Open on the map", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await replayHar(context, [FERNEY, MACKS]);

  // No parcels yet: the app opens on the map.
  await page.goto("/");
  await expect(page).toHaveURL(/\/explore$/);
  await openExplorer(page, FERNEY);
  await importParcels(page, [FERNEY, MACKS]);
  await seedScreens(page, [FERNEY, MACKS]);

  // With parcels: on the list.
  await page.goto("/");
  await expect(page).toHaveURL(/\/library$/);
  const rows = page.locator(".lib-table tbody tr");
  await expect(rows).toHaveCount(2);
  const macks = rows.filter({ hasText: "parcel 35-3" });
  // The whole name on hover; the cell cuts it short (one line, an ellipsis).
  await expect(macks.locator(".long-name")).toHaveAttribute("title", MACKS_NAME);
  expect(await macks.locator(".long-name-text").evaluate((el) => getComputedStyle(el).textOverflow)).toBe(
    "ellipsis",
  );
  await expect(macks.locator("td").nth(4)).toHaveText("VA");
  await expect(macks.locator("td").nth(5)).toHaveText("In progress");
  // The household verdict and both grades, from the kept screens.
  await expect(macks.locator("td").nth(6)).toHaveText(/^(Contender|Maybe|Pass)$/);
  await expect(macks.locator("td").nth(7)).toHaveText(/^[A-F](Contender|Maybe|Pass)$/);
  await expect(macks.locator("td").nth(8)).toHaveText(/^[A-F](Contender|Maybe|Pass)$/);

  // Its detail: the full name, the card; archived as sold.
  await macks.getByRole("button", { name: MACKS_NAME }).click();
  const detail = page.getByRole("dialog", { name: MACKS_NAME });
  await expect(detail.getByRole("heading", { name: MACKS_NAME })).toBeVisible();
  await expect(detail.locator(".card")).toBeVisible();
  await detail.getByRole("button", { name: "Archive…" }).click();
  await detail.getByRole("button", { name: "Sold" }).click();
  await detail.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(detail).toContainText(/Archived [A-Z][a-z]{2} \d{1,2}: Sold/);
  await detail.getByRole("button", { name: "Close" }).click();

  // Hidden by the default view; the Status filter shows it, and the choice outlasts a reload.
  await expect(rows).toHaveCount(1);
  await expect(page.locator(".lib-count")).toHaveText("Showing 1 of 2: the filters hide 1.");
  await page.getByRole("button", { name: "Filters" }).click();
  await page.getByRole("group", { name: "Status" }).getByRole("button", { name: "Archived" }).click();
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "parcel 35-3" })).toHaveClass("lib-archived");
  await page.reload();
  await expect(page.getByRole("button", { name: "Filters (1)" })).toBeVisible();
  await expect(rows).toHaveCount(2);
  expect(
    await page.evaluate(
      () => (JSON.parse(localStorage.getItem("ps.parcels")!) as { built: { status: string }[] }).built,
    ),
  ).toEqual(expect.arrayContaining([expect.objectContaining({ status: "archived" })]));

  // Ticked rows open in Compare.
  for (const r of await rows.all()) await r.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Compare 2" }).click();
  await expect(page).toHaveURL(/\/compare$/);
  await expect(page.locator(".compare-table thead .cmp-name")).toHaveCount(2);
  await expect(page.locator(".compare-table thead .cmp-name").first()).toHaveAttribute("title", /parcel /);

  // Open on the map, from a parcel's detail.
  await page.goto("/library");
  await rows
    .filter({ hasText: "parcel 52-47A" })
    .getByRole("button", { name: /parcel 52-47A/ })
    .click();
  await page.getByRole("link", { name: "Open on the map" }).click();
  await expect(page).toHaveURL(/\/explore$/);
  await expect(page.locator(".sh-name").first()).toContainText("52-47A");
  expect(errors).toEqual([]);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("cards, not a table; a long press shows the whole name; a tap opens the parcel", async ({
    page,
    context,
  }) => {
    await replayHar(context, [FERNEY, MACKS]);
    await openExplorer(page, FERNEY);
    await importParcels(page, [FERNEY, MACKS]);
    await page.goto("/library");
    await expect(page.locator(".lib-cards .lib-card")).toHaveCount(2);
    await expect(page.locator(".lib-table")).toBeHidden();
    const name = page.locator(".lib-card", { hasText: "parcel 35-3" }).locator(".long-name");
    await name.dispatchEvent("pointerdown", {
      pointerType: "touch",
      isPrimary: true,
      clientX: 50,
      clientY: 50,
    });
    await expect(page.getByRole("tooltip")).toHaveText(MACKS_NAME);
    await page
      .locator(".lib-card", { hasText: "parcel 35-3" })
      .getByRole("button", { name: MACKS_NAME })
      .tap();
    await expect(page.getByRole("dialog", { name: MACKS_NAME })).toBeVisible();
  });
});
