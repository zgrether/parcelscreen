/**
 * Every screenshot spec's `test` (owner, 2026-10-30, after a live screenshot captured a real landowner's name; the
 * rule is in CLAUDE.md). It puts each browser context in screenshot mode (lib/client/screenshots.ts), so the facts
 * card shows "Hidden in screenshots" for the owner of record and the site address. And it refuses any capture, of a
 * page or of an element, while a page shows one of those fields unmasked: the run fails instead of writing the image.
 * screenshots/guard.test.ts fails if a spec takes its `test` from anywhere else.
 */
import { test as base, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { OWNER_FIELD_ATTR, OWNER_HIDDEN, SCREENSHOT_COOKIE } from "../lib/client/screenshots";

export { expect } from "@playwright/test";

/** Puts a context in screenshot mode: the cookie the app reads, for the app's own host. */
async function screenshotMode(context: BrowserContext, baseURL: string): Promise<void> {
  await context.addCookies([{ name: SCREENSHOT_COOKIE, value: "1", url: baseURL }]);
}

/** Throws, naming the fields but never their values, when the page shows an owner field unmasked. */
export async function assertOwnerFieldsHidden(page: Page): Promise<void> {
  const shown = await page.evaluate(
    ({ attr, hidden }) =>
      [...document.querySelectorAll(`[${attr}]`)]
        .filter((cell) => (cell.textContent ?? "").trim() !== hidden)
        .map((cell) => cell.getAttribute(attr) ?? "owner field"),
    { attr: OWNER_FIELD_ATTR, hidden: OWNER_HIDDEN },
  );
  if (shown.length)
    throw new Error(
      `Refusing a screenshot: the page shows ${shown.join(" and ")} unmasked. Screenshot runs must never capture ` +
        "an owner's name or address (CLAUDE.md, phase-0.md §9.23).",
    );
}

/**
 * Wraps the Page and Locator screenshots so every capture is checked first, and the browser's newContext so a
 * context a spec opens itself (a second household member, a fresh device) is put in screenshot mode too. Once per
 * worker: the prototypes are shared, and the browser is the worker's.
 */
async function guardWorker(browser: Browser, baseURL: string): Promise<void> {
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...args: Parameters<Browser["newContext"]>) => {
    const context = await newContext(...args);
    await screenshotMode(context, baseURL);
    return context;
  };
  const probe = await newContext();
  const page = await probe.newPage();
  const pageProto = Object.getPrototypeOf(page) as Page;
  const pageShot = pageProto.screenshot;
  pageProto.screenshot = async function (this: Page, ...args: Parameters<Page["screenshot"]>) {
    await assertOwnerFieldsHidden(this);
    return pageShot.apply(this, args);
  };
  const locatorProto = Object.getPrototypeOf(page.locator("body")) as {
    screenshot: (...args: unknown[]) => Promise<Buffer>;
    page(): Page;
  };
  const locatorShot = locatorProto.screenshot;
  locatorProto.screenshot = async function (this: typeof locatorProto, ...args: unknown[]) {
    await assertOwnerFieldsHidden(this.page());
    return locatorShot.apply(this, args);
  };
  await probe.close();
}

export const test = base.extend<object, { ownerGuard: void }>({
  ownerGuard: [
    async ({ browser }, use, workerInfo) => {
      await guardWorker(browser, String(workerInfo.project.use.baseURL));
      await use();
    },
    { scope: "worker", auto: true },
  ],
  // The test's own context, whichever way Playwright made it.
  // (`provide` is Playwright's `use`, renamed so React's hook rule doesn't take it for one.)
  context: async ({ context, baseURL }, provide) => {
    await screenshotMode(context, baseURL!);
    await provide(context);
  },
});
