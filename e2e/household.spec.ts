/**
 * The household on the synced space (step 6, docs/plans/step-6-household.md): one list for every member, who added
 * each parcel, joining through Who's this? and I'm new here, and the clean break of each profile's own list. Two
 * browser contexts are two people's devices, over the memory store (playwright.config.ts).
 */
import { expect, test, type Page } from "@playwright/test";
import { OLD_DATA_DROPPED } from "@/lib/client/oldData";
import { PASSWORD_LEAD, START, SYNC_TITLE } from "@/lib/sync/words";
import { JULIE, ZACH } from "../test/support/rubrics";
import {
  booted,
  importParcels,
  listRow,
  openExplorer,
  openMenu,
  openYourData,
  reload,
  seedScreens,
  settled,
} from "./flow";

const FERNEY = "ferney-creek-52-47A" as const;
const MACKS = "macks-mountain-35-3" as const;

/** Starts syncing on this page; returns its code. */
async function startSyncing(page: Page): Promise<string> {
  await openYourData(page);
  await page.getByRole("button", { name: SYNC_TITLE, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: SYNC_TITLE });
  await dialog.getByRole("button", { name: START }).click();
  await expect(dialog.getByText(PASSWORD_LEAD)).toBeVisible({ timeout: 30_000 });
  const code = (await dialog.locator(".sync-code-value").innerText()).replace(/[-\s]/g, "");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  return code;
}

test("Julie joins: Who's this? → I'm new here → her name; one list, and who added each parcel", async ({
  browser,
}) => {
  const zach = await (await browser.newContext()).newPage();
  await openExplorer(zach, FERNEY);
  await importParcels(zach, [FERNEY, MACKS]);
  const code = await startSyncing(zach);

  const julie = await (await browser.newContext()).newPage();
  await openExplorer(julie, FERNEY);
  await julie.goto(`/link#${code}`);
  await julie.getByRole("button", { name: /^Join$/ }).click();
  await expect(julie).toHaveURL(/\/who$/);
  await expect(julie.getByRole("heading", { name: "Who's this?" })).toBeVisible();
  await expect(julie.getByRole("button", { name: "Profile 1" })).toBeVisible();
  await julie.getByRole("button", { name: "I'm new here" }).click();
  await julie.waitForURL("**/interview");
  await expect(julie.getByRole("heading", { name: "What should we call you?" })).toBeVisible();
  await julie.getByPlaceholder("Your name or a nickname").fill("Julie");
  await julie.getByRole("button", { name: "Continue" }).click();
  await julie.getByRole("button", { name: "Not now" }).click();

  // Her list is the household's: Zach's two parcels, each added by him.
  await julie.getByRole("link", { name: "Your list", exact: true }).click();
  await expect(listRow(julie, "52-47A")).toBeVisible();
  await expect(listRow(julie, "35-3")).toBeVisible();
  await listRow(julie, "52-47A").locator(".lib-open").click();
  await expect(julie.getByRole("dialog").getByText("Added by Profile 1")).toBeVisible();

  // The current profile stays per device: Julie's reload opens as her.
  await reload(julie);
  await expect((await openMenu(julie)).locator(".profile-btn-name")).toHaveText("Julie");
});

