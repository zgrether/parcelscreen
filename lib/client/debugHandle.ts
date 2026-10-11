/**
 * The test-only debug handle (step 18a): `window.__psDebug`, set only with localStorage `ps.debug` = "1".
 * `__psDebug.posted` is a frozen copy of the screen worker's latest posted result (a run, a re-evaluation or
 * a house re-assessment), for the e2e and headless checks to observe what the worker posted.
 *
 * No app code may read `window.__psDebug`. The app only writes it, here; it never carries state between
 * parts of the app.
 */
import type { PartialScreenResult } from "@/lib/screen/types";

export interface DebugHandle {
  readonly posted: Readonly<PartialScreenResult> | null;
}

/** Debug mode (localStorage `ps.debug` = "1"): the headless checks' handles, and the step times in the panel. */
export const debugOn = (): boolean => {
  try {
    return localStorage.getItem("ps.debug") === "1";
  } catch {
    return false; // storage blocked: no handle
  }
};

/**
 * `?debug=1` turns debug mode on and `?debug=0` off (A4b PR B: the owner times the driveway step on a phone, where
 * localStorage can't be set by hand). Kept until changed.
 */
export function debugFromUrl(search: string): void {
  const v = new URLSearchParams(search).get("debug");
  try {
    if (v === "1") localStorage.setItem("ps.debug", "1");
    else if (v === "0") localStorage.removeItem("ps.debug");
  } catch {
    /* storage blocked: debug mode stays as it was */
  }
}

/** Freezes an object and everything under it. */
export function deepFreeze<T>(v: T): T {
  if (v !== null && typeof v === "object" && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]);
  }
  return v;
}

/** Publishes the worker's latest posted result as a frozen copy (debug mode only). */
export function publishPosted(result: PartialScreenResult | null): void {
  if (typeof window === "undefined" || !debugOn()) return;
  const handle: DebugHandle = { posted: result === null ? null : deepFreeze(structuredClone(result)) };
  (window as unknown as { __psDebug?: DebugHandle }).__psDebug = Object.freeze(handle);
}
