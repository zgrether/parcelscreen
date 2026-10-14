/**
 * The household's list (WF2b, docs/plans/parcel-workflow.md §5): the app opens to it once there are parcels; each
 * row's name (cut short, whole on hover), state, status, household verdict and both grades; archiving from a parcel's
 * detail drops it from the default view, and the list's last line says so and shows it again (owner, #132), remembered
 * after a reload; ticked rows open in Compare; Open on the map; all archived, the app opens on the map. On a phone:
 * cards, the same last line, and a long press shows a whole name.
 */
import { expect, test } from "@playwright/test";
import { importParcels, openExplorer, seedScreens } from "./flow";
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
  await page.goto("/");
  await expect(page).toHaveURL(/\/explore$/);
  await openExplorer(page, FERNEY);
  await importParcels(page, [FERNEY, MACKS]);
  await seedScreens(page, [FERNEY, MACKS]);

  // With parcels: on the list.
  await page.goto("/");
  await expect(page).toHaveURL(/\/library$/);
  const rows = page.locator(".lib-table tbody tr");
  await expect(rows).toHaveCount(2);
  const macks = rows.filter({ hasText: "parcel 35-3" });
  // The whole name on hover; the cell cuts it short (one line, an ellipsis).
  await expect(macks.locator(".lib-open")).toHaveAttribute("title", MACKS_NAME);
  expect(
    await macks.locator(".lib-open .long-name-text").evaluate((el) => getComputedStyle(el).textOverflow),
  ).toBe("ellipsis");
  // My order's grip and menu come first (WF3), then the Compare tick.
  await expect(macks.locator("td").nth(5)).toHaveText("VA");
  // The state's county on hover (and a long press, on a phone).
  await expect(macks.locator(".lib-state")).toHaveAttribute("title", "Floyd County");
  await expect(macks.locator("td").nth(6)).toHaveText("In progress");
  // The household verdict and both grades, from the kept screens.
  await expect(macks.locator("td").nth(7)).toHaveText(/^(Contender|Maybe|Pass)$/);
  await expect(macks.locator("td").nth(8)).toHaveText(/^[A-F](Contender|Maybe|Pass)$/);
  await expect(macks.locator("td").nth(9)).toHaveText(/^[A-F](Contender|Maybe|Pass)$/);

  // A click anywhere on the row opens its detail (owner, after #133): the full name, the card; archived as sold.
  await macks.locator("td").nth(4).click();
  const detail = page.getByRole("dialog", { name: MACKS_NAME });
  await expect(detail.getByRole("heading", { name: MACKS_NAME })).toBeVisible();
  await expect(detail.locator(".card")).toBeVisible();
  await detail.getByRole("button", { name: "Archive…" }).click();
  await detail.getByRole("button", { name: "Sold" }).click();
  await detail.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(detail).toContainText(/Archived [A-Z][a-z]{2} \d{1,2}: Sold/);
  await detail.getByRole("button", { name: "Close" }).click();

  // Hidden by the default view; the Status filter shows it, and the choice outlasts a reload.
  await expect(rows).toHaveCount(1);
  // The list ends saying so (owner, #132): only the status filter hides it, so "Show" brings the archived back.
  const hiddenLine = page.locator(".lib-hidden");
  await expect(hiddenLine).toHaveText("1 archived parcel hidden · Show");
  await hiddenLine.getByRole("button", { name: "Show" }).click();
  await expect(rows).toHaveCount(2);
  await expect(hiddenLine).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Filters (1)" }), // the Status filter now includes Archived
  ).toBeVisible();
  await expect(rows.filter({ hasText: "parcel 35-3" })).toHaveClass(/lib-archived/);
  await page.reload();
  await expect(page.getByRole("button", { name: "Filters (1)" })).toBeVisible();
  await expect(rows).toHaveCount(2);
  expect(
    await page.evaluate(
      () => (JSON.parse(localStorage.getItem("ps.parcels")!) as { built: { status: string }[] }).built,
    ),
  ).toEqual(expect.arrayContaining([expect.objectContaining({ status: "archived" })]));

  // Hidden by another filter: "2 hidden by filters · Show all", which shows everything.
  await page.getByRole("button", { name: "Filters (1)" }).click();
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

  // The keyboard: a row takes focus, and Enter opens it.
  await page.goto("/library");
  await rows.filter({ hasText: "parcel 52-47A" }).focus();
  await page.keyboard.press("Enter");
  const ferneyDetail = page.getByRole("dialog");
  await expect(ferneyDetail.getByRole("heading", { name: /parcel 52-47A/ })).toBeVisible();

  // Its listing's facts and notes, editable here as in the map's Notes tab (owner, after #133).
  const listing = ferneyDetail.getByRole("group", { name: "Listing" });
  await listing.getByLabel("Asking price").fill("185k");
  await listing.getByLabel("Asking price").press("Enter");
  await expect(listing).toContainText(/asking \$185,000 as of /);
  await ferneyDetail.getByLabel(/^Notes for /).fill("Gate code from the agent.");
  await ferneyDetail.getByLabel(/^Notes for /).blur();
  // Unnamed: the row reads "{parcel ID} · {County} Co.", and the detail offers "Add a name".
  await listing.getByLabel("Name").fill("");
  await listing.getByLabel("Name").press("Enter");
  await expect(ferneyDetail.getByRole("heading", { name: "52-47A" })).toBeVisible();
  await ferneyDetail.getByRole("button", { name: "Add a name" }).click();
  await expect(listing.getByLabel("Name")).toBeFocused();
  await ferneyDetail.getByRole("button", { name: "Close" }).click();
  const ferneyRow = rows.filter({ hasText: "52-47A · Floyd Co." });
  await expect(ferneyRow.locator(".lib-open")).toHaveText("52-47A · Floyd Co.");
  await expect(ferneyRow.locator("td").nth(4)).toHaveText("$185k");
  expect(
    await page.evaluate(() =>
      (JSON.parse(localStorage.getItem("ps.parcels")!) as { built: Record<string, unknown>[] }).built.find(
        (b) => b.askingPrice === 185000,
      ),
    ),
  ).toMatchObject({ name: "", notes: "Gate code from the agent." });

  // Open on the map, from a parcel's detail.
  await ferneyRow.click();
  await page.getByRole("link", { name: "Open on the map" }).click();
  await expect(page).toHaveURL(/\/explore$/);
  await expect(page.locator(".sh-name").first()).toContainText("52-47A");

  // Every parcel archived: the app opens on the map (owner, #132), to find new ones.
  await page.goto("/library");
  await rows.filter({ hasText: "52-47A" }).click();
  const ferney = page.getByRole("dialog", { name: /52-47A/ });
  await ferney.getByRole("button", { name: "Archive…" }).click();
  await ferney.getByRole("button", { name: "Not for us" }).click();
  await ferney.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(ferney).toContainText("Archived");
  await page.goto("/");
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
    // Macks archived: the cards end with the hidden line, as the table does.
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("ps.parcels")!) as {
        built: { notes: string; status: string; archived: unknown }[];
      };
      const m = s.built.find((b) => b.notes.includes("35-3"))!;
      m.status = "archived";
      m.archived = { reason: "Sold", at: "2026-10-14T12:00:00.000Z", from: "inProgress" };
      localStorage.setItem("ps.parcels", JSON.stringify(s));
    });
    await page.goto("/library");
    await expect(page.locator(".lib-cards .lib-card")).toHaveCount(1);
    await expect(page.locator(".lib-hidden")).toHaveText("1 archived parcel hidden · Show");
    await page.locator(".lib-hidden").getByRole("button", { name: "Show" }).tap();
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
    // The state's county on a long press too.
    await page
      .locator(".lib-card", { hasText: "parcel 35-3" })
      .locator(".lib-state")
      .dispatchEvent("pointerdown", { pointerType: "touch", isPrimary: true, clientX: 60, clientY: 60 });
    await expect(page.getByRole("tooltip")).toHaveText("Floyd County");
    // A tap anywhere on the card opens it.
    await page.locator(".lib-card", { hasText: "parcel 35-3" }).locator(".lib-card-facts").tap();
    await expect(page.getByRole("dialog", { name: MACKS_NAME })).toBeVisible();
  });
});
