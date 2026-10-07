import { describe, expect, it } from "vitest";
import manifest, { BACKGROUND_COLOR, THEME_COLOR } from "@/app/manifest";
import { OFFLINE_TEXT, shouldRegister, showUpdateToast, unreachableMessage } from "./pwa";

describe("the manifest (step 17c)", () => {
  it("is installable: name, standalone, the explorer, and any and maskable icons at 192 and 512", () => {
    const m = manifest();
    expect(m).toMatchObject({
      name: "Parcel Screen",
      short_name: "Parcel Screen",
      start_url: "/explore",
      display: "standalone",
      theme_color: "#1c2620",
      background_color: "#e7eae3",
    });
    expect([THEME_COLOR, BACKGROUND_COLOR]).toEqual(["#1c2620", "#e7eae3"]);
    const icons = m.icons!.map((i) => `${i.sizes} ${i.purpose}`);
    expect(icons).toEqual(["192x192 any", "512x512 any", "192x192 maskable", "512x512 maskable"]);
  });
});

describe("the update toast: never mid-screen (plan §3)", () => {
  it("shows only with a version waiting and nothing in progress", () => {
    expect(showUpdateToast({ waiting: true, running: false, overlayOpen: false })).toBe(true);
    expect(showUpdateToast({ waiting: false, running: false, overlayOpen: false })).toBe(false);
    expect(showUpdateToast({ waiting: true, running: true, overlayOpen: false })).toBe(false);
    expect(showUpdateToast({ waiting: true, running: false, overlayOpen: true })).toBe(false);
  });
  it("the service worker registers only in production", () => {
    expect(shouldRegister("production", true)).toBe(true);
    expect(shouldRegister("development", true)).toBe(false);
    expect(shouldRegister("production", false)).toBe(false);
  });
});

describe("offline, a parcel service isn't blamed", () => {
  it("says the offline words instead of the state's service", () => {
    const down = "Virginia parcel service isn't responding — try again shortly, or draw the boundary";
    expect(unreachableMessage(down, true)).toBe(down);
    expect(unreachableMessage(down, false)).toBe(OFFLINE_TEXT);
  });
});
