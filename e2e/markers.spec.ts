/**
 * Markers (WF4, docs/plans/parcel-workflow.md §3.1) and placing them (owner, after #136): + Mark opens the Mark
 * picker, a popover on a desktop and a bottom sheet on a phone, its kinds in four groups with the last three used
 * first; the kind sets the shape. A septic permit passes the Septic gate at once, says how far it is from the build site once
 * dragged away, and its delete brings the warn back (Undo puts it back); one tap makes it a point, more outline its
 * field. A long press on a phone (a right-click on a desktop) opens the picker there. The boundary tools moved under
 * Boundary ▾. Markers outlast a reload; a Septic field #136 saved reads as a Septic permit's area.
 */
import { expect, test, type Page } from "@playwright/test";
import { expectedOf } from "../test/support/expected";
import { expectAllDone, importParcel, openExplorer, reload, screenIt } from "./flow";
import { replayHar } from "./replay";
import { reportCard } from "../lib/report/card";
import { defaultNamedRubric } from "../lib/rubric/default";

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

const picker = (page: Page) => page.getByRole("dialog", { name: "Mark on the parcel" });
/** + Mark, then a kind from its group. */
async function mark(page: Page, group: string, kind: string): Promise<void> {
  await page.locator(".toolbar").getByRole("button", { name: "+ Mark", exact: true }).click();
  await picker(page)
    .getByRole("group", { name: group })
    .getByRole("button", { name: kind, exact: true })
    .click();
}

test("the Mark picker: a septic permit (a point, then a field), its gate, a drag, delete and undo; a clearing; Recent; a reload", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await replayHar(context, [MACKS]);
  await openExplorer(page, MACKS);
  await importParcel(page, MACKS);
  expectAllDone(await screenIt(page));
  const gate = page.locator(".must-row").filter({ has: page.locator(".row-label", { hasText: /septic/i }) });
  await expect(gate).toHaveAttribute("aria-label", "Septic: warn");

  // The picker, a popover on a desktop: four groups, no Recent yet.
  await page.locator(".toolbar").getByRole("button", { name: "+ Mark", exact: true }).click();
  await expect(picker(page).getByRole("group")).toHaveText([
    /^Build/,
    /^Ways in/,
    /^Water & utilities/,
    /^On the land/,
  ]);
  await expect(picker(page).getByRole("group", { name: "Build" }).getByRole("button")).toHaveText([
    "House site",
  ]);
  await page.keyboard.press("Escape");
  await expect(picker(page)).toHaveCount(0);

  // A septic permit: one tap at the build site, then Done, makes its point. Step 7: the card's build site is the
  // person's best homesite (on the starting list, Macks's site #3).
  const best = reportCard(expectedOf(MACKS, "run"), defaultNamedRubric());
  const bestSite = expectedOf(MACKS, "run").sites![best.at]!;
  const site = bestSite.ll;
  await mark(page, "Water & utilities", "Septic permit");
  await expect(page.locator(".tb-status")).toHaveText("Tap the permit's spot, or its field's corners");
  const p = await onMap(page, site);
  await page.mouse.click(p.x, p.y);
  await page.getByRole("button", { name: "Done", exact: true }).click();

  // Its row opens in Details (step 8b); on Grade, the gate passes at once, no re-run and no banner, with the reminder
  // after the soils' sentence.
  const info = page.locator(".parcel-details");
  const details = info.locator(".pd-open");
  const tab = (name: "Grade" | "Details") => page.getByRole("tab", { name }).click();
  await expect(details.getByLabel("Name")).toHaveValue("Septic permit 1");
  await tab("Grade");
  await expect(gate).toHaveAttribute("aria-label", "Septic: pass");
  await expect(gate).toHaveAttribute(
    "title",
    "No soil on the parcel rates better than very limited for a septic field; a septic permit is on file (your marker): get a copy, and check it hasn't expired",
  );
  await expect(page.locator(".card-stale")).toHaveCount(0);
  await tab("Details");
  const row = (name: string) => info.locator(".pd-row").filter({ hasText: name });
  await row("Septic permit 1").click();
  await details.getByRole("button", { name: "Conventional" }).click();
  await expect(row("Septic permit 1").locator(".pd-meta")).toHaveText("septic permit · conventional");
  // Its row and its pin carry the kind's icon.
  await expect(row("Septic permit 1").locator(".mark-icon")).toHaveCount(1);
  const pin = page.locator(".mark-pin");
  await expect(pin.locator("svg")).toHaveCount(1);

  // Dragged well away from the build site (about 100 px): the gate says how far.
  const box = (await pin.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width / 2 + i * 10, box.y + box.height / 2);
  await page.mouse.up();
  await tab("Grade");
  await expect(gate).toHaveAttribute(
    "title",
    new RegExp(`; the permit is [\\d,]+ ft from site #${bestSite.rank}; it covers the spot that was tested$`),
  );

  // Delete (its row's ×): the warn is back; Undo puts the permit back, and the pass.
  await tab("Details");
  await row("Septic permit 1").getByRole("button", { name: "Delete Septic permit 1" }).click();
  await tab("Grade");
  await expect(gate).toHaveAttribute("aria-label", "Septic: warn");
  await expect(pin).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(gate).toHaveAttribute("aria-label", "Septic: pass");
  await expect(pin).toHaveCount(1);

  // A septic permit's field: more taps outline it, then Finish (two corners aren't a field).
  const at = async (dLat: number, dLon: number) => onMap(page, [site[0] + dLat, site[1] + dLon]);
  await mark(page, "Water & utilities", "Septic permit");
  for (const [dLat, dLon] of [
    [-0.0006, -0.0006],
    [-0.0006, -0.0012],
  ] as const) {
    const c = await at(dLat, dLon);
    await page.mouse.click(c.x, c.y);
  }
  await expect(page.getByRole("button", { name: "Finish", exact: true })).toBeDisabled();
  const c3 = await at(-0.0012, -0.0009);
  await page.mouse.click(c3.x, c3.y);
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(details.getByLabel("Name")).toHaveValue("Septic permit 2");
  await expect(row("Septic permit 2").locator(".pd-meta")).toHaveText(/^septic permit · \d+\.\d\d ac$/);

  // A clearing: an area from three corners.
  await mark(page, "On the land", "Clearing");
  for (const [dLat, dLon] of [
    [0.0006, 0.0006],
    [0.0006, 0.0012],
    [0.0012, 0.0009],
  ] as const) {
    const c = await at(dLat, dLon);
    await page.mouse.click(c.x, c.y);
  }
  await expect(page.locator(".tb-status")).toContainText("3 corners");
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(details.getByLabel("Name")).toHaveValue("Clearing 1");
  await expect(row("Clearing 1").locator(".pd-meta")).toHaveText(/^clearing · \d+\.\d\d ac$/);

  // Recent: the last kinds used, newest first, each once, above the groups; kept after a reload.
  const recent = () => picker(page).getByRole("group", { name: "Recent" }).getByRole("button");
  await page.locator(".toolbar").getByRole("button", { name: "+ Mark", exact: true }).click();
  await expect(recent()).toHaveText(["Clearing", "Septic permit"]);
  await page.keyboard.press("Escape");

  // Kept with the parcel: back after a reload.
  await reload(page);
  await expect(page.locator(".mark-pin")).toHaveCount(1);
  const kept = await page.evaluate(
    () =>
      (
        JSON.parse(window.__psKv!.getItem("ps.parcels")!) as {
          open: { markup: { shape: string; name: string }[] };
        }
      ).open.markup,
  );
  expect(kept.map((m) => [m.shape, m.name])).toEqual([
    ["point", "Septic permit 1"],
    ["area", "Septic permit 2"],
    ["area", "Clearing 1"],
  ]);
  await page.locator(".toolbar").getByRole("button", { name: "+ Mark", exact: true }).click();
  await expect(recent()).toHaveText(["Clearing", "Septic permit"]);
  expect(errors).toEqual([]);
});

