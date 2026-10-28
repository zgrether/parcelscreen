import type { Map as MlMap, Popup } from "maplibre-gl";
import { mapGone } from "./MapView";

/**
 * Pans the map so an open popup shows whole: clear of the search and map buttons over the top edge, and of the hint,
 * the toolbar and (on a phone) the tab bar over the bottom one. MapLibre places a popup on its next frame, so it's
 * measured after that.
 */
export function fitPopup(map: MlMap, pop: Popup): void {
  requestAnimationFrame(() => requestAnimationFrame(() => fitNow(map, pop)));
}

function fitNow(map: MlMap, pop: Popup): void {
  if (!pop.isOpen() || mapGone(map)) return;
  const box = pop.getElement()?.getBoundingClientRect();
  const frame = map.getContainer().getBoundingClientRect();
  if (!box) return;
  const pad = 8,
    top = 64,
    bottom = 150;
  const dy =
    box.top < frame.top + top
      ? box.top - frame.top - top
      : box.bottom > frame.bottom - bottom
        ? Math.min(box.bottom - frame.bottom + bottom, box.top - frame.top - top)
        : 0;
  const dx =
    box.left < frame.left + pad
      ? box.left - frame.left - pad
      : box.right > frame.right - pad
        ? box.right - frame.right + pad
        : 0;
  if (dx || dy) map.panBy([dx, dy], { duration: 250 });
}
