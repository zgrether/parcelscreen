/**
 * A drawn line after a screen (owner, A, 2026-10-13): the banner says so, with "Let the app consider it"; a tap on the
 * line selects it in the Layers tree, with its details (kind, condition, width, note, Edit, Delete; owner, #127);
 * Delete offers Undo; the Easement panel lists "Your lines", whose Edit selects the line in Layers.
 */
import { centroid } from "@turf/turf";
import { expect, test, type Page } from "@playwright/test";
import { loadFixture } from "../test/support/fixtures";
import { expectAllDone, importParcel, openExplorer, screenIt } from "./flow";
import { replayHar } from "./replay";

const FERNEY = "ferney-creek-52-47A" as const;

type DebugWindow = Window & { __psMap?: { project(ll: [number, number]): { x: number; y: number } } };

/** A point `dLat`, `dLon` degrees from Ferney's centre, in page pixels. */
async function at(page: Page, dLat: number, dLon: number): Promise<{ x: number; y: number }> {
  const [lon, lat] = centroid(loadFixture(FERNEY).input.polygon).geometry.coordinates as [number, number];
  const box = (await page.locator(".maplibregl-canvas").boundingBox())!;
  const p = await page.evaluate(([x, y]) => (window as DebugWindow).__psMap!.project([x, y]), [
    lon + dLon,
    lat + dLat,
  ] as const);
  return { x: box.x + p.x, y: box.y + p.y };
}

test("a drawn line: the banner, its layer and details (kind, condition, width, note, delete and undo), and Your lines", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const net = await replayHar(context, [FERNEY]);
  await openExplorer(page, FERNEY);
  await importParcel(page, FERNEY);
  expectAllDone(await screenIt(page));

  // Draw a track across the parcel's middle: three points, Finish.
  await page.getByRole("button", { name: "Line", exact: true }).click();
  for (const d of [-0.0004, 0, 0.0004]) {
    const p = await at(page, d / 2, d);
    await page.mouse.click(p.x, p.y);
  }
  await page.getByRole("button", { name: "Finish", exact: true }).click();

  // The results stay, under the owner's banner, with today's Run again as "Let the app consider it".
  const banner = page.locator(".card-stale");
  await expect(banner).toContainText("You drew or changed a line after this screen.");
  await expect(banner.getByRole("button", { name: "Let the app consider it" })).toBeVisible();

  // A tap on the line selects it in the Layers tree (owner, #127), with its details below: a track, pioneer, 10 ft.
  const mid = await at(page, 0, 0);
  await page.mouse.click(mid.x, mid.y);
  const info = page.locator(".info-panel");
  await expect(info.getByRole("treeitem", { name: /Track/ })).toHaveAttribute("aria-selected", "true");
  const details = info.locator(".ip-details");
  await expect(details.getByRole("heading", { name: "Existing track (user-drawn)" })).toBeVisible();
  await expect(details.getByRole("button", { name: "Track", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(details.getByRole("button", { name: "Pioneer" })).toHaveAttribute("aria-pressed", "true");
  await expect(details.getByLabel("Width in feet")).toHaveValue("10");
  await expect(details).toContainText("not used in costs yet");
  await expect(page.locator(".line-panel")).toHaveCount(0); // the floating panel is gone

  // An existing drive: improved and 12 ft by default; then paved, chosen; and a note.
  await details.getByRole("button", { name: "Existing drive" }).click();
  await expect(info.getByRole("treeitem", { name: /Existing drive/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(details.getByRole("button", { name: "Improved" })).toHaveAttribute("aria-pressed", "true");
  await expect(details.getByLabel("Width in feet")).toHaveValue("12");
  await details.getByRole("button", { name: "Paved" }).click();
  await expect(details.getByRole("button", { name: "Paved" })).toHaveAttribute("aria-pressed", "true");
  await details.getByLabel("Note for the existing drive").fill("The gravel lane from the gate");
  await details.getByLabel("Note for the existing drive").press("Enter");

  // Delete, then Undo: the line is back, as it was.
  await info.locator(".ip-actions").getByRole("button", { name: "Delete" }).click();
  await expect(info.getByRole("treeitem", { name: /Existing drive/ })).toHaveCount(0);
  const toast = page.locator(".line-undo");
  await expect(toast).toContainText("Existing drive deleted");
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(toast).toHaveCount(0);
  await expect(info.getByRole("treeitem", { name: /Existing drive/ })).toHaveCount(1);
  const markup = await page.evaluate(
    () => (JSON.parse(localStorage.getItem("ps.parcels")!) as { open: { markup: unknown[] } }).open.markup,
  );
  expect(markup).toEqual([
    expect.objectContaining({
      kind: "drive",
      condition: "paved",
      widthFt: 12,
      note: "The gravel lane from the gate",
    }),
  ]);
  // The Notes tab no longer lists the lines.
  await info.getByRole("tab", { name: /Notes/ }).click();
  await expect(info.getByText("Drawn lines")).toHaveCount(0);
  await info.getByRole("tab", { name: "Layers" }).click();
  await info.getByRole("button", { name: "Close the Info panel" }).click();

  // The Easement panel lists it: drawn after the screen, so nothing to say of it yet.
  await page.getByRole("button", { name: /^Easement needed:/ }).click();
  const easement = page.locator(".card-panel");
  const yours = easement.locator(".your-lines");
  await expect(yours.getByRole("heading", { name: "Your lines" })).toBeVisible();
  await expect(yours.locator("li")).toHaveCount(1);
  await expect(yours.locator("li b")).toHaveText(/^Existing drive, paved, [\d,]+ ft$/);
  await expect(yours).toContainText("Drawn after this screen: run again to see what the app makes of it.");
  // Edit selects the line in Layers.
  await yours.getByRole("button", { name: "Edit" }).click();
  await expect(info.getByRole("treeitem", { name: /Existing drive/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  expect(net.misses, "data requests the HAR doesn't have").toEqual([]);
  expect(errors).toEqual([]);
});
