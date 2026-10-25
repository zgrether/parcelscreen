/**
 * The e2e's steps through the explorer (step 18a): a reference parcel brought in through History import,
 * screened, and its result read back as the page shows it. Plan phase-0-18-acceptance.md §1.
 */
import { expect, type Locator, type Page } from "@playwright/test";
import { ENGINE_VERSION } from "@/lib/screen/engine";
import type { PartialScreenResult, ScreenResult } from "@/lib/screen/types";
import { differences } from "../test/support/compare";
import { loadFixture, type FixtureSlug } from "../test/support/fixtures";
import { EXPECTED_BROWSER, expectedOf } from "../test/support/expected";
import type { Scenario } from "../test/support/scenarios";

/**
 * An empty profile with the debug handles on (window.__psScreen, __psMap), opened at the parcel. `preProfile`:
 * localStorage keys from before profiles (`ps.parcels`, `ps.person`…), set before the first load, which drops them.
 */
export async function openExplorer(
  page: Page,
  slug: FixtureSlug,
  preProfile: Record<string, string> = {},
): Promise<void> {
  const { point } = loadFixture(slug).input;
  await page.addInitScript(
    ({ view, preProfile }) => {
      if (sessionStorage.getItem("e2e")) return; // a reload keeps what the test did
      sessionStorage.setItem("e2e", "1");
      localStorage.clear();
      localStorage.setItem("ps.debug", "1");
      // No roads & labels (17d): their tiles aren't in the fixtures, and no rendered check should see them.
      localStorage.setItem("ps.roads", "0");
      localStorage.setItem("ps.view", JSON.stringify(view));
      for (const [k, v] of Object.entries(preProfile)) localStorage.setItem(k, v);
    },
    { view: { lat: point.lat, lon: point.lon, z: 15 }, preProfile },
  );
  await page.goto("/explore");
}

/**
 * The parcel as a prototype export (`{ saved: [...] }`, proto L1605), imported through Settings' Your data (step 4b),
 * then opened from Your list. No `cfg`: the default settings stand, as in the goldens. `house` marks the bulls-eye.
 */
export async function importParcel(page: Page, slug: FixtureSlug, house?: [number, number]): Promise<void> {
  const { input } = loadFixture(slug);
  const saved = {
    id: Date.parse(input.recorded.runAt),
    name: input.name,
    geo: input.polygon,
    props: input.props,
    ...(house ? { house } : {}), // [lat, lon], as the prototype kept it
  };
  await openYourData(page);
  await page.locator('input[aria-label="Import file"]').setInputFiles({
    name: `${slug}.json`,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ saved: [saved] })),
  });
  await expect(page.locator(".import-summary")).toContainText("Imported 1 parcel");
  await page.keyboard.press("Escape");
  await addFromRecent(page, input.name);
  await openFromList(page, input.name);
}

/** Several parcels as one prototype export, imported and starred without opening any (17e's switching; step 8). */
export async function importParcels(
  page: Page,
  slugs: readonly FixtureSlug[],
  { star = true }: { star?: boolean } = {},
): Promise<void> {
  const saved = slugs.map((slug, i) => {
    const { input } = loadFixture(slug);
    return {
      id: Date.parse(input.recorded.runAt) + i,
      name: input.name,
      geo: input.polygon,
      props: input.props,
    };
  });
  await openYourData(page);
  await page.locator('input[aria-label="Import file"]').setInputFiles({
    name: "parcels.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ saved })),
  });
  await expect(page.locator(".import-summary")).toContainText(`Imported ${slugs.length} parcels`);
  await page.keyboard.press("Escape");
  if (star) for (const slug of slugs) await addFromRecent(page, loadFixture(slug).input.name);
}

/**
 * Adds an imported parcel to the list from Recent (step 8: an import, like a grading, puts it in the importer's Recent
 * only; 8c), with the name its sheet starts with: the imported name. Leaves Your list on Favorites.
 */
export async function addFromRecent(page: Page, name: string): Promise<void> {
  await page.getByRole("link", { name: /^Your list/ }).click();
  await page.getByRole("tab", { name: "Recent" }).click();
  const add = page.locator(".hist-row", { hasText: name }).getByRole("button", { name: /^Add to list/ });
  await add.click();
  await page.getByRole("dialog", { name: "Add to list" }).getByRole("button", { name: "Add" }).click();
  await expect(add).toHaveCount(0);
  await page.getByRole("tab", { name: "Shortlist" }).click();
}

/** The menu (step 4b): the places' bar's ☰ (More on a phone), opened if it isn't; its panel. */
export async function openMenu(page: Page): Promise<Locator> {
  const panel = page.locator(".menu-panel");
  if (!(await panel.count())) await page.locator(".app-more").click();
  await expect(panel).toBeVisible();
  return panel;
}

