/**
 * "Grade all saved parcels again" with a lost worker (#154 test plan B5: the first run hung once): the run in flight is
 * retried once on a fresh worker and the job finishes, with no error. A production build, the fixtures' HARs
 * replayed.
 */
import { expect, test, type Page } from "@playwright/test";
import { ageKept, importParcels, keptScreenCount, openExplorer, seedScreens, visit } from "./flow";
import { replayHar } from "./replay";

const FERNEY = "ferney-creek-52-47A" as const;
const MACKS = "macks-mountain-35-3" as const;
/** The screen's Web Worker (MapLibre runs workers of its own; the Library has none of those). */
const screenWorker = (page: Page) => page.workers().find((w) => /turbopack-worker/.test(w.url()));

test("a worker that dies mid-run: the parcel is run again on a fresh worker and the job finishes", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await replayHar(context, [FERNEY, MACKS]);
  await openExplorer(page, FERNEY);
  await importParcels(page, [FERNEY, MACKS]);
  await seedScreens(page, [FERNEY, MACKS]);
  await ageKept(page, "v2");
  await visit(page, "/library");
  const line = page.locator(".lib-rescreen");
  await expect(line).toContainText("2 parcels need grading again");
  // The worker is made and pinged as soon as the line shows: the first run never races a cold start.
  await expect.poll(() => !!screenWorker(page)).toBe(true);

  await line.getByRole("button", { name: "Grade all saved parcels again" }).click();
  await expect(line).toContainText(/Grading 1 of 2 again: /);
  // The worker crashes mid-run (as a phone kills one in the background): the page notices at once.
  const w = screenWorker(page);
  expect(w, "the screen worker").toBeDefined();
  await w!.evaluate(() =>
    setTimeout(() => {
      throw new Error("worker crash (test)");
    }),
  );

  // The parcel is run again on a fresh worker; both finish, each kept as a new screen.
  await expect(line).toContainText("Graded 2 parcels again.", { timeout: 200_000 });
  await expect(line).not.toContainText("couldn't be graded again");
  expect(await keptScreenCount(page)).toBe(4);
  expect(errors).toEqual([]);
});
