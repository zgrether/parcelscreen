/**
 * Step 14e (plan step-14e-offline.md §6, e2e 5): notes made offline are held, not failed: "Saved on this device — syncs
 * when you're back online", with no Not saved and no Try again. Meanwhile another device renames the parcel. Back
 * online, the held notes go by themselves, laid over the other device's newer copy, so both changes survive.
 */
import { expect, test, type Page } from "@playwright/test";
import { HELD } from "@/lib/sync/words";
import { booted, importParcels, listRow, openExplorer, unfoldListing } from "./flow";
import { startSyncing, YOUR_LIST } from "./household";

const FERNEY = "ferney-creek-52-47A" as const;
const NOTE = "Gate is chained: walk in from the road.";

/** Your list → the parcel → Details. */
async function details(page: Page, name: string) {
  await page.getByRole("link", { name: YOUR_LIST }).click();
  await listRow(page, name).locator(".lib-open").click();
  await page.getByRole("tab", { name: "Details" }).click();
  return page.locator(".parcel-details");
}

test("notes made offline are held, then sync by themselves, merged with another device's change", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const deskContext = await browser.newContext();
  const desk = await deskContext.newPage();
  await openExplorer(desk, FERNEY);
  await importParcels(desk, [FERNEY]);
  const code = await startSyncing(desk);

  const phone = await (await browser.newContext()).newPage();
  await openExplorer(phone, FERNEY);
  await phone.goto(`/link#${code}`);
  await phone.getByRole("button", { name: /^Join$/ }).click();
  await phone.getByRole("button", { name: "Profile 1" }).click();
  await booted(phone);

  // Offline on the desk: the note is held.
  const d = await details(desk, "52-47A");
  await deskContext.setOffline(true);
  await d.getByLabel(/^Notes for /).fill(NOTE);
  await d.getByLabel(/^Notes for /).blur();
  await expect(desk.locator(".sync-ind.bar")).toHaveText(HELD, { timeout: 15_000 });
  await expect(desk.locator(".sync-toast")).toHaveCount(0);

  // Meanwhile the phone, online, renames it.
  const p = await details(phone, "52-47A");
  const name = (await unfoldListing(p)).getByLabel("Name");
  await name.fill("Ferney from the phone");
  await name.press("Enter");
  await phone.locator(".back-chip").click();
  await expect(listRow(phone, "Ferney from the phone")).toBeVisible();
  // Saved to the space (a save goes a second after the edit), so it's newer there than the desk's starting copy.
  await expect
    .poll(() =>
      phone.evaluate(
        () =>
          (JSON.parse(localStorage.getItem("ps.sync")!) as { unsaved: { parcels: unknown[] } }).unsaved
            .parcels.length,
      ),
    )
    .toBe(0);

  // Back online: no Try again; it syncs by itself, and keeps the phone's name.
  await deskContext.setOffline(false);
  await expect(desk.locator(".sync-ind.bar")).toHaveText("Synced", { timeout: 20_000 });
  // The phone gets both: its own name and the desk's note. (An open notes box keeps its own text, so it's read fresh.)
  await expect(async () => {
    await phone.reload();
    await booted(phone);
    const again = await details(phone, "Ferney from the phone");
    await expect(again.getByLabel(/^Notes for /)).toHaveValue(NOTE, { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
});
