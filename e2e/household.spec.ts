/**
 * The household on the synced space (step 6, docs/plans/step-6-household.md): one list for every member, who added
 * each parcel, joining through Who's this? and I'm new here, and the clean break of each profile's own list. Two
 * browser contexts are two people's devices, over the memory store (playwright.config.ts).
 */
import { expect, test, type Page } from "@playwright/test";
import { OLD_DATA_DROPPED } from "@/lib/client/oldData";
import { afterTabSwitch, startSyncing, YOUR_LIST } from "./household";
import { JULIE, ZACH } from "../test/support/rubrics";
import { booted, importParcels, listRow, openExplorer, openMenu, reload, seedScreens, settled } from "./flow";

const FERNEY = "ferney-creek-52-47A" as const;
const MACKS = "macks-mountain-35-3" as const;

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
  await julie.getByRole("link", { name: YOUR_LIST }).click();
  await expect(listRow(julie, "52-47A")).toBeVisible();
  await expect(listRow(julie, "35-3")).toBeVisible();
  // A row opens the parcel on the map (Z-2); Details says who added it.
  await listRow(julie, "52-47A").locator(".lib-open").click();
  await julie.getByRole("tab", { name: "Details" }).click();
  await expect(julie.locator(".parcel-details")).toContainText("Added by Profile 1");

  // The current profile stays per device: Julie's reload opens as her.
  await reload(julie);
  await expect((await openMenu(julie)).locator(".profile-btn-name")).toHaveText("Julie");

  // UX part 2 PR 5 (P-8): Household, its own item in the menu, lists the members; Rename names Zach's profile.
  await julie.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: "Household" }).click();
  const household = julie.getByRole("dialog", { name: "Household" });
  const members = household.getByRole("list", { name: "Members" });
  await expect(members).toContainText("Julie (you)");
  await members
    .getByRole("listitem")
    .filter({ hasText: "Profile 1" })
    .getByRole("button", { name: "Rename" })
    .click();
  await household.getByLabel("New name for Profile 1").fill("Zach");
  await household.getByRole("button", { name: "Save" }).click();
  await expect(members).toContainText("Zach");
  await household.getByRole("button", { name: "Close" }).click();
  await julie.getByRole("link", { name: YOUR_LIST }).click();
  await listRow(julie, "52-47A").locator(".lib-open").click();
  await julie.getByRole("tab", { name: "Details" }).click();
  await expect(julie.locator(".parcel-details")).toContainText("Added by Zach");
});

