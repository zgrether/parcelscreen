/**
 * The places' bar (step 4b, docs/plans/step-4b-navigation.md §1–§3, §13): Map, Your list and What matters one tap from
 * every page, the place you're in marked, at 1280 px (a top bar) and at 375 px (a tab bar with More). On a phone at
 * 375 × 667 with Mud Creek screened, nothing overlaps: the tab bar, the results sheet (at its peek and at 46%), the
 * parcel toolbar and the map's buttons each keep their own space; a map tool steps the tabs aside. The interview has no
 * bar. A production build, the fixtures' HARs replayed.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { importParcel, openExplorer, screenIt } from "./flow";
import { replayHar } from "./replay";

const MUD = "grayson-mud-creek-6273" as const;

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function box(l: Locator): Promise<Box> {
  const b = await l.boundingBox();
  expect(b, "a box").not.toBeNull();
  return b!;
}

/** The current tab: the one link with aria-current. */
const current = (page: Page) => page.locator('.app-nav [aria-current="page"]');

for (const size of [
  { width: 1280, height: 800 },
  { width: 375, height: 667 },
])
  test.describe(`at ${size.width} × ${size.height}`, () => {
    test.use({ viewport: size, hasTouch: size.width < 768, isMobile: size.width < 768 });

    test("each place is one tap from every page, and the place you're in is marked", async ({
      page,
      context,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await replayHar(context, MUD);
      await openExplorer(page, MUD);
      await expect(current(page)).toHaveText("Map");
      for (const [tab, url, marked] of [
        ["Your list", /\/library$/, "Your list"],
        ["What matters", /\/priorities$/, "What matters"],
        ["Map", /\/explore$/, "Map"],
        ["What matters", /\/priorities$/, "What matters"],
        ["Your list", /\/library$/, "Your list"],
      ] as const) {
        await page.getByRole("link", { name: tab, exact: true }).click();
        await expect(page).toHaveURL(url);
        await expect(current(page)).toHaveText(marked);
        await expect(page.locator(".app-nav [aria-current]")).toHaveCount(1);
      }
      // The rulebook belongs to no place: nothing marked, and the tabs still there.
      await page.goto("/rulebook");
      await expect(page.locator(".app-nav")).toBeVisible();
      await expect(page.locator(".app-nav [aria-current]")).toHaveCount(0);
      // The menu's button: ☰ on a desktop, More on a phone.
      await expect(page.locator(".app-more")).toHaveAccessibleName(size.width < 768 ? "More" : "Menu");
      // The interview: no bar.
      await page.goto("/interview");
      await expect(page.locator(".iv-scene")).toBeVisible();
      await expect(page.locator(".app-nav")).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  });

test.describe("a phone at 375 × 667", () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });

  test("Mud Creek screened: the tab bar, the sheet (peek and 46%), the toolbar and the map's buttons don't overlap; a tool steps the tabs aside", async ({
    page,
    context,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await replayHar(context, MUD);
    await openExplorer(page, MUD);
    await importParcel(page, MUD);
    // The recording holds what the run needs for its layout (not flood, PAD-US or OSRM, as your-route.spec knows).
    await screenIt(page);

    const nav = page.locator(".app-nav");
    const sheet = page.locator(".explore-panel");
    const toolbar = page.locator(".toolbar");
    // The map's buttons: Search, and each control in the right-hand column (the column's own box is taller).
    const buttons = async (): Promise<Locator[]> => [
      page.locator(".search-btn"),
      ...(await page.locator(".map-col > *:visible").all()),
    ];
    const handle = page.locator(".sheet-handle");

    /**
     * At both snaps the tab bar, the sheet and the toolbar keep apart, and the sheet sits on the tabs. At the peek the
     * map's buttons are clear of the sheet too; at 46% the sheet covers the lower part of the right-hand column, as it
     * did before the tab bar (it's laid over the map), so that's not checked there.
     */
    const measure = async (label: "peek" | "46%") => {
      const n = await box(nav);
      const s = await box(sheet);
      const t = await box(toolbar);
      expect(n.height, `${label}: the tab bar's height`).toBe(56);
      expect(n.y + n.height, `${label}: the tab bar at the bottom`).toBe(667);
      expect(overlaps(s, n), `${label}: the sheet and the tab bar`).toBe(false);
      expect(s.y + s.height, `${label}: the sheet sits on the tab bar`).toBeCloseTo(n.y, 0);
      expect(overlaps(t, s), `${label}: the toolbar and the sheet`).toBe(false);
      expect(overlaps(t, n), `${label}: the toolbar and the tab bar`).toBe(false);
      for (const [i, b] of (await Promise.all((await buttons()).map(box))).entries()) {
        expect(overlaps(b, n), `${label}: map button ${i} and the tab bar`).toBe(false);
        if (label === "peek") expect(overlaps(b, s), `${label}: map button ${i} and the sheet`).toBe(false);
      }
    };

    // After a run the sheet rises to its middle snap: 46% of the space above the tabs.
    await expect.poll(async () => Math.round((await box(sheet)).height)).toBe(Math.round(611 * 0.46));
    await measure("46%");
    // A tap cycles the snaps: 88%, then the peek: 148 px while the grade button shows under the header (step 4c;
    // Mud Creek's "Try again: 3 sources didn't load").
    await handle.tap();
    await handle.tap();
    await expect.poll(async () => Math.round((await box(sheet)).height)).toBe(148);
    await measure("peek");

    // A map tool has the screen: the tabs step aside, and come back when it closes.
    await page.getByRole("button", { name: "Boundary ▾" }).click();
    await page.getByRole("menuitem", { name: "Split" }).click();
    await expect(toolbar).toHaveAttribute("data-mode", "split");
    await expect(nav).toBeHidden();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(toolbar).toHaveAttribute("data-mode", "open");
    await expect(nav).toBeVisible();
    expect(errors).toEqual([]);
  });
});
