/**
 * Step 15's screenshots (plan §10), desktop (1280 × 800) then phone (375 × 812): How it could pay on Mud Creek,
 * Virginia's credit slider moved, a split's break-even on Mud Creek, and Roan (Tennessee). Run by
 * `pnpm screenshots step-15`.
 */
import { expect, test, type Page } from "@playwright/test";
import { loadFixture, type FixtureSlug } from "../test/support/fixtures";
import { mudSplitLine } from "../test/support/splitScenario";
import { importParcels, openExplorer, openFromList, reload, seedScreens, settled, visit } from "../e2e/flow";
import { replayHar } from "../e2e/replay";

const OUT = "test-results/screenshots/step-15";
const MUD = "grayson-mud-creek-6273" as const;
const ROAN = "roan-hwy-143-099-046-02" as const;

/** Uses on the parcel, with a phone's sheet at its tallest so the panel has the room. */
async function onUses(page: Page, slug: FixtureSlug, phone: boolean): Promise<void> {
  await visit(page, "/library");
  await openFromList(page, loadFixture(slug).input.name);
  const tilt = page.locator(".tilt-hint button");
  if (await tilt.count()) await tilt.first().click();
  await page.getByRole("tab", { name: "Uses" }).click();
  await expect(page.locator(".pay-list .use").first()).toBeVisible();
  await tall(page, phone);
}
async function tall(page: Page, phone: boolean): Promise<void> {
  if (!phone) return;
  const handle = page.locator("[title='Drag or tap to resize']").first();
  for (let i = 0; i < 3 && !(await page.locator(".explore.sheet-tall").count()); i++) {
    await handle.click();
    await page.waitForTimeout(400);
  }
}
const toTop = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => el.scrollIntoView({ block: "start" }));

for (const phone of [false, true]) {
  const device = phone ? "phone" : "desktop";
  test.describe(device, () => {
    test.use(
      phone
        ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } },
    );
    const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${device}-${name}.png` });

    test("How it could pay: Mud Creek, the slider, a split's break-even, Roan", async ({ page, context }) => {
      test.setTimeout(900_000);
      await replayHar(context, [MUD, ROAN]);
      await openExplorer(page, MUD);
      await importParcels(page, [MUD, ROAN]);
      await seedScreens(page, [MUD, ROAN], { current: true, settings: true });
      await settled(page);

      // Mud Creek's panel.
      await onUses(page, MUD, phone);
      await toTop(page, ".pay-list");
      await page.waitForTimeout(400);
      await shot(page, "pay-mud");

      // Virginia's credit slider, moved to $200,000.
      const easement = page.locator(".pay-list .use").filter({ hasText: "Conservation easement" });
      await easement.locator("button.use-row").click();
      await easement.getByRole("slider").fill("200000");
      await toTop(page, ".pay-slider");
      await page.waitForTimeout(400);
      await shot(page, "pay-slider");

      // Mud Creek's split, graded from the recordings, with a purchase price typed.
      const line = mudSplitLine();
      await page.evaluate(async (l) => {
        const kv = window.__psKv!;
        const store = JSON.parse(kv.getItem("ps.parcels")!) as {
          open: { key: string; scenarios: unknown[] };
          built?: { key: string; scenarios?: unknown[] }[];
        };
        const sc = {
          id: "split-1",
          name: "Split 1",
          a: l.a,
          b: l.b,
          screens: { left: null, right: null },
          at: new Date().toISOString(),
          breakEven: { price: 250000 },
        };
        store.open.scenarios = [sc];
        for (const b of store.built ?? []) if (b.key === store.open.key) b.scenarios = [sc];
        await kv.setItem("ps.parcels", JSON.stringify(store));
      }, line);
      await reload(page);
      await page.getByRole("tab", { name: "Uses" }).click();
      const scenario = page.getByRole("article", { name: "Split 1" });
      const pieces = scenario.locator(".scn-piece");
      for (const i of [0, 1]) {
        await pieces.nth(i).getByRole("button", { name: "Try again" }).click();
        await expect(scenario.locator(".scn-status[role=status]")).toHaveCount(0, { timeout: 480_000 });
      }
      await tall(page, phone);
      await expect(scenario.locator(".be-sell")).toBeVisible();
      await toTop(page, ".be");
      await page.waitForTimeout(400);
      await shot(page, "pay-breakeven");
      // The pieces with their break-even rows, and Split and resell's line.
      await toTop(page, ".scn-pieces");
      await page.waitForTimeout(300);
      await shot(page, "pay-pieces");

      // Roan, in Tennessee.
      await onUses(page, ROAN, phone);
      await toTop(page, ".pay-list");
      await page.waitForTimeout(400);
      await shot(page, "pay-roan");
      const tnEasement = page.locator(".pay-list .use").filter({ hasText: "Conservation easement" });
      await tnEasement.locator("button.use-row").click();
      await toTop(page, ".pay-detail");
      await page.waitForTimeout(400);
      await shot(page, "pay-roan-easement");
    });
  });
}
