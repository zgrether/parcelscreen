/**
 * Step 14e (plan step-14e-offline.md §10): the service worker keeps the map's tiles as they're viewed. With the network
 * to the tile hosts cut, a reload of a viewed area is answered from the cache; past the cap set in Settings › Offline,
 * the least recently used tiles go and a pinned one stays. The basemap's hosts (USGS and the state aerials) are answered
 * here with PNGs of our own, which the service worker's requests reach too (Chromium routes them through the context).
 */
import { expect, test, type Page } from "@playwright/test";
import { openExplorer, openYourData, reload } from "./flow";
import { allStored, answerTiles, controlled, stored, tilesLoaded } from "./offline";
import { greyPng, noisePng } from "./png";
import { replayHar } from "./replay";

const SLUG = "grayson-mud-creek-6273";

test.use({ serviceWorkers: "allow" });

const jump = (page: Page, center: [number, number], zoom: number) =>
  page.evaluate(
    ([c, z]) =>
      (window as unknown as { __psMap: { jumpTo(o: object): void } }).__psMap.jumpTo({ center: c, zoom: z }),
    [center, zoom] as const,
  );

test("a viewed area's map comes from the cache with the network cut", async ({ page, context }) => {
  await replayHar(context, SLUG);
  const tiles = await answerTiles(context, greyPng(256));
  await openExplorer(page, SLUG);
  await controlled(page);
  await tilesLoaded(page);
  await expect.poll(async () => (await stored(page)).length).toBeGreaterThan(4);
  await allStored(page, tiles);
  const kept = (await stored(page)).map((s) => s.key);

  tiles.cut = true;
  await reload(page);
  await tilesLoaded(page);
  // Every tile the view needs was answered by the service worker: none reached the cut-off hosts.
  expect(tiles.cutOff).toBe(0);
  expect((await stored(page)).map((s) => s.key)).toEqual(expect.arrayContaining(kept));
});

test("past the cap, the oldest tiles go and a pinned one stays", async ({ page, context }) => {
  await replayHar(context, SLUG);
  // About 256 KB a tile, so a few views cross a 5 MB cap.
  await answerTiles(context, noisePng(256));
  await openExplorer(page, SLUG);
  await controlled(page);

  // A tile a saved parcel holds (Save offline writes these): the oldest of all, so the first the cap would take.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const req = indexedDB.open("parcelscreen-offline");
        req.onsuccess = () => {
          const tx = req.result.transaction("tiles", "readwrite");
          tx.objectStore("tiles").put({
            key: "https://example.org/pinned/16/1/1",
            layer: "usgs-imagery",
            bytes: 2_000_000,
            storedAt: 0,
            usedAt: 0,
            pins: ["mud-creek"],
          });
          tx.oncomplete = () => resolve();
        };
      }),
  );

  await openYourData(page);
  await expect(page.getByText(/^Map cache: \d+ [KM]B of 1 GB$/)).toBeVisible();
  await page.getByLabel("Keep up to").selectOption({ label: "5 MB" });
  await page.keyboard.press("Escape");

  const views: [number, number][] = [
    [-81.32, 36.62],
    [-81.36, 36.62],
    [-81.4, 36.62],
    [-81.44, 36.62],
    [-81.48, 36.62],
  ];
  for (const v of views) {
    await jump(page, v, 16);
    await tilesLoaded(page);
  }

  await expect
    .poll(async () => {
      const all = await stored(page);
      const automatic = all.filter((s) => !s.pins.length).reduce((n, s) => n + s.bytes, 0);
      // Eviction runs every 50 stores, so the cache may be up to 50 tiles past the cap between runs.
      return automatic < 5 * 1024 * 1024 + 50 * 270_000;
    })
    .toBe(true);
  const all = await stored(page);
  expect(all.find((s) => s.key === "https://example.org/pinned/16/1/1")?.pins).toEqual(["mud-creek"]);
});
