/**
 * The area catalog's suggestion box (step 13, docs/plans/step-13-area-catalog.md §6, §10): after the interview,
 * "Areas that fit you", five cards; "Show me a parcel here" goes to the map there; on the map with nothing open,
 * "Where to look"; a starred area's outline stays on the map, and the star outlasts a reload; Map layers' Area
 * outlines shows every area.
 */
import { expect, test, type Page } from "@playwright/test";
import { AREA_WORDS as W, MUSTS_PARCEL_SCALE } from "@/lib/areas/words";
import { openExplorer, reload, visit } from "./flow";
import { GRAYSON } from "./redGate";
import { replayHar } from "./replay";

/** The features of the map's area source: how many outlines are drawn, and how many are starred. */
const drawn = (page: Page) =>
  page.evaluate(() => {
    // The source's own data, not what's rendered: most areas are out of view.
    type Src = { serialize(): { data: { features: { properties: { starred: boolean } }[] } } };
    const map = (window as unknown as { __psMap: { getSource(id: string): Src | undefined } }).__psMap;
    const src = map.getSource("areas");
    const f = src?.serialize().data.features ?? [];
    return { areas: f.length, starred: f.filter((x) => x.properties.starred).length };
  });

test("after the interview: Areas that fit you, five cards, and Show me a parcel here", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await replayHar(context, [GRAYSON]);
  await openExplorer(page, GRAYSON);
  await visit(page, "/interview");
  // Every screen skipped: the starting list's priorities.
  for (let i = 0; i < 16 && !(await page.getByText("What matters to you").first().isVisible()); i++)
    await page.getByRole("button", { name: /^(Next|Skip|See my priorities)$/ }).click();
  const box = page.getByRole("region", { name: W.afterInterview });
  await expect(box.locator(".area-card")).toHaveCount(5);
  // The starting list's must-haves are all parcel-scale: said once, under the title.
  await expect(box.locator(".area-note")).toHaveText(MUSTS_PARCEL_SCALE);
  await expect(box.locator(".ac-share")).toHaveCount(0);
  const first = (await box.locator(".ac-name").first().innerText()).trim();
  await box.getByRole("button", { name: W.showParcel }).first().click();
  await expect(page).toHaveURL(/\/explore/);
  // The map opened on the area, and with nothing open, the box is there too.
  await expect(page.getByRole("region", { name: W.onTheMap }).locator(".ac-name").first()).toHaveText(first);
});

test("on the map: Where to look; a star keeps an outline drawn, through a reload; Area outlines shows all", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await replayHar(context, [GRAYSON]);
  await openExplorer(page, GRAYSON);
  const box = page.getByRole("region", { name: W.onTheMap });
  await expect(box.locator(".area-card")).toHaveCount(5);
  await expect.poll(() => drawn(page)).toEqual({ areas: 0, starred: 0 });

  // A star: its outline, solid, whatever Map layers says.
  const card = box.locator(".area-card").first();
  await card.getByRole("button", { name: W.star }).click();
  await expect(card.getByRole("button", { name: W.starred })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => drawn(page).then((d) => d.starred)).toBe(1);
  await reload(page);
  await expect(box.locator(".area-card").first().getByRole("button", { name: W.starred })).toBeVisible();
  await expect.poll(() => drawn(page).then((d) => d.starred)).toBe(1);

  // Map layers' Area outlines: every area.
  await page.getByRole("button", { name: "Map layers" }).click();
  await page.getByRole("button", { name: W.outlines }).click();
  await expect.poll(() => drawn(page).then((d) => d.areas), { timeout: 15_000 }).toBe(30);
  // Show more: the other 25, ranked.
  await box.getByRole("button", { name: W.showMore }).click();
  await expect(box.locator(".area-rest li")).toHaveCount(25);
});
