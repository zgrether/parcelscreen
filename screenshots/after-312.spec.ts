/**
 * Zach's answers after #312 (docs/plans/phase-0.md §9.71), desktop (1280 × 800) then phone (375 × 812), each parcel
 * graded here from its recordings (no seeded grade, so no "boundary changed"):
 * - Mud Creek opened as its county record, both parts: one acreage (30.15 ac) in the header, Details and Divide; the
 *   frontage walked along the boundary (885 ft); Garden's water named; Hunt counted from the boundary;
 * - its split on the map while Uses shows it, labelled as the panel names the pieces; Remove this split's Undo; a piece
 *   added to the list with the deed restrictions and HOA "from the original parcel";
 * - Ferney's pond as Garden's water; Roan's frontage, none along the county map's boundary.
 * Run by `pnpm screenshots`.
 */
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { loadFixture, type FixtureSlug } from "../test/support/fixtures";
import { countyRecordOf } from "../test/support/scenarios";
import { mudSplitLine } from "../test/support/splitScenario";
import { importParcels, openExplorer, openFromList, reload, screenIt, settled, visit } from "../e2e/flow";
import { replayHar } from "../e2e/replay";

const OUT = "test-results/screenshots";
const MUD = "grayson-mud-creek-6273" as const;
const FERNEY = "ferney-creek-52-47A" as const;
const ROAN = "roan-hwy-143-099-046-02" as const;

async function liveImagery(page: Page): Promise<void> {
  await page.context().route(/basemap\.nationalmap\.gov|arcgisonline\.com/, (r) => r.continue());
}

/** Writes these fields onto the open parcel and its list entry, then reloads. */
async function patchOpen(page: Page, patch: Record<string, unknown>): Promise<void> {
  await page.evaluate(async (p) => {
    const kv = window.__psKv!;
    const store = JSON.parse(kv.getItem("ps.parcels")!) as {
      open: Record<string, unknown> & { key: string };
      built?: (Record<string, unknown> & { key: string })[];
    };
    Object.assign(store.open, p);
    for (const b of store.built ?? []) if (b.key === store.open.key) Object.assign(b, p);
    await kv.setItem("ps.parcels", JSON.stringify(store));
  }, patch);
  await reload(page);
}

/** The fixture imported, opened from the list, made the county record a tap opens, and graded from its recordings. */
async function gradedHere(page: Page, slug: FixtureSlug): Promise<void> {
  await importParcels(page, [slug]);
  await settled(page);
  await visit(page, "/library");
  await openFromList(page, loadFixture(slug).input.name);
  await patchOpen(page, { pieces: [await countyRecordOf(slug)] });
  const tilt = page.locator(".tilt-hint button");
  if (await tilt.count()) await tilt.first().click();
  await screenIt(page);
}

/** On a phone, the sheet raised to its tallest, so a row and its facts have the room. */
async function tall(page: Page, phone: boolean): Promise<void> {
  const handle = page.locator("[title='Drag or tap to resize']").first();
  if (phone)
    for (let i = 0; i < 3 && !(await page.locator(".explore.sheet-tall").count()); i++) await handle.click();
}

/** A tap, the target first brought to the middle of its scroller: on a phone the bottom tabs cover the sheet's foot. */
async function tap(target: Locator): Promise<void> {
  await target.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await target.click();
}

async function openUse(page: Page, name: string): Promise<void> {
  const row = page.locator(".uses .use").filter({ hasText: name });
  await row.locator("button.use-row").click();
  await row.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(400);
}

