/**
 * Tennessee (roadmap step 2; docs/plans/step-2-tennessee.md §6.4, §7.3). Over one of the nine counties that keep their
 * own assessment systems the map says there are no state lines and offers Draw. The parcel services answer the replay
 * with empty collections there (e2e/replay.ts). PR 5 adds the Roan Mountain fixture's tests here.
 */
import { expect, test, type Page } from "@playwright/test";
import { OWN_RECORDS_HINT } from "@/lib/geo/ownRecords";
import { loadFixture, ROAN_SEARCH } from "../test/support/fixtures";
import { expectAllDone, openExplorer, openSearch, screenIt } from "./flow";
import { replayHar } from "./replay";

const ROAN = "roan-hwy-143-099-046-02" as const;

/** The parcel lines drawn on the map now (0 until the map is up). */
const linesDrawn = (page: Page) =>
  page.evaluate(
    () =>
      (
        (window as unknown as { __psMap?: { queryRenderedFeatures(): { layer: { id: string } }[] } }).__psMap
          ?.queryRenderedFeatures()
          .filter((f) => f.layer.id === "parcel-lines") ?? []
      ).length,
  );

/** Taps the map where this point is (the canvas's centre isn't the map's when a panel pads the view). */
async function tapAt(page: Page, ll: { lat: number; lon: number }): Promise<void> {
  const xy = await page.evaluate(
    ({ lat, lon }) =>
      (
        window as unknown as { __psMap: { project(ll: [number, number]): { x: number; y: number } } }
      ).__psMap.project([lon, lat]),
    ll,
  );
  const box = (await page.locator(".maplibregl-canvas").boundingBox())!;
  await page.mouse.click(box.x + xy.x, box.y + xy.y);
}

test("Roan Mountain: the Tennessee lines draw; a tap shows the Carter record's facts, deeded acres and its County record link; it screens", async ({
  page,
  context,
}) => {
  await replayHar(context, ROAN);
  await openExplorer(page, ROAN);
  await expect.poll(() => linesDrawn(page), { timeout: 30_000 }).toBeGreaterThan(0);
  await tapAt(page, loadFixture(ROAN).input.point);
  const info = page.getByRole("button", { name: /acres: parcel details$/ });
  await expect(info).toBeVisible({ timeout: 15_000 });
  await info.click();
  const facts = page.locator("table.facts").first();
  await expect(facts).toContainText("099 046.02");
  await expect(facts).toContainText("Carter");
  await expect(facts).toContainText("Deeded acres (county record)");
  await expect(facts).toContainText("12.71");
  const link = page.getByRole("link", { name: "County record ↗" }).first();
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("href", /^https:\/\/assessment\.cot\.tn\.gov\/TPAD\//);
  await page.getByRole("tab", { name: "Grade" }).click(); // step 8b: Esc would close the parcel
  expectAllDone(await screenIt(page));
  expect(errors).toEqual([]);
});

test("Roan Mountain: found by its tax-card number in Search", async ({ page, context }) => {
  await replayHar(context, ROAN);
  await openExplorer(page, ROAN);
  await expect.poll(() => linesDrawn(page), { timeout: 30_000 }).toBeGreaterThan(0);
  await openSearch(page);
  await page.keyboard.type(ROAN_SEARCH);
  await expect(page.getByText("099 046.02", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});

test("Tennessee's parcel service down: the hint names it, over Roan", async ({ page, context }) => {
  await replayHar(context, ROAN);
  await context.route(/Tennessee_Property_Boundaries_Public_Use\/FeatureServer\/0\/query/, (route) =>
    route.fulfill({ status: 500, body: "down", headers: { "access-control-allow-origin": "*" } }),
  );
  // No hillshade or contours: their unrecorded tiles' "Terrain tiles didn't load" could take the hint slot (it did, in CI).
  await openExplorer(page, ROAN, { "ps.hillshade": "0", "ps.contours": "0" });
  await expect(page.locator(".map-hint")).toContainText("Tennessee parcel service isn't responding", {
    timeout: 60_000,
  });
});

const FERNEY = "ferney-creek-52-47A" as const;
/** Downtown Knoxville, Knox County. */
const KNOXVILLE = { lat: 35.9606, lon: -83.9207, z: 15 };

let errors: string[] = [];
test.beforeEach(({ page }) => {
  errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
});

async function openAt(page: import("@playwright/test").Page, view: typeof KNOXVILLE): Promise<void> {
  await page.addInitScript((v) => {
    if (sessionStorage.getItem("e2e")) return;
    sessionStorage.setItem("e2e", "1");
    localStorage.clear();
    localStorage.setItem("ps.debug", "1");
    localStorage.setItem("ps.roads", "0");
    // No hillshade or contours: their tiles aren't recorded, and the replay aborts them, whose "Terrain tiles didn't
    // load" could take the one hint slot after the hint this reads (it did, in CI).
    localStorage.setItem("ps.hillshade", "0");
    localStorage.setItem("ps.contours", "0");
    localStorage.setItem("ps.view", JSON.stringify(v));
  }, view);
  await page.goto("/explore");
}

for (const phone of [false, true]) {
  test.describe(phone ? "on a phone" : "on a desktop", () => {
    if (phone) test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

    test("over Knox County: the no-lines hint with a Draw button that starts drawing", async ({
      page,
      context,
    }) => {
      await replayHar(context, FERNEY);
      await openAt(page, KNOXVILLE);
      const hint = page.locator(".map-hint");
      await expect(hint).toContainText(OWN_RECORDS_HINT, { timeout: 30_000 });
      const draw = hint.getByRole("button", { name: "Draw" });
      const box = (await draw.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      // Two lines at most (plan §6.7): the words beside a 44 px button.
      expect((await hint.boundingBox())!.height).toBeLessThanOrEqual(100);
      // Nothing scrolls sideways.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await draw.click();
      await expect(page.getByText(/(Tap|Click) each corner/)).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}
