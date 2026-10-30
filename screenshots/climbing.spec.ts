/**
 * Roadmap step 17's screenshots (docs/plans/step-17-climbing.md §10), desktop (1280 × 800) then phone (375 × 812):
 * Map layers with Places › Climbing and its key; the climbing areas around Chattanooga at zoom 9; Grayson Highlands'
 * bouldering card from Mud Creek, with its drive; the Climbing row on Mud Creek's card and its panel; and the
 * interview's climbing screen with its second row. Taken by `climbing-shots.yml` on CI's runners (the live basemaps),
 * into test-results/screenshots/step-17/. Mud Creek's data is its recording; the climbing cells are the committed
 * ones, so Chattanooga's show although no fixture is near it.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { loadFixture, type FixtureSlug } from "../test/support/fixtures";
import { importParcels, openExplorer, openFromList, seedScreens, settled, visit } from "../e2e/flow";
import { replayHar } from "../e2e/replay";
import { rubricFromWeights } from "../lib/rubric/default";
import { SCREEN_CONSTANTS } from "../lib/screen/config";
import { PLACES_PATH } from "../lib/screen/placeData";

const OUT = "test-results/screenshots/step-17";
const MUD = "grayson-mud-creek-6273" satisfies FixtureSlug;
/** Grayson Highlands' bouldering, the Massie Gap lot. */
const BOULDERS: [number, number] = [36.63314, -81.50731];
/** Between the Tennessee Wall, Sunset Rock, Foster Falls, Denny Cove and Stone Fort. */
const CHATTANOOGA: [number, number] = [35.2, -85.45];

/** The starting list with Climbing weighed, so its row shows on the card. */
const CLIMBER = rubricFromWeights({ ...SCREEN_CONSTANTS.card.weights.default, climbing: 5 });

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
  await page.waitForTimeout(1200);
};
const screenPoint = (page: Page, ll: [number, number]) =>
  page.evaluate(([lat, lon]) => {
    const m = (window as unknown as { __psMap: DebugMap }).__psMap;
    const p = m.project([lon, lat]);
    const box = m.getContainer().getBoundingClientRect();
    return { x: box.left + p.x, y: box.top + p.y };
  }, ll);

async function openMud(page: Page): Promise<void> {
  await visit(page, "/library");
  await openFromList(page, loadFixture(MUD).input.name);
  await page.waitForFunction(() => !!(window as unknown as { __psMap?: unknown }).__psMap);
}

for (const phone of [false, true]) {
  const device = phone ? "phone" : "desktop";
  test.describe(device, () => {
    test.use(
      phone
        ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } },
    );

    test("Places › Climbing, a crag's card, the Climbing row and its question", async ({ page, context }) => {
      test.setTimeout(300_000);
      await replayHar(context, [MUD]);
      // The committed climbing cells, wherever the map is (registered last, so asked first).
      await context.route(`**${PLACES_PATH}/curated/*.json`, (route) => {
        const file = join(process.cwd(), "public", new URL(route.request().url()).pathname);
        return existsSync(file)
          ? route.fulfill({ status: 200, contentType: "application/json", body: readFileSync(file) })
          : route.fulfill({ status: 404, body: "not found" });
      });
      // The basemaps and terrain live, as step 16's shots (the replay aborts them).
      await context.route(
        /basemap\.nationalmap\.gov|vginmaps\.vdem\.virginia\.gov|services\.nconemap\.gov\/.*Orthoimagery|tiles\.mapterhorn\.com|elevation-tiles-prod/,
        (r) => r.continue(),
      );
      await openExplorer(page, MUD);
      await importParcels(page, [MUD]);
      await seedScreens(page, [MUD], { current: true });
      await settled(page);
      await page.evaluate((m) => {
        window.__psKv!.setItem(
          "ps.rubrics",
          JSON.stringify({ mine: m, others: [], drivewayAdded: "undone" }),
        );
      }, CLIMBER);

      // Map layers: Places on, Climbing and its key.
      await openMud(page);
      await page.getByRole("button", { name: "Map layers" }).click();
      const panel = page.getByRole("region", { name: "Map layers" });
      await panel.getByRole("button", { name: "Places", exact: true }).click();
      await panel.getByText("Climbing: orange for rope").scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/${device}-places-climbing-panel.png` });
      // Climbing alone, so its icons read on the map.
      for (const k of [
        "ER hospitals",
        "Airports",
        "Trailheads",
        "Groceries",
        "Long-trail access",
        "Paddle launches",
      ])
        await panel.getByRole("group", { name: "Places shown" }).getByRole("button", { name: k }).click();
      await page.getByRole("button", { name: "Close the map panel" }).click();

      // Chattanooga's areas at zoom 9.
      await jump(page, 9, CHATTANOOGA);
      await settle(page);
      await page.screenshot({ path: `${OUT}/${device}-chattanooga.png` });

      // Grayson Highlands' bouldering from Mud Creek: its card, with the drive Mud Creek's grade timed.
      await jump(page, 11, BOULDERS);
      await settle(page);
      await page.screenshot({ path: `${OUT}/${device}-mud-creek-climbing.png` });
      await jump(page, 15, BOULDERS);
      await settle(page);
      const at = await screenPoint(page, BOULDERS);
      if (phone) await page.touchscreen.tap(at.x, at.y);
      else await page.mouse.click(at.x, at.y);
      await expect(page.locator(".place-tip")).toContainText("Climbing: bouldering");
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${device}-crag-card.png` });

      // The Climbing row on Mud Creek's card, and its panel.
      await openMud(page);
      if (phone)
        for (let i = 0; i < 4; i++) {
          if ((await page.locator(".explore-panel").boundingBox())!.height > 500) break;
          await page.locator(".sheet-handle").tap();
          await page.waitForTimeout(500);
        }
      const row = page
        .locator("button.card-row", { has: page.getByText("Climbing", { exact: true }) })
        .first();
      await expect(row).toBeVisible({ timeout: 30_000 });
      await row.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/${device}-climbing-row.png` });
      await row.click();
      await expect(page.locator(".card-panel")).toBeVisible();
      await page.locator(".card-panel").evaluate((el) => el.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${device}-climbing-panel.png` });

      // The interview's climbing screen (question 4's third), its second row asked after "A few times a season".
      await visit(page, "/interview");
      for (let q = 1; q < 4; q++) {
        await expect(page.locator(".iv-progress")).toHaveText(`${q} of 14`);
        await page.getByRole("button", { name: /^(Skip this question|Skip|Next)$/ }).click();
      }
      for (let s = 0; s < 2; s++) {
        await expect(page.locator(".iv-progress")).toHaveText("4 of 14");
        await page.getByRole("button", { name: /^(Skip this question|Skip|Next)$/ }).click();
      }
      await expect(page.locator(".iv-scene")).toContainText("Rope and a rack");
      await page.getByRole("radio", { name: "A few times a season" }).first().click();
      await expect(page.getByText("The longest you'd drive for a day of climbing?")).toBeVisible();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/${device}-interview-climbing.png`, fullPage: true });
    });
  });
}
