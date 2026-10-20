/**
 * A new device joining an existing synced space (after step 6: Zach's phone was named "Zach Mobile" at its first run,
 * and the space ended with two people for one). Opening the QR's link on a fresh device goes straight to joining, and
 * the first run offers joining before it asks for a name. Either way Who's this? picks the profile, and the space and
 * the device hold exactly one. Two browser contexts over the memory store.
 */
import { expect, test, type Page } from "@playwright/test";
import { ALREADY_USE, JOIN_EMPTY, PASSWORD_LEAD, START, SYNC_TITLE } from "@/lib/sync/words";
import { CODE_HEADER } from "@/lib/sync/wire";
import { groupCode } from "@/lib/sync/code";
import { openExplorer, openYourData } from "./flow";

const FERNEY = "ferney-creek-52-47A" as const;

async function startSyncing(page: Page): Promise<string> {
  await openYourData(page);
  await page.getByRole("button", { name: SYNC_TITLE, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: SYNC_TITLE });
  await dialog.getByRole("button", { name: START }).click();
  await expect(dialog.getByText(PASSWORD_LEAD)).toBeVisible({ timeout: 30_000 });
  const code = (await dialog.locator(".sync-code-value").innerText()).replace(/-/g, "");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  return code;
}

/** The space's live profiles' names, as the server holds them. */
const spaceProfiles = (page: Page, code: string): Promise<string[]> =>
  page.evaluate(
    async ({ code, header }) => {
      const r = await fetch("/api/sync/changes", { headers: { [header]: code }, cache: "no-store" });
      const c = (await r.json()) as { profiles: { record: { name: string } | null; deleted: boolean }[] };
      return c.profiles.filter((p) => !p.deleted && p.record).map((p) => p.record!.name);
    },
    { code, header: CODE_HEADER },
  );

/** The profiles this device keeps, by name. */
const deviceProfiles = (page: Page): Promise<string[]> =>
  page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open("parcelscreen");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const all = open.result.transaction("profiles").objectStore("profiles").getAll();
          all.onsuccess = () => {
            open.result.close();
            resolve((all.result as { name: string }[]).map((p) => p.name));
          };
          all.onerror = () => reject(all.error);
        };
      }),
  );

/** A device as a person's: nothing seeded, and the first run's questions on (lib/client/onboarding.ts). */
async function freshDevice(page: Page): Promise<string[]> {
  const urls: string[] = [];
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) urls.push(new URL(f.url()).pathname);
  });
  await page.addInitScript(() => {
    if (sessionStorage.getItem("e2e")) return;
    sessionStorage.setItem("e2e", "1");
    localStorage.setItem("ps.debug", "1");
    localStorage.setItem("ps.onboard", "1");
  });
  return urls;
}

/** The desktop: its one profile, named, syncing. */
async function desktop(page: Page): Promise<string> {
  await openExplorer(page, FERNEY);
  await openYourData(page);
  await page.keyboard.press("Escape");
  const code = await startSyncing(page);
  expect(await spaceProfiles(page, code)).toEqual(["Profile 1"]);
  return code;
}

/** Who's this? → the desktop's profile; then nothing new reaches the space, and the device keeps just that one. */
async function pickAndCheck(phone: Page, code: string): Promise<void> {
  await phone.waitForURL("**/who");
  await expect(phone.getByRole("heading", { name: "Who's this?" })).toBeVisible();
  await phone.getByRole("button", { name: "Profile 1" }).click();
  await phone.waitForURL("**/library");
  // A tab switch fetches and saves: anything the phone would add to the space would go now.
  await phone.getByRole("link", { name: "Map", exact: true }).click();
  await phone.getByRole("link", { name: "Your list", exact: true }).click();
  await expect.poll(() => spaceProfiles(phone, code), { timeout: 5000 }).toEqual(["Profile 1"]);
  expect(await deviceProfiles(phone)).toEqual(["Profile 1"]);
}

test("a fresh device opening the QR's link joins straight away: no profile prompt, Who's this?, one profile", async ({
  browser,
}) => {
  const code = await desktop(await (await browser.newContext()).newPage());
  const phone = await (await browser.newContext()).newPage();
  const visited = await freshDevice(phone);
  await phone.goto(`/link#${groupCode(code)}`);
  // Nothing of its own to replace: the plain question, never "This device has 1 profile…".
  await expect(phone.getByText(JOIN_EMPTY)).toBeVisible();
  await phone.getByRole("button", { name: "Join", exact: true }).click();
  await pickAndCheck(phone, code);
  expect(visited).not.toContain("/interview");
});

test("the first run offers joining before it asks for a name; the device joins as the existing profile", async ({
  browser,
}) => {
  const code = await desktop(await (await browser.newContext()).newPage());
  const phone = await (await browser.newContext()).newPage();
  await freshDevice(phone);
  await phone.goto("/");
  await phone.waitForURL("**/interview");
  await expect(phone.getByRole("heading", { name: "What should we call you?" })).toBeVisible();
  await phone.getByRole("button", { name: ALREADY_USE }).click();
  const form = phone.getByRole("form", { name: ALREADY_USE });
  await form.getByRole("textbox").fill("not a code");
  await form.getByRole("button", { name: "Join" }).click();
  await expect(form.getByRole("alert")).toBeVisible();
  await form.getByRole("textbox").fill(groupCode(code));
  await form.getByRole("button", { name: "Join" }).click();
  await phone.waitForURL("**/link");
  await expect(phone.getByText(JOIN_EMPTY)).toBeVisible();
  await phone.getByRole("button", { name: "Join", exact: true }).click();
  await pickAndCheck(phone, code);
});
