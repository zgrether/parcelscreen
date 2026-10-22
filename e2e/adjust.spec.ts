/**
 * Step 12, per-parcel adjustments (plan §3): from a row's panel, override its letter with a reason (the card strikes
 * the app's through beside it), remove it and Undo; set a Must aside and the answer line names it.
 */
import { expect, test, type Page } from "@playwright/test";
import { loadFixture } from "../test/support/fixtures";
import {
  booted,
  importParcels,
  listRow,
  openExplorer,
  openFromList,
  seedScreens,
  settled,
  visit,
} from "./flow";
import { afterTabSwitch, startSyncing } from "./household";
import { replayHar } from "./replay";

const FERNEY = "ferney-creek-52-47A";
const NAME = loadFixture(FERNEY).input.name;

async function openFerney(page: Page): Promise<void> {
  await openExplorer(page, FERNEY);
  await importParcels(page, [FERNEY]);
  await seedScreens(page, [FERNEY]);
  await settled(page);
  await visit(page, "/library");
  await openFromList(page, NAME);
}

const row = (page: Page, key: string) => page.locator(`.card [data-card-key="${key}"] .card-row`);
const adjust = (page: Page) => page.locator(".card-panel .adjust");

test("override a row's letter with a reason, then remove it and Undo", async ({ page, context }) => {
  test.setTimeout(180_000);
  await replayHar(context, FERNEY);
  await openFerney(page);

  const sky = row(page, "sky");
  const app = (await sky.locator(".card-grade").first().textContent())!.trim();
  await sky.click();
  await expect(adjust(page).getByRole("heading", { name: "Adjust for this parcel" })).toBeVisible();
  // The app's own letter isn't offered.
  await expect(adjust(page).getByRole("button", { name: `Override the grade: ${app}` })).toHaveCount(0);
  const to = app === "A" ? "B" : "A";
  await adjust(page)
    .getByRole("button", { name: `Override the grade: ${to}` })
    .click();
  const save = adjust(page).getByRole("button", { name: "Save" });
  await expect(save).toBeDisabled();
  await adjust(page).getByLabel("Why? (required)").fill("No glow from the ridge at night");
  await save.click();

  await expect(adjust(page)).toContainText(`You set it to ${to}; the app says ${app}.`);
  await expect(sky.locator("s.was")).toHaveText(app);
  await expect(sky).toContainText("“No glow from the ridge at night”");

  await adjust(page).getByRole("button", { name: "Remove adjustment" }).click();
  await expect(adjust(page)).toContainText("Adjustment removed.");
  await expect(sky.locator("s.was")).toHaveCount(0);
  await adjust(page).getByRole("button", { name: "Undo" }).click();
  await expect(sky.locator("s.was")).toHaveText(app);
  await expect(adjust(page)).toContainText(`You set it to ${to}`);

  // The list marks the adjusted grade and the adjusted factor (PR 4).
  await visit(page, "/library");
  const listed = listRow(page, "52-47A");
  await expect(listed.locator(".lib-grade .adjusted-mark")).toHaveAttribute(
    "title",
    "Adjusted for this parcel",
  );
});

test("set a Must aside: listed as set aside, and named in the answer line", async ({ page, context }) => {
  test.setTimeout(180_000);
  await replayHar(context, FERNEY);
  await openFerney(page);

  await row(page, "floodplain").click();
  await adjust(page).getByRole("button", { name: "Set aside for this parcel" }).click();
  await adjust(page).getByLabel("Why? (required)").fill("The house goes on the ridge");
  await adjust(page).getByRole("button", { name: "Save" }).click();

  await expect(page.locator(".card-panel .panel-reading")).toContainText(
    "Set aside for this parcel: “The house goes on the ridge”.",
  );
  const flood = row(page, "floodplain");
  await expect(flood).toHaveClass(/set-aside/);
  await expect(flood).toContainText("set aside for this parcel");
  await expect(page.locator(".card .card-reason")).toContainText("You set aside a must-have: Floodplain.");
});

test("an adjustment syncs: made on one device, the other's card has it", async ({ browser }) => {
  test.setTimeout(240_000);
  const desk = await (await browser.newContext()).newPage();
  await replayHar(desk.context(), FERNEY);
  await openFerney(desk);
  const code = await startSyncing(desk);

  // The same person's phone: Who's this? → them.
  const phone = await (await browser.newContext()).newPage();
  await replayHar(phone.context(), FERNEY);
  await openExplorer(phone, FERNEY);
  await phone.goto(`/link#${code}`);
  await phone.getByRole("button", { name: /^Join$/ }).click();
  await phone.getByRole("button", { name: "Profile 1" }).click();
  await booted(phone);

  await visit(desk, "/library");
  await openFromList(desk, NAME);
  await row(desk, "floodplain").click();
  await adjust(desk).getByRole("button", { name: "Set aside for this parcel" }).click();
  await adjust(desk).getByLabel("Why? (required)").fill("The house goes on the ridge");
  await adjust(desk).getByRole("button", { name: "Save" }).click();
  await expect(row(desk, "floodplain")).toHaveClass(/set-aside/);

  await afterTabSwitch(phone, async () => {
    await listRow(phone, "52-47A").locator(".lib-open").click();
    await expect(row(phone, "floodplain")).toHaveClass(/set-aside/, { timeout: 5_000 });
  });
});

test("the nudge: Night sky set aside on 3 parcels, offered once; Move it down, then Undo", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const SLUGS = [FERNEY, "macks-mountain-35-3", "grayson-mud-creek-6273"] as const;
  await openExplorer(page, FERNEY);
  await importParcels(page, [...SLUGS]);
  await settled(page);
  await page.evaluate(() => {
    const kv = window.__psKv!;
    const me = localStorage.getItem("ps.profile")!;
    const keys = (JSON.parse(kv.getItem("ps.parcels")!) as { built: { key: string }[] }).built.map(
      (p) => p.key,
    );
    const adjusts = keys.map((parcel) => ({
      key: `${parcel}:${me}:sky`,
      parcel,
      by: me,
      factor: "sky",
      kind: "setAside",
      reason: "fine by us",
      was: "B",
      at: "2026-10-22T12:00:00Z",
    }));
    kv.setItem("ps.household", JSON.stringify({ v: 1, asks: [], takes: [], adjusts }));
  });
  await settled(page);
  await visit(page, "/priorities");
  const column = (name: string) => page.getByRole("region", { name, exact: true });
  await expect(column("Really want")).toContainText("Night sky");
  const offer = page.locator(".rubric-nudge");
  await expect(offer).toContainText("You've set aside Night sky on 3 parcels. Move it down a tier?");
  await offer.getByRole("button", { name: "Move it to Nice to have" }).click();
  await expect(offer).toContainText("Moved Night sky to Nice to have.");
  await expect(column("Nice to have")).toContainText("Night sky");
  await offer.getByRole("button", { name: "Undo" }).click();
  await expect(column("Really want")).toContainText("Night sky");
  await expect(page.locator(".rubric-nudge")).toHaveCount(0);
  // Offered once: not again.
  await visit(page, "/priorities");
  await expect(page.locator(".rubric-nudge")).toHaveCount(0);
});
