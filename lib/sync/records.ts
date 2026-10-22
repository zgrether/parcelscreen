/**
 * Whole records, and what changed between two copies (step 5, docs/plans/step-5-sync.md §5). Pure, so it's tested in
 * Node. A device keeps its data as profile documents (lib/client/profileKv.ts); the synced space keeps one record per
 * profile and one per built parcel:
 *   - a profile's record: its name and created time, and the documents that sync (settings, priorities, answers, and
 *     step 8's History log), each as the string the prefs module writes;
 *   - a parcel's record: the built parcel, exactly as the parcel store's `built[]` holds it.
 * What a device keeps for itself (the open parcel, which profile is current, the views and sorts) never leaves it.
 */
import { EMPTY_HOUSEHOLD, readHousehold, recordsOf, type Ask, type Take } from "@/lib/client/takes";
import type { StoredHousehold, StoredParcel } from "./wire";

/** The profile documents that sync (§5's table); every other profile document stays on the device. */
export const SYNCED_DOCS = ["ps.cfg", "ps.costs", "ps.rubrics", "ps.interview", "ps.history"] as const;
export type SyncedDoc = (typeof SYNCED_DOCS)[number];
export const isSyncedDoc = (key: string): key is SyncedDoc =>
  (SYNCED_DOCS as readonly string[]).includes(key);
/** The parcels document: its `built[]` syncs, one record per parcel, and its `open` stays on the device. */
export const PARCELS_DOC = "ps.parcels";

export interface ProfileRecord {
  name: string;
  createdAt: string;
  /** The synced documents this profile has, by key, as stored. */
  docs: Partial<Record<SyncedDoc, string>>;
}

export function profileRecord(
  p: { name: string; createdAt: string },
  doc: (key: SyncedDoc) => string | null,
): ProfileRecord {
  const docs: Partial<Record<SyncedDoc, string>> = {};
  for (const k of SYNCED_DOCS) {
    const v = doc(k);
    if (v !== null) docs[k] = v;
  }
  return { name: p.name, createdAt: p.createdAt, docs };
}

/** A record's identity for comparing: the same content gives the same string, whatever order its keys came in. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  );
}

type Json = Record<string, unknown>;
interface StoreJson {
  v?: unknown;
  open: Json | null;
  built: Json[];
}

/** The parcels document as JSON; an empty store when there's none or it isn't one. */
export function parseParcels(raw: string | null): StoreJson {
  try {
    const s = raw ? (JSON.parse(raw) as Partial<StoreJson>) : null;
    if (s && Array.isArray(s.built)) return { v: s.v ?? 2, open: s.open ?? null, built: s.built };
  } catch {
    /* not JSON: an empty store */
  }
  return { v: 2, open: null, built: [] };
}

/** Each built parcel by its key, as its canonical string. */
export function parcelSnapshot(raw: string | null): Map<string, string> {
  return new Map(
    parseParcels(raw)
      .built.filter((p) => typeof p.key === "string")
      .map((p) => [p.key as string, canonical(p)]),
  );
}

/** What changed from `before` to `after`: each parcel added or edited (whole), and each key that's gone. */
export function diffParcels(
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
): { changed: string[]; removed: string[] } {
  const changed = [...after].filter(([k, v]) => before.get(k) !== v).map(([k]) => k);
  const removed = [...before.keys()].filter((k) => !after.has(k));
  return { changed, removed };
}

/** One built parcel from the parcels document, by key. */
export function parcelOf(raw: string | null, key: string): Json | null {
  return parseParcels(raw).built.find((p) => p.key === key) ?? null;
}

/**
 * The parcels document with the space's changes in it: each changed parcel replaced whole or added, each deleted one
 * removed, except the keys in `keep` (changed on this device and not saved yet: its own save follows, and is later).
 * The open parcel follows its built entry: replaced when that changed, closed when it was deleted.
 */
export function mergeParcels(
  raw: string | null,
  remote: readonly StoredParcel[],
  keep: ReadonlySet<string>,
): string {
  const s = parseParcels(raw);
  const built = new Map(s.built.map((p) => [String(p.key), p]));
  let open = s.open;
  for (const r of remote) {
    if (keep.has(r.key)) continue;
    if (r.deleted || !r.record) built.delete(r.key);
    else built.set(r.key, r.record);
    if (open && open.key === r.key) open = r.deleted || !r.record ? null : { ...r.record };
  }
  return JSON.stringify({ v: s.v ?? 2, open, built: [...built.values()] });
}

/** Splits items into batches whose JSON stays under `maxBytes` (one item alone over it still goes, alone). */
export function batches<T>(items: readonly T[], maxBytes: number, size: (x: T) => number): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  let bytes = 0;
  for (const x of items) {
    const n = size(x);
    if (cur.length && bytes + n > maxBytes) {
      out.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(x);
    bytes += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

// ---------- the household's asks and takes (step 6) ----------

/** The household's shared document: each ask and take syncs as its own record. */
export const HOUSEHOLD_DOC = "ps.household";

/** A record's identity in the sync: its kind and its key ("take:<parcel>:<person>"). */
export const householdId = (kind: "ask" | "take", key: string): string => `${kind}:${key}`;

/** Each ask and take by its identity, as its canonical string. */
export function householdSnapshot(raw: string | null): Map<string, string> {
  const h = (raw && readHousehold(raw)) || EMPTY_HOUSEHOLD;
  return new Map(recordsOf(h).map((x) => [householdId(x.kind, x.record.key), canonical(x.record)]));
}

/** One ask or take from the document, by its identity. */
export function householdRecord(
  raw: string | null,
  id: string,
): { kind: "ask" | "take"; key: string; record: Json | null } {
  const [kind, ...rest] = id.split(":");
  const key = rest.join(":");
  const h = (raw && readHousehold(raw)) || EMPTY_HOUSEHOLD;
  const list: readonly (Ask | Take)[] = kind === "ask" ? h.asks : h.takes;
  const found = list.find((x) => x.key === key);
  return { kind: kind as "ask" | "take", key, record: found ? (found as unknown as Json) : null };
}

/** The household's document with the space's changes in it, except the records in `keep` (unsaved here). */
export function mergeHousehold(
  raw: string | null,
  remote: readonly StoredHousehold[],
  keep: ReadonlySet<string>,
): string {
  const h = (raw && readHousehold(raw)) || EMPTY_HOUSEHOLD;
  const asks = new Map(h.asks.map((a) => [a.key, a]));
  const takes = new Map(h.takes.map((t) => [t.key, t]));
  for (const x of remote) {
    if (keep.has(householdId(x.kind, x.key))) continue;
    const target = (x.kind === "ask" ? asks : takes) as Map<string, unknown>;
    if (x.deleted || !x.record) target.delete(x.key);
    else target.set(x.key, x.record);
  }
  // Step 12's adjustments ride along untouched until they sync (plan §11, PR 3).
  return JSON.stringify({ ...h, v: 1, asks: [...asks.values()], takes: [...takes.values()] });
}
