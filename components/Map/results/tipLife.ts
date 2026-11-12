/**
 * How long a tapped tip lives (map-room plan §4): no tip stays pinned. A tip closes after `TIP_MS`, and earlier on a tap
 * elsewhere, the map moving or a tool starting (ResultTips calls `hidden` then). Showing it again restarts the clock.
 * Pure but for the timer, which is passed in, so the clock is unit-tested.
 */
export const TIP_MS = 5000;

export interface TipLife {
  /** A tip was shown (or shown again): it closes in `ms` unless something closes it first. */
  shown(): void;
  /** The tip closed: the clock stops. */
  hidden(): void;
  /** Is a tip showing? A tap that closes one does nothing else (Zach, #427: it only closes). */
  readonly open: boolean;
}

export function tipLife(
  hide: () => void,
  ms = TIP_MS,
  timers: { set: typeof setTimeout; clear: typeof clearTimeout } = { set: setTimeout, clear: clearTimeout },
): TipLife {
  let t: ReturnType<typeof setTimeout> | null = null;
  let open = false;
  const stop = () => {
    if (t !== null) timers.clear(t);
    t = null;
  };
  return {
    shown() {
      stop();
      open = true;
      t = timers.set(() => {
        t = null;
        open = false;
        hide();
      }, ms);
    },
    hidden() {
      stop();
      open = false;
    },
    get open() {
      return open;
    },
  };
}
