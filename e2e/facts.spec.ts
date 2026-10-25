/**
 * J-5 (UX part 2 PR 3c): Adjust on a row a document settles asks "Is this a fact about the parcel?" first. A flood
 * letter marked there is the parcel's, for every member: the Floodplain Must's reason says it's on file, and the fact
 * shows in place of the question until it's removed. A production build, the fixtures' HARs replayed.
 */
import { expect, test } from "@playwright/test";
import { importParcel, openExplorer, screenIt } from "./flow";
import { replayHar } from "./replay";

const FERNEY = "ferney-creek-52-47A" as const;

test.use({ viewport: { width: 1280, height: 800 } });

test("a flood letter marked as a fact: on file for everyone, in the Floodplain reason; Remove takes it back", async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await replayHar(context, [FERNEY]);
  await openExplorer(page, FERNEY);
  await importParcel(page, FERNEY);
  await screenIt(page);

  await page.locator(".card .card-row", { hasText: "Floodplain" }).first().click();
  const panel = page.locator(".card-panel");
  const fact = panel.getByRole("group", { name: "Is this a fact about the parcel?" });
  await expect(fact).toContainText(
    "An elevation certificate or a Letter of Map Amendment (LOMA) settles it.",
  );
  await fact.getByRole("button", { name: "Mark it for everyone" }).click();
  await expect(fact.getByRole("button", { name: "Mark it", exact: true })).toBeDisabled();
  await fact.getByRole("button", { name: "LOMA" }).click();
  await fact.getByRole("button", { name: "Mark it", exact: true }).click();
  await expect(fact).toContainText("On file for everyone: a LOMA.");
  await expect(panel).toContainText("a Letter of Map Amendment (LOMA) is on file (your mark): get a copy");

  // Kept with the parcel: stored, and gone again with Remove.
  const stored = () =>
    page.evaluate(
      () => JSON.parse(window.__psKv!.getItem("ps.parcels")!).open?.facts?.floodLetter?.kind ?? null,
    );
  await expect.poll(stored).toBe("loma");
  await fact.getByRole("button", { name: "Remove" }).click();
  await expect(fact.getByRole("button", { name: "Mark it for everyone" })).toBeVisible();
  await expect(panel).not.toContainText("is on file (your mark)");
  await expect.poll(stored).toBe(null);
  expect(errors).toEqual([]);
});