for (const phone of [false, true]) {
  const device = phone ? "phone" : "desktop";
  test.describe(device, () => {
    test.use(
      phone
        ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } },
    );

    test("Mud Creek: one acreage, the frontage, Garden and Hunt; its split on the map", async ({
      page,
      context,
    }) => {
      test.setTimeout(900_000);
      await replayHar(context, MUD);
      await liveImagery(page);
      await openExplorer(page, MUD);
      await gradedHere(page, MUD);
      // The place line follows the acres since UX part 2 PR 3a.
      await expect(page.locator(".sh-acres").first()).toHaveText(/^30\.15 ac · /);

      // Uses: Garden's water named, Hunt from the boundary.
      // On a phone the sheet raised first: at its peek, the header and its actions row (UX part 2 PR 3a) fill it.
      await tall(page, phone);
      await tap(page.getByRole("tab", { name: "Uses" }));
      await expect(page.locator(".uses .use").first()).toBeVisible();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/${device}-312-uses.png` });

      // Divide's What decides it: 30.15 ac and the frontage, 885 ft along the county map's boundary.
      await tall(page, phone);
      await openUse(page, "Divide");
      await page.screenshot({ path: `${OUT}/${device}-312-divide.png` });

      // Details: the county record's acres, both parts.
      await tall(page, phone);
      await tap(page.getByRole("tab", { name: "Details" }));
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${device}-312-details.png` });

      // The split, on the map while Uses shows it, labelled; its pieces graded from the recordings.
      const line = mudSplitLine();
      await patchOpen(page, {
        scenarios: [
          {
            id: "split-1",
            name: "Split 1",
            a: line.a,
            b: line.b,
            screens: { left: null, right: null },
            at: new Date().toISOString(),
          },
        ],
        deedRestrictions: "No mobile homes",
        hoa: "no",
      });
      await tall(page, phone);
      await tap(page.getByRole("tab", { name: "Uses" }));
      await tall(page, phone);
      const scenario = page.getByRole("article", { name: "Split 1" });
      const pieces = scenario.locator(".scn-piece");
      for (const i of [0, 1]) {
        await tap(pieces.nth(i).getByRole("button", { name: "Try again" }));
        await expect(scenario.locator(".scn-status[role=status]")).toHaveCount(0, { timeout: 480_000 });
      }
      await expect(page.locator(".piece-label")).toHaveCount(2);
      await scenario.scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      // On a phone, the sheet lowered so the map shows the pieces; raised again for the rest.
      const handle = page.locator("[title='Drag or tap to resize']").first();
      if (phone)
        for (let i = 0; i < 3 && (await page.locator(".explore.sheet-tall").count()); i++)
          await handle.click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${OUT}/${device}-312-split-map.png` });
      await tall(page, phone);

      // Remove this split: the Undo.
      await tap(scenario.getByRole("button", { name: "Remove this split" }));
      await expect(page.locator(".line-undo")).toBeVisible();
      await page.screenshot({ path: `${OUT}/${device}-312-split-undo.png` });
      await page.locator(".line-undo").getByRole("button", { name: "Undo" }).click();

      // A piece added to the list: its listing, the deed restrictions and HOA from the original parcel.
      await tap(
        page
          .getByRole("article", { name: "Split 1" })
          .locator(".scn-piece")
          .first()
          .getByRole("button", { name: "Add this piece to the list" }),
      );
      await settled(page);
      await tall(page, phone);
      await tap(page.getByRole("tab", { name: "Details" }));
      const summary = page.locator(".ip-listing-summary");
      if ((await summary.count()) && (await summary.getAttribute("aria-expanded")) === "false")
        await summary.click();
      await tall(page, phone);
      await page.locator(".ip-from").first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${device}-312-piece-listing.png` });
    });

    test("Ferney's pond, Roan's frontage", async ({ page, context }) => {
      test.setTimeout(600_000);
      await replayHar(context, [FERNEY, ROAN]);
      await liveImagery(page);
      await openExplorer(page, FERNEY);
      await gradedHere(page, FERNEY);
      await page.getByRole("tab", { name: "Uses" }).click();
      await tall(page, phone);
      await openUse(page, "Garden");
      await page.screenshot({ path: `${OUT}/${device}-312-garden-pond.png` });

      await gradedHere(page, ROAN);
      await page.getByRole("tab", { name: "Uses" }).click();
      await tall(page, phone);
      await openUse(page, "Divide");
      await page
        .locator(".use-fact")
        .filter({ hasText: /^Public road frontage/ })
        .evaluate((el) => el.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${device}-312-roan-frontage.png` });
    });
  });
}
