/**
 * The household's list (WF2b, docs/plans/parcel-workflow.md §5): the app opens to it once there are parcels; each
 * row's name (cut short, whole on hover), state, status and grade; archiving from a parcel's
 * detail drops it from the default view, and the list's last line says so and shows it again (owner, #132), remembered
 * after a reload; ticked rows open in Compare; Open on the map; all archived, the app opens on the map. On a phone:
 * cards, the same last line, and a long press shows a whole name.
 */
import { expect, test } from "@playwright/test";
import { importParcels, openExplorer, reload, seedScreens, settled, unfoldListing, visit } from "./flow";
import { replayHar } from "./replay";

const FERNEY = "ferney-creek-52-47A" as const;
const MACKS = "macks-mountain-35-3" as const;
const MACKS_NAME = "Macks Mountain, Floyd County VA, parcel 35-3";

test("the list: opens there, rows and verdicts, archive and the filter, Compare, Open on the map", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await replayHar(context, [FERNEY, MACKS]);

  // No parcels yet: the app opens on the map.
  await visit(page, "/");
  await expect(page).toHaveURL(/\/explore$/);
  await openExplorer(page, FERNEY);
  await importParcels(page, [FERNEY, MACKS]);
  await seedScreens(page, [FERNEY, MACKS]);

  // With parcels: on the list.
  await visit(page, "/");
  await expect(page).toHaveURL(/\/library$/);
  const rows = page.locator(".lib-table tbody tr");
  await expect(rows).toHaveCount(2);
  const macks = rows.filter({ hasText: "parcel 35-3" });
  // The whole name on hover; the cell cuts it short (one line, an ellipsis).
  await expect(macks.locator(".lib-open")).toHaveAttribute("title", MACKS_NAME);
  expect(
    await macks.locator(".lib-open .long-name-text").evaluate((el) => getComputedStyle(el).textOverflow),
  ).toBe("ellipsis");
  // Step 10b: State starts hidden; Columns ▾ shows it. My order's grip and menu come first (WF3), then the tick.
  await expect(macks.locator(".lib-c-state")).toHaveCount(0);
  await page.getByRole("button", { name: "Columns ▾" }).click();
  await page.getByRole("group", { name: "Columns" }).getByLabel("State").check();
  await page.getByRole("button", { name: "Columns ▾" }).click();
  await expect(macks.locator(".lib-c-state")).toHaveText("VA");
  // The state's county on hover (and a long press, on a phone).
  await expect(macks.locator(".lib-state")).toHaveAttribute("title", "Floyd County");
  // Polish #12: no row has a price or a status yet (step 8: an active favorite has no status word), so neither column shows.
  await expect(page.locator(".lib-table thead")).not.toContainText("Price");
  await expect(page.locator(".lib-table thead")).not.toContainText("Status");
  // The grade from the kept screen, in the profile's own rubric (step 1): a fresh profile holds no other, so there is
  // no Household column and no second grade.
  await expect(macks.locator(".lib-c-grade")).toHaveText(/^(Contender|Maybe|Not for us)[A-F]$/); // J-4: the verdict first
  // Step 10: Cost to build ("$55–195k + land" without a price) is a column once a row has one; step 10b: then a
  // column per factor, the kept dealbreakers first.
  await expect(page.locator(".lib-table thead th")).toContainText([
    "Name",
    "Cost to build",
    "Flood",
    "Access",
  ]);
  await expect(page.locator(".lib-table thead")).not.toContainText("Household");

  // A click anywhere on the row opens it on the map, with the one panel (Z-2, UX part 2); ruled out from its Details.
  await macks.locator(".lib-c-acres").click();
  await expect(page).toHaveURL(/\/explore$/);
  await expect(page.locator(".sh-name").first()).toContainText("35-3");
  await page.getByRole("tab", { name: "Details" }).click();
  const status = page.getByRole("group", { name: "Status" });
  await status.getByRole("button", { name: "Not for us…" }).click();
  await status.getByRole("button", { name: "Price" }).click();
  await status.getByRole("button", { name: "Rule it out" }).click();
  await expect(status).toContainText(/Ruled out [A-Z][a-z]{2} \d{1,2}: Price/);
  // "‹ Your list": back to the list.
  await page.locator(".back-chip").click();
  await expect(page).toHaveURL(/\/library$/);

  // UX part 2 PR 7a (P-5): it leaves the Shortlist for Ruled out, which says when and why; Move back returns it.
  await expect(rows).toHaveCount(1);
  const views = page.getByRole("tablist", { name: "Shortlist, Recent or Ruled out" });
  await expect(views.getByRole("tab", { name: /^Shortlist/ })).toHaveText("Shortlist 1");
  await views.getByRole("tab", { name: /^Ruled out/ }).click();
  const ruled = page.getByRole("list", { name: "Ruled out" });
  await expect(ruled).toContainText("parcel 35-3");
  await expect(ruled).toContainText(/Ruled out [A-Z][a-z]{2} \d{1,2}: Price/);
  await reload(page);
  await expect(ruled).toContainText("parcel 35-3"); // the view outlasts a reload
  expect(
    await page.evaluate(
      () => (JSON.parse(window.__psKv!.getItem("ps.parcels")!) as { built: { status: string }[] }).built,
    ),
  ).toEqual(expect.arrayContaining([expect.objectContaining({ status: "archived" })]));
  await ruled.getByRole("button", { name: "Move back" }).click();
  await expect(views.getByRole("tab", { name: /^Ruled out/ })).toHaveText("Ruled out 0");
  await views.getByRole("tab", { name: /^Shortlist/ }).click();
  await expect(rows).toHaveCount(2);
  const hiddenLine = page.locator(".lib-hidden");

  // Hidden by a filter: "2 hidden by filters · Show all", which shows everything.
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByRole("group", { name: "Milestones" }).getByRole("button", { name: "Walked" }).click();
  await expect(rows).toHaveCount(0);
  await expect(hiddenLine).toHaveText("2 hidden by filters · Show all");
  await hiddenLine.getByRole("button", { name: "Show all" }).click();
  await expect(rows).toHaveCount(2);
  await expect(hiddenLine).toHaveCount(0);

  // Ticked rows open in Compare.
  for (const r of await rows.all()) await r.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Compare 2" }).click();
  await expect(page).toHaveURL(/\/compare$/);
  await expect(page.locator(".compare-table thead .cmp-name")).toHaveCount(2);
  await expect(page.locator(".compare-table thead .cmp-name").first()).toHaveAttribute("title", /parcel /);

  // The keyboard: a row takes focus, and Enter opens it on the map.
  await visit(page, "/library");
  await rows.filter({ hasText: "parcel 52-47A" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/explore$/);
  await expect(page.locator(".sh-name").first()).toContainText("52-47A");

  // Its listing's facts and notes, in the one panel's Details (Z-2: the list's own detail went).
  await page.getByRole("tab", { name: "Details" }).click();
  const details = page.locator(".parcel-details");
  const listing = await unfoldListing(details);
  await listing.getByLabel("Asking price").fill("185k");
  await listing.getByLabel("Asking price").press("Enter");
  await expect(listing).toContainText(/asking \$185,000 as of /);
  await details.getByLabel(/^Notes for /).fill("Gate code from the agent.");
  await details.getByLabel(/^Notes for /).blur();
  // Unnamed: the row reads "{parcel ID} · {County} Co.".
  await listing.getByLabel("Name").fill("");
  await listing.getByLabel("Name").press("Enter");
  await page.locator(".back-chip").click();
  await expect(page).toHaveURL(/\/library$/);
  const ferneyRow = rows.filter({ hasText: "52-47A · Floyd Co." });
  await expect(ferneyRow.locator(".lib-open")).toHaveText("52-47A · Floyd Co.");
  await expect(ferneyRow.locator(".lib-c-price")).toHaveText("$185k");
  expect(
    await page.evaluate(() =>
      (JSON.parse(window.__psKv!.getItem("ps.parcels")!) as { built: Record<string, unknown>[] }).built.find(
        (b) => b.askingPrice === 185000,
      ),
    ),
  ).toMatchObject({ name: "", notes: "Gate code from the agent." });

  // Every parcel ruled out: the app opens on the map (owner, #132), to find new ones.
  await ferneyRow.click();
  await expect(page).toHaveURL(/\/explore$/);
  await page.getByRole("tab", { name: "Details" }).click();
  await status.getByRole("button", { name: "Not for us…" }).click();
  await status.getByRole("button", { name: "Rule it out" }).click();
  await expect(status).toContainText("Ruled out");
  // Macks, moved back above, ruled out again: then every parcel is.
  await page.locator(".back-chip").click();
  await macks.click();
  await page.getByRole("tab", { name: "Details" }).click();
  await status.getByRole("button", { name: "Not for us…" }).click();
  await status.getByRole("button", { name: "Rule it out" }).click();
  await expect(status).toContainText("Ruled out");
  await visit(page, "/");
  await expect(page).toHaveURL(/\/explore$/);
  expect(errors).toEqual([]);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("cards, not a table; the hidden line; a long press shows the whole name; a tap opens the parcel", async ({
    page,
    context,
  }) => {
    await replayHar(context, [FERNEY, MACKS]);
    await openExplorer(page, FERNEY);
    await importParcels(page, [FERNEY, MACKS]);
    // The import's own writes kept first: the edit below reads and writes the store directly.
    await settled(page);
    // Macks archived: the cards end with the hidden line, as the table does.
    await page.evaluate(async () => {
      const s = JSON.parse(window.__psKv!.getItem("ps.parcels")!) as {
        built: { name: string; status: string; archived: unknown }[];
      };
      const m = s.built.find((b) => b.name.includes("35-3"))!;
      m.status = "archived";
      // Ruled out from the Shortlist: Move back returns it there.
      m.archived = { reason: "Sold", at: "2026-10-14T12:00:00.000Z", from: "saved" };
      await window.__psKv!.setItem("ps.parcels", JSON.stringify(s));
    });
    await visit(page, "/library");
    await expect(page.locator(".lib-cards .lib-card")).toHaveCount(1);
    // UX part 2 PR 7a: in Ruled out, with why; Move back returns it to the cards.
    await page.getByRole("tab", { name: /^Ruled out/ }).tap();
    await expect(page.getByRole("list", { name: "Ruled out" })).toContainText("Ruled out Oct 14: Sold");
    await page.getByRole("list", { name: "Ruled out" }).getByRole("button", { name: "Move back" }).tap();
    await page.getByRole("tab", { name: /^Shortlist/ }).tap();
    await expect(page.locator(".lib-cards .lib-card")).toHaveCount(2);
    await expect(page.locator(".lib-table")).toBeHidden();
    const name = page.locator(".lib-card", { hasText: "parcel 35-3" }).locator(".lib-open");
    await name.dispatchEvent("pointerdown", {
      pointerType: "touch",
      isPrimary: true,
      clientX: 50,
      clientY: 50,
    });
    await expect(page.getByRole("tooltip")).toHaveText(MACKS_NAME);
    // A tap anywhere on the card opens it on the map, with the one panel (Z-2).
    await page.locator(".lib-card", { hasText: "parcel 35-3" }).locator(".lib-card-money").tap();
    await expect(page).toHaveURL(/\/explore$/);
    await expect(page.locator(".sh-name").first()).toContainText("35-3");
  });
});
