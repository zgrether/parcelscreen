/**
 * Step 14, What the land can do (docs/plans/step-14-land-uses.md §6, §7, §11): on Mud Creek's kept grade, Grade's
 * shortcut line opens Uses, with the seven answers, What limits you and the not-advice line; What decides it opens in
 * place. An easement's purpose, picked in Details, is kept and listed under What limits you. One page has the Divide
 * line; Full has the section. Then Map layers' Power lines on Macks, whose line crosses it.
 */
import { expect, test, type Page } from "@playwright/test";
import { loadFixture, type FixtureSlug } from "../test/support/fixtures";
import {
  importParcel,
  importParcels,
  openExplorer,
  openFromList,
  reload,
  screenIt,
  seedScreens,
  settled,
  visit,
} from "./flow";
import { GRAYSON, withRedGate } from "./redGate";
import { replayHar } from "./replay";

const MACKS = "macks-mountain-35-3" as const;

async function openGraded(page: Page, slug: FixtureSlug): Promise<void> {
  await openExplorer(page, slug);
  await importParcels(page, [slug]);
  await seedScreens(page, [slug]);
  await settled(page);
  await visit(page, "/library");
  await openFromList(page, loadFixture(slug).input.name);
}

const storedLine = (page: Page) =>
  page.evaluate(
    () =>
      (
        JSON.parse(window.__psKv!.getItem("ps.parcels")!) as {
          open: { markup: Record<string, unknown>[] };
        }
      ).open.markup[0],
  );

test("Uses on Mud Creek: from Grade's shortcut, seven answers, What decides it, What limits you, not advice", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await replayHar(context, GRAYSON);
  await openGraded(page, GRAYSON);

  // Grade's answer has the shortcut line; it opens Uses.
  const shortcut = page.locator(".card .uses-shortcut");
  await expect(shortcut).toContainText(/^What you can do here: (\d+ (yes|maybe|no)(, )?)+/);
  await shortcut.click();
  await expect(page.getByRole("tab", { name: "Uses" })).toHaveAttribute("aria-selected", "true");

  const uses = page.getByRole("region", { name: "Uses" });
  await expect(uses.locator(".uses-head")).toHaveText(["What you can do here", "What limits you"]);
  await expect(uses.locator(".use-name")).toHaveText([
    "Camp now",
    "Build",
    "Trails and walking woods",
    "Garden, orchard, animals",
    "Hunt",
    "Ride, ski, snowshoe from home",
    "Divide",
  ]);
  for (const chip of await uses.locator(".use-chip").all()) await expect(chip).toHaveText(/^(Yes|Maybe|No)$/);
  await expect(uses.locator(".uses-advice")).toHaveText(
    "Not advice: check with the county, a surveyor or a land-use attorney before acting.",
  );

  // Divide: Yes, its limit named; a tap opens What decides it in place, with the county's rules and their sources.
  const divide = uses.locator(".use").filter({ hasText: "Divide" });
  await expect(divide.locator(".use-chip")).toHaveText("Yes");
  await expect(divide.locator(".use-reason")).toHaveText(
    "Up to 11 lots: limited by 1,116 ft of road frontage at 100 ft per lot",
  );
  // The row itself (its Try a split is the other button, split-scenario.spec.ts).
  await divide.locator("button.use-row").click();
  await expect(divide.locator("button.use-row")).toHaveAttribute("aria-expanded", "true");
  await expect(divide.getByRole("heading", { name: "What decides it" })).toBeVisible();
  await expect(divide.locator(".use-fact").first()).toContainText("Grayson");
  await expect(divide.locator(".use-source").first()).toBeVisible();

  // Grade again: the card, with its shortcut.
  await page.getByRole("tab", { name: "Grade" }).click();
  await expect(page.locator(".card .uses-shortcut")).toBeVisible();
  expect(errors).toEqual([]);
});

