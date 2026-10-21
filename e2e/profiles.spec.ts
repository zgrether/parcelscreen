/**
 * Local profiles (roadmap step 1, PR 5b; docs/plans/step-1-profiles-grading.md §3.4, §7): the first visit's
 * "Profile 1" and the picker (add, switch, rename, delete with its screens; a parcel kept in one profile isn't in
 * another); a pre-profile store dropped, with the menu's one-time line (step 2 plan §9); and the Library after a clean
 * break: rows reading "Needs a re-screen", and "Re-screen all saved parcels" with Cancel.
 * A production build, the fixtures' HARs replayed.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { drawnPart } from "@/lib/geo/recipe";
import { built } from "../test/support/parcels";
import { loadFixture } from "../test/support/fixtures";
import {
  ageKept,
  booted,
  expectAllDone,
  importParcel,
  importParcels,
  keptScreenCount,
  openExplorer,
  reload,
  screenIt,
  seedScreens,
  visit,
  openMenu,
} from "./flow";
import { replayHar } from "./replay";

const FERNEY = "ferney-creek-52-47A" as const;
const MACKS = "macks-mountain-35-3" as const;

let errors: string[] = [];
test.beforeEach(({ page }) => {
  errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
});

const menu = (page: Page) => openMenu(page);
/** Your list, by its tab (step 4b: History's parcels are there). */
async function yourList(page: Page): Promise<void> {
  if (await page.locator(".menu-panel").count()) await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Your list", exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
}
/** The picker's button in the menu: it shows the current profile's name. */
const currentName = (page: Page) =>
  page.locator(".menu-profile").getByRole("button", { name: "Switch profile" });
/** Opens the picker's list in the menu. */
async function openPicker(page: Page) {
  await menu(page);
  const list = page.locator(".menu-profile .profile-pop");
  if (!(await list.count())) await currentName(page).click();
  await expect(list).toBeVisible();
  return list;
}
/** Switches to a profile by name: the page reloads and the profile boots. */
async function switchTo(page: Page, name: string): Promise<void> {
  const list = await openPicker(page);
  const loaded = page.waitForEvent("load");
  await list.locator(".profile-name", { hasText: name }).click();
  await loaded;
  await booted(page);
  await menu(page); // the reload closed the menu: the checks that follow read the picker in it
}

test("the first visit's Profile 1; add Visitor and switch; one list for both (step 6); rename; delete keeps the list", async ({
  page,
  context,
}) => {
  await replayHar(context, FERNEY);
  await openExplorer(page, FERNEY);
  // The first visit creates Profile 1, named in the menu.
  await menu(page);
  await expect(currentName(page)).toHaveText(/Profile 1/);

  // Add Visitor: the app switches to it and opens its interview, its name first (step 4); "Not now" goes to the map,
  // with an empty list.
  let list = await openPicker(page);
  await list.getByRole("button", { name: "Add a profile" }).click();
  await page.waitForURL("**/interview");
  await page.getByPlaceholder("Your name or a nickname").fill("Visitor");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator(".iv-progress")).toHaveText("1 of 14");
  await page.getByRole("button", { name: "Not now" }).click();
  await page.waitForURL("**/explore");
  await booted(page);
  await menu(page);
  await expect(currentName(page)).toHaveText(/Visitor/);
  await yourList(page);
  await expect(page.locator("main")).toContainText("No favorites yet");
  await page.getByRole("link", { name: "Map", exact: true }).click();

  // A parcel screened under Visitor: on the household's one list (step 6). Neither profile has set priorities: no switch.
  await importParcel(page, FERNEY);
  expectAllDone(await screenIt(page));
  await expect(page.locator(".card-person")).toHaveCount(0);
  expect(await keptScreenCount(page)).toBe(1);

  await yourList(page);
  await switchTo(page, "Profile 1");
  await expect(currentName(page)).toHaveText(/Profile 1/);
  await expect(page.locator(".lib-row:visible", { hasText: "52-47A" })).toHaveCount(1);
  await switchTo(page, "Visitor");
  await expect(page.locator(".lib-row:visible", { hasText: "52-47A" })).toHaveCount(1);

  // Rename Visitor to Julie, in place; then delete it: the list and its screen stay, and Profile 1 is current again.
  list = await openPicker(page);
  const visitor = list.locator("li", { hasText: "Visitor" });
  await visitor.getByRole("button", { name: "Rename" }).click();
  // While it is edited the row shows the input, not its name: the form is found in the list, not by the row.
  await list.getByLabel("New name for Visitor").fill("Julie");
  await list.getByRole("button", { name: "Save" }).click();
  await expect(list.locator("li", { hasText: "Julie" })).toContainText("current");
  await expect(currentName(page)).toHaveText(/Julie/);
  const julie = list.locator("li", { hasText: "Julie" });
  await julie.getByRole("button", { name: "Delete" }).click();
  await expect(julie.getByRole("alert")).toContainText(
    "Delete Julie? Their settings, priorities and answers go with it; the household's list stays.",
  );
  const reloaded = page.waitForEvent("load");
  await julie.getByRole("alert").getByRole("button", { name: "Delete" }).click();
  await reloaded;
  await booted(page);
  await menu(page);
  await expect(currentName(page)).toHaveText(/Profile 1/);
  list = await openPicker(page);
  await expect(list.locator(".profile-name")).toHaveCount(1);
  expect(await keptScreenCount(page)).toBe(1);
  expect(errors).toEqual([]);
});

