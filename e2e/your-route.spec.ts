/**
 * WF5 (docs/plans/parcel-workflow.md §3.4) on Mud Creek: the red-gate right-of-way, drawn as an easement carried on to
 * 6273's boundary, screened beside the app's pick from Rte 600's frontage (Mud Creek Ln). The Easement panel compares
 * them side by side; "Use as my driveway" scores the red-gate route (the gates say it's over the veto, the Driveway
 * section says it was chosen), and the choice outlasts a reload. Its "Recorded in" replaces the "verify" warning with
 * the reminder; cleared, the warning is back.
 */
import { expect, test } from "@playwright/test";
import { importParcel, openExplorer, reload, screenIt } from "./flow";
import { replayHar } from "./replay";

import { GRAYSON, withRedGate } from "./redGate";
const REF = "Ashe Co. Plat Bk 574 Pg 1132";

test("Mud Creek: the red-gate route beside the app's pick; chosen as the driveway; its record", async ({
  page,
  context,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await replayHar(context, [GRAYSON]);
  await openExplorer(page, GRAYSON);
  await importParcel(page, GRAYSON);
  await withRedGate(page);
  // Grayson's recording holds the roads and the ground the driveway needs, not FEMA's, PAD-US's or OSRM's replies:
  // only the driveway has to be done.
  expect((await screenIt(page)).driveway).toBe("done");

  const gate = (label: RegExp) =>
    page.locator(".must-row").filter({ has: page.locator(".row-label", { hasText: label }) });
  const access = gate(/access/i);
  await expect(access).toHaveAttribute("aria-label", "Legal road access: pass");
  await expect(access).toHaveAttribute("title", "Frontage on Mud Creek Ln");

  // The Easement panel: the app's pick and the red-gate route, side by side.
  await gate(/driveway on your land/i).click();
  const choice = page.locator(".route-choice");
  await expect(choice.locator(".route-choice-col")).toHaveCount(2);
  await expect(choice.locator(".route-choice-col").nth(0)).toContainText("The app's pick");
  await expect(choice.locator(".route-choice-col").nth(0)).toContainText("Scored on the card");
  await expect(choice.locator(".route-choice-col").nth(1)).toContainText("Red gate");
  await expect(choice.locator(".route-choice-col").nth(1)).toContainText("over 25%");

  // Chosen: the card scores it.
  await choice.getByRole("button", { name: "Use as my driveway" }).click();
  await expect(choice.locator(".route-choice-col.scored")).toContainText("Red gate");
  await expect(access).toHaveAttribute("aria-label", "Legal road access: warn");
  await expect(access).toHaveAttribute(
    "title",
    "Frontage on Mud Creek Ln; Red gate: verify it's a legal right-of-way; your route is steeper than your veto (41% vs 25%)",
  );
  await expect(page.locator(".your-route")).toHaveText("Your route");
  await expect(
    page.getByText(/^You chose this route, from Red gate; the app's pick starts from E\d, Mud Creek Ln\.$/),
  ).toBeVisible();
  await expect(choice.getByRole("button", { name: "Use the app's pick" })).toBeVisible();

  // Kept with the parcel: still chosen after a reload.
  await reload(page);
  await expect(access).toHaveAttribute("aria-label", "Legal road access: warn");
  await expect(access).toHaveAttribute("title", /your route is steeper than your veto \(41% vs 25%\)$/);

  // Its record, in the line's open row in Details (step 8b): the "verify" warning gives way to the reminder; cleared,
  // it's back. The card is on Grade, a tap away.
  const info = page.locator(".parcel-details");
  const details = info.locator(".pd-open");
  const openRow = async () => {
    await page.getByRole("tab", { name: "Details" }).click();
    if (!(await details.count())) await info.locator(".pd-row").filter({ hasText: "Red gate" }).click();
  };
  const grade = () => page.getByRole("tab", { name: "Grade" }).click();
  await page.getByRole("button", { name: /acres: parcel details$/ }).click();
  await openRow();
  await expect(details.getByText("The card scores its route as your driveway.")).toBeVisible();
  const recorded = details.getByLabel("Recorded in");
  await recorded.fill(REF);
  await recorded.press("Enter");
  await grade();
  await expect(access).toHaveAttribute(
    "title",
    `Frontage on Mud Creek Ln; your route is steeper than your veto (41% vs 25%); recorded in ${REF} (your entry): make sure your deed includes this right-of-way`,
  );
  await openRow();
  await recorded.fill("");
  await recorded.press("Enter");
  await grade();
  await expect(access).toHaveAttribute("title", /Red gate: verify it's a legal right-of-way/);

  // The app's pick again, from the line's open row.
  await openRow();
  await details.getByRole("button", { name: "Use the app's pick" }).click();
  await grade();
  await expect(access).toHaveAttribute("aria-label", "Legal road access: pass");
  expect(errors).toEqual([]);
});
