/** The sync screen's words (step 5, docs/plans/step-5-sync.md §9), in one place for the screens and the e2e. */

// UX part 2 PR 5b (P-8): the code is for your own devices; another person joins with Invite someone.
export const SYNC_TITLE = "Link a device of yours";
export const SYNC_LINE =
  "Your phone and computer as one: the same parcels, screens and priorities on each. For another person, use Invite someone.";
export const START = "Start syncing this device";
export const JOIN_WITH_CODE = "Join with a code";
export const PASSWORD_LEAD = "This code works like a password.";
export const PASSWORD_LINE =
  "Anyone who has it can see and change everything you sync. Use it only on your own devices, and don't post it or send it to anyone you wouldn't give a password.";
export const SCAN_LINE =
  "Scan it with your other device's camera, or type the code there under Join with a code.";
export const JOINED = "This device is synced.";
export const SHOW_CODE = "Show code";
export const LEAVE = "Stop syncing this device"; // polish #34 (was "Leave sync on this device")
export const LEAVE_QUESTION =
  "Stop syncing this device? It keeps a copy of everything as it is now, and stops getting your other devices' changes.";
/** The first run's way to join instead of starting as someone new (after step 6). */
export const ALREADY_USE = "I already use Parcel Screen on another device";
export const JOIN_FIRST_LINE =
  "On that device: ☰ → Household → Link a device of yours → Show code. Scan its QR with this device's camera, or type the code here.";

/** Invite someone (UX part 2 PR 5b; the audit's P-8): a one-use link for a person. */
export const INVITE_WORDS = {
  title: "Invite someone",
  line: "A link for one person: they open it, type their name, and join with priorities of their own. It works once, for 7 days.",
  make: "Make an invite link",
  making: "Making the link…",
  startingFirst: "Setting up sync on this device first…",
  failed: "Couldn't make the link. Check the connection and try again.",
  copy: "Copy",
  copied: "Copied",
  share: "Share",
  linkLabel: "Invite link",
  sendOnly: "Send it only to the person joining: anyone who opens it first joins your household.",
  joinTitle: "Join a household",
  opening: "Opening the invite…",
  spent: "This invite has been used, or it's more than 7 days old. Ask for a new one.",
  offline: "Couldn't open the invite: check the connection and open the link again.",
};
/** Set by /join as the person joins: Who's this? makes them a new member at once, and asks their name. */
export const JOIN_AS_NEW = "ps.joinAsNew";
export const WRONG_CODE = "That code doesn't match a synced space. Check it and try again.";
/** A sync route answered that the server's own setup is wrong: not the person's connection or code. */
export const SERVER_SETUP = "The sync server isn't set up correctly. Nothing was synced; try again later.";
export const JOIN_EMPTY =
  "Join this synced space? This device will show the same parcels as your other devices.";
export const GETTING = "Getting your synced parcels…";
export const SYNCED = "Synced";
export const NOT_SAVED = "Not saved";
/** Step 14e: notes or lines changed offline, held for when the device is back online. */
export const HELD = "Saved on this device — syncs when you're back online";
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
/** What the space holds, after the join question (polish #35): "It holds 12 parcels." */
export const spaceHolds = (parcels: number): string => `It holds ${n(parcels, "parcel")}.`;

export function joinReplaces(profiles: number, parcels: number): string {
  return `This device has ${n(profiles, "profile")} and ${n(parcels, "parcel")} of its own. Joining replaces them with the synced space's. Export them first if you want to keep a copy.`;
}

export function uploading(stage: "profiles" | "screens", done: number, total: number): string {
  return stage === "profiles"
    ? "Uploading your profiles and parcels…"
    : `Uploading screens: ${done} of ${total}`;
}
