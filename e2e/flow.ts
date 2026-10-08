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

/** Screen it, wait for the run to finish, and return each step's final status. */
export async function screenIt(page: Page): Promise<Record<string, string>> {
  if (await page.locator(".menu-scrim").count()) await page.keyboard.press("Escape");
  await page
    .locator("button", { hasText: /^Screen it$/ })
    .first()
    .click();
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
 * The result the Web Worker last posted (`__psScreen.posted`): the run, or a re-evaluation. Not the panel's
 * display, which shows the kept run when a pin is the run's own point (15b).
 */
export const postedResult = (page: Page): Promise<PartialScreenResult | null> =>
  page.evaluate(
    () => (window as unknown as { __psScreen: { posted: PartialScreenResult | null } }).__psScreen.posted,
  );

/** The assertion message for againstGolden's lines. */
export const GOLDEN = "differences from the golden (path: actual vs expected)";

/** Every difference from the golden, as "path: actual vs expected" lines (the Node test's comparator). */
export function againstGolden(result: unknown, golden: Parameters<typeof fromPrototype>[0]): string[] {
  return differences(asPrototype(result as ScreenResult, golden), fromPrototype(golden), PARITY);
}
