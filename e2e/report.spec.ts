/**
 * The report card export (step 9, docs/plans/step-9-report-export.md §1–§2): /parcel/<key>/report from the saved screen
 * alone, without the app's tabs; One page fits one Letter page (printed with Chromium's own PDF, the CSS @page size),
 * for each fixture; the switch remembers Full in the URL; and the page's states. A production build, the fixtures'
 * screens seeded.
 */
import { expect, test, type Page } from "@playwright/test";
import { loadFixture, type FixtureSlug } from "../test/support/fixtures";
import { importParcels, openExplorer, openFromList, seedScreens, settled, visit } from "./flow";
import { replayHar } from "./replay";

const SLUGS: readonly FixtureSlug[] = [
  "grayson-mud-creek-6273",
  "ferney-creek-52-47A",
  "macks-mountain-35-3",
  "roan-hwy-143-099-046-02",
];

/** A built parcel's key, by its imported name. */
const keyOf = (page: Page, name: string): Promise<string> =>
  page.evaluate(
    (n) =>
      (
        JSON.parse(window.__psKv!.getItem("ps.parcels")!) as { built: { name: string; key: string }[] }
      ).built.find((b) => b.name === n)!.key,
    name,
  );

/** A PDF's page count: its page objects, not the page tree. */
const pageCount = (pdf: Buffer): number =>
  (pdf.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;

test("One page: from the saved screen, no tabs, one Letter page for each fixture; Full in the URL", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await replayHar(context, "ferney-creek-52-47A");
  await openExplorer(page, "ferney-creek-52-47A");
  await importParcels(page, SLUGS);
  await seedScreens(page, SLUGS);
  await settled(page);

  for (const slug of SLUGS) {
    const name = loadFixture(slug).input.name;
    await visit(page, `/parcel/${await keyOf(page, name)}/report`);
    const sheet = page.locator(".rp-sheet");
    await expect(sheet.getByRole("heading", { level: 1 })).toHaveText(name);
    await expect(page.locator(".app-nav")).toHaveCount(0);
    await expect(sheet.locator(".rp-grade").first()).toContainText(/(Contender|Maybe|Not for us)/);
    await expect(sheet.locator(".rp-tier h2").first()).toHaveText("Must have");
    await expect(sheet.getByRole("heading", { name: "Questions for the agent" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "One page" })).toHaveAttribute("aria-selected", "true");
    // The map (PR 2): its tiles asked for (the replay aborts them, so they fail and the map says so), the boundary and
    // the best site drawn over them, and Print enabled once every tile has settled.
    const map = sheet.locator(".rp-map");
    await expect(map.locator(".rp-overlay path").first()).toBeAttached();
    await expect(map.locator(".rp-overlay text").first()).toBeAttached();
    await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeEnabled({ timeout: 30_000 });
    await expect(map).toContainText("The map couldn't load.");
    await expect(map.locator("figcaption")).toContainText("Imagery: USGS (public domain)");
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    expect(pageCount(pdf), `${slug}: One page's pages`).toBe(1);
  }

  // The switch: Full, kept in the URL and on the device.
  await page.getByRole("tab", { name: "Full" }).click();
  await expect(page).toHaveURL(/[?&]preset=full\b/);
  await page.reload();
  await expect(page.getByRole("tab", { name: "Full" })).toHaveAttribute("aria-selected", "true");
  expect(errors).toEqual([]);
});

