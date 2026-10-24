/**
 * Step 14, Split as a scenario (docs/plans/step-14-land-uses.md §5, §11): on Mud Creek's kept grade, Divide's Try a
 * split starts the split tool; a line across the parcel, then Grade both pieces, grades the two pieces one after the
 * other from the recordings; both show side by side, each with its grade, its costs and a county check. Then Add this
 * piece to the list makes a new parcel of one piece, on the list, with the piece's grade.
 */
import { bbox, centroid } from "@turf/turf";
import { expect, test, type Page } from "@playwright/test";
import { loadFixture } from "../test/support/fixtures";
import { mudSplitLine } from "../test/support/splitScenario";
import {
  importParcels,
  listRow,
  openExplorer,
  openFromList,
  reload,
  seedScreens,
  settled,
  visit,
} from "./flow";
import { GRAYSON } from "./redGate";
import { replayHar, type ReplayLog } from "./replay";

type DebugWindow = Window & { __psMap?: { project(ll: [number, number]): { x: number; y: number } } };

/** A point on the map at [lat, lon], in page pixels. */
async function onMap(page: Page, lat: number, lon: number): Promise<{ x: number; y: number }> {
  const box = (await page.locator(".maplibregl-canvas").boundingBox())!;
  const p = await page.evaluate(([x, y]) => (window as DebugWindow).__psMap!.project([x, y]), [
    lon,
    lat,
  ] as const);
  return { x: box.x + p.x, y: box.y + p.y };
}

/** Mud Creek open from the list, with its kept grade, on Uses. */
async function openOnUses(page: Page): Promise<void> {
  await openExplorer(page, GRAYSON);
  await importParcels(page, [GRAYSON]);
  await seedScreens(page, [GRAYSON]);
  await settled(page);
  await visit(page, "/library");
  await openFromList(page, loadFixture(GRAYSON).input.name);
  await page.getByRole("tab", { name: "Uses" }).click();
}

/** Try a split, a line north to south through the parcel's middle, and Grade both pieces. */
async function splitAndGrade(page: Page): Promise<void> {
  const divide = page.locator(".uses .use").filter({ hasText: "Divide" });
  await divide.getByRole("button", { name: "Try a split" }).click();
  const bar = page.locator(".toolbar");
  await expect(bar).toHaveAttribute("data-mode", "split");
  await expect(bar.locator(".tb-status")).toHaveText("Draw where you'd split it");
  const geo = loadFixture(GRAYSON).input.polygon;
  const [, minLat, , maxLat] = bbox(geo);
  const [lon] = centroid(geo).geometry.coordinates as [number, number];
  const pad = (maxLat - minLat) * 0.08;
  for (const lat of [maxLat + pad, minLat - pad]) {
    const p = await onMap(page, lat, lon);
    await page.mouse.click(p.x, p.y);
  }
  await bar.getByRole("button", { name: "Grade both pieces" }).click();
  await expect(bar).toHaveAttribute("data-mode", "open");
}

/**
 * The split the recordings hold (test/support/splitScenario.ts): Mud Creek's scenario with that line, as Grade both
 * pieces leaves it before its first run (no screens yet), put on the open parcel; then each piece graded with its Try
 * again, one after the other. A line drawn by taps lands a pixel's width from it, and the pieces' screens are recorded
 * for this one.
 */
async function seedAndGrade(page: Page): Promise<void> {
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
  const pieces = page.getByRole("article", { name: "Split 1" }).locator(".scn-piece");
  await expect(pieces).toHaveCount(2);
  for (const i of [0, 1]) {
    await pieces.nth(i).getByRole("button", { name: "Try again" }).click();
    await graded(page);
  }
}

/** The grading has finished, one way or the other: no piece is grading or waiting. */
async function graded(page: Page): Promise<void> {
  const scenario = page.getByRole("article", { name: "Split 1" });
  await expect(scenario.locator(".scn-status[role=status]")).toHaveCount(0, { timeout: 480_000 });
  await expect(scenario.locator(".scn-row.loading")).toHaveCount(0);
}

