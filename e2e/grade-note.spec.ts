/**
 * The grade note (step 8b, owner on #228): Mud Creek graded, then a septic permit marked at its build site from
 * Details' + Mark. The card regrades at once, and without leaving Details a line under the header says "Septic now
 * passes"; a tap shows Grade at the Septic row. A line drawn after the run asks for a re-run instead: no note.
 */
import { expect, test, type Page } from "@playwright/test";
import { expectedOf } from "../test/support/expected";
import { defaultNamedRubric } from "@/lib/rubric/default";
import { reportCard } from "@/lib/report/card";
import { importParcel, openExplorer, screenIt } from "./flow";
import { replayHar } from "./replay";

const GRAYSON = "grayson-mud-creek-6273" as const;

type DebugWindow = Window & { __psMap?: { project(ll: [number, number]): { x: number; y: number } } };

/** A [lat, lon] on the map, in page pixels. */
async function onMap(page: Page, [lat, lon]: [number, number]): Promise<{ x: number; y: number }> {
  const box = (await page.locator(".maplibregl-canvas").boundingBox())!;
  const p = await page.evaluate(([x, y]) => (window as DebugWindow).__psMap!.project([x, y]), [
    lon,
    lat,
  ] as const);
  return { x: box.x + p.x, y: box.y + p.y };
}

test("a septic permit marked from Details: 'Septic now passes' under the header; a tap shows it on Grade", async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await replayHar(context, GRAYSON);
  await openExplorer(page, GRAYSON);
  await importParcel(page, GRAYSON);
  // Its recording lacks FEMA, PAD-US and OSRM (step 4c): those steps fail, the rest grade.
  await screenIt(page);
  const septic = page
    .locator(".must-row")
    .filter({ has: page.locator(".row-label", { hasText: /septic/i }) });
  await expect(septic).toHaveAttribute("aria-label", /: warn$/);

  // Details → Lines & marks → + Mark → Septic permit, at the build site, then Done.
  await page.getByRole("tab", { name: "Details" }).click();
  await page.locator(".parcel-details").getByRole("button", { name: "+ Mark" }).click();
  await page
    .getByRole("dialog", { name: "Mark on the parcel" })
    .getByRole("group", { name: "Water & utilities" })
    .getByRole("button", { name: "Septic permit", exact: true })
    .click();
  const result = expectedOf(GRAYSON, "run");
  const site = result.sites![reportCard(result, defaultNamedRubric()).at]!.ll;
  const p = await onMap(page, site);
  await page.mouse.click(p.x, p.y);
  await page.getByRole("button", { name: "Done", exact: true }).click();

  // Still on Details, its row open; the note says what moved.
  await expect(page.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".pd-open").getByLabel("Name")).toHaveValue("Septic permit 1");
  const note = page.locator(".grade-note");
  await expect(note).toHaveText("Septic now passes");

  // A tap: Grade, the Septic row in view, passing.
  await note.click();
  await expect(page.getByRole("tab", { name: "Grade" })).toHaveAttribute("aria-selected", "true");
  await expect(septic).toHaveAttribute("aria-label", /: pass$/);
  await expect(septic).toBeInViewport();
  await expect(note).toHaveCount(0);

  // A line drawn after the run needs a re-run: the grade button says so, and there's no note.
  await page.getByRole("tab", { name: "Details" }).click();
  await page.locator(".parcel-details").getByRole("button", { name: "Draw a line" }).click();
  for (const d of [-0.0004, 0, 0.0004]) {
    const q = await onMap(page, [site[0] + d / 2, site[1] + d]);
    await page.mouse.click(q.x, q.y);
  }
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(page.locator(".grade-btn").first()).toHaveText("Grade again: lines changed");
  await page.waitForTimeout(500);
  await expect(note).toHaveCount(0);
  expect(errors).toEqual([]);
});
