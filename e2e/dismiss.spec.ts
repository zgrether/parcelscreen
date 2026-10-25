/**
 * Closing and ruling out (UX part 2, J-2 and P-4; Zach, 2026-10-24). × closes the parcel and clears it from the map, and
 * a graded parcel stays in Recent: it was 8c's "not for me". Not for us, in Details, rules out any parcel, with an
 * optional reason: it joins Your list as Ruled out, greyed on the map, with Undo and Move back.
 */
import { expect, test, type Page } from "@playwright/test";
import { expectAllDone, importParcels, openExplorer, openFromRecent, screenIt, settled } from "./flow";
import { YOUR_LIST } from "./household";
import { replayHar } from "./replay";

const FERNEY = "ferney-creek-52-47A";
const MACKS = "macks-mountain-35-3";

/** The saved outlines drawn on the map: their keys and whether each is ruled out. */
const drawn = (page: Page) =>
  page.evaluate(() => {
    type Src = {
      serialize(): { data: { features: { properties: { key: string; ruledOut: boolean } }[] } };
    };
    const map = (window as unknown as { __psMap: { getSource(id: string): Src | undefined } }).__psMap;
    return (map.getSource("saved")?.serialize().data.features ?? []).map((f) => f.properties);
  });
/** The built parcels as stored: their statuses and why. */
const stored = async (page: Page) => {
  await settled(page);
  return page.evaluate(
    () =>
      (
        JSON.parse(window.__psKv!.getItem("ps.parcels")!) as {
          built: { key: string; status: string; archived: { reason: string } | null }[];
        }
      ).built,
  );
};

async function gradedFromRecent(page: Page): Promise<void> {
  await openExplorer(page, FERNEY);
  await importParcels(page, [FERNEY, MACKS], { star: false });
  await openFromRecent(page, "52-47A");
  expectAllDone(await screenIt(page));
}

test("× closes and clears the map; the graded parcel stays in Recent", async ({ page, context }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await replayHar(context, [FERNEY, MACKS]);
  await gradedFromRecent(page);

  await page.getByRole("button", { name: "Close this parcel" }).first().click();
  await expect(page.locator(".sh-name")).toHaveCount(0);
  // No "Closed. Undo": nothing was removed.
  await expect(page.locator(".switch-toast")).toHaveCount(0);
  expect(await stored(page)).toHaveLength(2);
  // Off the map: only Your list is drawn, and neither is on it.
  expect(await drawn(page)).toEqual([]);

  await page.getByRole("link", { name: YOUR_LIST }).click();
  await page.getByRole("tab", { name: "Recent" }).click();
  await expect(page.locator(".hist-row")).toHaveCount(2);
  expect(errors, "page errors").toEqual([]);
});

test("Not for us: any parcel, a reason optional; Undo; Move back; Ruled out is greyed on the map", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await replayHar(context, [FERNEY, MACKS]);
  await gradedFromRecent(page);

  // Details › Status: Not for us…, a reason and a note, Rule it out.
  await page.getByRole("tab", { name: "Details" }).click();
  const status = page.getByRole("group", { name: "Status" });
  await status.getByRole("button", { name: "Not for us…" }).click();
  await status.getByRole("group", { name: "Why (optional)" }).getByRole("button", { name: "Septic" }).click();
  await status.getByRole("textbox", { name: "A note for later (optional)" }).fill("perc failed");
  await status.getByRole("button", { name: "Rule it out" }).click();
  await expect(status).toContainText(/Ruled out \w+ \d+: Septic: perc failed/);
  expect((await stored(page)).find((b) => b.status === "archived")?.archived?.reason).toBe(
    "Septic: perc failed",
  );

  // Undo: back in Recent, as it was.
  await page.locator(".line-undo", { hasText: "Ruled out —" }).getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await stored(page)).some((b) => b.status === "archived")).toBe(false);

  // The header's Not for us (UX part 2 PR 3, P-2): the same question in the actions' place. No reason at all is fine;
  // the header's Move back puts it where it was.
  const acts = page.getByRole("group", { name: "This parcel" });
  await acts.getByRole("button", { name: "Not for us", exact: true }).click();
  const form = page.locator(".sh-form");
  await expect(form.getByRole("heading", { name: "Not for us?" })).toBeVisible();
  await form.getByRole("button", { name: "Rule it out" }).click();
  await expect(status.locator(".ip-note")).toHaveText(/^Ruled out \w+ \d+$/);
  await acts.getByRole("button", { name: "Move back" }).click();
  await expect.poll(async () => (await stored(page)).every((b) => b.status === "inProgress")).toBe(true);

  // Ruled out and closed: on the map, greyed.
  await status.getByRole("button", { name: "Not for us…" }).click();
  await status.getByRole("button", { name: "Rule it out" }).click();
  await page.getByRole("button", { name: "Close this parcel" }).first().click();
  await expect.poll(async () => (await drawn(page)).map((f) => f.ruledOut)).toEqual([true]);
  expect(errors, "page errors").toEqual([]);
});