test("alone, a kept parcel's Ask someone opens Household (P-8)", async ({ page }) => {
  await openExplorer(page, FERNEY);
  await importParcels(page, [FERNEY]);
  await page.getByRole("link", { name: YOUR_LIST }).click();
  await listRow(page, "52-47A").locator(".lib-open").click();
  await page.locator(".sh-acts").getByRole("button", { name: "Ask someone" }).click();
  const household = page.getByRole("dialog", { name: "Household" });
  await expect(household).toBeVisible();
  await expect(household).toContainText("It's just you so far.");
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

test("everyone's grade; How Julie would rate it; Ask Julie → Waiting for you → her take beside her grade", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const zach = await (await browser.newContext()).newPage();
  await openExplorer(zach, FERNEY);
  await importParcels(zach, [FERNEY, MACKS]);
  await seedScreens(zach, [FERNEY, MACKS]);
  // The seeded grades are written to the store directly: a reload has the map read them, as the list does on opening.
  await settled(zach);
  await reload(zach);
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
    // The row opens the map (Z-2); the other members' grades are in its Grade.
    await listRow(zach, "52-47A").locator(".lib-open").click();
    await zach.getByRole("tab", { name: "Grade" }).click();
    await expect(zach.getByText("Julie hasn't said what matters to them yet.")).toBeVisible({
      timeout: 8000, // the row opens the map (Z-2), which restores the parcel's screen first
    });
  });
  await expect(zach.getByRole("button", { name: "Answer as Julie here" })).toBeVisible();
  await zach.locator(".back-chip").click();

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
  // UX part 2 PR 3 (P-2): Ask is the header's, in the row of actions; the form opens in the row's place.
  await zach.locator(".sh-acts").getByRole("button", { name: "Ask Julie" }).click();
  const ask = zach.getByRole("form", { name: "Ask for a take" });
  await ask.getByRole("textbox").fill("The spring by the road?");
  await ask.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(section).toContainText("Julie's Waiting for you");
  // Closed, so the tab switches below (by way of the map) don't have it in front of him when her take arrives.
  await zach.getByRole("button", { name: "Close this parcel" }).first().click();
  await zach.getByRole("link", { name: YOUR_LIST }).click();

  await afterTabSwitch(julie, async () => {
    await expect(julie.locator(".app-badge")).toHaveText("1", { timeout: 1000 });
  });
  await julie.getByRole("button", { name: /^Waiting for you/ }).click();
  await expect(julie.locator(".lib-row:visible")).toHaveCount(1);
  // Step 6b: the ask's note on its row.
  await expect(listRow(julie, "52-47A").locator(".lib-ask-note")).toHaveText(
    "Profile 1 asked for your take: “The spring by the road?” Open it to answer.",
  );
  await listRow(julie, "52-47A").locator(".lib-open").click();
  const yours = julie.getByRole("region", { name: "Your take" });
  await expect(yours).toContainText("Profile 1 asked for your take: “The spring by the road?”");
  await yours.getByRole("button", { name: "Maybe" }).click();
  await yours.getByRole("textbox").fill("Steep drive, lovely spring.");
  await yours.getByRole("button", { name: "Save my take" }).click();
  await expect(yours).toContainText("Steep drive, lovely spring.");
  await expect(julie.locator(".app-badge")).toHaveCount(0);

  // Zach: her take beside her grade, new (step 6b: the dot, and a count on the badge), and in her section.
  await afterTabSwitch(zach, async () => {
    await expect(listRow(zach, "52-47A").locator(".take-chip")).toHaveText("Julie says Maybe", {
      timeout: 1000,
    });
  });
  await expect(listRow(zach, "52-47A").locator(".new-dot")).toBeVisible();
  await expect(zach.locator(".app-badge")).toHaveText("1");
  // Polish #13: her comment's start on the row; #14: New takes (1) keeps the rows with a take not seen yet.
  await expect(listRow(zach, "52-47A").locator(".take-note")).toHaveText("“Steep drive, lovely spring.”");
  await expect(zach.getByRole("button", { name: "New takes (1)" })).toBeVisible();
  await expect(zach.locator(".app-badge")).toHaveAttribute("aria-label", "1 new take");
  await listRow(zach, "52-47A").locator(".lib-open").click();
  await expect(zach.getByRole("region", { name: "How Julie would rate it" })).toContainText(
    "Steep drive, lovely spring.",
  );
  // UX part 2 PR 3 (P-2): her take under the header's actions, with the dot it had as it opened.
  const takes = zach.getByRole("list", { name: "Takes" });
  await expect(takes).toContainText("Julie · Maybe");
  await expect(takes).toContainText("“Steep drive, lovely spring.”");
  await expect(takes.getByRole("img", { name: "New take from Julie" })).toBeVisible();
  // Opening it saw it: no dot, no count.
  await expect(zach.locator(".app-badge")).toHaveCount(0);
  await expect(listRow(zach, "52-47A").locator(".new-dot")).toHaveCount(0);
});

/** The list's scroll position (it scrolls inside the page, not the window); with `to`, scrolls there first. */
const listScroll = (page: Page, to?: number): Promise<number> =>
  page.evaluate((to) => {
    let el = document.querySelector(".lib-row")?.parentElement ?? null;
    while (el && !(el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY)))
      el = el.parentElement;
    if (!el) return 0;
    if (to !== undefined) el.scrollTop = to;
    return el.scrollTop;
  }, to);