test("a right-click on the map opens the picker there; a line starts at that point", async ({
  page,
  context,
}) => {
  await replayHar(context, [MACKS]);
  await openExplorer(page, MACKS);
  await importParcel(page, MACKS);
  const site = expectedOf(MACKS, "run").sites![0]!.ll;
  const p = await onMap(page, site);
  await page.mouse.click(p.x, p.y, { button: "right" });
  await expect(picker(page).getByRole("heading", { name: "Mark here" })).toBeVisible();
  // Beside the point, not above the toolbar.
  const box = (await picker(page).boundingBox())!;
  expect(Math.abs(box.x - p.x)).toBeLessThan(400);
  await picker(page)
    .getByRole("group", { name: "Ways in" })
    .getByRole("button", { name: "Existing drive" })
    .click();
  await expect(page.locator(".toolbar")).toHaveAttribute("data-mode", "drive");
  await expect(page.locator(".tb-status")).toHaveText("1 point");
});

test("Boundary ▾ holds Parcel, Custom and Split, each starting its tool", async ({ page, context }) => {
  await replayHar(context, [MACKS]);
  await openExplorer(page, MACKS);
  await importParcel(page, MACKS);
  const bar = page.locator(".toolbar");
  for (const [item, mode] of [
    ["Parcel", "combine"],
    ["Custom", "draw"],
    ["Split", "split"],
  ] as const) {
    await page.getByRole("button", { name: "Boundary ▾" }).click();
    await page.getByRole("menuitem", { name: item }).click();
    await expect(bar).toHaveAttribute("data-mode", mode);
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(bar).toHaveAttribute("data-mode", "open");
  }
  // The old buttons are gone from the bar: the house and the lines are in the picker.
  for (const name of ["Parcel", "Custom", "Split", "Line", "House"])
    await expect(bar.getByRole("button", { name, exact: true })).toHaveCount(0);
});

