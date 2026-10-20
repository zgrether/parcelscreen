/**
 * The listing's facts (WF1, docs/plans/parcel-workflow.md §2): typed in the Notes tab, the name shown for the parcel,
 * the listing's acres compared on the card, and a pasted listing link in the search centring the map on its address,
 * with only the address (never the link) sent to the geocoder, and no parcel selected for you. Then (owner, #130) the
 * next parcel opened is offered that link with one tap.
 */
import { centroid } from "@turf/turf";
import { expect, test, type Page } from "@playwright/test";
import { loadFixture } from "../test/support/fixtures";
import {
  expectAllDone,
  importParcel,
  openExplorer,
  openFromList,
  openSearch,
  screenIt,
  unfoldListing,
} from "./flow";
import { replayHar } from "./replay";

const FERNEY = "ferney-creek-52-47A" as const;
const LINK = "https://www.redfin.com/VA/Floyd/0-Ferney-Creek-Rd-24091/home/12345678";

type DebugWindow = Window & { __psMap?: { getCenter(): { lat: number; lng: number }; getZoom(): number } };

const ADDRESS = "Ferney Creek Rd, Floyd, VA 24091";

/**
 * The geocoder: every request is recorded, so a test can check the link never goes out. The listing's address is
 * answered here, near Ferney; the screen's own place searches go on to the recording.
 */
async function geocoder(page: Page): Promise<{ asked: string[]; at: [number, number] }> {
  const [lon, lat] = centroid(loadFixture(FERNEY).input.polygon).geometry.coordinates as [number, number];
  const asked: string[] = [];
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
  return { asked, at: [lon + 0.004, lat + 0.003] };
}

/** Search for the link and pick "Go to …". */
async function goToLink(page: Page): Promise<void> {
  await (await openSearch(page)).fill(LINK);
  await page.getByRole("option", { name: /^Go to / }).click();
  await expect(page.locator(".map-hint")).toContainText("tap the parcel");
}

const stored = (page: Page) =>
  page.evaluate(
    () => (JSON.parse(window.__psKv!.getItem("ps.parcels")!) as { open: Record<string, unknown> }).open,
  );

test("the listing's facts: typed, the name shown, the acres compared on the card; a link centres the map", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const net = await replayHar(context, FERNEY);
  const { asked, at } = await geocoder(page);
  const [lon, lat] = [at[0] - 0.004, at[1] - 0.003];
  const forAddress = () => asked.filter((u) => decodeURIComponent(u).includes(`q=${ADDRESS}&`));
  await openExplorer(page, FERNEY);
  await importParcel(page, FERNEY);
  expectAllDone(await screenIt(page));

  // The Notes tab's Listing section.
  await page.locator('button[aria-label$="acres: parcel details"]').first().click();
  const listing = await unfoldListing(page);
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
  expect(await stored(page)).toMatchObject({
    name: "Ferney Creek 43 ac",
    listingUrl: LINK,
    listingAcres: 52,
    agent: "A. Agent, 540-555-0100",
  });

  // The name is the parcel's name: the panel's header uses it.
  await expect(page.locator(".sh-name").first()).toContainText("Ferney Creek 43 ac");
  await page.getByRole("tab", { name: "Grade" }).click();
  // The card says the acres differ, under its reason (appended, rule 7).
  await expect(page.locator(".card-note")).toHaveText("The listing says 52 ac; this boundary is 43.9 ac.");

  // A pasted link: "Go to" its address; the map centres there at a road's zoom, and nothing is selected.
  const box = await openSearch(page);
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
  await (await openSearch(page)).fill("https://example.com/listing/9");
  await expect(page.locator(".sr-note")).toHaveText("Couldn't read an address from this link.");

  expect(net.misses, "data requests the HAR doesn't have").toEqual([]);
  expect(errors).toEqual([]);
});

test("a searched link is offered to the next parcel opened, and attached only with a tap (owner, #130)", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await replayHar(context, FERNEY);
  await geocoder(page);
  await openExplorer(page, FERNEY);
  await importParcel(page, FERNEY);
  // Its imported name cleared, so the chip names it after the listing's street.
  await page.locator('button[aria-label$="acres: parcel details"]').first().click();
  const name = (await unfoldListing(page)).getByLabel("Name");
  await name.fill("");
  await name.press("Enter");
  await page.getByRole("tab", { name: "Grade" }).click();

  // The parcel open during the search isn't offered the link.
  await goToLink(page);
  const chip = page.locator(".attach-listing");
  await expect(chip).toHaveCount(0);
  // The next parcel opened is.
  await page.getByRole("button", { name: "Close this parcel" }).first().click();
  await openFromList(page, "52-47A");
  await expect(chip).toContainText("Attach Redfin listing (0 Ferney Creek Rd)");
  expect(await stored(page)).toMatchObject({ listingUrl: "", name: "" }); // nothing without the tap
  await chip.getByRole("button", { name: /^Attach / }).click();
  await expect(chip).toHaveCount(0);
  expect(await stored(page)).toMatchObject({ listingUrl: LINK, name: "0 Ferney Creek Rd" });

  // Dismissed: gone, and not offered again. (Its link cleared first: a parcel with a link is never offered one.)
  await page.locator('button[aria-label$="acres: parcel details"]').first().click();
  const link = (await unfoldListing(page)).getByLabel("Listing link");
  await link.fill("");
  await link.press("Enter");
  await page.getByRole("tab", { name: "Grade" }).click();
  await goToLink(page);
  await page.getByRole("button", { name: "Close this parcel" }).first().click();
  await openFromList(page, "0 Ferney Creek Rd");
  await expect(chip).toBeVisible();
  await chip.getByRole("button", { name: "Dismiss the listing link" }).click();
  await expect(chip).toHaveCount(0);
  await page.getByRole("button", { name: "Close this parcel" }).first().click();
  await openFromList(page, "0 Ferney Creek Rd");
  await expect(chip).toHaveCount(0);
  expect(await stored(page)).toMatchObject({ listingUrl: "", name: "0 Ferney Creek Rd" });
  expect(errors).toEqual([]);
});
