/**
 * The household's asks and takes on this page (step 6, docs/plans/step-6-household.md §4): read from the shared
 * `ps.household` document, written through the prefs module (so a joined device syncs each ask and take as a record),
 * and heard by the pages through HOUSEHOLD_WRITTEN, whether the change is made here or arrives by a sync.
 */
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { getPref, HOUSEHOLD_WRITTEN, setPref } from "./prefs";
import { currentProfileId } from "./profiles";
import { sharedKv } from "./profileKv";
import {
  EMPTY_HOUSEHOLD,
  newTakes,
  readHousehold,
  withSeen,
  withAsk,
  withoutParcel,
  withTake,
  type Answer,
  type Household,
  type SeenTakes,
  type Take,
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

// ---------- new takes (step 6b) ----------

let seenCache: { raw: string; seen: SeenTakes } = { raw: "{}", seen: {} };
/** The takes this profile has seen on this device; the same object until it changes. */
function seenTakes(): SeenTakes {
  const seen = getPref("ps.seenTakes");
  const raw = JSON.stringify(seen);
  if (raw !== seenCache.raw) seenCache = { raw, seen };
  return seenCache.seen;
}
const NO_SEEN: SeenTakes = {};
export const useSeenTakes = (): SeenTakes =>
  useSyncExternalStore(subscribeHousehold, seenTakes, () => NO_SEEN);

/** The other members' takes the current person hasn't seen: given or changed since they last opened the parcel. */
export function useNewTakes(): Take[] {
  const h = useHousehold();
  const seen = useSeenTakes();
  const me = currentProfileId();
  return useMemo(() => (me ? newTakes(h, me, seen) : []), [h, seen, me]);
}

/** Marks every take on a parcel seen, as it stands now: the parcel is open in front of the current person. */
export function seeTakes(parcel: string): void {
  const h = householdDoc();
  if (!h.takes.some((t) => t.parcel === parcel)) return;
  const seen = getPref("ps.seenTakes");
  const next = withSeen(seen, h, parcel);
  if (JSON.stringify(next) !== JSON.stringify(seen)) setPref("ps.seenTakes", next);
}

/** While a parcel is open, its takes are seen, including one that arrives by a sync while it's open. */
export function useSeeTakes(parcel: string | null): void {
  const h = useHousehold();
  useEffect(() => {
    if (parcel) seeTakes(parcel);
  }, [parcel, h]);
}

/** A parcel removed from the list: its asks and takes go too. */
export function dropParcel(parcel: string): void {
  const h = getPref("ps.household");
  if (h && (h.asks.some((a) => a.parcel === parcel) || h.takes.some((t) => t.parcel === parcel)))
    save(withoutParcel(h, parcel));
}
