/**
 * Step 8b (docs/plans/step-8b-parcel-panel.md): the parcel panel holds the parcel. On Mud Creek with the red-gate line:
 * Details from the toolbar's acres; the line's row edited (name, condition); + Mark from Lines & marks; the listing and
 * notes; Map layers holds only how the map looks, and Your lines and marks hides them all. Then the phone's sheet.
 */
import { expect, test, type Page } from "@playwright/test";
import roads from "../test/tools/driveway-validation.roads.json";
import { importParcel, openExplorer, reload, unfoldListing } from "./flow";
import { replayHar } from "./replay";

const GRAYSON = "grayson-mud-creek-6273" as const;

/** The red gate's drive (the validation study's road C) on the open parcel, named "Red gate". */
async function withRedGate(page: Page): Promise<void> {
  const line = (roads.c.coordinates as [number, number][]).map(([lon, lat]): [number, number] => [lat, lon]);
  await page.evaluate(async (line) => {
    const s = JSON.parse(window.__psKv!.getItem("ps.parcels")!) as {
      open: { key: string; markup: unknown[] };
      built: { key: string; markup: unknown[] }[];
    };
    const m = {
      id: "red-gate",
      name: "Red gate",
      shape: "line",
      kind: "easement",
      condition: "uncleared",
      line,
      widthFt: 30,
      note: "",
      recordedIn: "",
      at: "2026-10-15T12:00:00.000Z",
    };
    s.open.markup = [m];
    for (const b of s.built) if (b.key === s.open.key) b.markup = [m];
    await window.__psKv!.setItem("ps.parcels", JSON.stringify(s));
  }, line);
  await reload(page);
}

const stored = (page: Page) =>
  page.evaluate(
    () =>
      (
        JSON.parse(window.__psKv!.getItem("ps.parcels")!) as {
          open: Record<string, unknown> & { markup: unknown[] };
        }
      ).open,
  );

test("Details holds the parcel; Map layers holds the map; Your lines and marks hides them", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await replayHar(context, GRAYSON);
  await openExplorer(page, GRAYSON);
  await importParcel(page, GRAYSON);
  await withRedGate(page);

  // Not graded: it opens on Details, with its sections in order.
  const details = page.locator(".parcel-details");
  await expect(page.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true");
  await expect(details.locator(".pd-sec-head h3")).toHaveText([
    "Listing",
    "Notes",
    "Lines & marks",
    "Boundary",
    "Status",
  ]);
  // Grade says it isn't graded yet.
  await page.getByRole("tab", { name: "Grade" }).click();
  await expect(page.locator(".parcel-ungraded")).toHaveText(
    "Not graded yet. Grade this parcel to see how it does.",
  );

  // The toolbar's acres: Details again, at Boundary (the county record's facts).
  await page.getByRole("button", { name: /acres: parcel details$/ }).click();
  await expect(page.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true");
  await expect(details.locator(".pd-sec[data-boundary] table.facts")).toBeVisible();

  // The red gate's row: opened, renamed, its condition changed.
  const row = details.locator(".pd-row").filter({ hasText: "Red gate" });
  await expect(row.locator(".pd-meta")).toContainText("uncleared");
  await row.click();
  const open = details.locator(".pd-open");
  await open.getByLabel("Name").fill("Red gate road");
  await open.getByLabel("Name").press("Enter");
  await open.getByRole("group", { name: "Its condition" }).getByRole("button", { name: "Pioneer" }).click();
  await expect(
    details.locator(".pd-row").filter({ hasText: "Red gate road" }).locator(".pd-meta"),
  ).toContainText("pioneer");
  expect((await stored(page)).markup).toEqual([
    expect.objectContaining({ name: "Red gate road", condition: "pioneer" }),
  ]);

  // + Mark in Lines & marks opens the toolbar's picker; Draw a line starts its line tool.
  await details.getByRole("button", { name: "+ Mark" }).click();
  await expect(page.getByRole("dialog", { name: "Mark on the parcel" })).toBeVisible();
  await page.keyboard.press("Escape");
  await details.getByRole("button", { name: "Draw a line" }).click();
  await expect(page.locator(".toolbar")).toHaveAttribute("data-mode", "track");
  await page.getByRole("button", { name: "Cancel" }).click();

  // The listing and notes.
  const listing = await unfoldListing(details);
  await listing.getByLabel("Asking price").fill("185k");
  await listing.getByLabel("Asking price").press("Enter");
  await details.getByLabel(/^Notes for /).fill("Gate code from the agent.");
  await details.getByLabel(/^Notes for /).blur();
  await expect.poll(async () => (await stored(page)).notes).toBe("Gate code from the agent.");
  expect(await stored(page)).toMatchObject({ askingPrice: 185000 });
  // Clear has an Undo (polish #21).
  await details.getByRole("button", { name: "Clear", exact: true }).click();
  await expect.poll(async () => (await stored(page)).notes).toBe("");
  await expect(details).toContainText("Notes cleared.");
  await details.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await stored(page)).notes).toBe("Gate code from the agent.");

  // Map layers: only how the map looks; Your lines and marks hides them, and Details says so.
  await page.getByRole("button", { name: "Map layers" }).click();
  const layers = page.getByRole("region", { name: "Map layers" });
  await expect(layers.getByRole("group", { name: "On the map" })).toBeVisible();
  await expect(layers).not.toContainText("Red gate");
  await expect(layers).not.toContainText("Notes");
  await layers.getByRole("button", { name: "Your lines and marks" }).click();
  await expect(layers.getByRole("button", { name: "Your lines and marks" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(details.locator(".pd-hidden")).toHaveText("1 hidden on the map. Show them in Map layers.");
  await layers.getByRole("button", { name: "Your lines and marks" }).click();
  await expect(details.locator(".pd-hidden")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test("the sheet holds the same: the switch full width, a row's details in place, 44 px targets", async ({
    page,
    context,
  }) => {
    await replayHar(context, GRAYSON);
    await openExplorer(page, GRAYSON);
    await importParcel(page, GRAYSON);
    await withRedGate(page);
    await page.getByRole("button", { name: /acres: parcel details$/ }).tap();
    const switchBox = (await page.locator(".parcel-switch").boundingBox())!;
    expect(switchBox.width).toBeGreaterThan(330);
    for (const seg of await page.locator(".parcel-switch-seg").all())
      expect((await seg.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const row = page.locator(".pd-row").filter({ hasText: "Red gate" });
    await row.tap();
    await expect(page.locator(".pd-open").getByLabel("Name")).toHaveValue("Red gate");
    for (const b of await row.locator("button").all())
      expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
