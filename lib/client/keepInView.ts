/**
 * Menus and popovers stay in view (owner, 10/18: the profile menu was cut off at the right edge). "In view" is the window
 * cut down by every scrolling ancestor: the pages that scroll inside their own <main> clip a popover at the main's edge,
 * not the window's (that was the profile menu's case: <main> is 1200 px wide on a wider window). Given where a popover
 * landed and the button that opened it, `keepInView` works out how far to nudge it:
 * - past the right edge: line its right edge up with the button's, as a menu near the right edge should;
 * - still out (or out on the left): shift it in, keeping a margin from the edge;
 * - past the bottom: flip it above the button when it fits there, else shift it up.
 * A popover already in view stays where it is, even against an edge (a phone's full-width bottom sheet). Pure: the hook
 * (`useKeepInView`) measures, and applies the answer as a CSS `translate`, which leaves the popover's own placement and
 * transform alone.
 */
import { useLayoutEffect, type RefObject } from "react";

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The space kept between a popover and the edge it was moved off, px. */
export const VIEW_MARGIN = 8;
/** The gap between a flipped popover and its button, px. */
const GAP = 6;

export function keepInView(
  pop: Box,
  view: Box,
  anchor?: Box | null,
  margin = VIEW_MARGIN,
): { dx: number; dy: number } {
  const h = pop.bottom - pop.top;
  let dx = 0;
  if (pop.left < view.left || pop.right > view.right) {
    if (pop.right > view.right && anchor) dx = anchor.right - pop.right;
    if (pop.right + dx > view.right - margin) dx -= pop.right + dx - (view.right - margin);
    if (pop.left + dx < view.left + margin) dx += view.left + margin - (pop.left + dx);
  }

  let dy = 0;
  if (pop.top < view.top || pop.bottom > view.bottom) {
    if (pop.bottom > view.bottom) {
      const above = anchor ? anchor.top - GAP - h : -Infinity;
      dy = above >= view.top + margin ? above - pop.top : view.bottom - margin - pop.bottom;
    }
    if (pop.top + dy < view.top + margin) dy += view.top + margin - (pop.top + dy);
  }
  return { dx: Math.round(dx), dy: Math.round(dy) };
}

/** The part of the window `el` can be seen in: the window, cut down by each ancestor that clips its overflow. */
export function visibleBox(el: HTMLElement): Box {
  const box: Box = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  // A fixed popover escapes its ancestors' overflow; only the window clips it.
  if (getComputedStyle(el).position === "fixed") return box;
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const s = getComputedStyle(p);
    if (s.overflowX === "visible" && s.overflowY === "visible") continue;
    const r = p.getBoundingClientRect();
    box.left = Math.max(box.left, r.left);
    box.top = Math.max(box.top, r.top);
    box.right = Math.min(box.right, r.right);
    box.bottom = Math.min(box.bottom, r.bottom);
  }
  return box;
}

/**
 * Keeps `pop` in view while `open`: measured after each render that opens it and on a resize. `anchor` is the button
 * that opened it, for right-aligning and flipping.
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
      const { dx, dy } = keepInView(r, visibleBox(el), a);
      if (dx || dy) el.style.setProperty("translate", `${dx}px ${dy}px`);
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  });
}
