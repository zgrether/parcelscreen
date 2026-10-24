/**
 * Step 14's screenshots (plan §11), desktop (1280 × 800) then phone (375 × 812): Uses on Mud Creek, Ferney and Roan,
 * What decides it opened, Mud Creek's split graded side by side, and Macks with Map layers' Power lines on (its 765 kV
 * line crosses it). Run by `pnpm screenshots`.
 */
import { expect, test, type Page } from "@playwright/test";
import { loadFixture, type FixtureSlug } from "../test/support/fixtures";
import { mudSplitLine } from "../test/support/splitScenario";
import {
  importParcel,
  importParcels,
  openExplorer,
  openFromList,
  reload,
  screenIt,
  seedScreens,
  settled,
  visit,
} from "../e2e/flow";
import { replayHar } from "../e2e/replay";

const OUT = "test-results/screenshots";
const MUD = "grayson-mud-creek-6273" as const;
const FERNEY = "ferney-creek-52-47A" as const;
const ROAN = "roan-hwy-143-099-046-02" as const;
const MACKS = "macks-mountain-35-3" as const;

async function liveImagery(page: Page): Promise<void> {
  await page.context().route(/basemap\.nationalmap\.gov|arcgisonline\.com/, (r) => r.continue());
}

async function onUses(page: Page, slug: FixtureSlug): Promise<void> {
  await visit(page, "/library");
  await openFromList(page, loadFixture(slug).input.name);
  const tilt = page.locator(".tilt-hint button");
  if (await tilt.count()) await tilt.first().click();
  await page.getByRole("tab", { name: "Uses" }).click();
  await expect(page.locator(".uses .use").first()).toBeVisible();
  await page.waitForTimeout(500);
}

for (const phone of [false, true]) {
  const device = phone ? "phone" : "desktop";
  test.describe(device, () => {
    test.use(
      phone
        ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } },
    );

    test("Uses on three parcels, What decides it, the split graded", async ({ page, context }) => {
      test.setTimeout(600_000);
      await replayHar(context, [MUD, FERNEY, ROAN]);
      await liveImagery(page);
      await openExplorer(page, MUD);
      await importParcels(page, [MUD, FERNEY, ROAN]);
      await seedScreens(page, [MUD, FERNEY, ROAN]);
      await settled(page);

      for (const [slug, name] of [
        [MUD, "mud"],
        [FERNEY, "ferney"],
        [ROAN, "roan"],
      ] as const) {
        await onUses(page, slug);
        if (phone) await page.locator("[title='Drag or tap to resize']").first().click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${OUT}/${device}-uses-${name}.png` });
      }

      // What decides it, on Mud Creek's Divide.
      await onUses(page, MUD);
      const divide = page.locator(".uses .use").filter({ hasText: "Divide" });
      await divide.locator("button").first().click();
      await divide.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${device}-uses-decides.png` });

      // Grade's shortcut line.
      await page.getByRole("tab", { name: "Grade" }).click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${device}-uses-shortcut.png` });

      // Mud Creek's split, graded from the recordings, side by side (stacked on a phone).
      await page.getByRole("tab", { name: "Uses" }).click();
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
      if (phone) await page.locator("[title='Drag or tap to resize']").first().click();
      await scenario.scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/${device}-uses-split.png` });
    });

    test("Macks with Power lines on", async ({ page, context }) => {
      test.setTimeout(300_000);
      await replayHar(context, MACKS);
      await liveImagery(page);
      await openExplorer(page, MACKS);
      await importParcel(page, MACKS);
      await screenIt(page);
      const tilt = page.locator(".tilt-hint button");
      if (await tilt.count()) await tilt.first().click();
      await page.getByRole("button", { name: "Map layers" }).click();
      await page
        .getByRole("group", { name: "On the map" })
        .getByRole("button", { name: "Power lines" })
        .click();
      await page.getByRole("button", { name: "Close the map panel" }).click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/${device}-power-lines.png` });
    });
  });
}
