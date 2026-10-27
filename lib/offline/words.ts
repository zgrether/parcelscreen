/**
 * Step 14e's strings (docs/plans/step-14e-offline.md §9): UI only, no report text. One place, so the components and
 * the e2e read the same words.
 */
export const OFFLINE_WORDS = {
  heading: "Offline",
  device: (used: string, quota: string) =>
    `This device: ${used} of about ${quota}, for the app, your parcels and their maps`,
  kept: "Kept until you delete it",
  mayClear: "The browser may clear this when space runs low. Keep offline data asks it not to.",
  keep: "Keep offline data",
  mapCache: (used: string, cap: string) => `Map cache: ${used} of ${cap}`,
  mapCacheLine:
    "The maps you've looked at, kept so they open faster and offline; past the limit, the oldest go. Saved parcels aren't counted here, and Clear map cache leaves them.",
  keepUpTo: "Keep up to",
  clear: "Clear map cache",
  iphone:
    "On an iPhone, add Parcel Screen to your Home Screen (Share › Add to Home Screen), or Safari may clear offline data after a week without use.",
  notKept: "not kept offline",
  esriOffline: "Esri's maps aren't kept offline: pick USGS or State aerial in Map layers.",
  // Save offline (⋯ and its sheet).
  save: "Save offline",
  update: "Update offline copy",
  saving: (pct: number) => `Saving offline… ${pct}%`,
  question: "Save offline?",
  savingTitle: "Saving offline",
  working: "Working out the size…",
  about: (mb: number) => `About ${mb} MB`,
  includes:
    "The parcel's grade, your lines and marks, the places nearby, and the map for a quarter mile around it in every basemap and layer whose provider allows it.",
  noEsri:
    "Not included: the two Esri basemaps, Aerial (Esri) and Streets (Esri). Their terms don't allow it.",
  where: "Open it from Your list, even with no connection. Settings › Offline lists it.",
  saved: (size: string) => `Saved offline (${size})`,
  failed: (n: number) => (n === 1 ? "1 map tile didn't download." : `${n} map tiles didn't download.`),
  tryAgain: "Try again",
  cancel: "Cancel",
  done: "Done",
  full: "Not enough space on this device: free some up, or lower the map cache.",
  unavailable: "This browser can't keep the app offline.",
  // Settings › Offline's list.
  savedHeading: "Saved offline",
  incomplete: "Incomplete",
  delete: "Delete",
  // Polish 2 (L9): Delete waits a few seconds with Undo; a saved parcel's name opens it on the map.
  deleted: "Deleted",
  undo: "Undo",
  openTitle: "Open it on the map",
  none: "No parcels saved offline. Use Save offline in a parcel's ⋯ menu.",
} as const;

/** "640 KB", "312 MB", "1 GB", "4.5 GB": bytes in the binary units the cap is set in. */
export function formatBytes(n: number): string {
  const MB = 1024 * 1024;
  if (n < MB) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n >= 1024 * MB) {
    const gb = n / (1024 * MB);
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  }
  return `${Math.round(n / MB)} MB`;
}
