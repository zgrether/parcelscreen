/**
 * The PWA's small rules (step 17c), pure so they're Node-tested: when the "Updated — reload" toast may show,
 * and whether the app is offline.
 */

export interface UpdateState {
  /** A new service worker is installed and waiting. */
  waiting: boolean;
  /** A screen is running for the open parcel. */
  running: boolean;
  /** The ground viewer or Settings is open. */
  overlayOpen: boolean;
}

/** Never mid-screen (plan §3): only with a version waiting, no screen running, nothing open over the map. */
export const showUpdateToast = (s: UpdateState): boolean => s.waiting && !s.running && !s.overlayOpen;

export const UPDATE_TEXT = "Updated — reload";
export const OFFLINE_TEXT = "You're offline — saved parcels still open from History";
export const OFFLINE_SCREEN_TEXT = "You're offline — screening needs the network.";

/**
 * A parcel service that didn't answer while the browser is offline isn't down: say the offline words
 * instead of naming the state's service.
 */
export const unreachableMessage = (serviceMessage: string, online: boolean): string =>
  online ? serviceMessage : OFFLINE_TEXT;

/** The service worker registers only in production builds (never in next dev, nor under the e2e's block). */
export const shouldRegister = (env: string | undefined, hasServiceWorker: boolean): boolean =>
  env === "production" && hasServiceWorker;
