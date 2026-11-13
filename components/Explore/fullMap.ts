/**
 * Full-map mode (docs/plans/map-room.md §5; Zach's option A, 2026-11-12): every control on the map hides but the sheet's
 * line and a restore button, so the land has the whole screen.
 *
 * On a phone it starts with a swipe down on the slim line, or a tap on the map that does nothing today (the open
 * parcel off any feature, or empty map with no hint); it ends with a swipe up on the line, the restore button, or
 * another such tap. On a desktop it starts with the Hide button beside the Key chip and ends with restore.
 *
 * Zach's rules (#427):
 * - a tap that closes something (a tip, the open Key, a popup) only closes it;
 * - never while Edit or any tool is in use, and a tool starting or Edit opening ends it;
 * - the parcel closing ends it.
 *
 * The rules are a pure reducer, unit-tested; the store beside it is what the map, the sheet and the toolbar share.
 */
import { useSyncExternalStore } from "react";

export type FullMapEvent =
  /** A tap that does nothing today (after the double-tap window). `closedSomething`: it closed a tip, the Key or a popup. */
  | { type: "emptyTap"; closedSomething: boolean }
  /** A swipe down on the line, or the desktop's Hide button. */
  | { type: "hide" }
  /** A swipe up on the line, or the restore button. */
  | { type: "show" }
  /** A tool started, Edit opened, the sheet left the line, or the parcel closed. */
  | { type: "end" };

/** What blocks it: a tool in use, or the toolbar open for editing. */
export interface FullMapContext {
  busy: boolean;
}

export function fullMapReducer(on: boolean, e: FullMapEvent, ctx: FullMapContext): boolean {
  switch (e.type) {
    case "emptyTap":
      if (e.closedSomething) return on;
      return ctx.busy ? false : !on;
    case "hide":
      return ctx.busy ? on : true;
    case "show":
    case "end":
      return false;
  }
}

// The store: one map per page.
let on = false;
let editing = false;
let tool = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Applies an event under the current context. */
export function fullMap(e: FullMapEvent): void {
  const next = fullMapReducer(on, e, { busy: tool || editing });
  if (next === on) return;
  on = next;
  emit();
}

/** The toolbar reports Edit, and the explorer a tool in use: either ends full-map mode and blocks it. */
export function setFullMapBlockers(b: { editing?: boolean; tool?: boolean }): void {
  if (b.editing !== undefined) editing = b.editing;
  if (b.tool !== undefined) tool = b.tool;
  if (editing || tool) fullMap({ type: "end" });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
/** Whether full-map mode is on. */
export const useFullMap = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => on,
    () => false,
  );
/** For non-React readers (the map's tap). */
export const fullMapOn = (): boolean => on;

/** The one-time hint over the line (Zach: once per device, never again). */
export const FULL_MAP_HINT = "Swipe down to hide controls.";
export const FULL_MAP_HINT_KEY = "ps.fullMapHint";
/** The restore button's name, for screen readers (map-room plan §8). */
export const SHOW_CONTROLS = "Show the map's controls";
export const HIDE_CONTROLS = "Hide the map's controls";
