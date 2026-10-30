/**
 * Roadmap step 14d's screenshots (docs/plans/step-14d-places.md §10), desktop (1280 × 800) then phone (375 × 812):
 * Map layers with Places open; Places over Mud Creek, clustered at zoom 10 and apart at 13; a river launch's card
 * (Mud Creek's South Fork New River access) and a lake launch's (Roan's Rat Branch Boat Ramp, with its drive); the
 * Paddling row and its panel on Mud Creek; and the interview's question 4 with Paddling's second row. Run by
 * `pnpm screenshots`; the cells are the fixtures' frozen copies (e2e/replay.ts).
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { loadFixture, type FixtureSlug } from "../test/support/fixtures";
import { importParcels, openExplorer, openFromList, seedScreens, settled, visit } from "../e2e/flow";
import { replayHar } from "../e2e/replay";
import { rubricFromWeights } from "../lib/rubric/default";
import { SCREEN_CONSTANTS } from "../lib/screen/config";

const OUT = "test-results/screenshots";
const MUD = "grayson-mud-creek-6273" satisfies FixtureSlug;
const ROAN = "roan-hwy-143-099-046-02" satisfies FixtureSlug;
/** Grayson Highlands State Park's trailhead, among Mud Creek's places. */
const PARK: [number, number] = [36.612985, -81.481351];
const RIVER_LAUNCH: [number, number] = [36.416814, -81.386859];
const LAKE_LAUNCH: [number, number] = [36.304787, -82.118919];

/** The starting list with Paddling weighed, so its row shows on the card. */
const PADDLER = rubricFromWeights({ ...SCREEN_CONSTANTS.card.weights.default, paddling: 5 });

type DebugMap = {
  jumpTo(o: object): void;
  isMoving(): boolean;
  areTilesLoaded(): boolean;
  project(ll: [number, number]): { x: number; y: number };
  getContainer(): HTMLElement;
};
const jump = (page: Page, zoom: number, at: [number, number]) =>
  page.evaluate(
    ([z, lat, lon]) =>
      (window as unknown as { __psMap: DebugMap }).__psMap.jumpTo({ zoom: z, center: [lon, lat] }),
    [zoom, at[0], at[1]] as const,
  );
const settle = async (page: Page) => {
  await page
    .waitForFunction(
      () => {
        const m = (window as unknown as { __psMap: DebugMap }).__psMap;
        return !m.isMoving() && m.areTilesLoaded();
      },
      undefined,
      { timeout: 20_000 },
    )
    .catch(() => undefined);
  await page.waitForTimeout(800);
};
const screenPoint = (page: Page, ll: [number, number]) =>
  page.evaluate(([lat, lon]) => {
    const m = (window as unknown as { __psMap: DebugMap }).__psMap;
    const p = m.project([lon, lat]);
    const box = m.getContainer().getBoundingClientRect();
    return { x: box.left + p.x, y: box.top + p.y };
  }, ll);

/** Opens a fixture's parcel from the list, its screen seeded current. */
async function open(page: Page, slug: FixtureSlug): Promise<void> {
  await visit(page, "/library");
  await openFromList(page, loadFixture(slug).input.name);
  await page.waitForFunction(() => !!(window as unknown as { __psMap?: unknown }).__psMap);
}

/** Taps a place and waits for its card. */
async function tapPlace(page: Page, ll: [number, number], phone: boolean): Promise<void> {
  await jump(page, 15, ll);
  await settle(page);
  const at = await screenPoint(page, ll);
  if (phone) await page.touchscreen.tap(at.x, at.y);
  else await page.mouse.click(at.x, at.y);
  await expect(page.locator(".place-tip")).toBeVisible();
  await page.waitForTimeout(300);
}

for (const phone of [false, true]) {
  const device = phone ? "phone" : "desktop";
  test.describe(device, () => {
    test.use(
      phone
        ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } },
    );

    test("Places, the launches' cards, the Paddling row and its question", async ({ page, context }) => {
      test.setTimeout(300_000);
      await replayHar(context, [MUD, ROAN]);
      await openExplorer(page, MUD);
      await importParcels(page, [MUD, ROAN]);
      await seedScreens(page, [MUD, ROAN], { current: true });
      await settled(page);
      await page.evaluate((m) => {
        window.__psKv!.setItem(
          "ps.rubrics",
          JSON.stringify({ mine: m, others: [], drivewayAdded: "undone" }),
        );
      }, PADDLER);

      // Map layers, with Places on.
      await open(page, MUD);
      await page.getByRole("button", { name: "Map layers" }).click();
      const panel = page.getByRole("region", { name: "Map layers" });
      await panel.getByRole("button", { name: "Places", exact: true }).click();
      await panel.getByRole("group", { name: "Places shown" }).scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/${device}-places-panel.png` });
      await page.getByRole("button", { name: "Close the map panel" }).click();

      // Over Mud Creek: clustered, then apart.
      await jump(page, 10, PARK);
      await settle(page);
      await page.screenshot({ path: `${OUT}/${device}-places-z10.png` });
      await jump(page, 13, PARK);
      await settle(page);
      await page.screenshot({ path: `${OUT}/${device}-places-z13.png` });

      // A river launch's card, then (Roan open) a lake launch's, with the drive Roan's grade timed.
      await tapPlace(page, RIVER_LAUNCH, phone);
      await page.screenshot({ path: `${OUT}/${device}-places-launch-river.png` });
      await open(page, ROAN);
      await tapPlace(page, LAKE_LAUNCH, phone);
      await page.screenshot({ path: `${OUT}/${device}-places-launch-lake.png` });

      // The Paddling row on Mud Creek's card, and its panel.
      await open(page, MUD);
      if (phone)
        for (let i = 0; i < 4; i++) {
          if ((await page.locator(".explore-panel").boundingBox())!.height > 500) break;
          await page.locator(".sheet-handle").tap();
          await page.waitForTimeout(500);
        }
      const row = page
        .locator("button.card-row", { has: page.getByText("Paddling", { exact: true }) })
        .first();
      await expect(row).toBeVisible({ timeout: 30_000 });
      await row.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/${device}-paddling-row.png` });
      await row.click();
      await expect(page.locator(".card-panel")).toBeVisible();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${device}-paddling-panel.png` });

      // The interview's question 4, Paddling's second row asked after "Some weekends".
      await visit(page, "/interview");
      for (let q = 1; q < 4; q++) {
        await expect(page.locator(".iv-progress")).toHaveText(`${q} of 14`);
        await page.getByRole("button", { name: /^(Skip this question|Next)$/ }).click();
      }
      await expect(page.locator(".iv-progress")).toHaveText("4 of 14");
      await page.getByRole("radio", { name: "Walk out the door" }).first().click();
      await page.getByRole("radio", { name: "Some weekends" }).first().click();
      await expect(page.getByText("The longest you'd drive to a launch?")).toBeVisible();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/${device}-interview-paddling.png`, fullPage: true });
    });
  });
}
