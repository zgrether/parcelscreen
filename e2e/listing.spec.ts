/**
 * The listing's facts (WF1, docs/plans/parcel-workflow.md §2): typed in the Notes tab, the name shown for the parcel,
 * the listing's acres compared on the card, and a pasted listing link in the search centring the map on its address,
 * with only the address (never the link) sent to the geocoder, and no parcel selected for you.
 */
import { centroid } from "@turf/turf";
import { expect, test } from "@playwright/test";
import { loadFixture } from "../test/support/fixtures";
import { expectAllDone, importParcel, openExplorer, screenIt } from "./flow";
import { replayHar } from "./replay";

const FERNEY = "ferney-creek-52-47A" as const;
const LINK = "https://www.redfin.com/VA/Floyd/0-Ferney-Creek-Rd-24091/home/12345678";

type DebugWindow = Window & { __psMap?: { getCenter(): { lat: number; lng: number }; getZoom(): number } };

test("the listing's facts: typed, the name shown, the acres compared on the card; a link centres the map", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const net = await replayHar(context, FERNEY);
  // Every geocoder request is recorded, so the test can check the link never goes out. The listing's address is
  // answered here; the screen's own place searches go on to the recording.
  const [lon, lat] = centroid(loadFixture(FERNEY).input.polygon).geometry.coordinates as [number, number];
  const asked: string[] = [];
  const ADDRESS = "Ferney Creek Rd, Floyd, VA 24091";
  const forAddress = () => asked.filter((u) => decodeURIComponent(u).includes(`q=${ADDRESS}&`));
  await page.route("https://photon.komoot.io/**", (route) => {
    asked.push(route.request().url());
    if (!decodeURIComponent(route.request().url()).includes(`q=${ADDRESS}&`)) return route.fallback();
    return route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
      body: JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [lon + 0.004, lat + 0.003] },
            properties: {
              name: "Ferney Creek Road",
              osm_key: "highway",
              osm_value: "tertiary",
              state: "Virginia",
            },
          },
        ],
      }),
    });
  });
  await openExplorer(page, FERNEY);
  await importParcel(page, FERNEY);
  expectAllDone(await screenIt(page));

  // The Notes tab's Listing section.
  await page.locator('button[aria-label$="acres: parcel info"]').first().click();
  await page.getByRole("tab", { name: "Notes" }).click();
  const listing = page.getByRole("group", { name: "Listing" });
  await expect(listing.getByLabel("Name")).toHaveAttribute("placeholder", "52-47A");
  for (const [label, value] of [
    ["Name", "Ferney Creek 43 ac"],
    ["Listing link", LINK],
    ["Listing acres", "52"],
    ["Agent", "A. Agent, 540-555-0100"],
  ] as const) {
    await listing.getByLabel(label).fill(value);
    await listing.getByLabel(label).press("Enter");
  }
  await expect(listing.getByRole("link", { name: "Open listing ↗" })).toHaveAttribute("href", LINK);
  await expect(listing).toContainText("The listing says 52 ac; this boundary is 43.9 ac.");
  const stored = await page.evaluate(
    () => (JSON.parse(localStorage.getItem("ps.parcels")!) as { open: Record<string, unknown> }).open,
  );
  expect(stored).toMatchObject({
    name: "Ferney Creek 43 ac",
    listingUrl: LINK,
    listingAcres: 52,
    agent: "A. Agent, 540-555-0100",
  });

  // The name is the parcel's name: the Layers tree and the report's header use it.
  await page.getByRole("tab", { name: "Layers" }).click();
  await expect(page.getByRole("treeitem").first()).toContainText("Ferney Creek 43 ac");
  await page.getByRole("button", { name: "Close the Info panel" }).click();
  // The card says the acres differ, under its reason (appended, rule 7).
  await expect(page.locator(".card-note")).toHaveText("The listing says 52 ac; this boundary is 43.9 ac.");

  // A pasted link: "Go to" its address; the map centres there at a road's zoom, and nothing is selected.
  await page.getByRole("button", { name: "Search" }).click();
  const box = page.getByRole("combobox");
  await box.fill(LINK);
  const go = page.getByRole("option", { name: /^Go to Ferney Creek Rd, Floyd, VA 24091/ });
  await expect(go).toBeVisible();
  await page.waitForTimeout(600); // past the search's debounce: nothing may be sent for the link itself
  expect(forAddress()).toEqual([]);
  await go.click();
  await expect(page.locator(".map-hint")).toContainText(
    "Centred on Ferney Creek Rd, Floyd, VA 24091: tap the parcel.",
  );
  expect(forAddress()).toHaveLength(1);
  // Neither the screen nor the search ever sent the link itself.
  expect(asked.filter((u) => /redfin|12345678/.test(decodeURIComponent(u)))).toEqual([]);
  const view = await page.evaluate(() => {
    const m = (window as DebugWindow).__psMap!;
    return { ...m.getCenter(), zoom: m.getZoom() };
  });
  expect(view.zoom).toBeCloseTo(14, 0); // where the parcel outlines show, to tap
  expect(view.lat).toBeCloseTo(lat + 0.003, 3);
  expect(view.lng).toBeCloseTo(lon + 0.004, 3);

  // A link the app can't read says so.
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("combobox").fill("https://example.com/listing/9");
  await expect(page.locator(".sr-note")).toHaveText("Couldn't read an address from this link.");

  expect(net.misses, "data requests the HAR doesn't have").toEqual([]);
  expect(errors).toEqual([]);
});