test("a Septic field saved by #136 reads as a Septic permit drawn as an area", async ({ page, context }) => {
  await replayHar(context, [MACKS]);
  await openExplorer(page, MACKS);
  await importParcel(page, MACKS);
  const site = expectedOf(MACKS, "run").sites![0]!.ll;
  await page.evaluate(async (s) => {
    const store = JSON.parse(window.__psKv!.getItem("ps.parcels")!) as {
      open: { markup: unknown[] };
      built: { markup: unknown[] }[];
    };
    // As #136 saved one from its "Septic field" chip: an area of kind "septic", with no class.
    const field = {
      id: "f",
      name: "Septic permit 1",
      shape: "area",
      kind: "septic",
      ring: [
        [s[0], s[1]],
        [s[0], s[1] + 0.0005],
        [s[0] + 0.0005, s[1] + 0.0005],
      ],
      note: "",
      at: "2026-10-14T12:00:00.000Z",
    };
    store.open.markup = [field];
    store.built[0]!.markup = [field];
    await window.__psKv!.setItem("ps.parcels", JSON.stringify(store));
  }, site);
  await reload(page);
  const info = page.locator(".parcel-details");
  await page.getByRole("button", { name: /acres: parcel details$/ }).click();
  const row = info.locator(".pd-row").filter({ hasText: "Septic permit 1" });
  await expect(row.locator(".pd-meta")).toHaveText(/^septic permit · \d+\.\d\d ac$/);
  await row.click();
  await expect(info.locator(".pd-open").getByRole("button", { name: "Septic permit" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("+ Mark opens a bottom sheet of icons, four across; a long press opens it where it was, and the mark goes there", async ({
    page,
    context,
  }) => {
    await replayHar(context, [MACKS]);
    await openExplorer(page, MACKS);
    await importParcel(page, MACKS);

    // The sheet: along the bottom, the full width, a grid of four.
    await page.locator(".toolbar").getByRole("button", { name: "+ Mark", exact: true }).tap();
    const sheet = picker(page);
    const box = (await sheet.boundingBox())!;
    expect(Math.round(box.x)).toBe(0);
    expect(Math.round(box.width)).toBe(390);
    expect(Math.round(box.y + box.height)).toBe(844);
    expect(
      await sheet
        .locator(".mark-grid")
        .first()
        .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length),
    ).toBe(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // Picked from the sheet: a spring, then a tap places it.
    await sheet
      .getByRole("group", { name: "Water & utilities" })
      .getByRole("button", { name: "Spring" })
      .tap();
    const site = expectedOf(MACKS, "run").sites![0]!.ll;
    const p = await onMap(page, site);
    await page.touchscreen.tap(p.x, p.y);
    await expect(page.locator(".mark-pin")).toHaveCount(1);
    await expect(page.locator(".parcel-details .pd-open").getByLabel("Name")).toHaveValue("Spring 1");
    // Step 8b: its row is open in the sheet, raised to half; back to the grade, and the sheet down for the map.
    await page.getByRole("tab", { name: "Grade" }).tap();
    // Half → 88% → the peek (the handle's tap cycle).
    await page.locator(".sheet-handle").tap();
    await page.locator(".sheet-handle").tap();

    // A long press elsewhere: the sheet opens for that spot; a Gate goes there, with no further tap.
    const q = await onMap(page, [site[0] + 0.0012, site[1] - 0.0012]);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: q.x, y: q.y }] });
    await page.waitForTimeout(700);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(sheet.getByRole("heading", { name: "Mark here" })).toBeVisible();
    // Recent holds the spring.
    await expect(sheet.getByRole("group", { name: "Recent" }).getByRole("button")).toHaveText(["Spring"]);
    await sheet.getByRole("group", { name: "On the land" }).getByRole("button", { name: "Gate" }).tap();
    await expect(page.locator(".mark-pin")).toHaveCount(2);
    // At the pressed spot: projected again, since the sheet rises to show the gate's row (step 8b) and the map's
    // padding follows it.
    const gate = page.locator(".mark-pin").nth(1);
    await expect(page.locator(".parcel-details .pd-open").getByLabel("Name")).toHaveValue("Gate 1");
    await page.waitForTimeout(500);
    const q2 = await onMap(page, [site[0] + 0.0012, site[1] - 0.0012]);
    const g = (await gate.boundingBox())!;
    expect(Math.hypot(g.x + g.width / 2 - q2.x, g.y + g.height / 2 - q2.y)).toBeLessThan(6);
  });
});
