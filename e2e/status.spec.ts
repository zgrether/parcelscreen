/**
 * A parcel's standing (WF2a, docs/plans/parcel-workflow.md §4; step 8; UX part 2's P-4): Not for us, which asks why (a
 * reason and a note, both optional) and keeps everything; Move back, onto the list; the Walked and Offered milestones
 * with their dates; and all of it on Your list and kept across a reload.
 */
import { expect, test, type Page } from "@playwright/test";
import { importParcel, listRow, openExplorer, reload } from "./flow";
import { replayHar } from "./replay";

const FERNEY = "ferney-creek-52-47A" as const;

const stored = (page: Page) =>
  page.evaluate(
    () => (JSON.parse(window.__psKv!.getItem("ps.parcels")!) as { open: Record<string, unknown> }).open,
  );

test("the parcel's standing: a favorite archived with a reason, restored; milestones; on Your list and after a reload", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await replayHar(context, FERNEY);
  await openExplorer(page, FERNEY);
  await importParcel(page, FERNEY);
  await page.locator('button[aria-label$="acres: parcel details"]').first().click();
  const standing = page.getByRole("group", { name: "Status" });

  // Starred on import (the helper): a favorite; no In progress or Saved any more (step 8).
  await expect(standing.getByRole("button", { name: "In progress" })).toHaveCount(0);
  await expect(page.locator(".sh-actions").getByRole("button", { name: "On your list" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Not for us (UX part 2, P-4: Archive became Rule out) asks why, both optional: Other puts the cursor in the note.
  await standing.getByRole("button", { name: "Not for us…" }).click();
  await standing.getByRole("button", { name: "Other" }).click();
  await expect(standing.getByLabel("A note for later (optional)")).toBeFocused();
  await page.keyboard.type("no winter sun");
  await standing.getByRole("button", { name: "Rule it out" }).click();
  await expect(standing).toContainText(/Ruled out [A-Z][a-z]{2} \d{1,2}: Other: no winter sun/);
  expect(await stored(page)).toMatchObject({
    status: "archived",
    archived: { reason: "Other: no winter sun", from: "saved" },
  });

  // Move back: back on the list.
  await standing.getByRole("button", { name: "Move back" }).click();
  await expect(standing.getByRole("button", { name: "Not for us…" })).toBeVisible();
  expect(await stored(page)).toMatchObject({ status: "saved", archived: null });

  // Milestones: Walked today, then a chosen date; Offered set and cleared.
  const milestones = page.getByRole("group", { name: "Milestones" });
  await milestones.getByRole("button", { name: "+ Walked" }).click();
  await milestones.getByLabel("Walked on").fill("2026-10-20");
  await milestones.getByRole("button", { name: "+ Offered" }).click();
  await milestones.getByRole("button", { name: "Clear Offered" }).click();
  expect(await stored(page)).toMatchObject({ milestones: { walked: "2026-10-20", offered: null } });

  // Your list says so, its star filled; a reload keeps it.
  await page.getByRole("tab", { name: "Grade" }).click();
  await page.getByRole("link", { name: "Your list", exact: true }).click();
  const row = listRow(page, "52-47A");
  await expect(row.getByRole("button", { name: /^On your list/ })).toBeVisible();
  await expect(row).toContainText("Walked Oct 20");
  await reload(page);
  expect(await stored(page)).toMatchObject({ status: "saved", milestones: { walked: "2026-10-20" } });
  expect(errors).toEqual([]);
});
