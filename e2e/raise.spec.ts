/**
 * Step 12, ways to raise this grade (plan §2): Macks' section after the card, its septic suggestion opening the Septic
 * panel with the choice made and the reason prefilled, and saving it making the parcel a Contender.
 */
import { expect, test, type Page } from "@playwright/test";
import { loadFixture } from "../test/support/fixtures";
import {
  importParcel,
  importParcels,
  keptScreenCount,
  openExplorer,
  openFromList,
  screenIt,
  seedScreens,
  settled,
  visit,
} from "./flow";
import { GRAYSON, withRedGate } from "./redGate";
import { replayHar } from "./replay";

const MACKS = "macks-mountain-35-3";

async function open(page: Page, slug: string): Promise<void> {
  await openExplorer(page, slug as never);
  await importParcels(page, [slug as never]);
  await seedScreens(page, [slug as never]);
  await settled(page);
  await visit(page, "/library");
  await openFromList(page, loadFixture(slug as never).input.name);
}

test("Macks: the septic suggestion, counted as passed, makes it a Contender", async ({ page, context }) => {
  test.setTimeout(180_000);
  await replayHar(context, MACKS);
  await open(page, MACKS);

  await expect(page.locator(".card .card-word")).toHaveText("Maybe");
  const raise = page.getByRole("region", { name: "Ways to raise this grade" });
  await expect(raise).toContainText("Plan on an alternative septic system: Septic ! → ✓, Maybe → Contender");
  await expect(raise).toContainText("septic $15–55k in Ready to build (Alternative)");
  await expect(raise.locator(".raise-item")).toHaveCount(2);

  await raise.getByRole("button", { name: "Count it as passed" }).click();
  const panel = page.locator(".card-panel");
  await expect(panel.getByRole("heading", { name: "Septic", exact: false }).first()).toBeVisible();
  await expect(panel.getByLabel("Why? (required)")).toHaveValue("Planning on an alternative septic system");
  await panel.getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".card .card-word")).toHaveText("Contender");
  // The septic system no longer raises it: the section moves on.
  await panel.getByRole("button", { name: "Close" }).click();
  await expect(raise).not.toContainText("alternative septic");
});

test("Mud Creek's red gate: not suggested; in the Easement panel, Try it shows the card going down and why", async ({
  page,
  context,
}) => {
  test.setTimeout(300_000);
  await replayHar(context, [GRAYSON]);
  await openExplorer(page, GRAYSON);
  await importParcel(page, GRAYSON);
  await withRedGate(page);
  expect((await screenIt(page)).driveway).toBe("done");
  // Its recording holds what the driveway needs, not FEMA's, PAD-US's or OSRM's: the verdict is held at Maybe for
  // what didn't load, so the Musts say what the red gate does.
  const access = page
    .locator(".must-row")
    .filter({ has: page.locator(".row-label", { hasText: /access/i }) });
  await expect(access).toHaveAttribute("aria-label", "Legal road access: pass");

  // It lowers the grade (41% against the 25% veto): never a way to raise it.
  const raise = page.getByRole("region", { name: "Ways to raise this grade" });
  await expect(raise).toBeVisible();
  await expect(raise.locator(".raise-access")).toHaveCount(0);

  // The Easement panel: Try it beside Use as my driveway.
  const gate = page
    .locator(".must-row")
    .filter({ has: page.locator(".row-label", { hasText: /driveway on your land/i }) });
  await gate.click();
  const redGate = page.locator(".route-choice-col").filter({ hasText: "Red gate" });
  const screens = await keptScreenCount(page);
  await redGate.getByRole("button", { name: "Try it" }).click();
  const tried = redGate.locator(".try-it.tried");
  await expect(tried).toContainText("Legal road access ✓ → !", { timeout: 60_000 });
  await expect(tried).toContainText("Why:");
  await expect(tried).toContainText("your route is steeper than your veto (41% vs 25%)");
  // Still a suggestion: the card and the kept screens are as they were.
  await expect(access).toHaveAttribute("aria-label", "Legal road access: pass");
  expect(await keptScreenCount(page)).toBe(screens);

  await tried.getByRole("button", { name: "Discard" }).click();
  await expect(redGate.locator(".try-it.tried")).toHaveCount(0);
  await expect(access).toHaveAttribute("aria-label", "Legal road access: pass");

  // Tried again and kept: the red gate is the driveway, on a new screen timed from it.
  await redGate.getByRole("button", { name: "Try it" }).click();
  await expect(redGate.locator(".try-it.tried")).toBeVisible({ timeout: 60_000 });
  await redGate.getByRole("button", { name: "Use it" }).click();
  await expect(access).toHaveAttribute("aria-label", "Legal road access: warn");
  await expect(page.locator(".route-choice-col.scored")).toContainText("Red gate");
  await expect.poll(() => keptScreenCount(page)).toBe(screens + 1);
});
