/**
 * The map panel (step 17e; plan phase-0-17e-switching.md §2–3): every basemap picked from its radio row, on
 * desktop and on a phone, changes the basemap and nothing else. The native dropdown it replaced let a pick click
 * through to the toggle beneath it.
 */
import { expect, test, type Page } from "@playwright/test";
import { BASEMAPS, basemapLayerIds } from "@/components/Map/style";
import { openExplorer } from "./flow";
import { replayHar } from "./replay";

const TOGGLES = ["3D terrain", "Hillshade", "Contours", "Dim map", "Parcel lines", "Light pollution"];
const PREFS = ["ps.terrain", "ps.hillshade", "ps.contours", "ps.dim", "ps.lines", "ps.roads"];

async function states(page: Page) {
  const panel = page.getByRole("region", { name: "Map layers" });
  const pressed: Record<string, string | null> = {};
  for (const t of TOGGLES)
    pressed[t] = await panel.getByRole("button", { name: t, exact: true }).getAttribute("aria-pressed");
  const prefs = await page.evaluate((keys) => keys.map((k) => localStorage.getItem(k)), PREFS);
  return { pressed, prefs };
}

for (const device of ["desktop", "phone"] as const) {
  test.describe(device, () => {
    if (device === "phone")
      test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test(`${device}: each basemap from its radio row changes the basemap and no toggle`, async ({
      page,
      context,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await replayHar(context, "ferney-creek-52-47A");
      await openExplorer(page, "ferney-creek-52-47A");
      // Some toggles on, some off, so a click-through either way would show.
      await page.evaluate(() => {
        localStorage.setItem("ps.terrain", JSON.stringify({ on: true, exaggeration: 1.5 }));
        localStorage.setItem("ps.hillshade", "0");
        localStorage.setItem("ps.contours", "1");
        localStorage.setItem("ps.dim", "1");
      });
      await page.reload();
      await page.getByRole("button", { name: "Map layers" }).click();
      const panel = page.getByRole("region", { name: "Map layers" });
      await expect(panel).toBeVisible();
      const before = await states(page);
      expect(before.pressed["3D terrain"]).toBe("true");
      expect(before.pressed["Hillshade"]).toBe("false");

      for (const b of [...BASEMAPS.slice(1), BASEMAPS[0]!]) {
        const row = panel.getByRole("radio", { name: b.label });
        if (device === "phone") await row.tap();
        else await row.click();
        await expect(row).toHaveAttribute("aria-checked", "true");
        const visible = await page.evaluate(
          (ids) =>
            ids.map((id) =>
              (
                window as unknown as { __psMap: { getLayoutProperty(id: string, p: string): unknown } }
              ).__psMap.getLayoutProperty(id, "visibility"),
            ),
          basemapLayerIds(b.id),
        );
        expect(visible, `${b.id} layers`).toEqual(basemapLayerIds(b.id).map(() => "visible"));
        expect(await states(page), `toggles after picking ${b.id}`).toEqual(before);
      }
      expect(errors).toEqual([]);
    });
  });
}
