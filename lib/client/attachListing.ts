/**
 * After a listing-link search, the next parcel opened offers to take the link (owner, #130): a one-tap chip, "Attach
 * Redfin listing (0 Ferney Creek Rd)". Nothing is attached without the tap. The offer ends once used or dismissed,
 * when another link is searched, or after ATTACH_MS. Pure; the controller holds the offer and its timer.
 */
import type { ListingSite } from "./listingUrl";
import type { ListingField, WorkingParcel } from "./parcelStore";

/** How long a searched link is offered (owner, #130: 30 minutes). */
export const ATTACH_MS = 30 * 60 * 1000;

export interface SearchedListing {
  url: string;
  site: ListingSite;
  /** The street as the listing writes it, when the link has one. */
  street: string | null;
  /** What was geocoded: the chip's fallback label. */
  query: string;
  /** The parcel open when the link was searched (`state.serial`): the offer is for the next one opened. */
  afterSerial: number;
}

/**
 * Whether the open parcel is offered the link: one opened after the search, with no link of its own (a link already
 * there is never replaced by a chip).
 */
export function offersListing(
  s: SearchedListing | null,
  open: WorkingParcel | null,
  serial: number,
): s is SearchedListing {
  return !!s && !!open && serial > s.afterSerial && open.listingUrl.trim() === "";
}

export const attachLabel = (s: SearchedListing): string =>
  `Attach ${s.site} listing (${s.street ?? s.query})`;

/** The link, and the street as the name when the parcel has none. */
export function attachPatch(
  s: SearchedListing,
  open: WorkingParcel,
): Partial<Pick<WorkingParcel, ListingField>> {
  return { listingUrl: s.url, ...(open.name.trim() === "" && s.street ? { name: s.street } : {}) };
}
