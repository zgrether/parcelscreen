/// <reference lib="esnext" />
/// <reference lib="webworker" />
/**
 * The service worker (step 17c; plan phase-0-17c-pwa.md). It precaches the app shell and static assets: the
 * /explore page, Next's static chunks (the screen's Web Worker among them), fonts and icons.
 *
 * Step 14e (plan step-14e-offline.md §3): it also keeps the map's tiles as they're viewed, for the layers whose terms
 * allow it (lib/offline/swTiles.ts; components/Map/offlineLayers.ts lists them). Everything else (API, parcel lookups,
 * the grade's DEM, soils) goes to the network untouched, from the page and from the screen's worker alike.
 *
 * Updates (§3): a new version installs and waits (no skipWaiting) until the next launch, or until the page
 * asks it to take over (the "Updated — reload" toast posts SKIP_WAITING). Offline, a navigation that isn't
 * precached gets the precached /explore, which shows the offline state.
 */
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";
import { handleMapTile, isMapTile } from "@/lib/offline/swTiles";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // The precache manifest, injected at build (createSerwistRoute).
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/** The report page's shell, precached (app/serwist/[path]/route.ts), and the paths it stands in for. */
const REPORT_SHELL = "/parcel/_/report";
const REPORT_PATH = /^\/parcel\/[^/]+\/report\/?$/;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false,
  clientsClaim: false,
  navigationPreload: false,
  runtimeCaching: [
    { matcher: ({ url, sameOrigin }) => isMapTile(url, sameOrigin), handler: handleMapTile },
    // Parcel lines are POST queries, one per zoom-14 tile; the handler keys them by their form body.
    { matcher: ({ url, sameOrigin }) => isMapTile(url, sameOrigin), handler: handleMapTile, method: "POST" },
  ],
  fallbacks: {
    entries: [
      // The report card export (step 9 plan §1): one precached shell for every parcel, which reads its key from the URL.
      {
        url: REPORT_SHELL,
        matcher: ({ request }) =>
          request.destination === "document" && REPORT_PATH.test(new URL(request.url).pathname),
      },
      { url: "/explore", matcher: ({ request }) => request.destination === "document" },
    ],
  },
});

// The toast's "reload": take over now instead of at the next launch.
self.addEventListener("message", (event) => {
  if ((event.data as { type?: string } | null)?.type === "SKIP_WAITING") void self.skipWaiting();
});

serwist.addEventListeners();
