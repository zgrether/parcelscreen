/**
 * WF5 (docs/plans/parcel-workflow.md §3.4) on Mud Creek: the red-gate right-of-way, drawn as an easement carried on to
 * 6273's boundary, screened beside the app's pick from Rte 600's frontage (Mud Creek Ln). The Easement panel compares
 * them side by side; "Use as my driveway" scores the red-gate route (the gates say it's over the veto, the Driveway
 * section says it was chosen), and the choice outlasts a reload. Its "Recorded in" replaces the "verify" warning with
 * the reminder; cleared, the warning is back.
 */
import { bearing, destination, nearestPointOnLine, polygon, polygonToLine } from "@turf/turf";
import type { Feature, LineString } from "geojson";
import { expect, test, type Page } from "@playwright/test";
import { loadFixture } from "../test/support/fixtures";
import roads from "../test/tools/driveway-validation.roads.json";
import { importParcel, openExplorer, reload, screenIt } from "./flow";
import { replayHar } from "./replay";

const GRAYSON = "grayson-mud-creek-6273" as const;
const REF = "Ashe Co. Plat Bk 574 Pg 1132";

/** The red gate's drive (the validation study's road C), carried on 5 m into 6273 at the nearest point, [lat, lon]. */
function redGateToTheBoundary(): [number, number][] {
  const line = (roads.c.coordinates as [number, number][]).map(([lon, lat]): [number, number] => [lat, lon]);
  const end = line[line.length - 1]!;
  const ring = polygonToLine(
    polygon(loadFixture(GRAYSON).input.polygon.geometry.coordinates as number[][][]),
  ) as Feature<LineString>;
  const np = nearestPointOnLine(ring, [end[1], end[0]]).geometry.coordinates;
  const [lon, lat] = destination(np, 5, bearing([end[1], end[0]], np), { units: "meters" }).geometry
    .coordinates;
  return [...line, [lat!, lon!]];
}

/** The parcel open, with the red-gate easement drawn (as the line tool keeps one), named "Red gate". */
async function withRedGate(page: Page): Promise<void> {
  await page.evaluate(async (line) => {
    const s = JSON.parse(window.__psKv!.getItem("ps.parcels")!) as {
      open: { key: string; markup: unknown[] };
      built: { key: string; markup: unknown[] }[];
    };
    const m = {
      id: "red-gate",
      name: "Red gate",
      shape: "line",
      kind: "easement",
      condition: "uncleared",
      line,
      widthFt: 30,
      note: "listing's 'road right of way into property', unverified",
      recordedIn: "",
      at: "2026-10-15T12:00:00.000Z",
    };
    s.open.markup = [m];
    for (const b of s.built) if (b.key === s.open.key) b.markup = [m];
    await window.__psKv!.setItem("ps.parcels", JSON.stringify(s));
  }, redGateToTheBoundary());
  await reload(page);
}

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

  const gate = (label: RegExp) => page.locator(".card-gates .gate").filter({ hasText: label });
  const access = gate(/access/i);
  await expect(access).toHaveAttribute("aria-label", "Legal road access: pass");
  await expect(access).toHaveAttribute("title", "Frontage on Mud Creek Ln");

  // The Easement panel: the app's pick and the red-gate route, side by side.
  await gate(/easement/i).click();
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

  // Its record, in the line's details: the "verify" warning gives way to the reminder; cleared, it's back.
  await page.getByRole("button", { name: /acres: parcel info$/ }).click();
  const info = page.locator(".info-panel");
  await info.getByRole("treeitem").filter({ hasText: "Red gate" }).click();
  const details = info.locator(".ip-details");
  await expect(details.getByText("The card scores its route as your driveway.")).toBeVisible();
  const recorded = details.getByLabel("Recorded in");
  await recorded.fill(REF);
  await recorded.press("Enter");
  await expect(access).toHaveAttribute(
    "title",
    `Frontage on Mud Creek Ln; your route is steeper than your veto (41% vs 25%); recorded in ${REF} (your entry): make sure your deed includes this right-of-way`,
  );
  await recorded.fill("");
  await recorded.press("Enter");
  await expect(access).toHaveAttribute("title", /Red gate: verify it's a legal right-of-way/);

  // The app's pick again, from the line's details.
  await details.getByRole("button", { name: "Use the app's pick" }).click();
  await expect(access).toHaveAttribute("aria-label", "Legal road access: pass");
  expect(errors).toEqual([]);
});
