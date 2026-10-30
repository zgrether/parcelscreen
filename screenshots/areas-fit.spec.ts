/**
 * Explaining the fit (owner, 10/23), desktop (1280 × 800) then phone (375 × 812): the outlines filled and labelled by
 * fit at three zooms, a card with its rank and "What holds it back", the catalog-wide line, and Where to look from the
 * menu. Run by `pnpm screenshots`.
 */
import type { BrowserContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { AREA_WORDS as W } from "@/lib/areas/words";
import { defaultRubric } from "@/lib/rubric/default";
import { openExplorer, openMenu, reload } from "../e2e/flow";
import { GRAYSON } from "../e2e/redGate";
import { replayHar } from "../e2e/replay";

const OUT = "test-results/screenshots";

async function liveImagery(context: BrowserContext): Promise<void> {
  await context.route(/basemap\.nationalmap\.gov|arcgisonline\.com/, (r) => r.continue());
}

async function dismissTilt(page: Page): Promise<void> {
  const x = page.locator(".tilt-hint button");
  if (await x.count()) await x.first().click();
}

const jump = (page: Page, zoom: number) =>
  page.evaluate((z) => {
    const map = (window as unknown as { __psMap: { jumpTo(o: object): void } }).__psMap;
    map.jumpTo({ center: [-81.45, 36.42], zoom: z });
  }, zoom);

/** Where to look: docked on a desktop; under the search box on a phone. */
async function whereToLook(page: Page, phone: boolean) {
  if (phone) await page.getByRole("button", { name: "Search" }).click();
  const box = page.getByRole("region", { name: W.onTheMap });
  await expect(box.locator(".area-card").first()).toBeVisible({ timeout: 30_000 });
  return box;
}

for (const phone of [false, true]) {
  const device = phone ? "phone" : "desktop";
  test.describe(device, () => {
    test.use(
      phone
        ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } },
    );

    test("the labelled map at three zooms, a card, the catalog-wide line, the menu's Where to look", async ({
      page,
      context,
    }) => {
      test.setTimeout(240_000);
      await replayHar(context, [GRAYSON]);
      await liveImagery(context);
      await openExplorer(page, GRAYSON);
      await dismissTilt(page);

      // The outlines on (Map layers), then three zooms: letters only far out, names where they fit.
      await page.getByRole("button", { name: "Map layers" }).click();
      await page.getByRole("button", { name: W.outlines }).click();
      await expect(page.locator(".areas-legend")).toBeVisible();
      await page.locator(".areas-legend").evaluate((el) => el.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/${device}-areas-fit-legend.png` });
      await page.getByRole("button", { name: "Close the map panel" }).click();
      for (const [z, name] of [
        [6.6, "far"],
        [8.2, "mid"],
        [9.6, "near"],
      ] as const) {
        await jump(page, z);
        await page.waitForTimeout(1500);
        await page.screenshot({ path: `${OUT}/${device}-areas-fit-map-${name}.png` });
      }

      // A tap on an outline: its card.
      // A label well inside the visible map (not under the docked panel), and a tap just below it.
      const spot = await page.locator(".area-label:not(.al-hidden)").evaluateAll((els) => {
        const w = window.innerWidth,
          h = window.innerHeight;
        const r = els
          .map((e) => e.getBoundingClientRect())
          .find((b) => b.left > (w > 800 ? 420 : 4) && b.right < w - 4 && b.top > 120 && b.bottom < h - 200);
        return r ? { x: r.left + r.width / 2, y: r.bottom + 8 } : null;
      });
      await page.mouse.click(spot!.x, spot!.y);
      await expect(page.locator(".area-pop .area-card")).toBeVisible();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${device}-areas-fit-tapped.png` });
      await page.keyboard.press("Escape");

      // A card with its rank and What holds it back.
      await reload(page);
      await dismissTilt(page);
      const box = await whereToLook(page, phone);
      const card = box.locator(".area-card").first();
      await card.locator(".ac-back").evaluate((el) => el.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${device}-areas-fit-card.png` });

      // A Must that rules out most of the region: the line, and the rest ranked with their reasons.
      await page.waitForFunction(() => !!window.__psKv);
      await page.evaluate(
        (r) => window.__psKv!.setItem("ps.rubrics", JSON.stringify({ mine: r, others: [] })),
        { ...defaultRubric(), musts: [...defaultRubric().musts, { factor: "trails", threshold: 3 }] },
      );
      await reload(page);
      await dismissTilt(page);
      const tight = await whereToLook(page, phone);
      await expect(tight.locator(".area-region")).toBeVisible();
      await tight.locator(".area-region").evaluate((el) => el.scrollIntoView({ block: "start" }));
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${device}-areas-fit-region.png` });

      // Where to look from the menu.
      if (phone) await page.keyboard.press("Escape");
      await (await openMenu(page)).getByRole("button", { name: W.onTheMap }).click();
      await expect(
        page.getByRole("dialog", { name: W.onTheMap }).locator(".area-card").first(),
      ).toBeVisible();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${device}-areas-fit-menu.png` });
    });
  });
}