/** Settings, where Your data is (step 4b): the menu → Settings. */
export async function openYourData(page: Page): Promise<void> {
  await (await openMenu(page)).getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your data" })).toBeVisible();
}

/** Search's field: the docked panel's first row on a desktop (step 4c), opened by the map's Search button on a phone. */
export const searchField = (page: Page): Locator =>
  page.getByRole("combobox", { name: /^Search coordinates/ });

/** Search, ready to type in (focused). */
export async function openSearch(page: Page): Promise<Locator> {
  const field = searchField(page);
  const button = page.getByRole("button", { name: "Search" });
  // Just after a navigation the map may not have drawn either yet.
  await expect(field.or(button).first()).toBeVisible();
  if (!(await field.count())) await button.click();
  await field.click();
  return field;
}

/** A parcel's row on Your list, by (part of) the name it shows: a table row on a desktop, a card on a phone. */
export const listRow = (page: Page, name: string): Locator =>
  page.locator(".lib-row:visible", { hasText: name }).first();

/**
 * Waits for the profile's writes so far to reach IndexedDB (step 1, PR 4: the store writes through asynchronously, and
 * a page unloaded a moment after a click could lose its last write). Before a reload or a navigation that follows an
 * edit.
 */
export const settled = (page: Page): Promise<void> => page.evaluate(() => window.__psKv?.flush());

/** Waits for the profile to boot after a load: until then the app renders nothing and the store handle isn't there. */
export const booted = (page: Page): Promise<unknown> =>
  page.waitForFunction(() => !!window.__psKv || !localStorage.getItem("ps.debug"));

/** A reload as a user would do it, once the profile's writes are kept; returns after the profile has booted again. */
export async function reload(page: Page): Promise<void> {
  await settled(page);
  await page.reload();
  await booted(page);
}

/** A navigation once the profile's writes are kept; returns after the profile has booted on the new page. */
export async function visit(page: Page, url: string): Promise<void> {
  await settled(page);
  await page.goto(url);
  await booted(page);
}

/** Rewrites every kept screen: as a v2 result kept before this release, or as one from Phase 0's rules. */
export const ageKept = (page: Page, how: "v2" | "earlier rules"): Promise<void> =>
  page.evaluate(
    (how) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("parcelscreen");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction("screens", "readwrite");
          const req = tx.objectStore("screens").openCursor();
          req.onsuccess = () => {
            const c = req.result;
            if (!c) return;
            const v = c.value as { engine?: number; result: { schemaVersion: number } };
            if (how === "v2") v.result.schemaVersion = 2;
            else v.engine = 1;
            c.update(v);
            c.continue();
          };
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    how,
  );

/**
 * Opens a saved parcel on the map from Your list, by (part of) the name its row shows: the Your list tab, then its row
 * (Z-2, UX part 2: a tap opens it on the map, the one panel). The map stays mounted behind the tab, so the parcels
 * screened this session keep their sessions.
 */
export async function openFromList(page: Page, name: string): Promise<void> {
  await page.getByRole("link", { name: "Your list", exact: true }).click();
  await page.getByRole("tab", { name: "Shortlist" }).click();
  await listRow(page, name).click();
  await expect(page).toHaveURL(/\/explore$/);
  // An imported prototype parcel is named after its saved name (owner, #130), which holds the parcel ID.
  await expect(page.locator(".sh-name").first()).toContainText(name);
}

/** Opens a parcel on the map from Recent (step 8; 8c), by (part of) its name: its row's Open on the map. */
export async function openFromRecent(page: Page, name: string): Promise<void> {
  await page.getByRole("link", { name: /^Your list/ }).click();
  await page.getByRole("tab", { name: "Recent" }).click();
  await page.locator(".hist-row", { hasText: name }).getByRole("link", { name: "Open on the map" }).click();
  await expect(page).toHaveURL(/\/explore$/);
  await expect(page.locator(".sh-name").first()).toContainText(name);
}

/**
 * Grade it (step 4c: the toolbar's button on a desktop, the sheet's on a phone; for a kept run with nothing changed, the
 * overlays note's "Grade again"), wait for the run to finish, and return each step's final status.
 */
