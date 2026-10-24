/** What more than one use reads (step 14 §3): the build site, the public land next door. Pure. */
import { buildSite, siteLabel } from "../report/card";
import type { LatLon } from "../geo/types";
import type { PartialScreenResult, Site } from "../screen/types";

export interface Spot {
  /** "the marked house", "site #1". */
  label: string;
  ll: LatLon;
  elevFt: number | null;
  /** The site's acres; null for a marked house. */
  acres: number | null;
  /** The ranked site, when the spot is one (not a marked house). */
  site: Site | null;
  privacy: Site["privacy"];
}

/**
 * The build site the card reads (card.ts buildSite): the marked house, else the ranked site at `at`. null when there's
 * neither; undefined when the homesites weren't ranked and there's no house.
 */
export function spotOf(r: PartialScreenResult, at: number): Spot | null | undefined {
  const b = buildSite(r, at);
  if (!b) return b;
  const h = r.house && !("outside" in r.house) ? r.house : null;
  const s = h ? null : (r.sites?.[at] ?? null);
  return {
    label: s ? siteLabel(s) : b.label,
    ll: b.ll,
    elevFt: b.elevFt,
    acres: s ? s.acres : null,
    site: s,
    privacy: h ? h.privacy : s?.privacy,
  };
}

/**
 * Open-access public land the parcel adjoins (PAD-US, as the card's Trails row reads it): its name, "unnamed" without
 * one; null when there's none; undefined when PAD-US didn't load.
 */
export function adjoiningPublic(r: PartialScreenResult): string | null | undefined {
  if (!r.protected) return undefined;
  const p = r.protected.find((x) => x.access === "OA" && x.adjoins);
  return p ? (p.name ?? "unnamed") : null;
}

/** "Uppercase first", for a card phrase that leads a reason. */
export const upperFirst = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
