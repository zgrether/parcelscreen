/// <reference lib="esnext" />
/// <reference lib="webworker" />
/**
 * The service worker (step 17c; plan phase-0-17c-pwa.md). It precaches the app shell and static assets only:
 * the /explore page, Next's static chunks (the screen's Web Worker among them), fonts and icons. Nothing else
 * is routed (no runtimeCaching): API, parcel, DEM, soils and tile requests go to the network untouched, from
 * the page and from the screen's worker alike.
 *
 * Updates (§3): a new version installs and waits (no skipWaiting) until the next launch, or until the page
 * asks it to take over (the "Updated — reload" toast posts SKIP_WAITING). Offline, a navigation that isn't
 * precached gets the precached /explore, which shows the offline state.
 */
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // The precache manifest, injected at build (createSerwistRoute).
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false,
  clientsClaim: false,
  navigationPreload: false,
  runtimeCaching: [],
  fallbacks: {
    entries: [{ url: "/explore", matcher: ({ request }) => request.destination === "document" }],
  },
});

// The toast's "reload": take over now instead of at the next launch.
self.addEventListener("message", (event) => {
  if ((event.data as { type?: string } | null)?.type === "SKIP_WAITING") void self.skipWaiting();
});

serwist.addEventListeners();
