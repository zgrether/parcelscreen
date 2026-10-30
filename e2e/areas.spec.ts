/**
 * The area catalog's suggestion box (step 13, docs/plans/step-13-area-catalog.md §6, §10): after the interview,
 * "Where to look" ("Areas that fit your answers" under it), five cards; "Show me a parcel here" opens the area's sample on the map there, read-only until
 * Add to list; on the map with nothing open, "Where to look"; a starred area's outline stays on the map, and the star
 * outlasts a reload; Map layers' Area outlines shows every area.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { AREA_FILE_VERSION } from "@/lib/areas/types";
import { AREA_WORDS as W, MUSTS_PARCEL_SCALE, SAMPLE_WORDS } from "@/lib/areas/words";
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

test("after the interview: Where to look, five cards, and Show me a parcel here", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await replayHar(context, [GRAYSON]);
  await openExplorer(page, GRAYSON);
  await visit(page, "/interview");
  // Every screen skipped: the starting list's priorities (17 screens since step 17's Climbing).
  for (let i = 0; i < 17 && !(await page.getByText("What matters to you").first().isVisible()); i++)
    await page.getByRole("button", { name: /^(Next|Skip this question|See my priorities)$/ }).click();
  const box = page.getByRole("region", { name: W.onTheMap });
  await expect(box.getByText(W.afterInterview)).toBeVisible();
  await expect(box.locator(".area-card")).toHaveCount(5);
  // The starting list's must-haves are all parcel-scale: said once, under the title.
  await expect(box.locator(".area-note")).toHaveText([W.ranked, MUSTS_PARCEL_SCALE]);
  await expect(box.locator(".ac-share")).toHaveCount(0);
  const first = (await box.locator(".ac-name").first().innerText()).trim();
  await box.getByRole("button", { name: W.showParcel }).first().click();
  await expect(page).toHaveURL(/\/explore/);

  // The area's first sample, graded, read-only until it's on the list.
  const header = page.locator(".explore-header");
  await expect(header.locator(".sh-name")).toHaveText(`Sample parcel 1 · ${first}`);
  await expect(header.locator(".sh-sample")).toHaveText(SAMPLE_WORDS.tag);
  await expect(header.locator(".sh-card .card-grade")).toHaveText(/^[A-F]$/);
  await expect(page.locator(".toolbar")).toContainText(SAMPLE_WORDS.readOnly);
  // The map is on it: its centre inside the area's box.
  const index = JSON.parse(
    readFileSync(join(process.cwd(), "public", "areas", `v${AREA_FILE_VERSION}`, "index.json"), "utf8"),
  ) as {
    areas: { name: string; bbox: [number, number, number, number] }[];
  };
  const [w, s, e, n] = index.areas.find((a) => a.name === first)!.bbox;
  const inside = () =>
    page.evaluate(
      ([w, s, e, n]) => {
        const c = (
          window as unknown as { __psMap: { getCenter(): { lng: number; lat: number } } }
        ).__psMap.getCenter();
        return c.lng >= w! && c.lng <= e! && c.lat >= s! && c.lat <= n!;
      },
      [w, s, e, n],
    );
  await expect.poll(inside).toBe(true);
  // The other one, then back to the first.
  await header.getByRole("button", { name: SAMPLE_WORDS.other }).click();
  await expect(header.locator(".sh-name")).toHaveText(`Sample parcel 2 · ${first}`);
  await header.getByRole("button", { name: SAMPLE_WORDS.other }).click();
  await expect(header.locator(".sh-name")).toHaveText(`Sample parcel 1 · ${first}`);

  // Add to list: an ordinary parcel of the person's, the tag gone and the tools back.
  await page
    .locator(".sh-acts")
    .getByRole("button", { name: /^Add to list/ })
    .click();
  await page.getByRole("dialog", { name: "Add to list" }).getByRole("button", { name: "Add" }).click();
  await expect(header.locator(".sh-sample")).toHaveCount(0);
  await expect(page.locator(".toolbar")).not.toContainText(SAMPLE_WORDS.readOnly);
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

test("from the map: Show me a parcel here opens the sample, and the map goes there", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await replayHar(context, [GRAYSON]);
  await openExplorer(page, GRAYSON);
  const box = page.getByRole("region", { name: W.onTheMap });
  const first = (await box.locator(".ac-name").first().innerText()).trim();
  await box.getByRole("button", { name: W.showParcel }).first().click();
  await expect(page.locator(".explore-header .sh-name")).toHaveText(`Sample parcel 1 · ${first}`);
  const index = JSON.parse(
    readFileSync(join(process.cwd(), "public", "areas", `v${AREA_FILE_VERSION}`, "index.json"), "utf8"),
  ) as {
    areas: { name: string; bbox: [number, number, number, number] }[];
  };
  const box4 = index.areas.find((a) => a.name === first)!.bbox;
  const inside = () =>
    page.evaluate(([w, s, e, n]) => {
      const c = (
        window as unknown as { __psMap: { getCenter(): { lng: number; lat: number } } }
      ).__psMap.getCenter();
      return c.lng >= w! && c.lng <= e! && c.lat >= s! && c.lat <= n!;
    }, box4);
  await expect.poll(inside).toBe(true);
});
