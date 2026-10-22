/**
 * Step 12, ways to raise this grade (plan §2): Macks' section after the card, its septic suggestion opening the Septic
 * panel with the choice made and the reason prefilled, and saving it making the parcel a Contender.
 */
import { expect, test, type Page } from "@playwright/test";
import { loadFixture } from "../test/support/fixtures";
import { importParcels, openExplorer, openFromList, seedScreens, settled, visit } from "./flow";
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
