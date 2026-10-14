/**
 * A drawn line after a screen (owner, A, 2026-10-13): the banner says so, with "Let the app consider it"; a tap on the
 * line selects it in the Layers tree, with its details (name, kind, condition, width, note, Edit, Delete; owner, #127);
 * the row's × and Delete offer Undo; the Easement panel lists "Your lines", whose Edit selects the line in Layers.
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

/** Draws a track across Ferney's middle: three points, Finish. */
async function drawTrack(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Line", exact: true }).click();
  for (const d of [-0.0004, 0, 0.0004]) {
    const p = await at(page, d / 2, d);
    await page.mouse.click(p.x, p.y);
  }
  await page.getByRole("button", { name: "Finish", exact: true }).click();
}

test("a drawn line: the banner, its layer and details (name, kind, condition, width, note, delete and undo), and Your lines", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const net = await replayHar(context, [FERNEY]);
  await openExplorer(page, FERNEY);
  await importParcel(page, FERNEY);
  expectAllDone(await screenIt(page));
  await drawTrack(page);

  // The results stay, under the owner's banner, with today's Run again as "Let the app consider it".
  const banner = page.locator(".card-stale");
  await expect(banner).toContainText("You drew or changed a line after this screen.");
  await expect(banner.getByRole("button", { name: "Let the app consider it" })).toBeVisible();

  // A tap on the line selects its row in the Layers tree (owner, #127): "Track 1", with its condition and length on
  // the right; its details below, headed by its name: a track, pioneer, 10 ft.
  const mid = await at(page, 0, 0);
  await page.mouse.click(mid.x, mid.y);
  const info = page.locator(".info-panel");
  const row = (name: string) => info.getByRole("treeitem").filter({ hasText: name });
  await expect(row("Track 1")).toHaveAttribute("aria-selected", "true");
  await expect(row("Track 1").locator(".mt")).toHaveText(/^pioneer · [\d,]+ ft$/);
  const details = info.locator(".ip-details");
  await expect(details.getByLabel("Name")).toHaveValue("Track 1");
  await expect(details.getByRole("button", { name: "Track", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(details.getByRole("button", { name: "Pioneer" })).toHaveAttribute("aria-pressed", "true");
  await expect(details.getByLabel("Width in feet")).toHaveValue("10");
  await expect(details).toContainText("not used in costs yet");
  await expect(info).not.toContainText("Existing track");
  await expect(page.locator(".line-panel")).toHaveCount(0); // the floating panel is gone

  // An existing drive: renamed "Existing drive 1", improved and 12 ft by default; then paved, chosen; and a note.
  await details.getByRole("button", { name: "Existing drive" }).click();
  await expect(row("Existing drive 1")).toHaveAttribute("aria-selected", "true");
  await expect(details.getByLabel("Name")).toHaveValue("Existing drive 1");
  await expect(details.getByRole("button", { name: "Improved" })).toHaveAttribute("aria-pressed", "true");
  await expect(details.getByLabel("Width in feet")).toHaveValue("12");
  await details.getByRole("button", { name: "Paved" }).click();
  await expect(details.getByRole("button", { name: "Paved" })).toHaveAttribute("aria-pressed", "true");
  await expect(row("Existing drive 1").locator(".mt")).toHaveText(/^paved · /);
  await details.getByLabel("Note for Existing drive 1").fill("From the gate to the barn");
  await details.getByLabel("Note for Existing drive 1").press("Enter");

  // Renamed in its details, then in the tree (a double-click).
  await details.getByLabel("Name").fill("Gate lane");
  await details.getByLabel("Name").press("Enter");
  await expect(row("Gate lane")).toHaveCount(1);
  await row("Gate lane").locator(".nm").dblclick();
  await info.getByRole("tree").getByLabel("Name").fill("Gravel lane");
  await info.getByRole("tree").getByLabel("Name").press("Enter");
  await expect(row("Gravel lane")).toHaveAttribute("aria-selected", "true");
  await expect(details.getByLabel("Name")).toHaveValue("Gravel lane");

  // The row's ×, then Undo; the footer's Delete, then Undo: each time the line comes back as it was.
  const toast = page.locator(".line-undo");
  for (const del of [
    row("Gravel lane").getByRole("button", { name: "Delete Gravel lane" }),
    info.locator(".ip-actions").getByRole("button", { name: "Delete" }),
  ]) {
    await del.click();
    await expect(row("Gravel lane")).toHaveCount(0);
    await expect(toast).toContainText("Gravel lane deleted");
    await toast.getByRole("button", { name: "Undo" }).click();
    await expect(toast).toHaveCount(0);
    await expect(row("Gravel lane")).toHaveCount(1);
    await row("Gravel lane").click();
  }
  const markup = await page.evaluate(
    () => (JSON.parse(localStorage.getItem("ps.parcels")!) as { open: { markup: unknown[] } }).open.markup,
  );
  expect(markup).toEqual([
    expect.objectContaining({
      name: "Gravel lane",
      kind: "drive",
      condition: "paved",
      widthFt: 12,
      note: "From the gate to the barn",
    }),
  ]);
  // The Notes tab no longer lists the lines.
  await info.getByRole("tab", { name: /Notes/ }).click();
  await expect(info.getByText("Drawn lines")).toHaveCount(0);
  await info.getByRole("tab", { name: "Layers" }).click();
  await info.getByRole("button", { name: "Close the Info panel" }).click();

  // The Easement panel lists it by name: drawn after the screen, so nothing to say of it yet.
  await page.getByRole("button", { name: /^Easement needed:/ }).click();
  const easement = page.locator(".card-panel");
  const yours = easement.locator(".your-lines");
  await expect(yours.getByRole("heading", { name: "Your lines" })).toBeVisible();
  await expect(yours.locator("li")).toHaveCount(1);
  await expect(yours.locator("li b")).toHaveText("Gravel lane");
  await expect(yours.locator("li")).toContainText(/Existing drive, paved, [\d,]+ ft/);
  await expect(yours).toContainText("Drawn after this screen: run again to see what the app makes of it.");
  // Edit selects the line in Layers.
  await yours.getByRole("button", { name: "Edit" }).click();
  await expect(row("Gravel lane")).toHaveAttribute("aria-selected", "true");

  expect(net.misses, "data requests the HAR doesn't have").toEqual([]);
  expect(errors).toEqual([]);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("a long press renames a line's row; its × deletes, and Undo, above the Info panel, puts it back", async ({
    page,
    context,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await replayHar(context, [FERNEY]);
    await openExplorer(page, FERNEY);
    await importParcel(page, FERNEY);
    await drawTrack(page);
    const mid = await at(page, 0, 0);
    await page.mouse.click(mid.x, mid.y);
    const info = page.locator(".info-panel");
    const row = (name: string) => info.getByRole("treeitem").filter({ hasText: name });
    await expect(row("Track 1")).toHaveAttribute("aria-selected", "true");

    // A long press (touch) opens the name for editing.
    const nm = row("Track 1").locator(".nm");
    await nm.dispatchEvent("pointerdown", { pointerType: "touch", isPrimary: true, bubbles: true });
    const name = info.getByRole("tree").getByLabel("Name");
    await expect(name).toBeVisible();
    await name.fill("Logging road");
    await name.press("Enter");
    await expect(row("Logging road")).toHaveCount(1);

    // The × (always shown on a phone), then Undo: real taps, so the toast mustn't sit under the panel.
    await row("Logging road").getByRole("button", { name: "Delete Logging road" }).tap();
    const toast = page.locator(".line-undo");
    await expect(toast).toContainText("Logging road deleted");
    await toast.getByRole("button", { name: "Undo" }).tap();
    await expect(row("Logging road")).toHaveCount(1);
    expect(errors).toEqual([]);
  });
});
