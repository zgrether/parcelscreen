/**
 * The report card export (step 9, docs/plans/step-9-report-export.md §1–§2): /parcel/<key>/report from the saved screen
 * alone, without the app's tabs; One page fits one Letter page (printed with Chromium's own PDF, the CSS @page size),
 * for each fixture; the switch remembers Full in the URL; and the page's states. A production build, the fixtures'
 * screens seeded.
 */
import { expect, test, type Page } from "@playwright/test";
import { loadFixture, type FixtureSlug } from "../test/support/fixtures";
import { importParcels, openExplorer, seedScreens, settled, visit } from "./flow";
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