export async function screenIt(page: Page): Promise<Record<string, string>> {
  if (await page.locator(".menu-panel").count()) await page.keyboard.press("Escape");
  // Wait for this run to start, then to finish.
  await page.locator(".grade-btn:enabled, .grade-again-link:enabled").first().click();
  const grading = page.locator(".grade-btn", { hasText: /^Grading…$/ });
  await expect(grading.first()).toBeVisible();
  await expect(grading).toHaveCount(0, { timeout: 200_000 });
  return page.evaluate(() => {
    const s = (
      window as unknown as { __psScreen: { steps: Record<string, { status: string; message?: string }> } }
    ).__psScreen;
    // A step that didn't finish carries its message ("fail: FEMA NFHL timed out").
    return Object.fromEntries(
      Object.entries(s.steps).map(([k, v]) => [
        k,
        v.status === "done" ? v.status : `${v.status}: ${v.message ?? ""}`,
      ]),
    );
  });
}

/** Every step of the run ended "done". */
export function expectAllDone(steps: Record<string, string>): void {
  expect(Object.keys(steps).length, "steps reported").toBeGreaterThan(0);
  expect(
    Object.entries(steps).filter(([, v]) => v !== "done"),
    "steps not done",
  ).toEqual([]);
}

/**
 * The result the Web Worker last posted: the run, or a re-evaluation. Read from the test-only debug handle
 * (`window.__psDebug.posted`, lib/client/debugHandle.ts), not the panel's display, which shows the kept run
 * when a pin is the run's own point (15b).
 */
export const postedResult = (page: Page): Promise<PartialScreenResult | null> =>
  page.evaluate(
    () =>
      (window as unknown as { __psDebug?: { posted: PartialScreenResult | null } }).__psDebug?.posted ?? null,
  );

/** Waits until the worker has posted a result evaluated at `label` ("site #2"). */
export async function waitForPosted(page: Page, label: string): Promise<void> {
  await expect
    .poll(async () => ((await postedResult(page)) as { focus?: { label: string } } | null)?.focus?.label)
    .toBe(label);
}

/** How many screens this browser keeps (IndexedDB "parcelscreen" / "screens", lib/client/screenStore.ts). */
export const keptScreenCount = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open("parcelscreen");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction("screens", "readonly").objectStore("screens").count();
          req.onsuccess = () => {
            open.result.close();
            resolve(req.result);
          };
          req.onerror = () => reject(req.error);
        };
      }),
  );

/** The assertion message for againstExpected's lines. */
export const EXPECTED_MSG = "differences from expected.json (path: actual vs expected)";

/**
 * Every difference from the fixture's expected.json (Batch A §1; the prototype's golden.json is frozen), as
 * "path: actual vs expected" lines: the Node test's comparator, with the measured browser tolerances.
 */
export function againstExpected(result: unknown, slug: FixtureSlug, scenario: Scenario): string[] {
  return differences(result as ScreenResult, expectedOf(slug, scenario), EXPECTED_BROWSER);
}

/**
 * Gives each imported fixture parcel its fixture's expected result as its kept screen, as a run would leave it:
 * straight into IndexedDB, no screening (VR6's compare, WF2b's list).
 */
/**
 * A parcel's Listing section, unfolded: it folds to a summary once it has a name or a price (polish #24, on a desktop
 * too), and an imported parcel has its name.
 */
export async function unfoldListing(scope: Page | Locator): Promise<Locator> {
  const listing = scope.getByRole("group", { name: "Listing" }).first();
  const summary = listing.locator(".ip-listing-summary");
  if ((await summary.count()) > 0 && (await summary.getAttribute("aria-expanded")) === "false")
    await summary.click();
  return listing;
}

export async function seedScreens(page: Page, slugs: readonly FixtureSlug[]): Promise<void> {
  const seeds = slugs.map((slug) => ({
    name: loadFixture(slug).input.name,
    result: expectedOf(slug, "run"),
  }));
  await page.evaluate(
    async ({ seeds, engine }: { seeds: { name: string; result: ScreenResult }[]; engine: number }) => {
      // The current profile's documents (step 1, PR 4): the debug handle writes through to IndexedDB.
      const kv = window.__psKv!;
      const store = JSON.parse(kv.getItem("ps.parcels")!) as {
        built: { name: string; screenIds: string[] }[];
      };
      // The app has opened the database at its current version by now; no version here, so it's never downgraded.
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("parcelscreen");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction("screens", "readwrite");
      for (const s of seeds) {
        // The imported name is the parcel's name (lib/client/exportFile.ts; polish #21).
        const b = store.built.find((x) => x.name === s.name)!;
        const id = `e2e-${s.name}`;
        tx.objectStore("screens").put({
          id,
          keys: { boundary: "e2e", house: "", settings: "e2e", lines: "" },
          result: s.result,
          engine,
          // The household's list (step 6): its screens are the space's.
          profile: "_space",
        });
        b.screenIds = [id];
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      await kv.setItem("ps.parcels", JSON.stringify(store));
    },
    { seeds, engine: ENGINE_VERSION },
  );
}
