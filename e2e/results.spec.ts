/**
 * Step 7's results panel (docs/plans/step-7-results.md §7): the answer line, Best homesite's numbers, the card in
 * priority order, an alternative evaluated and Back, Still unknown's Copy and Copy all, Full report, and the answer in
 * the phone's peek.
 */
import { expect, test } from "@playwright/test";
import { expectedOf } from "../test/support/expected";
import { answerReason } from "../lib/report/answer";
import { AGENT_QUESTIONS, agentQuestions, copyAllText } from "../lib/report/agent";
import { reportCard } from "../lib/report/card";
import { defaultNamedRubric } from "../lib/rubric/default";
import { importParcel, openExplorer, screenIt } from "./flow";
import { replayHar } from "./replay";
import { siteMeasures } from "../lib/report/siteMeasures";

const FERNEY = "ferney-creek-52-47A" as const;
const MACKS = "macks-mountain-35-3" as const;

test("Ferney: the answer, Best homesite, the card's order, an alternative and Back, Copy, Full report", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await replayHar(context, [FERNEY]);
  await openExplorer(page, FERNEY);
  await importParcel(page, FERNEY);
  await screenIt(page);

  // The answer: this person's reason line (a fresh profile grades with the starting list).
  const r = expectedOf(FERNEY, "run");
  const card = reportCard(r, defaultNamedRubric());
  await expect(page.locator(".card .card-reason")).toHaveText(answerReason(card, r));
  await expect(page.locator(".card .card-reason")).toHaveText(/^Strong elevation and winter sun; /);

  // Best homesite: the site and its measurements, never a letter (owner, 2026-10-22).
  const best = page.locator(".best-site");
  await expect(best.locator(".best-site-name")).toContainText(`Site #${card.sites[0]!.rank}`);
  await expect(best.locator(".site-measures")).toHaveText(siteMeasures(r, card.sites[0]!.index));
  await expect(best.locator(".card-grade")).toHaveCount(0);

  // The card in priority order.
  // Step 10: Cost to enjoy after the answer, then the card's tiers.
  await expect(page.locator(".card .card-group > .card-sub")).toHaveText([
    "Cost to enjoy",
    "Must have",
    "Really want",
  ]);

  // An alternative, evaluated as its pin would be; Back to the best site ends it.
  const alt = best.locator(".other-spots .site-row").first();
  const name = (await alt.locator(".spot-name").innerText()).toLowerCase();
  await alt.click();
  await expect(best.locator(".best-site-showing")).toContainText(`Showing ${name} on the map`, {
    timeout: 60_000,
  });
  await best.getByRole("button", { name: "Back to the best site" }).click();
  await expect(best.locator(".best-site-showing")).toHaveCount(0, { timeout: 60_000 });

  // Still unknown: the one question, copied.
  const ask = page.locator(".ask-agent");
  await expect(ask.locator(".ask-q")).toHaveText([AGENT_QUESTIONS.access]);
  await ask.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(ask.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(AGENT_QUESTIONS.access);

  // Full report: every section, under its heading.
  await page.locator(".full-report-toggle").click();
  await expect(page.locator(".full-report-body > section h3").first()).toContainText("Verdict");
  expect(await page.locator(".full-report-body > section").count()).toBeGreaterThanOrEqual(10);
  // "More to check that no dataset covers" opens it at the checklist.
  await page.locator(".full-report-toggle").click();
  await ask.getByRole("button", { name: "More to check that no dataset covers" }).click();
  await expect(page.locator('.full-report-body [data-key="still-unknown"]')).toBeInViewport();
  expect(errors).toEqual([]);
});

test("Macks: Copy all puts the agent questions on the clipboard, numbered, under the parcel's name", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await replayHar(context, [MACKS]);
  await openExplorer(page, MACKS);
  await importParcel(page, MACKS);
  await screenIt(page);
  const name = await page.locator(".sh-name").innerText();
  const qs = agentQuestions(reportCard(expectedOf(MACKS, "run"), defaultNamedRubric()));
  expect(qs.map((q) => q.key)).toEqual(["access", "septic"]);
  await page.locator(".ask-agent").getByRole("button", { name: "Copy all" }).click();
  await expect(page.locator(".ask-agent").getByRole("button", { name: "Copied" })).toBeVisible();
  // The clipboard keeps the platform's line ends (Windows writes CRLF).
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.replace(/\r\n/g, "\n")).toBe(copyAllText(name, qs));
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test("the answer's reason fits the peek, on two lines at most", async ({ page, context }) => {
    await replayHar(context, [FERNEY]);
    await openExplorer(page, FERNEY);
    await importParcel(page, FERNEY);
    await screenIt(page);
    // After a run the sheet rises to its middle: tap back down to the peek.
    const handle = page.locator(".sheet-handle");
    await handle.tap();
    await handle.tap();
    const reason = page.locator(".at-peek .sh-reason");
    await expect(reason).toBeVisible();
    await expect(reason).toHaveText(/^Strong elevation and winter sun; /);
    const box = (await reason.boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(2 * 13.5 * 1.3 + 2);
    // Inside the sheet, not cut off by its bottom.
    const sheet = (await page.locator(".explore-panel").boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(sheet.y + sheet.height);
    // Raised, the header no longer repeats it.
    await handle.tap();
    await expect(page.locator(".sh-reason")).toBeHidden();
  });
});