test("the page's states: a parcel not on this device, and one not graded yet", async ({ page, context }) => {
  await replayHar(context, "ferney-creek-52-47A");
  await openExplorer(page, "ferney-creek-52-47A");
  await importParcels(page, ["ferney-creek-52-47A"]);
  await settled(page);
  await visit(page, "/parcel/no-such-parcel/report");
  await expect(page.getByText("This parcel isn't on this device.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Print or save as PDF" })).toHaveCount(0);
  const key = await keyOf(page, loadFixture("ferney-creek-52-47A").input.name);
  await visit(page, `/parcel/${key}/report`);
  await expect(page.getByText("This parcel hasn't been graded yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "← Back" })).toBeVisible();
});

test("Full: the summary, then the brief's sections in order, the closing line; Cost to enjoy, then Ways to raise this grade", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  const slugs: readonly FixtureSlug[] = ["roan-hwy-143-099-046-02", "grayson-mud-creek-6273"];
  await replayHar(context, "ferney-creek-52-47A");
  await openExplorer(page, "ferney-creek-52-47A");
  await importParcels(page, slugs);
  await seedScreens(page, slugs);
  await settled(page);
  for (const slug of slugs) {
    await visit(page, `/parcel/${await keyOf(page, loadFixture(slug).input.name)}/report?preset=full`);
    const full = page.locator(".rp-full");
    await expect(full.locator(".rp-full-section > h2")).toHaveText([
      "The priorities it was graded against",
      "Best site and alternatives",
      "Access and driveway",
      // Step 10: the breakdown, after Access and driveway.
      "Cost to enjoy",
      // Step 12: both parcels have a way to raise their grade (Roan the septic system, Mud Creek a set-aside).
      "Ways to raise this grade",
      // Step 14: what the land can do, after Ways to raise.
      "What you can do here",
      "Winter sun and the horizon",
      "Night sky",
      "Soils, septic and flood",
      "Drive times",
      "Climate", // step 11
      "Privacy",
      "Long view",
      "Satellite internet",
      "Listing facts and notes",
      "Lines and marks",
      "Data sources",
    ]);
    await expect(full.locator(".rp-closing")).toHaveText(
      "This is a desk screen, not a survey, perc test or appraisal.",
    );
    await expect(full).toContainText(/Graded by engine version \d+\./);
    await expect(full).toContainText("Published ranges, not a quote.");
    // The summary is One page's, unshortened; Full runs to more pages.
    await expect(page.locator(".rp-one")).not.toHaveAttribute("data-fit");
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    expect(pageCount(pdf), `${slug}: Full's pages`).toBeGreaterThan(2);
    // Nothing cut off: in print, no table is wider than the page's column (the side-by-side table had been).
    await page.emulateMedia({ media: "print" });
    const widest = await page.evaluate(() => {
      const column = document.querySelector(".rp-sheet")!.getBoundingClientRect().width;
      return (
        Math.max(...[...document.querySelectorAll(".rp-sheet table")].map((t) => t.scrollWidth)) - column
      );
    });
    expect(widest, `${slug}: a table past the page's width, px`).toBeLessThanOrEqual(1);
    await page.emulateMedia({ media: null });
  }
});

test("Report card from the panel header's ⋯ and from a Favorites row's ⋯, in any sort", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  const slug: FixtureSlug = "ferney-creek-52-47A";
  const name = loadFixture(slug).input.name;
  await replayHar(context, slug);
  await openExplorer(page, slug);
  await importParcels(page, [slug, "macks-mountain-35-3"]);
  await seedScreens(page, [slug, "macks-mountain-35-3"]);
  await settled(page);

  // The panel: ⋯ → Report card, once the parcel's grade shows (a fresh load, so the explorer reads the seeded screens).
  await visit(page, "/library");
  await openFromList(page, name);
  await expect(page.locator(".report .card").first()).toBeVisible();
  await page.getByRole("button", { name: "More for this parcel" }).first().click();
  await page.getByRole("menuitem", { name: "Make a report" }).click();
  await expect(page).toHaveURL(/\/parcel\/[^/]+\/report/);
  await expect(page.locator(".rp-sheet h1")).toHaveText(name);
  await page.getByRole("button", { name: "← Back" }).click();
  await expect(page).toHaveURL(/\/explore$/);

  // A row's ⋯ under another sort (no grips there): Report card, and no Move up.
  await page.getByRole("link", { name: "Your list", exact: true }).click();
  await page.getByLabel("Sort by").selectOption("acres");
  await expect(page.locator(".lib-handle")).toHaveCount(0);
  await page
    .locator(".lib-table tbody tr")
    .filter({ hasText: "parcel 35-3" })
    .getByRole("button", { name: /^More for / })
    .click();
  await expect(page.getByRole("menuitem", { name: "Move up" })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Make a report" }).click();
  await expect(page.locator(".rp-sheet h1")).toContainText("35-3");
});