/** Grading the pieces asked for requests the recordings don't have: said, and the test stops there. */
function stopOnMisses(net: ReplayLog): void {
  if (net.misses.length)
    test.info().annotations.push({ type: "not recorded", description: [...new Set(net.misses)].join("\n") });
  expect(
    [...new Set(net.misses)],
    "grading the pieces asks for requests the recordings don't have (recording them is the owner's)",
  ).toEqual([]);
}

test("Split Mud Creek: grade both pieces, both shown side by side, each with a county check", async ({
  page,
  context,
}) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const net = await replayHar(context, GRAYSON);
  await openOnUses(page);
  await seedAndGrade(page);
  stopOnMisses(net);

  // The scenario, on Uses.
  const scenario = page.getByRole("article", { name: "Split 1" });
  await expect(page.getByRole("region", { name: "Keep this, sell that" })).toBeVisible();

  // Both pieces, by side and acres, each graded with its rows and a county check.
  const pieces = scenario.locator(".scn-piece");
  await expect(pieces).toHaveCount(2);
  await expect(pieces.locator(".scn-piece-name")).toHaveText([
    // The line runs south, so its left is the east.
    /^East piece, [\d.]+ ac$/,
    /^West piece, [\d.]+ ac$/,
  ]);
  // The east piece (26.7 ac) is priced; the west one (2.6 ac, D, Not for us) has no routed driveway, so its cost says so.
  await expect(pieces.nth(0).locator(".scn-row[data-row=camp] .scn-value")).toContainText("plus the land");
  await expect(pieces.nth(1)).toContainText("The way in isn't priced yet");
  for (const piece of await pieces.all()) {
    await expect(piece.locator(".scn-row").first().locator(".card-grade")).toBeVisible();
    await expect(piece.locator(".scn-row[data-row=county] .scn-value")).toHaveText(
      // After its ✓ or ! mark.
      /^\s*(Passes the county's lot size and frontage|Under the county's .+)$/,
    );
    await expect(piece.getByText("This piece didn't grade")).toHaveCount(0);
  }
  // Side by side on a desktop.
  const [left, right] = [await pieces.nth(0).boundingBox(), await pieces.nth(1).boundingBox()];
  expect(right!.x).toBeGreaterThan(left!.x + left!.width - 1);

  // What you can do here, folded, opens to the piece's uses.
  await pieces.nth(0).locator(".scn-uses summary").click();
  await expect(pieces.nth(0).locator(".scn-uses .use-name")).toHaveCount(7);

  // Kept: the scenario and its screens are on the parcel, not in its own screens.
  const stored = await page.evaluate(
    () =>
      (
        JSON.parse(window.__psKv!.getItem("ps.parcels")!) as {
          open: { screenIds: string[]; scenarios: { screens: { left: string; right: string } }[] };
        }
      ).open,
  );
  expect(stored.screenIds).toHaveLength(1);
  expect(stored.scenarios[0]!.screens.left).toBeTruthy();
  expect(stored.scenarios[0]!.screens.right).toBeTruthy();
  expect(errors).toEqual([]);
});

test("Add a piece to the list: a new parcel of that piece, on the list, with the piece's grade", async ({
  page,
  context,
}) => {
  test.setTimeout(600_000);
  const net = await replayHar(context, GRAYSON);
  await openOnUses(page);
  await seedAndGrade(page);
  stopOnMisses(net);

  const piece = page.getByRole("article", { name: "Split 1" }).locator(".scn-piece").first();
  await piece.getByRole("button", { name: "Add this piece to the list" }).click();
  const name = `${loadFixture(GRAYSON).input.name}, East piece`;
  await expect(page.locator(".sh-name").first()).toHaveText(name);
  await expect(page.locator(".sh-card .card-grade")).toBeVisible(); // its screen came with it: no run
  await expect(page.locator(".grade-btn", { hasText: /^Grading…$/ })).toHaveCount(0);
  await settled(page);
  await visit(page, "/library");
  await page.getByRole("tab", { name: "Favorites" }).click();
  await expect(listRow(page, name)).toBeVisible();
});

