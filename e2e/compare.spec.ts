/**
 * The comparison table (VR6; owner, #117 review): parcels on Your list with kept screens, seeded from the fixtures'
 * expected results straight into IndexedDB (no screening). Reached from Your list's ticks, 2 or 3 of them (step 4b; owner
 * #185 Q5): one tick waits for another, a fourth isn't offered, and /compare with none ticked says how. The columns, a
 * best and a worst mark, and a cell opening its slide-in panel for its parcel.
 */
import { expect, test, type Page } from "@playwright/test";
import { importParcels, openExplorer, seedScreens } from "./flow";
import { replayHar } from "./replay";

const FERNEY = "ferney-creek-52-47A" as const;
const MACKS = "macks-mountain-35-3" as const;
const MUD = "grayson-mud-creek-6273" as const;
const ROAN = "roan-hwy-143-099-046-02" as const;

const tick = (page: Page, name: string) => page.getByRole("checkbox", { name: `Compare ${name}` });

test("compare: two screened parcels as columns, best and worst marked, a cell opens its panel", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await replayHar(context, [FERNEY, MACKS]);
  await openExplorer(page, FERNEY);
  await importParcels(page, [FERNEY, MACKS, MUD, ROAN]);
  await seedScreens(page, [FERNEY, MACKS]);

  // Nothing ticked (an old link): how to get here, and the way back.
  await page.goto("/compare");
  await expect(page.locator("main")).toContainText("Tick 2 or 3 parcels on Your list to compare them.");
  await page.locator("main").getByRole("link", { name: "Open Your list", exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);

  // One tick: Compare waits for a second.
  await tick(page, "Ferney Creek, Floyd County VA, parcel 52-47A").check();
  await expect(page.getByRole("button", { name: "Compare 1" })).toBeDisabled();
  await tick(page, "Macks Mountain, Floyd County VA, parcel 35-3").check();
  await page.getByRole("button", { name: "Compare 2" }).click();
  await expect(page).toHaveURL(/\/compare$/);
  const names = page.locator(".compare-table thead .cmp-name");
  await expect(names).toHaveCount(2);
  // Named after their prototype names (owner, #130).
  expect((await names.allTextContents()).sort()).toEqual([
    "Ferney Creek, Floyd County VA, parcel 52-47A",
    "Macks Mountain, Floyd County VA, parcel 35-3",
  ]);
  // Both are screened: each column has its grade and verdict, not "grades again when opened".
  await expect(page.locator(".cmp-headline td .card-grade")).toHaveCount(2);
  // Where the parcels differ, the better is marked ↑ and the worse ↓.
  await expect(page.locator(".cmp-mark.best").first()).toBeVisible();
  await expect(page.locator(".cmp-mark.worst").first()).toBeVisible();

  // A cell opens that line's panel, for that parcel.
  await page.getByRole("button", { name: /parcel 35-3, Night sky: / }).click();
  const panel = page.locator(".card-panel");
  await expect(panel).toBeVisible();
  await expect(panel.locator("#card-panel-title")).toHaveText(
    "Night sky · Macks Mountain, Floyd County VA, parcel 35-3",
  );
  await expect(panel.locator(".panel-question")).toHaveText("How dark is it overhead?");
  // UX part 2 PR 3d (P-2): Adjust here too, as on the map's panel; the override shows on the column, marked.
  const adjust = panel.locator(".adjust");
  await adjust
    .getByRole("button", { name: /^Override the grade: [A-F]$/ })
    .first()
    .click();
  await adjust.getByLabel("Why? (required)").fill("Darker than the atlas says");
  await adjust.getByRole("button", { name: "Save" }).click();
  await expect(adjust.locator(".adjust-now")).toContainText("Darker than the atlas says");
  await expect(page.getByRole("button", { name: /parcel 35-3, Night sky: / })).toContainText("✎");
  await panel.getByRole("button", { name: "Close" }).click();
  await expect(panel).toHaveCount(0);

  // Three at most: a fourth tick isn't offered, and the table takes no more.
  await page.getByRole("link", { name: "← Your list" }).click();
  for (const name of ["parcel 52-47A", "parcel 35-3", "parcel 6273"])
    await page.getByRole("checkbox", { name: new RegExp(`^Compare .*${name}`) }).check();
  await expect(page.getByRole("checkbox", { name: /^Compare Roan Mountain/ })).toBeDisabled();
  await page.getByRole("button", { name: "Compare 3" }).click();
  await expect(names).toHaveCount(3);
  await expect(page.locator(".cmp-add")).toHaveCount(0);

  expect(errors).toEqual([]);
});
