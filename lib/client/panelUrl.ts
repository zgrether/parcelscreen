/**
 * The open report panel in the explorer's URL, `/explore?panel=sky` (owner, #121 review): Back from the rulebook
 * (a panel's "How it's scored") returns to it, and a link that names a panel opens it. Opening or closing a panel
 * replaces the URL's entry, so Back doesn't step through the panels.
 */
import { PANEL_KEYS, type PanelKey } from "@/lib/report/cardPanels";

const PARAM = "panel";

/** The panel a URL's query names, or null when it names none, or something that isn't a panel. */
export function panelFromSearch(search: string): PanelKey | null {
  const v = new URLSearchParams(search).get(PARAM);
  return v !== null && (PANEL_KEYS as readonly string[]).includes(v) ? (v as PanelKey) : null;
}

/** The URL with its panel set (or removed, for null), its path, other parameters and hash kept. */
export function withPanel(href: string, panel: PanelKey | null): string {
  const url = new URL(href);
  if (panel) url.searchParams.set(PARAM, panel);
  else url.searchParams.delete(PARAM);
  return url.pathname + url.search + url.hash;
}

/** Writes the open panel into the address bar, replacing the current entry; nothing when it's already there. */
export function replacePanelInUrl(panel: PanelKey | null): void {
  const next = withPanel(window.location.href, panel);
  const now = window.location.pathname + window.location.search + window.location.hash;
  // null state: Next's router keeps its own and takes the new URL as current (App Router's replaceState support).
  if (next !== now) window.history.replaceState(null, "", next);
}