test("the clean break: a profile's own list from before step 6 goes, and the menu says so once", async ({
  page,
}) => {
  await openExplorer(page, FERNEY);
  await booted(page);
  const profile = await page.evaluate(() => window.__psKv!.profile);
  // A list kept the old way: under the profile, with no shared one. Written from a page that doesn't run the app, so
  // the app's own flush as it unloads can't put the shared list back (it did, in CI).
  await settled(page);
  await page.goto("/api/health");
  await page.evaluate(
    ({ parcels, profile }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("parcelscreen");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction("docs", "readwrite");
          const docs = tx.objectStore("docs");
          docs.put({ profile, key: "ps.parcels", value: parcels });
          docs.delete(["_space", "ps.parcels"]);
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { parcels: JSON.stringify({ v: 2, open: null, built: [] }), profile },
  );
  await page.goto("/explore");
  await booted(page);
  await expect((await openMenu(page)).getByText(OLD_DATA_DROPPED)).toBeVisible();
  await page.keyboard.press("Escape");
  await reload(page);
  await expect((await openMenu(page)).getByText(OLD_DATA_DROPPED)).toHaveCount(0);
});

/** Sets the current profile's own priorities through the debug handle (a rubric as the editor would save it). */
const setPriorities = (page: Page, rubric: unknown) =>
  page.evaluate((r) => window.__psKv!.setItem("ps.rubrics", JSON.stringify({ mine: r, others: [] })), rubric);

/** Switches tabs until the check passes: each switch fetches the space's changes. */
async function afterTabSwitch(page: Page, check: () => Promise<void>): Promise<void> {
  await expect(async () => {
    await page.getByRole("link", { name: "Map", exact: true }).click();
    await page.getByRole("link", { name: "Your list", exact: true }).click();
    await check();
  }).toPass({ timeout: 30_000 });
}

test("everyone's grade; How Julie would rate it; Ask Julie → Waiting for you → her take beside her grade", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const zach = await (await browser.newContext()).newPage();
  await openExplorer(zach, FERNEY);
  await importParcels(zach, [FERNEY, MACKS]);
  await seedScreens(zach, [FERNEY, MACKS]);
  await setPriorities(zach, ZACH.rubric);
  const code = await startSyncing(zach);

  // Julie joins as someone new, and hasn't set priorities yet.
  const julie = await (await browser.newContext()).newPage();
  await openExplorer(julie, FERNEY);
  await julie.goto(`/link#${code}`);
  await julie.getByRole("button", { name: /^Join$/ }).click();
  await julie.getByRole("button", { name: "I'm new here" }).click();
  await julie.waitForURL("**/interview");
  await julie.getByPlaceholder("Your name or a nickname").fill("Julie");
  await julie.getByRole("button", { name: "Continue" }).click();
  await julie.getByRole("button", { name: "Not now" }).click();
  await booted(julie);

  // Zach sees her, without priorities.
  await afterTabSwitch(zach, async () => {
    await listRow(zach, "52-47A").locator(".lib-open").click();
    await expect(zach.getByText("Julie hasn't said what matters to them yet.")).toBeVisible({
      timeout: 1000,
    });
  });
  await expect(zach.getByRole("button", { name: "Answer as Julie here" })).toBeVisible();
  await zach.getByRole("dialog").getByRole("button", { name: "Close" }).click();

  // Julie sets hers: Zach's list shows her grade beside his.
  await setPriorities(julie, JULIE.rubric);
  await afterTabSwitch(zach, async () => {
    await expect(listRow(zach, "52-47A").locator(".lib-other-grade")).toContainText("Julie", {
      timeout: 1000,
    });
  });
  await listRow(zach, "52-47A").locator(".lib-open").click();
  const section = zach.getByRole("region", { name: "How Julie would rate it" });
  await expect(section.locator(".card-grade")).toBeVisible();
  await expect(section.locator(".others-reason")).not.toBeEmpty();

  // Zach asks; Julie's badge and Waiting for you; she answers Maybe with a comment.
  await section.getByRole("button", { name: "Ask Julie" }).click();
  await section.getByRole("textbox").fill("The spring by the road?");
  await section.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(section).toContainText("Julie's Waiting for you");
  await zach.getByRole("dialog").getByRole("button", { name: "Close" }).click();

  await afterTabSwitch(julie, async () => {
    await expect(julie.locator(".app-badge")).toHaveText("1", { timeout: 1000 });
  });
  await julie.getByRole("button", { name: /^Waiting for you/ }).click();
  await expect(julie.locator(".lib-row:visible")).toHaveCount(1);
  await listRow(julie, "52-47A").locator(".lib-open").click();
  const yours = julie.getByRole("region", { name: "Your take" });
  await expect(yours).toContainText("Profile 1 asked for your take: “The spring by the road?”");
  await yours.getByRole("button", { name: "Maybe" }).click();
  await yours.getByRole("textbox").fill("Steep drive, lovely spring.");
  await yours.getByRole("button", { name: "Save my take" }).click();
  await expect(yours).toContainText("Steep drive, lovely spring.");
  await expect(julie.locator(".app-badge")).toHaveCount(0);

  // Zach: her take beside her grade, and in her section.
  await afterTabSwitch(zach, async () => {
    await expect(listRow(zach, "52-47A").locator(".take-chip")).toHaveText("says Maybe", { timeout: 1000 });
  });
  await listRow(zach, "52-47A").locator(".lib-open").click();
  await expect(zach.getByRole("region", { name: "How Julie would rate it" })).toContainText(
    "Steep drive, lovely spring.",
  );
});
