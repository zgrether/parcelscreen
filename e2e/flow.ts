/**
 * The e2e's steps through the explorer (step 18a): a reference parcel brought in through History import,
 * screened, and its result read back as the page shows it. Plan phase-0-18-acceptance.md §1.
 */
import { expect, type Page } from "@playwright/test";
import type { PartialScreenResult, ScreenResult } from "@/lib/screen/types";
import { differences } from "../test/support/compare";
import { loadFixture, type FixtureSlug } from "../test/support/fixtures";
import { fromPrototype } from "../test/support/fromPrototype";
import { asPrototype, PARITY } from "../test/support/parity";

/** An empty profile with the debug handles on (window.__psScreen, __psMap), opened at the parcel. */
export async function openExplorer(page: Page, slug: FixtureSlug): Promise<void> {
  const { point } = loadFixture(slug).input;
  await page.addInitScript(
    (view) => {
      if (sessionStorage.getItem("e2e")) return; // a reload keeps what the test did
      sessionStorage.setItem("e2e", "1");
      localStorage.clear();
      localStorage.setItem("ps.debug", "1");
      // No roads & labels (17d): their tiles aren't in the fixtures, and no rendered check should see them.
      localStorage.setItem("ps.roads", "0");
      localStorage.setItem("ps.view", JSON.stringify(view));
    },
    { lat: point.lat, lon: point.lon, z: 15 },
  );
  await page.goto("/explore");
}

/**
 * The parcel as a prototype export (`{ saved: [...] }`, proto L1605), imported through ☰ → History → Import
 * file, then opened. No `cfg`: the default settings stand, as in the goldens. `house` marks the bulls-eye.
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
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.locator('input[aria-label="Import file"]').setInputFiles({
    name: `${slug}.json`,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ saved: [saved] })),
  });
  await expect(page.locator(".import-summary")).toContainText("Imported 1 parcel");
  await page.getByRole("button", { name: "Open", exact: true }).first().click();
  await expect(page.locator(".sh-name").first()).toBeVisible();
}

/** Several parcels as one prototype export, imported into History without opening any (17e's switching). */
export async function importParcels(page: Page, slugs: readonly FixtureSlug[]): Promise<void> {
  const saved = slugs.map((slug, i) => {
    const { input } = loadFixture(slug);
    return {
      id: Date.parse(input.recorded.runAt) + i,
      name: input.name,
      geo: input.polygon,
      props: input.props,
    };
  });
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.locator('input[aria-label="Import file"]').setInputFiles({
    name: "parcels.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ saved })),
  });
  await expect(page.locator(".import-summary")).toContainText(`Imported ${slugs.length} parcels`);
  await page.keyboard.press("Escape");
}

/** Opens a History parcel by the name its row shows (☰ → History → Open). */
export async function openFromHistory(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page
    .locator(".menu-drawer li", { hasText: name })
    .getByRole("button", { name: "Open", exact: true })
    .click();
  await expect(page.locator(".sh-name").first()).toHaveText(name);
}

/** Screen it, wait for the run to finish, and return each step's final status. */
export async function screenIt(page: Page): Promise<Record<string, string>> {
  if (await page.locator(".menu-scrim").count()) await page.keyboard.press("Escape");
  // "Run again" when the parcel already has a result: wait for this run to start, then to finish.
  await page
    .locator("button", { hasText: /^(Screen it|Run again)$/ })
    .first()
    .click();
  await expect(page.locator("button", { hasText: /^Running…$/ }).first()).toBeVisible();
  await expect(page.locator("button", { hasText: /^Run again$/ }).first()).toBeVisible({ timeout: 200_000 });
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

/** The assertion message for againstGolden's lines. */
export const GOLDEN = "differences from the golden (path: actual vs expected)";

/** Every difference from the golden, as "path: actual vs expected" lines (the Node test's comparator). */
export function againstGolden(result: unknown, golden: Parameters<typeof fromPrototype>[0]): string[] {
  return differences(asPrototype(result as ScreenResult, golden), fromPrototype(golden), PARITY);
}