test("an easement's purpose, picked in Details, is kept and listed under What limits you", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  await replayHar(context, GRAYSON);
  await openGraded(page, GRAYSON);
  await withRedGate(page);

  await page.getByRole("tab", { name: "Details" }).click();
  const details = page.locator(".parcel-details");
  await details.locator(".pd-row").filter({ hasText: "Red gate" }).click();
  const purpose = details.locator(".pd-open").getByRole("group", { name: "What it's for" });
  await expect(purpose.getByRole("button")).toHaveText(["Road right-of-way", "Utility", "Scenic", "Other"]);
  await purpose.getByRole("button", { name: "Road right-of-way" }).click();
  await expect(purpose.getByRole("button", { name: "Road right-of-way" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect.poll(async () => (await storedLine(page))?.easementType).toBe("row");

  await page.getByRole("tab", { name: "Uses" }).click();
  await expect(page.locator(".uses .use-fact").filter({ hasText: "Red gate" })).toContainText(
    "Road right-of-way",
  );

  // Kept: after a reload, Details shows it picked; a second tap clears it.
  await reload(page);
  await page.getByRole("tab", { name: "Details" }).click();
  await details.locator(".pd-row").filter({ hasText: "Red gate" }).click();
  const again = details.locator(".pd-open").getByRole("group", { name: "What it's for" });
  await expect(again.getByRole("button", { name: "Road right-of-way" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await again.getByRole("button", { name: "Road right-of-way" }).click();
  await expect.poll(async () => (await storedLine(page))?.easementType).toBeNull();
});

test("One page has the Divide line; Full has What you can do here", async ({ page, context }) => {
  test.setTimeout(120_000);
  await replayHar(context, GRAYSON);
  await openExplorer(page, GRAYSON);
  await importParcels(page, [GRAYSON]);
  await seedScreens(page, [GRAYSON]);
  await settled(page);
  const name = loadFixture(GRAYSON).input.name;
  const key = await page.evaluate(
    (n) =>
      (
        JSON.parse(window.__psKv!.getItem("ps.parcels")!) as { built: { name: string; key: string }[] }
      ).built.find((b) => b.name === n)!.key,
    name,
  );
  await visit(page, `/parcel/${key}/report`);
  await expect(page.locator(".rp-one .rp-divide")).toHaveText("Can divide into up to 11 lots");

  await page.getByRole("tab", { name: "Full" }).click();
  const section = page
    .locator(".rp-full-section")
    .filter({ has: page.getByRole("heading", { name: "What you can do here", level: 2 }) });
  await expect(section.locator(".rp-uses > li")).toHaveCount(7);
  await expect(section.locator(".rp-uses > li").last()).toContainText(
    "Divide: Yes. Up to 11 lots: limited by 1,116 ft of road frontage at 100 ft per lot.",
  );
  await expect(section.getByRole("heading", { name: "What limits you" })).toBeVisible();
  await expect(section).toContainText(
    "Not advice: check with the county, a surveyor or a land-use attorney before acting.",
  );
});

test("Map layers' Power lines draws the lines near the graded parcel; off by default", async ({
  page,
  context,
}) => {
  test.setTimeout(300_000);
  await replayHar(context, MACKS);
  await openExplorer(page, MACKS);
  await importParcel(page, MACKS);
  // Graded here, from its recordings: a seeded grade reads as on an earlier boundary, and the overlays hide with it.
  await screenIt(page);
  // The lines in the layer's source (the source isn't made until there's something to draw).
  type Src = { serialize(): { data: { features: unknown[] } } };
  const drawn = () =>
    page.evaluate(() => {
      const map = (
        window as unknown as {
          __psMap: { getLayer(id: string): unknown; getSource(id: string): Src | undefined };
        }
      ).__psMap;
      const src = map.getLayer("power-line") ? map.getSource("power-lines") : undefined;
      return src ? src.serialize().data.features.length : 0;
    });
  expect(await drawn()).toBe(0);
  await page.getByRole("button", { name: "Map layers" }).click();
  const toggle = page.getByRole("group", { name: "On the map" }).getByRole("button", { name: "Power lines" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect.poll(drawn).toBeGreaterThan(0);
  // In the key too.
  await page.locator(".mp-key summary").click();
  await expect(page.locator(".mp-key")).toContainText(
    "A power line near the parcel, when Power lines is on.",
  );
});
