/**
 * Screenshot mode (owner, 2026-10-30, after a live screenshot captured a real landowner's name): the screenshot runs
 * (screenshots/fixtures.ts) set this cookie in every browser context, and while it's set the parcel facts card shows
 * OWNER_HIDDEN in place of the owner of record and the site address. Those two are read live from the county
 * services (phase-0.md §9.23) and must never be captured into the repo. The fixtures also refuse any capture whose
 * page shows one of them unmasked (assertOwnerFieldsHidden).
 */
export const SCREENSHOT_COOKIE = "ps-screenshots";

/** What the facts card shows in place of an owner field in screenshot mode. */
export const OWNER_HIDDEN = "Hidden in screenshots";

/** The attribute on each owner field's cell (ParcelFacts.tsx), which the screenshot guard reads. */
export const OWNER_FIELD_ATTR = "data-owner-field";

/** Whether this page is being captured by the screenshot runs. */
export function inScreenshots(): boolean {
  return typeof document !== "undefined" && document.cookie.split(/;\s*/).includes(`${SCREENSHOT_COOKIE}=1`);
}
