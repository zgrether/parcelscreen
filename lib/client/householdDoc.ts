/**
 * The household's asks and takes on this page (step 6, docs/plans/step-6-household.md §4): read from the shared
 * `ps.household` document, written through the prefs module (so a joined device syncs each ask and take as a record),
 * and heard by the pages through HOUSEHOLD_WRITTEN, whether the change is made here or arrives by a sync.
 */
import { useSyncExternalStore } from "react";
import { getPref, HOUSEHOLD_WRITTEN, setPref } from "./prefs";
import { currentProfileId } from "./profiles";
import { sharedKv } from "./profileKv";
import {
  EMPTY_HOUSEHOLD,
  readHousehold,
  withAsk,
  withoutParcel,
  withTake,
  type Answer,
  type Household,
} from "./takes";

let cache: { raw: string | null; doc: Household } = { raw: null, doc: EMPTY_HOUSEHOLD };

/** The document as stored now; the same object until it changes, as useSyncExternalStore needs. */
export function householdDoc(): Household {
  const raw = sharedKv()?.getItem("ps.household") ?? null;
  if (raw !== cache.raw) cache = { raw, doc: (raw && readHousehold(raw)) || EMPTY_HOUSEHOLD };
  return cache.doc;
}

export function subscribeHousehold(changed: () => void): () => void {
  window.addEventListener(HOUSEHOLD_WRITTEN, changed);
  return () => window.removeEventListener(HOUSEHOLD_WRITTEN, changed);
}

export const useHousehold = (): Household =>
  useSyncExternalStore(subscribeHousehold, householdDoc, () => EMPTY_HOUSEHOLD);

const save = (h: Household) => setPref("ps.household", h);
const now = () => new Date().toISOString();

/** Asks a member for their take on a parcel, with an optional note. */
export function askFor(parcel: string, to: string, note: string): void {
  const from = currentProfileId();
  if (!from) return;
  save(
    withAsk(getPref("ps.household") ?? EMPTY_HOUSEHOLD, { parcel, from, to, note: note.trim(), at: now() }),
  );
}

/** Gives, or changes, the current person's take on a parcel. */
export function giveTake(parcel: string, answer: Answer, comment: string): void {
  const by = currentProfileId();
  if (!by) return;
  save(
    withTake(getPref("ps.household") ?? EMPTY_HOUSEHOLD, {
      parcel,
      by,
      answer,
      comment: comment.trim(),
      at: now(),
    }),
  );
}

/** A parcel removed from the list: its asks and takes go too. */
export function dropParcel(parcel: string): void {
  const h = getPref("ps.household");
  if (h && (h.asks.some((a) => a.parcel === parcel) || h.takes.some((t) => t.parcel === parcel)))
    save(withoutParcel(h, parcel));
}