test("a pre-profile store is dropped: an empty Profile 1, the menu's line once, and no old keys", async ({
  page,
  context,
}) => {
  await replayHar(context, FERNEY);
  // What a browser held before profiles (one that never opened step 1): History with Ferney, the weight switch on Julie,
  // and step 1's renamed copy of a key.
  const ferney = loadFixture(FERNEY).input.polygon;
  const store = {
    v: 2,
    open: null,
    built: [built("legacy-1", { pieces: [drawnPart(ferney as never)], name: "Ferney Creek", notes: "" })],
  };
  await openExplorer(page, FERNEY, {
    "ps.parcels": JSON.stringify(store),
    "ps.person": "julie",
    "ps.legacy.ps.cfg": "{}",
  });
  await menu(page);
  await expect(currentName(page)).toHaveText(/Profile 1/);
  await expect(page.locator(".old-data-note")).toHaveText("Saved with an older version; screen it again.");
  await yourList(page);
  await expect(page.locator(".lib-row:visible", { hasText: "Ferney Creek" })).toHaveCount(0);
  const left = await page.evaluate(() =>
    Object.keys(localStorage).filter(
      (k) => k.startsWith("ps.legacy.") || k === "ps.parcels" || k === "ps.person",
    ),
  );
  expect(left).toEqual([]);
  // Once: the next boot finds nothing to drop.
  await reload(page);
  await menu(page);
  await expect(page.locator(".old-data-note")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("after a clean break: rows read Needs a re-screen; Re-screen all saved parcels can be cancelled, then screens them all", async ({
  page,
  context,
}) => {
  await replayHar(context, [FERNEY, MACKS]);
  await openExplorer(page, FERNEY);
  await importParcels(page, [FERNEY, MACKS]);
  await seedScreens(page, [FERNEY, MACKS]);
  await ageKept(page, "v2");
  await visit(page, "/library");
  const rows = page.locator(".lib-table tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator(".lib-c-grade")).toHaveText("Needs a re-screen");
  await expect(rows.nth(1).locator(".lib-c-grade")).toHaveText("Needs a re-screen");
  const line = page.locator(".lib-rescreen");
  await expect(line).toContainText("2 parcels need a re-screen");

  // Cancel part-way: the run in flight is dropped, nothing is kept, the rows still need one.
  await line.getByRole("button", { name: "Re-screen all saved parcels" }).click();
  await expect(line).toContainText(/Re-screening 1 of 2: /);
  await line.getByRole("button", { name: "Cancel" }).click();
  await expect(line).toContainText("Stopped after 0 of 2.");
  await expect(rows.nth(0).locator(".lib-c-grade")).toHaveText("Needs a re-screen");
  expect(await keptScreenCount(page)).toBe(2);

  // Then all of them: each row gets its grade back, each as a new kept screen.
  await line.getByRole("button", { name: "Re-screen all saved parcels" }).click();
  await expect(line).toContainText("Re-screened 2 parcels.", { timeout: 200_000 });
  await expect(rows.nth(0).locator(".lib-c-grade")).toHaveText(/^[A-F](Contender|Maybe|Not for us)$/);
  await expect(rows.nth(1).locator(".lib-c-grade")).toHaveText(/^[A-F](Contender|Maybe|Not for us)$/);
  expect(await keptScreenCount(page)).toBe(4);
  await expect(line).not.toContainText("need a re-screen");
  expect(errors).toEqual([]);
});

/** Every corner of `el` (12 px in) is inside the window, and is `el` where a click would land. */
const fullyVisible = (el: Locator): Promise<boolean> =>
  el.evaluate((e) => {
    const r = e.getBoundingClientRect();
    return [
      [r.left + 12, r.top + 12],
      [r.right - 12, r.top + 12],
      [r.left + 12, r.bottom - 12],
      [r.right - 12, r.bottom - 12],
    ].every(([x, y]) => {
      const hit = document.elementFromPoint(x!, y!);
      return x! < window.innerWidth && y! < window.innerHeight && !!hit && e.contains(hit);
    });
  });

/**
 * Menus stay inside the window (owner, 10/18: the profile menu was cut off at the right edge): the menu (step 4b: a
 * panel under ☰ on a desktop, More's sheet on a phone) and the profile list inside it, on every page, in a short window
 * too.
 */
for (const size of [
  { width: 1280, height: 800 },
  { width: 1280, height: 480 },
  { width: 375, height: 812 },
])
  test.describe(`at ${size.width} × ${size.height}`, () => {
    test.use({ viewport: size });

    test("the menu, and the profile list in it, are fully visible on every page", async ({ page }) => {
      await page.addInitScript(() => {
        if (sessionStorage.getItem("e2e")) return;
        sessionStorage.setItem("e2e", "1");
        localStorage.clear();
        localStorage.setItem("ps.debug", "1");
      });
      for (const path of ["/priorities", "/library", "/rulebook", "/explore"]) {
        await page.goto(path);
        // What matters' Try it bar is up first: on a phone it sits along the bottom, where More's sheet opens.
        if (path === "/priorities") await expect(page.getByRole("region", { name: "Try it" })).toBeVisible();
        const panel = await openMenu(page);
        // The menu has placed itself (useKeepInView runs after layout), and nothing clips it: each of its corners (12 px
        // in, past the rounding) is inside the window and is the menu itself where a click would land there, not the
        // page beneath (the first version of this check passed while a scrolling <main> cut a menu off).
        await expect.poll(() => fullyVisible(panel), { message: `the menu on ${path}` }).toBe(true);
        // A short window: the menu scrolls inside itself, and the profile list's last item is reachable.
        await currentName(page).click();
        const add = page.locator(".menu-profile .profile-pop").getByRole("button", { name: "Add a profile" });
        await add.scrollIntoViewIfNeeded();
        await expect(add).toBeInViewport();
        await expect
          .poll(() => fullyVisible(panel), { message: `the menu with its list on ${path}` })
          .toBe(true);
        await page.keyboard.press("Escape");
      }
      expect(errors).toEqual([]);
    });
  });
