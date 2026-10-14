/**
 * The comparison table (VR6; owner, #117 review): two History parcels with kept screens, seeded from the fixtures'
 * expected results straight into IndexedDB (no screening), side by side at /compare. The columns, a best and a worst
 * mark, and a cell opening its slide-in panel for its parcel.
 */
import { expect, test } from "@playwright/test";
import { ENGINE_VERSION } from "@/lib/screen/engine";
import type { ScreenResult } from "@/lib/screen/types";
import { expectedOf } from "../test/support/expected";
import { loadFixture } from "../test/support/fixtures";
import { importParcels, openExplorer } from "./flow";
import { replayHar } from "./replay";

const FERNEY = "ferney-creek-52-47A" as const;
const MACKS = "macks-mountain-35-3" as const;

test("compare: two screened parcels as columns, best and worst marked, a cell opens its panel", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await replayHar(context, [FERNEY, MACKS]);
  await openExplorer(page, FERNEY);
  await importParcels(page, [FERNEY, MACKS]);

  // Each imported parcel gets its fixture's expected result as its kept screen, as a run would leave it.
  const seeds = [FERNEY, MACKS].map((slug) => ({
    name: loadFixture(slug).input.name,
    result: expectedOf(slug, "run"),
  }));
  await page.evaluate(
    async ({ seeds, engine }: { seeds: { name: string; result: ScreenResult }[]; engine: number }) => {
      const store = JSON.parse(localStorage.getItem("ps.parcels")!) as {
        built: { notes: string; screenIds: string[] }[];
      };
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("parcelscreen", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("screens", { keyPath: "id" });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction("screens", "readwrite");
      for (const s of seeds) {
        // The imported name is the notes' first line (lib/client/exportFile.ts).
        const b = store.built.find((x) => x.notes.split("\n")[0] === `Name: ${s.name}`)!;
        const id = `e2e-${s.name}`;
        tx.objectStore("screens").put({
          id,
          keys: { boundary: "e2e", house: "", settings: "e2e", lines: "" },
          result: s.result,
          engine,
        });
        b.screenIds = [id];
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      localStorage.setItem("ps.parcels", JSON.stringify(store));
    },
    { seeds, engine: ENGINE_VERSION },
  );

  await page.goto("/compare");
  const names = page.locator(".compare-table thead .cmp-name");
  await expect(names).toHaveCount(2);
  // Named after their prototype names (owner, #130).
  expect((await names.allTextContents()).sort()).toEqual([
    "Ferney Creek, Floyd County VA, parcel 52-47A",
    "Macks Mountain, Floyd County VA, parcel 35-3",
  ]);
  // Both are screened: each column has its grade and verdict, not "re-screens when opened".
  await expect(page.locator(".cmp-headline td .card-grade")).toHaveCount(2);
  // Where the parcels differ, the better is marked ↑ and the worse ↓.
  await expect(page.locator(".cmp-mark.best").first()).toBeVisible();
  await expect(page.locator(".cmp-mark.worst").first()).toBeVisible();

  // A cell opens that line's panel, for that parcel.
  await page.getByRole("button", { name: /parcel 35-3, Night sky: / }).click();
  const panel = page.locator(".card-panel");
  await expect(panel).toBeVisible();
  await expect(panel.locator("#card-panel-title")).toHaveText(
    "Night sky · Macks Mountain, Floyd County VA, parcel 35-3",
  );
  await expect(panel.locator(".panel-question")).toHaveText("How dark is it overhead?");
  await panel.getByRole("button", { name: "Close" }).click();
  await expect(panel).toHaveCount(0);

  expect(errors).toEqual([]);
});
