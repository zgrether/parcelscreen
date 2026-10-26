/**
 * A phone's double-tap (UX part 2, Z-1; Zach, after #333): the first tap acts at once, and a second one soon after and
 * close by zooms in instead, taking the first back. Detected here rather than by MapLibre's own double-tap zoom, which a
 * camera ease started by the first tap (a parcel framing itself) resets between the two taps.
 */

/** MapLibre's own limits for a double-tap (its TapRecognizer): the second tap within 500 ms and 30 px of the first. */
export const DOUBLE_TAP_MS = 500;
export const DOUBLE_TAP_PX = 30;

export interface Tap {
  t: number;
  x: number;
  y: number;
}

/** Whether a tap is the second of a double-tap: soon enough after the last one, and close enough to it. */
export function isDoubleTap(last: Tap | null, now: Tap): boolean {
  return (
    !!last && now.t - last.t <= DOUBLE_TAP_MS && Math.hypot(now.x - last.x, now.y - last.y) <= DOUBLE_TAP_PX
  );
}

/**
 * When an input event happened, on performance.now()'s clock: the event's own time, not the time it's handled. A page
 * busy opening a parcel handles a double-tap's second tap half a second late, which read as two single taps.
 */
export function eventTime(e?: Event): number {
  return e && e.timeStamp > 0 ? e.timeStamp : performance.now();
}
