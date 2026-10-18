/**
 * Menus and popovers stay inside the window (owner, 10/18: the profile menu was cut off at the right edge). Given where
 * a popover landed and the button that opened it, `keepInView` works out how far to nudge it:
 * - past the right edge: line its right edge up with the button's, as a menu near the right edge should;
 * - still out (or out on the left): shift it in, keeping a margin from the window's edge;
 * - past the bottom: flip it above the button when it fits there, else shift it up.
 * A popover already inside the window stays where it is, even against an edge (a phone's full-width bottom sheet).
 * Pure: the hook (`useKeepInView`) measures, and applies the answer as a CSS `translate`, which leaves the popover's own
 * placement and transform alone.
 */
import { useLayoutEffect, type RefObject } from "react";

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The space kept between a popover and the window's edge, px. */
export const VIEW_MARGIN = 8;
/** The gap between a flipped popover and its button, px. */
const GAP = 6;

export function keepInView(
  pop: Box,
  view: { width: number; height: number },
  anchor?: Box | null,
  margin = VIEW_MARGIN,
): { dx: number; dy: number } {
  const h = pop.bottom - pop.top;
  const out = (lo: number, hi: number, size: number) => lo < 0 || hi > size;
  let dx = 0;
  if (out(pop.left, pop.right, view.width)) {
    if (pop.right > view.width && anchor) dx = anchor.right - pop.right;
    if (pop.right + dx > view.width - margin) dx -= pop.right + dx - (view.width - margin);
    if (pop.left + dx < margin) dx += margin - (pop.left + dx);
  }

  let dy = 0;
  if (out(pop.top, pop.bottom, view.height)) {
    if (pop.bottom > view.height) {
      const above = anchor ? anchor.top - GAP - h : -Infinity;
      dy = above >= margin ? above - pop.top : view.height - margin - pop.bottom;
    }
    if (pop.top + dy < margin) dy += margin - (pop.top + dy);
  }
  return { dx: Math.round(dx), dy: Math.round(dy) };
}

/**
 * Keeps `pop` inside the window while `open`: measured after each render that opens it and on a resize. `anchor` is the
 * button that opened it, for right-aligning and flipping.
 */
export function useKeepInView(
  pop: RefObject<HTMLElement | null>,
  open: boolean,
  anchor?: RefObject<HTMLElement | null>,
): void {
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const el = pop.current;
      if (!el) return;
      el.style.removeProperty("translate");
      const r = el.getBoundingClientRect();
      const a = anchor?.current?.getBoundingClientRect() ?? null;
      const { dx, dy } = keepInView(r, { width: window.innerWidth, height: window.innerHeight }, a);
      if (dx || dy) el.style.setProperty("translate", `${dx}px ${dy}px`);
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  });
}
