/**
 * Explaining the fit (owner, 10/23): each card's rank and what holds it back, the outlines filled and labelled by fit
 * with a legend, a tap on an outline opening its card, the catalog-wide line with its way to the limit on What matters,
 * and Where to look reachable from the menu with a parcel open.
 */
import { expect, test, type Page } from "@playwright/test";
import { AREA_WORDS as W } from "@/lib/areas/words";
import { defaultRubric } from "@/lib/rubric/default";
import { importParcels, openExplorer, openFromList, openMenu, reload, seedScreens, visit } from "./flow";
import { GRAYSON } from "./redGate";
import { replayHar } from "./replay";

/** A tap on an area's outline, at its label's spot (the area's centre of mass). */
async function tapArea(page: Page, name: string): Promise<void> {
  const label = page.locator(".area-label", { has: page.locator(".al-name", { hasText: name }) });
  const box = (await label.boundingBox())!;
  // Just below the label (labels don't take taps): still inside the outline.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height + 6);
}

test("each card: its rank beside the fit, and what holds it back; the map's outlines by fit, a tap opens the card", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await replayHar(context, [GRAYSON]);
  await openExplorer(page, GRAYSON);
  const box = page.getByRole("region", { name: W.onTheMap });
  const first = box.locator(".area-card").first();
  await expect(first.locator(".ac-rank")).toHaveText(/^.+ · #1 of 30 for you$/);
  await expect(box.locator(".area-card").nth(2).locator(".ac-rank")).toHaveText(/ · #3 of 30 for you$/);
  await expect(first.locator(".ac-back")).toContainText(W.holdsBack);
  await expect(first.locator(".ac-back li")).not.toHaveCount(0);

  // Map layers: the outlines, the legend under them, a label each with its fit letter.
  await page.getByRole("button", { name: "Map layers" }).click();
  await page.getByRole("button", { name: W.outlines }).click();
  await expect(page.locator(".areas-legend")).toHaveText(W.legend);
  await expect(page.locator(".area-label")).toHaveCount(30);
  await expect(page.locator(".area-label .al-fit").first()).toHaveText(/^[A-F][+−]?$/);
  // No two shown labels overlap.
  const boxes = await page
    .locator(".area-label:not(.al-hidden)")
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect));
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const [a, b] = [boxes[i]!, boxes[j]!];
      const apart = a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
      expect(apart, `labels ${i} and ${j}`).toBe(true);
    }

  // A tap on Grayson Highlands' outline: its card, rank and all.
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const map = (window as unknown as { __psMap: { jumpTo(o: object): void } }).__psMap;
    map.jumpTo({ center: [-81.5, 36.63], zoom: 9.5 });
  });
  await page.waitForTimeout(500);
  await tapArea(page, "Grayson Highlands");
  const pop = page.locator(".area-pop .area-card");
  await expect(pop.locator(".ac-name")).toHaveText(/^Grayson Highlands/);
  await expect(pop.locator(".ac-rank")).toHaveText(/ · #\d+ of 30 for you$/);
  await expect(pop.getByRole("button", { name: W.showParcel })).toBeVisible();
  // Its star turns as it's tapped (the walkthroughs, 10/23: it stayed hollow).
  const star = pop.getByRole("button", { name: W.star });
  await star.click();
  await expect(pop.getByRole("button", { name: W.starred })).toHaveAttribute("aria-pressed", "true");
  await pop.getByRole("button", { name: W.starred }).click();
  await expect(pop.getByRole("button", { name: W.star })).toHaveAttribute("aria-pressed", "false");

  // Where parcels can be picked, a tap is the parcel's: no area card over it.
  await page.locator(".maplibregl-popup-close-button").click();
  await page.evaluate(() => {
    const map = (window as unknown as { __psMap: { jumpTo(o: object): void } }).__psMap;
    map.jumpTo({ center: [-81.5, 36.63], zoom: 14.5 });
  });
  await page.waitForTimeout(500);
  // The map's centre, inside Grayson Highlands' outline (its fill is under the tap).
  const at = await page.evaluate(() => {
    type M = {
      getCanvas(): HTMLCanvasElement;
      queryRenderedFeatures(p: [number, number], o: object): unknown[];
    };
    const map = (window as unknown as { __psMap: M }).__psMap;
    const r = map.getCanvas().getBoundingClientRect();
    const p: [number, number] = [r.width / 2, r.height / 2];
    return {
      x: r.left + p[0],
      y: r.top + p[1],
      under: map.queryRenderedFeatures(p, { layers: ["areas-fill"] }).length,
    };
  });
  expect(at.under).toBeGreaterThan(0);
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(500);
  await expect(page.locator(".area-pop")).toHaveCount(0);
});

test("a Must that rules out most of the region: the box says so, and Change it opens that limit", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await replayHar(context, [GRAYSON]);
  await openExplorer(page, GRAYSON);
  await page.waitForFunction(() => !!window.__psKv);
  await page.evaluate((r) => window.__psKv!.setItem("ps.rubrics", JSON.stringify({ mine: r, others: [] })), {
    ...defaultRubric(),
    musts: [...defaultRubric().musts, { factor: "trails", threshold: 3 }],
  });
  await reload(page);
  const box = page.getByRole("region", { name: W.onTheMap });
  const line = box.locator(".area-region");
  await expect(line).toContainText(
    "Your 3-minute trailhead limit rules out most of the region; that's why few areas fit.",
  );
  // Every area is still ranked, each left-out one with its reason.
  const top = await box.locator(".area-card").count();
  await box.getByRole("button", { name: top ? W.showMore : W.showAll }).click();
  await expect(box.locator(".area-rest li")).toHaveCount(30 - top);
  await expect(box.locator(".area-rest-rank").last()).toContainText("passes your must-haves");
  await line.getByRole("link", { name: W.changeIt }).click();
  await expect(page).toHaveURL(/\/priorities\?limit=trails$/);
  await expect(page.getByRole("dialog")).toContainText("Trails");
});

test("Where to look from the menu, with a parcel open", async ({ page, context }) => {
  test.setTimeout(120_000);
  await replayHar(context, [GRAYSON]);
  await openExplorer(page, GRAYSON);
  await importParcels(page, [GRAYSON]);
  await seedScreens(page, [GRAYSON]);
  await visit(page, "/library");
  await openFromList(page, "Mud Creek");
  await (await openMenu(page)).getByRole("button", { name: W.onTheMap }).click();
  const dialog = page.getByRole("dialog", { name: W.onTheMap });
  await expect(dialog.locator(".area-card")).toHaveCount(5);
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
});