/**
 * What runs without the pieces' recordings: the scenario kept and shown, its grading cancelled (each piece then says it
 * didn't grade, with Try again), Rename, Adjust the line, and Add this piece to the list.
 */
test("a split scenario: Grade both pieces, Cancel, Rename, Adjust the line, Add this piece to the list", async ({
  page,
  context,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await replayHar(context, GRAYSON);
  await openOnUses(page);
  await splitAndGrade(page);

  const region = page.getByRole("region", { name: "Keep this, sell that" });
  await expect(region.getByRole("heading", { name: "Keep this, sell that" })).toBeVisible();
  const scenario = region.getByRole("article", { name: "Split 1" });
  const status = scenario.locator(".scn-status[role=status]");
  await expect(status).toContainText("Grading piece 1 of 2…");
  await status.getByRole("button", { name: "Cancel" }).click();

  // Both pieces by side and acres, side by side, each ungraded with Try again; the scenario kept with no screens.
  const pieces = scenario.locator(".scn-piece");
  await expect(pieces.locator(".scn-piece-name")).toHaveText([
    // The line runs south, so its left is the east.
    /^East piece, [\d.]+ ac$/,
    /^West piece, [\d.]+ ac$/,
  ]);
  for (const piece of await pieces.all()) {
    await expect(piece.locator(".scn-status")).toContainText("This piece didn't grade");
    await expect(piece.getByRole("button", { name: "Try again" })).toBeVisible();
  }
  const [left, right] = [await pieces.nth(0).boundingBox(), await pieces.nth(1).boundingBox()];
  expect(right!.x).toBeGreaterThan(left!.x + left!.width - 1);
  const stored = () =>
    page.evaluate(
      () =>
        (
          JSON.parse(window.__psKv!.getItem("ps.parcels")!) as {
            open: { screenIds: string[]; scenarios: { name: string; screens: unknown }[] };
          }
        ).open,
    );
  expect((await stored()).scenarios).toMatchObject([
    { name: "Split 1", screens: { left: null, right: null } },
  ]);
  expect((await stored()).screenIds).toHaveLength(1); // the parcel's own screens are as they were

  // Rename.
  await scenario.getByRole("button", { name: "Rename" }).click();
  const field = region.getByRole("textbox", { name: "Rename" });
  await field.fill("Sell the east");
  await field.press("Enter");
  const renamed = region.getByRole("article", { name: "Sell the east" });
  await expect(renamed.getByRole("heading", { name: "Sell the east" })).toBeVisible();
  await expect.poll(async () => (await stored()).scenarios[0]?.name).toBe("Sell the east");

  // Adjust the line: the split tool, from the scenario's line; Cancel leaves it as it was.
  await renamed.getByRole("button", { name: "Adjust the line" }).click();
  const bar = page.locator(".toolbar");
  await expect(bar).toHaveAttribute("data-mode", "split");
  await expect(bar.getByRole("button", { name: "Grade both pieces" })).toBeEnabled();
  await bar.getByRole("button", { name: "Cancel" }).click();
  await expect(bar).toHaveAttribute("data-mode", "open");

  // Add this piece to the list: a new parcel of the east piece, open, and on the list, with no scenario of its own.
  await page.getByRole("tab", { name: "Uses" }).click();
  await page
    .getByRole("article", { name: "Sell the east" })
    .locator(".scn-piece")
    .first()
    .getByRole("button", { name: "Add this piece to the list" })
    .click();
  const name = `${loadFixture(GRAYSON).input.name}, East piece`;
  await expect(page.locator(".sh-name").first()).toHaveText(name);
  await expect(page.locator(".sh-star")).toContainText("On your list");
  const made = await stored();
  expect(made.scenarios).toEqual([]);
  // The piece had no grade (it was cancelled), so the new parcel grades as it opens, as combine's "as new" does.
  await expect(page.locator(".grade-btn", { hasText: /^Grading…$/ }).first()).toBeVisible();
  await settled(page);
  await visit(page, "/library");
  await page.getByRole("tab", { name: "Favorites" }).click();
  await expect(listRow(page, name)).toBeVisible();
  expect(errors).toEqual([]);
});
