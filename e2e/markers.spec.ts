/**
 * Point and area markers (WF4, docs/plans/parcel-workflow.md §3.1): the Mark tool (a kind, then a tap; an area's
 * corners, then Finish), each marker a layer in the Info panel's tree with its details. A septic permit passes the
 * Septic gate without a re-run, says how far it is from site #1 once dragged away, and its delete brings the warn back
 * (Undo puts the permit back). Markers outlast a reload.
 */
import { expect, test, type Page } from "@playwright/test";
import { expectedOf } from "../test/support/expected";
import { expectAllDone, importParcel, openExplorer, screenIt } from "./flow";
import { replayHar } from "./replay";

const MACKS = "macks-mountain-35-3" as const;

type DebugWindow = Window & { __psMap?: { project(ll: [number, number]): { x: number; y: number } } };

/** A [lat, lon] in page pixels. */
async function onMap(page: Page, [lat, lon]: [number, number]): Promise<{ x: number; y: number }> {
  const box = (await page.locator(".maplibregl-canvas").boundingBox())!;
  const p = await page.evaluate(([x, y]) => (window as DebugWindow).__psMap!.project([x, y]), [
    lon,
    lat,
  ] as const);
  return { x: box.x + p.x, y: box.y + p.y };
}

test("the Mark tool: a septic permit passes the gate, its distance once moved, delete and undo; an area; a reload", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await replayHar(context, [MACKS]);
  await openExplorer(page, MACKS);
  await importParcel(page, MACKS);
  expectAllDone(await screenIt(page));
  const gate = page.locator(".card-gates .gate").filter({ hasText: /septic/i });
  await expect(gate).toHaveAttribute("aria-label", "Septic: warn");

  // Mark → Septic permit → a tap at site #1.
  const site = expectedOf(MACKS, "run").sites![0]!.ll;
  await page.getByRole("button", { name: "Mark", exact: true }).click();
  await page
    .getByRole("group", { name: "What you're marking" })
    .getByRole("button", { name: "Septic permit" })
    .click();
  await expect(page.locator(".tb-status")).toHaveText("Tap where it is");
  const p = await onMap(page, site);
  await page.mouse.click(p.x, p.y);

  // Its details open; the gate passes at once, no re-run and no banner, with the reminder after the soils' sentence.
  const info = page.locator(".info-panel");
  const details = info.locator(".ip-details");
  await expect(details.getByLabel("Name")).toHaveValue("Septic permit 1");
  await expect(details.getByRole("button", { name: "Septic permit" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(gate).toHaveAttribute("aria-label", "Septic: pass");
  await expect(gate).toHaveAttribute(
    "title",
    "No soil on the parcel rates better than very limited for a septic field; a septic permit is on file (your marker): get a copy, and check it hasn't expired",
  );
  await expect(page.locator(".card-stale")).toHaveCount(0);
  // Its class, from the permit: shown in its Layers row.
  await details.getByRole("button", { name: "Conventional" }).click();
  const row = (name: string) => info.getByRole("treeitem").filter({ hasText: name });
  await expect(row("Septic permit 1").locator(".mt")).toHaveText("septic permit · conventional");

  // Dragged well away from site #1 (about 100 px): the gate says how far.
  const pin = page.locator(".mark-pin");
  await expect(pin).toHaveCount(1);
  const box = (await pin.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width / 2 + i * 10, box.y + box.height / 2);
  await page.mouse.up();
  await expect(gate).toHaveAttribute(
    "title",
    /; the permit is [\d,]+ ft from site #1; it covers the spot that was tested$/,
  );

  // Delete: the warn is back; Undo puts the permit back, and the pass.
  await info.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(gate).toHaveAttribute("aria-label", "Septic: warn");
  await expect(pin).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(gate).toHaveAttribute("aria-label", "Septic: pass");
  await expect(pin).toHaveCount(1);

  // An area: Mark → Clearing, three corners, Finish.
  await page.getByRole("button", { name: "Mark", exact: true }).click();
  await page
    .getByRole("group", { name: "What you're marking" })
    .getByRole("button", { name: "Clearing" })
    .click();
  const corners: [number, number][] = [
    [0.0006, 0.0006],
    [0.0006, 0.0012],
    [0.0012, 0.0009],
  ];
  for (const [dLat, dLon] of corners) {
    const c = await onMap(page, [site[0] + dLat, site[1] + dLon]);
    await page.mouse.click(c.x, c.y);
  }
  await expect(page.locator(".tb-status")).toContainText("3 corners");
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(details.getByLabel("Name")).toHaveValue("Clearing 1");
  await expect(row("Clearing 1").locator(".mt")).toHaveText(/^clearing · \d+\.\d\d ac$/);

  // Kept with the parcel: back after a reload.
  await page.reload();
  await expect(page.locator(".mark-pin")).toHaveCount(1);
  const kept = await page.evaluate(
    () =>
      (
        JSON.parse(localStorage.getItem("ps.parcels")!) as {
          open: { markup: { shape: string; name: string }[] };
        }
      ).open.markup,
  );
  expect(kept.map((m) => [m.shape, m.name])).toEqual([
    ["point", "Septic permit 1"],
    ["area", "Clearing 1"],
  ]);
  expect(errors).toEqual([]);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("the kinds scroll sideways in the one-line bar; a tap places the point", async ({ page, context }) => {
    await replayHar(context, [MACKS]);
    await openExplorer(page, MACKS);
    await importParcel(page, MACKS);
    await page.getByRole("button", { name: "Mark", exact: true }).tap();
    const kinds = page.getByRole("group", { name: "What you're marking" });
    // The bar stays one line: the kinds scroll inside it, and the page doesn't.
    expect(await kinds.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await kinds.getByRole("button", { name: "Spring" }).tap();
    const site = expectedOf(MACKS, "run").sites![0]!.ll;
    const p = await onMap(page, site);
    await page.touchscreen.tap(p.x, p.y);
    await expect(page.locator(".mark-pin")).toHaveCount(1);
    await expect(page.locator(".info-panel .ip-details").getByLabel("Name")).toHaveValue("Spring 1");
  });
});
