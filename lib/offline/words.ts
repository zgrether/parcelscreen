/**
 * Step 14e's strings (docs/plans/step-14e-offline.md §9): UI only, no report text. One place, so the components and
 * the e2e read the same words.
 */
export const OFFLINE_WORDS = {
  heading: "Offline",
  device: (used: string, quota: string) => `This device: ${used} of about ${quota}`,
  kept: "Kept until you delete it",
  mayClear: "The browser may clear this when space runs low.",
  keep: "Keep offline data",
  mapCache: (used: string, cap: string) => `Map cache: ${used} of ${cap}`,
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
  working: "Working out the size…",
  about: (mb: number) => `About ${mb} MB`,
  includes:
    "The map ¼ mile around the parcel, in every layer that allows it, with its grade, lines, marks and nearby places.",
  noEsri: "Esri's maps aren't included: their terms don't allow it.",
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
