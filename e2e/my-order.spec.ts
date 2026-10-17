/**
 * My order (WF3, docs/plans/parcel-workflow.md §5): the list's default sort, rearranged by a drag on a row's grip (a
 * mouse, the keyboard, or a long press on a phone) or by its menu's Move up and Move down. A move keeps after a reload,
 * writes the parcel's rank and not when it last changed; under another sort the grips hide, and the list says how to
 * get them back.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { importParcels, openExplorer } from "./flow";
import { replayHar } from "./replay";

const FERNEY = "ferney-creek-52-47A" as const;
const MACKS = "macks-mountain-35-3" as const;

/** The parcel IDs in the order shown: "52-47A", "35-3". */
const order = async (names: Locator) =>
  (await names.allTextContents()).map((t) => /parcel ([\w-]+)/.exec(t)?.[1] ?? t);

const stored = (page: Page) =>
  page.evaluate(
    () =>
      (
        JSON.parse(window.__psKv!.getItem("ps.parcels")!) as {
          built: { notes: string; rank: string; updatedAt: string }[];
        }
      ).built,
  );

async function twoParcels(page: Page, context: Parameters<typeof replayHar>[0]) {
  await replayHar(context, [FERNEY, MACKS]);
  await openExplorer(page, FERNEY);
  await importParcels(page, [FERNEY, MACKS]);
  await page.goto("/library");
}

test("desktop: My order by default; a mouse drag, the keyboard and the menu move a row; other sorts are views", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await twoParcels(page, context);
  const rows = page.locator(".lib-table tbody tr");
  const names = page.locator(".lib-table .lib-open");
  await expect(rows).toHaveCount(2);
  await expect(page.getByLabel("Sort by")).toHaveValue("order");
  // My order isn't reversed: it's rearranged.
  await expect(page.getByRole("button", { name: "Reverse the order" })).toHaveCount(0);
  const [first, second] = await order(names);
  const before = await stored(page);

  // A mouse drag on the second row's grip, up past the first.
  const grip = rows.nth(1).locator(".lib-handle").first();
  const target = await rows.nth(0).boundingBox();
  const from = await grip.boundingBox();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++)
    await page.mouse.move(from!.x + from!.width / 2, from!.y - ((from!.y - target!.y) * i) / 10 - 2);
  await page.mouse.up();
  await expect.poll(() => order(names)).toEqual([second, first]);
  // Not a tap on the row: no detail opened.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // It keeps after a reload; the move wrote a rank, not when the parcel changed.
  await page.reload();
  await expect.poll(() => order(names)).toEqual([second, first]);
  const after = await stored(page);
  expect(after.map((b) => b.updatedAt)).toEqual(before.map((b) => b.updatedAt));
  expect(after.map((b) => b.rank)).not.toEqual(before.map((b) => b.rank));

  // The keyboard: Space on the grip picks it up, the arrows move it, Space puts it down.
  await rows.nth(0).locator(".lib-handle").first().focus();
  await page.keyboard.press("Space");
  await expect(rows.nth(0)).toHaveClass(/lib-dragging/);
  // @dnd-kit listens for the arrows a moment after the pick-up: faster than a person's next key.
  await page.waitForTimeout(150);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(300); // the row slides into its new place before it's put down
  await page.keyboard.press("Space");
  await expect.poll(() => order(names)).toEqual([first, second]);

  // The menu: Move up stops at the top; Move down moves it, says so, and the focus stays on the menu's button.
  const menu = rows.nth(0).getByRole("button", { name: /^Order: / });
  await menu.click();
  await expect(page.getByRole("menuitem", { name: "Move up" })).toBeDisabled();
  await page.getByRole("menuitem", { name: "Move down" }).click();
  await expect.poll(() => order(names)).toEqual([second, first]);
  await expect(page.getByRole("status").filter({ hasText: "moved to 2 of 2" })).toHaveCount(1);
  await expect(rows.nth(1).getByRole("button", { name: /^Order: / })).toBeFocused();
  // With the keyboard: Enter on the focused button opens the menu, and Enter on Move up moves it back.
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "Move up" }).press("Enter");
  await expect.poll(() => order(names)).toEqual([first, second]);

  // Another sort is a view: no grips, and the way back to My order.
  await page.getByLabel("Sort by").selectOption("price");
  await expect(page.locator(".lib-handle")).toHaveCount(0);
  await expect(page.locator(".lib-count")).toContainText("Switch to My order to rearrange");
  await page.getByRole("button", { name: "Switch to My order" }).click();
  await expect(page.getByLabel("Sort by")).toHaveValue("order");
  await expect.poll(() => order(names)).toEqual([first, second]);
  expect(errors).toEqual([]);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("a long press on a card's grip, on its left, picks it up and a drag moves it; the menu too", async ({
    page,
    context,
  }) => {
    await twoParcels(page, context);
    const cards = page.locator(".lib-cards .lib-card");
    const names = page.locator(".lib-cards .lib-open");
    await expect(cards).toHaveCount(2);
    const [first, second] = await order(names);
    // The grip is on the card's left.
    const grip = cards.nth(1).locator(".lib-handle").first();
    const g = (await grip.boundingBox())!,
      card = (await cards.nth(1).boundingBox())!;
    expect(g.x - card.x).toBeLessThan(12);

    // A touch: held still past the long press, then dragged up over the first card.
    const cdp = await context.newCDPSession(page);
    const top = (await cards.nth(0).boundingBox())!;
    const x = g.x + g.width / 2;
    let y = g.y + g.height / 2;
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", points: { x: number; y: number }[]) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
    await touch("touchStart", [{ x, y }]);
    await page.waitForTimeout(450);
    const to = top.y + 4;
    for (let i = 1; i <= 12; i++) await touch("touchMove", [{ x, y: (y = y - (y - to) / (13 - i)) }]);
    await touch("touchEnd", []);
    await expect.poll(() => order(names)).toEqual([second, first]);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // The menu, beside the Compare tick: Move down puts it back.
    await cards
      .nth(0)
      .getByRole("button", { name: /^Order: / })
      .tap();
    await page.getByRole("menuitem", { name: "Move down" }).tap();
    await expect.poll(() => order(names)).toEqual([first, second]);
  });
});
