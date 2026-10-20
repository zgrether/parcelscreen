/** The sync screen's words (step 5, docs/plans/step-5-sync.md §9), in one place for the screens and the e2e. */

export const SYNC_TITLE = "Sync across devices";
export const SYNC_LINE =
  "Keep this device and your others in step: the same parcels, screens and priorities everywhere.";
export const START = "Start syncing this device";
export const JOIN_WITH_CODE = "Join with a code";
export const PASSWORD_LEAD = "This code works like a password.";
export const PASSWORD_LINE =
  "Anyone who has it can see and change everything you sync. Use it only on your own devices, and don't post it or send it to anyone you wouldn't give a password.";
export const SCAN_LINE =
  "Scan it with your other device's camera, or type the code there under Join with a code.";
export const JOINED = "This device is synced.";
export const SHOW_CODE = "Show code";
export const LEAVE = "Leave sync on this device";
export const LEAVE_QUESTION =
  "Stop syncing this device? It keeps a copy of everything as it is now, and stops getting your other devices' changes.";
export const WRONG_CODE = "That code doesn't match a synced space. Check it and try again.";
export const JOIN_EMPTY =
  "Join this synced space? This device will show the same parcels as your other devices.";
export const GETTING = "Getting your synced parcels…";
export const SYNCED = "Synced";
export const NOT_SAVED = "Not saved";
export const NOT_SAVED_LINE = "a change here isn't on your other devices yet.";
export const TRY_AGAIN = "Try again";
export const DISCARD = "Discard";
export const UNSAVED_AT_OPEN = "A change on this device wasn't saved.";
/** Under "Not saved": the change isn't lost (fresh-eyes review, 10/19). */
export const KEPT_HERE = "It's kept on this device.";
/** The next-open line, naming what wasn't saved (fresh-eyes review): "…wasn't saved: Macks Mountain." */
export function unsavedAtOpen(names: readonly string[]): string {
  if (!names.length) return UNSAVED_AT_OPEN;
  const shown = names.slice(0, 2).join(", ");
  const more = names.length > 2 ? ` and ${names.length - 2} more` : "";
  return names.length === 1
    ? `A change on this device wasn't saved: ${shown}.`
    : `Changes on this device weren't saved: ${shown}${more}.`;
}
export const DISCARD_QUESTION = "Discard it? Your other devices' copy replaces it here.";
export const START_LINE =
  "Start uploads this device's profiles, parcels and screens to Parcel Screen's server, then shows a code for your other devices.";

const n = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "s"}`;

/** The join question for a device that holds data of its own (plan §2). */
export function joinReplaces(profiles: number, parcels: number): string {
  return `This device has ${n(profiles, "profile")} and ${n(parcels, "parcel")} of its own. Joining replaces them with the synced space's. Export them first if you want to keep a copy.`;
}

/** Export first saves the current profile only, as Export file does: said when there are others. */
export const EXPORT_ONE_PROFILE =
  "Export first saves this profile's parcels; switch profiles to export the others.";

export function uploading(stage: "profiles" | "screens", done: number, total: number): string {
  return stage === "profiles"
    ? "Uploading your profiles and parcels…"
    : `Uploading screens: ${done} of ${total}`;
}
