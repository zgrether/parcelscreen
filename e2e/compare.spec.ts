/**
 * The comparison table (VR6; owner, #117 review): two History parcels with kept screens, seeded from the fixtures'
 * expected results straight into IndexedDB (no screening), side by side at /compare. The columns, a best and a worst
 * mark, and a cell opening its slide-in panel for its parcel.
 */
import { expect, test } from "@playwright/test";
import { importParcels, openExplorer, seedScreens } from "./flow";
import { replayHar } from "./replay";

const FERNEY = "ferney-creek-52-47A" as const;
const MACKS = "macks-mountain-35-3" as const;

test("compare: two screened parcels as columns, best and worst marked, a cell opens its panel", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await replayHar(context, [FERNEY, MACKS]);
  await openExplorer(page, FERNEY);
  await importParcels(page, [FERNEY, MACKS]);

  await seedScreens(page, [FERNEY, MACKS]);

  await page.goto("/compare");
  const names = page.locator(".compare-table thead .cmp-name");
  await expect(names).toHaveCount(2);
  // Named after their prototype names (owner, #130).
  expect((await names.allTextContents()).sort()).toEqual([
    "Ferney Creek, Floyd County VA, parcel 52-47A",
    "Macks Mountain, Floyd County VA, parcel 35-3",
  ]);
  // Both are screened: each column has its grade and verdict, not "re-screens when opened".
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
  await panel.getByRole("button", { name: "Close" }).click();
  await expect(panel).toHaveCount(0);

  expect(errors).toEqual([]);
});
