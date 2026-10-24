/**
 * The parcel's own facts edited (the notes, the asking price, the listing's facts): the explorer's Notes tab and the
 * list's detail make the same changes (owner, after #133). Each returns the parcel itself when nothing changes, so a
 * caller can tell and save nothing. Pure.
 */
import type { ListingField, WorkingParcel } from "./parcelStore";

/** The notes, dated when they say something; blank notes have no date. */
export const withNotes = (p: WorkingParcel, text: string, now: string): WorkingParcel =>
  text === p.notes ? p : { ...p, notes: text, notesAt: text.trim() ? now : null };

/** The asking price and when it was entered (owner, #101); null clears both. */
export const withAskingPrice = (p: WorkingParcel, price: number | null, now: string): WorkingParcel =>
  price === p.askingPrice ? p : { ...p, askingPrice: price, askingPriceAt: price === null ? null : now };

/** Some of the listing's facts (WF1). */
export function withListing(
  p: WorkingParcel,
  patch: Partial<Pick<WorkingParcel, ListingField>>,
): WorkingParcel {
  const next = { ...p, ...patch };
  if ((Object.keys(patch) as ListingField[]).every((k) => next[k] === p[k])) return p;
  // Owner, after #312: an edit makes a copied fact the person's own.
  const kept = p.fromOriginal?.filter((k) => !(k in patch));
  if (kept?.length) next.fromOriginal = kept;
  else delete next.fromOriginal;
  return next;
}
