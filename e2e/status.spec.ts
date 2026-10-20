/**
 * A parcel's standing (WF2a, docs/plans/parcel-workflow.md §4; step 8): a favorite's Archive, which asks why ("Rejected:
 * …" takes the rest in the box) and keeps everything; Restore, back to the favorites; the Walked and Offered milestones
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
  await expect(page.locator(".sh-actions").getByRole("button", { name: "In favorites" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Archive asks why: nothing to archive with a blank reason or "Rejected:" alone.
  await standing.getByRole("button", { name: "Archive…" }).click();
  const archive = standing.getByRole("button", { name: "Archive", exact: true });
  await expect(archive).toBeDisabled();
  await standing.getByRole("button", { name: "Rejected: …" }).click();
  await expect(archive).toBeDisabled();
  await expect(standing.getByLabel("Why it's archived")).toBeFocused();
  await page.keyboard.type("no winter sun");
  await archive.click();
  await expect(standing).toContainText(/Archived [A-Z][a-z]{2} \d{1,2}: Rejected: no winter sun/);
  expect(await stored(page)).toMatchObject({
    status: "archived",
    archived: { reason: "Rejected: no winter sun", from: "saved" },
  });

  // Restore: back to the favorites.
  await standing.getByRole("button", { name: "Restore" }).click();
  await expect(standing.getByRole("button", { name: "Archive…" })).toBeVisible();
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
  await expect(row.getByRole("button", { name: /^In favorites/ })).toBeVisible();
  await expect(row).toContainText("Walked Oct 20");
  await reload(page);
  expect(await stored(page)).toMatchObject({ status: "saved", milestones: { walked: "2026-10-20" } });
  expect(errors).toEqual([]);
});
