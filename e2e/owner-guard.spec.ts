/**
 * The screenshot runs' owner guard (CLAUDE.md, phase-0.md §9.23), in a browser: Hamilton's Three Gorges lot from its
 * recording, whose owner and address read "[redacted]". Without screenshot mode the facts card shows them and the
 * guard refuses a capture; in screenshot mode (screenshots/fixtures.ts's cookie) the card hides them and the guard lets
 * the capture through.
 */
import { expect, test, type Page } from "@playwright/test";
import { OWNER_HIDDEN, SCREENSHOT_COOKIE } from "@/lib/client/screenshots";
import { assertOwnerFieldsHidden } from "../screenshots/fixtures";
import { replayHamilton, threeGorgesPoint } from "./hamilton";
import { replayHar } from "./replay";

async function openFacts(page: Page): Promise<void> {
  const lot = threeGorgesPoint();
  await page.addInitScript(
    (v) => {
      if (sessionStorage.getItem("e2e")) return;
      sessionStorage.setItem("e2e", "1");
      localStorage.clear();
      localStorage.setItem("ps.debug", "1");
      localStorage.setItem("ps.roads", "0");
      localStorage.setItem("ps.hillshade", "0");
      localStorage.setItem("ps.contours", "0");
      localStorage.setItem("ps.view", JSON.stringify(v));
    },
    { ...lot, z: 16 },
  );
  await page.goto("/explore");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as { __psMap?: { queryRenderedFeatures(): { layer: { id: string } }[] } }
          ).__psMap
            ?.queryRenderedFeatures()
            .filter((f) => f.layer.id === "parcel-lines").length ?? 0,
      ),
    )
    .toBeGreaterThan(0);
  const xy = await page.evaluate(
    ({ lat, lon }) =>
      (
        window as unknown as { __psMap: { project(ll: [number, number]): { x: number; y: number } } }
      ).__psMap.project([lon, lat]),
    lot,
  );
  const box = (await page.locator(".maplibregl-canvas").boundingBox())!;
  await page.mouse.click(box.x + xy.x, box.y + xy.y);
  await page.getByRole("button", { name: /acres: parcel details$/ }).click();
  await expect(page.locator("table.facts").first()).toContainText("048 045.24");
}

test.beforeEach(async ({ context }) => {
  await replayHar(context, "ferney-creek-52-47A");
  await replayHamilton(context);
});

test("without screenshot mode, the guard refuses a capture that shows the owner fields", async ({ page }) => {
  await openFacts(page);
  await expect(page.locator("[data-owner-field]")).toHaveCount(2);
  await expect(assertOwnerFieldsHidden(page)).rejects.toThrow(
    "Refusing a screenshot: the page shows Owner of record and Site address unmasked",
  );
});

test("in screenshot mode, the card hides them and the guard lets the capture through", async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([{ name: SCREENSHOT_COOKIE, value: "1", url: baseURL! }]);
  await openFacts(page);
  const cells = page.locator("[data-owner-field]");
  await expect(cells).toHaveCount(2);
  await expect(cells).toHaveText([OWNER_HIDDEN, OWNER_HIDDEN]);
  await expect(assertOwnerFieldsHidden(page)).resolves.toBeUndefined();
});
