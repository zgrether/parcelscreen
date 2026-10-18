/**
 * Whether the map is the page on show (step 4b): the explorer stays mounted behind the other tabs (owner, 10/18), so
 * its keyboard shortcuts must ignore keys pressed on Your list or What matters, and its map pauses. AppFrame sets it
 * from the route; the map and the explorer's key listeners read it.
 */

let showing = true;
const listeners = new Set<(showing: boolean) => void>();

export const mapShowing = (): boolean => showing;

export function setMapShowing(next: boolean): void {
  if (next === showing) return;
  showing = next;
  for (const l of listeners) l(next);
}

/** An element of the map's, hidden behind another tab: what the shared panels ask before taking a key. */
export const behindTabs = (el: Element | null): boolean => !!el?.closest(".app-map[hidden]");

/** Called on every change; returns the unsubscribe. */
export function onMapShowing(l: (showing: boolean) => void): () => void {
  listeners.add(l);
  return () => void listeners.delete(l);
}