test("polling (step 6b): a take saved on one device appears on the other within 35 s, with no action, and the scroll holds", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const MUD = "grayson-mud-creek-6273" as const;
  const zach = await (await browser.newContext()).newPage();
  await openExplorer(zach, FERNEY);
  await importParcels(zach, [FERNEY, MACKS, MUD]);
  await seedScreens(zach, [FERNEY, MACKS, MUD]);
  const code = await startSyncing(zach);

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

  // Her priorities, so her grade (and her take beside it) has a place on Zach's list.
  await setPriorities(julie, JULIE.rubric);

  // Zach: Your list in a short window, scrolled to its end, and then left alone.
  await zach.setViewportSize({ width: 1280, height: 240 });
  await zach.getByRole("link", { name: YOUR_LIST }).click();
  await expect(listRow(zach, "6273")).toBeVisible();
  await listScroll(zach, 1e6);
  const scrolled = await listScroll(zach);
  expect(scrolled, "the list scrolls in a short window").toBeGreaterThan(0);

  // Julie gives her take on Ferney.
  await julie.getByRole("link", { name: YOUR_LIST }).click();
  await listRow(julie, "52-47A").locator(".lib-open").click();
  const yours = julie.getByRole("region", { name: "Your take" });
  await yours.getByRole("button", { name: "Yes" }).click();
  await yours.getByRole("button", { name: "Save my take" }).click();
  await expect(yours).toContainText("Change");

  // Zach, untouched: her take arrives by the poll.
  await expect(listRow(zach, "52-47A").locator(".take-chip")).toHaveText("Julie says Yes", {
    timeout: 35_000,
  });
  // Held: the row above grows a pixel with the take's chip, and the browser's scroll anchoring keeps the view still.
  expect(Math.abs((await listScroll(zach)) - scrolled)).toBeLessThanOrEqual(2);
});

test("Invite someone: a one-use link; she joins as a new member with her name, and the link is spent (P-8)", async ({
  browser,
}) => {
  const zach = await (await browser.newContext()).newPage();
  await openExplorer(zach, FERNEY);
  await importParcels(zach, [FERNEY]);
  // Not synced yet: making the link starts sync first.
  const drawer = await openMenu(zach);
  await drawer.getByRole("button", { name: "Household" }).click();
  const household = zach.getByRole("dialog", { name: "Household" });
  const invite = household.getByRole("region", { name: "Invite someone" });
  await invite.getByRole("button", { name: "Make an invite link" }).click();
  const link = await invite.getByLabel("Invite link").inputValue({ timeout: 30_000 });
  expect(link).toMatch(/\/join#[0-9A-Z]{26}$/);
  await household.getByRole("button", { name: "Close" }).click();

  const julie = await (await browser.newContext()).newPage();
  await openExplorer(julie, FERNEY);
  await julie.goto(link);
  await expect(julie).toHaveURL(/\/join$/); // the token is gone from the address bar
  await julie.getByRole("button", { name: /^Join$/ }).click();
  // Straight to her name: no Who's this?
  await julie.waitForURL("**/interview");
  await julie.getByPlaceholder("Your name or a nickname").fill("Julie");
  await julie.getByRole("button", { name: "Continue" }).click();
  await julie.getByRole("button", { name: "Not now" }).click();
  await booted(julie);
  await expect((await openMenu(julie)).locator(".profile-btn-name")).toHaveText("Julie");

  // Zach's household has her, once his device has fetched (the dialog closed each try, so the tabs can switch).
  await afterTabSwitch(zach, async () => {
    await (await openMenu(zach)).getByRole("button", { name: "Household" }).click();
    try {
      await expect(household.getByRole("list", { name: "Members" })).toContainText("Julie", {
        timeout: 1000,
      });
    } finally {
      await household.getByRole("button", { name: "Close" }).click();
    }
  });

  // The link is spent: a second opening joins nothing.
  const other = await (await browser.newContext()).newPage();
  await openExplorer(other, FERNEY);
  await other.goto(link);
  await expect(other.locator("main")).toContainText(
    "This invite has been used, or it's more than 7 days old.",
  );
});
