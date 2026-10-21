/**
 * Step 10, the cost to enjoy (plan §11): Mud Creek's two lines after the answer, "plus the land" without a price, and a
 * rate changed in Settings → Costs flowing straight into the lines, with no re-grade.
 */
import { expect, test, type Page } from "@playwright/test";
import { loadFixture } from "../test/support/fixtures";
import { importParcels, openExplorer, openFromList, openMenu, seedScreens, settled, visit } from "./flow";
import { replayHar } from "./replay";

const MUD = "grayson-mud-creek-6273";
const NAME = loadFixture(MUD).input.name;

const setPrice = (page: Page, price: number | null) =>
  page.evaluate(
    ({ name, price }) => {
      const kv = window.__psKv!;
      const parcels = JSON.parse(kv.getItem("ps.parcels")!) as {
        built: { name: string; askingPrice: number | null; askingPriceAt: string | null }[];
      };
      for (const p of parcels.built)
        if (p.name === name)
          Object.assign(p, { askingPrice: price, askingPriceAt: price ? "2026-10-11T12:00:00Z" : null });
      kv.setItem("ps.parcels", JSON.stringify(parcels));
    },
    { name: NAME, price },
  );

test("the two lines, plus the land without a price, and a Settings rate flowing through", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  await replayHar(context, "ferney-creek-52-47A");
  await openExplorer(page, "ferney-creek-52-47A");
  await importParcels(page, [MUD]);
  await seedScreens(page, [MUD]);
  await settled(page);
  await setPrice(page, 185_000);
  await visit(page, "/library");
  await openFromList(page, NAME);

  const lines = page.getByRole("group", { name: "Cost to enjoy" });
  const camp = lines.getByRole("button", { name: /^Ready to camp/ });
  await expect(camp).toHaveAccessibleName("Ready to camp: $200–240k");
  await expect(lines.getByRole("button", { name: /^Ready to build/ })).toHaveAccessibleName(
    "Ready to build: $330–595k",
  );

  // A pioneer track at $50–60/ft: the camp's 2,888 ft track costs more at once.
  await (await openMenu(page)).getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Pioneer track (cleared, graded, 4x4): low").fill("50");
  await page.getByLabel("Pioneer track (cleared, graded, 4x4): high").fill("60");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(camp).toHaveAccessibleName("Ready to camp: $330–360k");
  // A rate isn't a run's input: no "settings changed" re-grade.
  await expect(page.getByRole("button", { name: /Grade again: settings changed/ })).toHaveCount(0);

  // No asking price: the range plus the land.
  await setPrice(page, null);
  await visit(page, "/library");
  await openFromList(page, NAME);
  await expect(camp).toHaveAccessibleName(/^Ready to camp: \$\d+–\d+k plus the land$/);
});
