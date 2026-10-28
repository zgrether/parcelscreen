/**
 * Per-browser UI preferences in localStorage, under the prototype's keys. Storage can be missing or throw
 * (private windows, blocked site data), so every read falls back to the default and every write is
 * best-effort.
 */
import { readCurrentParcel, writeCurrentParcel, type CurrentParcel } from "./currentParcel";
import { DEFAULT_VIEW, readLibraryView, type LibraryView } from "./library";
import { readRecent, type MarkChoice } from "./markChoices";
import { withRanks } from "./myOrder";
import { ProfileRubricsSchema, type ProfileRubrics } from "@/lib/rubric/schema";
import { InterviewDocSchema, type InterviewDoc } from "@/lib/rubric/interview/doc";
import { MINE } from "@/lib/rubric/types";
import { readHousehold, readSeen, type Household, type SeenTakes } from "./takes";
import { EMPTY_LOG, readHistoryLog, type HistoryLog } from "./favorites";
import { activeKv, isProfileKey, isSharedKey, sharedKv } from "./profileKv";
import { readParcelStore, withNamesFromNotes, writeParcelStore, type ParcelStore } from "./parcelStore";
import { presetOf, type Preset } from "../print/report";
import { PLACE_KINDS, type PlaceKind } from "../places/layer";

export interface MapView {
  lat: number;
  lon: number;
  z: number;
  /** Bearing and pitch, in degrees (13g); absent in views saved before them. */
  b?: number;
  p?: number;
}

/** The terrain preview (13g): 3D terrain and its vertical exaggeration. */
/** The result overlays a user can hide (step 15). */
export interface OverlayPrefs {
  pins: boolean;
  /**
   * Every pin, not just the best homesite: the other sites, shelves, gardens and road entrances (UX part 2 PR 3b2, the
   * audit's P-2: the pins outside the map's key line stay off until asked for).
   */
  allPins: boolean;
  fan: boolean;
  soils: boolean;
  trailheads: boolean;
  driveway: boolean;
}
const ALL_OVERLAYS: OverlayPrefs = {
  pins: true,
  allPins: false,
  fan: true,
  soils: true,
  trailheads: true,
  driveway: true,
};

export interface TerrainPref {
  on: boolean;
  exaggeration: 1 | 1.5 | 2;
}

export interface Prefs {
  "ps.base": string;
  "ps.view": MapView | null;
  "ps.dim": boolean;
  "ps.lines": boolean;
  /** Step 8b: the open parcel's lines, marks and house site drawn on the map (Map layers' Your lines and marks). */
  "ps.marks": boolean;
  /** Roads & labels over the aerials (17d): a UI pref, never part of UserConfig or a run. */
  "ps.roads": boolean;
  "ps.omode": "house" | "garden" | "slope" | "off";
  /** New in the port (step 13d): the parcel being worked on and the house, kept across a refresh. */
  "ps.current": CurrentParcel | null;
  /** Step 13e: the open parcel and History. Replaces ps.current, which converts on first read. */
  "ps.parcels": ParcelStore | null;
  /** Step 13e-5: the Info panel's tab, so it reopens on the last one used. */
  /**
   * Step 13g, the terrain preview: UI layers only, never in UserConfig or a run's settings, so they can't
   * mark a screen out of date. Hillshade and contours are null until first toggled: then the device decides
   * (on on desktop, off on phones, for the tile data on cellular; owner, 13g).
   */
  "ps.terrain": TerrainPref;
  "ps.hillshade": boolean | null;
  "ps.contours": boolean | null;
  /** Step 15: which result overlays show (the Analysis rows in Info › Layers). UI only, like the terrain. */
  "ps.overlays": OverlayPrefs;
  /** The one-time desktop hint for tilting and rotating has been seen (owner, map UX 2026-10-10). */
  "ps.tiltHint": boolean;
  /** The rubric on show (step 1): "mine", or one of the profile's other rubrics by id. UI only, never part of a run. */
  "ps.rubricView": string;
  /** The report card export's preset (step 9): One page or Full, the last one used. */
  "ps.reportPreset": Preset;
  /** The profile's rubrics (step 1; lib/client/rubrics.ts): null until it has its own. */
  "ps.rubrics": ProfileRubrics | null;
  /** The interview (step 4): its answers, where to resume, and the rubric it made; null until it's begun. */
  "ps.interview": InterviewDoc | null;
  /** The household's asks and takes (step 6; shared, lib/client/takes.ts). */
  "ps.household": Household | null;
  /** The comparison table's columns (VR6): History keys, in order; null until the table is first changed (all shown). */
  "ps.compare": string[] | null;
  /** The list's filters and sort (WF2b), remembered per browser. */
  "ps.library": LibraryView;
  /**
   * The parcels kept before they had names have taken theirs from their notes (owner, #133): done once per browser,
   * so a name cleared on purpose isn't filled again.
   */
  "ps.namesFromNotes": boolean;
  /** The Mark picker's Recent row (owner, after #136): the last kinds marked, newest first, per browser. */
  "ps.recentMarks": MarkChoice[];
  /** The other members' takes this profile has seen here (step 6b): per profile and device, never synced. */
  "ps.seenTakes": SeenTakes;
  /** When this profile last graded each parcel (step 8): History's order; synced with the profile. */
  "ps.history": HistoryLog;
  /** Step 13: Map layers' Area outlines, per device (off). */
  "ps.areas": boolean;
  /** Step 13: the areas this profile starred; their outlines stay on the map. */
  "ps.areaStars": string[];
  /** Step 14: Map layers' Power lines, per device (off). */
  "ps.power": boolean;
  /** Step 14c: Map layers' Lidar terrain, per device: off, Shaded relief, at 60%. */
  "ps.lidar": LidarPref;
  /** Step 14d: Map layers' Places and its six kinds, per device: off, every kind on. */
  "ps.places": PlacesPref;
  /** Step 16: Map layers' Public land, per device (off). */
  "ps.publicLand": boolean;
}

/** Step 14d: the Places layer's toggle and which kinds it shows. */
export interface PlacesPref {
  on: boolean;
  kinds: Record<PlaceKind, boolean>;
}

const ALL_PLACE_KINDS = Object.fromEntries(PLACE_KINDS.map((k) => [k, true])) as Record<PlaceKind, boolean>;

/** Step 14c: the lidar terrain layer's toggle, style and opacity (0.2–1). */
export interface LidarPref {
  on: boolean;
  style: "relief" | "slope";
  opacity: number;
}

const DEFAULTS: Prefs = {
  "ps.base": "state",
  "ps.view": null,
  // Off by default (owner, 13e-5 review); the prototype started dimmed.
  "ps.dim": false,
  "ps.lines": true,
  "ps.marks": true,
  "ps.roads": true,
  "ps.omode": "house",
  "ps.current": null,
  "ps.parcels": null,
  "ps.terrain": { on: false, exaggeration: 1.5 },
  "ps.hillshade": null,
  "ps.contours": null,
  "ps.overlays": ALL_OVERLAYS,
  "ps.tiltHint": false,
  "ps.rubricView": MINE,
  "ps.reportPreset": "one",
  "ps.rubrics": null,
  "ps.interview": null,
  "ps.household": null,
  "ps.compare": null,
  "ps.library": DEFAULT_VIEW,
  "ps.namesFromNotes": false,
  "ps.recentMarks": [],
  "ps.seenTakes": {},
  "ps.history": EMPTY_LOG,
  "ps.areas": false,
  "ps.areaStars": [],
  "ps.power": false,
  "ps.lidar": { on: false, style: "relief", opacity: 0.6 },
  "ps.places": { on: false, kinds: ALL_PLACE_KINDS },
  "ps.publicLand": false,
};

/** How each key is stored: the prototype kept flags as "1"/"0" and the rest as plain strings or JSON. */
const CODEC: { [K in keyof Prefs]: { read(raw: string): Prefs[K]; write(v: Prefs[K]): string } } = {
  "ps.base": { read: (r) => r, write: (v) => v },
  "ps.view": { read: (r) => JSON.parse(r) as MapView, write: (v) => JSON.stringify(v) },
  "ps.dim": { read: (r) => r !== "0", write: (v) => (v ? "1" : "0") },
  "ps.lines": { read: (r) => r !== "0", write: (v) => (v ? "1" : "0") },
  "ps.marks": { read: (r) => r !== "0", write: (v) => (v ? "1" : "0") },
  "ps.roads": { read: (r) => r !== "0", write: (v) => (v ? "1" : "0") },
  "ps.omode": { read: (r) => r as Prefs["ps.omode"], write: (v) => v },
  "ps.current": { read: readCurrentParcel, write: writeCurrentParcel },
  "ps.parcels": { read: readParcelStore, write: (v) => (v ? writeParcelStore(v) : "null") },
  "ps.terrain": { read: readTerrain, write: (v) => JSON.stringify(v) },
  "ps.hillshade": { read: (r) => r !== "0", write: (v) => (v ? "1" : "0") },
  "ps.contours": { read: (r) => r !== "0", write: (v) => (v ? "1" : "0") },
  "ps.tiltHint": { read: (r) => r === "1", write: (v) => (v ? "1" : "0") },
  "ps.rubricView": { read: (r) => r, write: (v) => v },
  "ps.reportPreset": { read: (r) => presetOf(r) ?? "one", write: (v) => v },
  "ps.rubrics": {
    read: (r) => {
      const parsed = ProfileRubricsSchema.safeParse(JSON.parse(r));
      return parsed.success ? parsed.data : null;
    },
    write: (v) => JSON.stringify(v),
  },
  "ps.household": { read: readHousehold, write: (v) => JSON.stringify(v) },
  "ps.interview": {
    read: (r) => {
      const parsed = InterviewDocSchema.safeParse(JSON.parse(r));
      return parsed.success ? parsed.data : null;
    },
    write: (v) => JSON.stringify(v),
  },
  "ps.compare": {
    read: (r) => {
      const v: unknown = JSON.parse(r);
      return Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : null;
    },
    write: (v) => JSON.stringify(v),
  },
  "ps.library": { read: readLibraryView, write: (v) => JSON.stringify(v) },
  "ps.namesFromNotes": { read: (r) => r === "1", write: (v) => (v ? "1" : "0") },
  "ps.recentMarks": { read: readRecent, write: (v) => JSON.stringify(v) },
  "ps.seenTakes": { read: readSeen, write: (v) => JSON.stringify(v) },
  "ps.history": { read: (r) => readHistoryLog(r) ?? EMPTY_LOG, write: (v) => JSON.stringify(v) },
  "ps.areas": { read: (r) => r === "1", write: (v) => (v ? "1" : "0") },
  "ps.power": { read: (r) => r === "1", write: (v) => (v ? "1" : "0") },
  "ps.lidar": { read: readLidar, write: (v) => JSON.stringify(v) },
  "ps.places": { read: readPlaces, write: (v) => JSON.stringify(v) },
  "ps.publicLand": { read: (r) => r === "1", write: (v) => (v ? "1" : "0") },
  "ps.areaStars": {
    read: (r) => {
      const v = JSON.parse(r) as unknown;
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    },
    write: (v) => JSON.stringify(v),
  },
  "ps.overlays": {
    // Unknown or missing keys read as their defaults: an overlay added later starts visible, and Every pin off.
    read: (r) => ({ ...ALL_OVERLAYS, ...(JSON.parse(r) as Partial<OverlayPrefs>) }),
    write: (v) => JSON.stringify(v),
  },
};

function readTerrain(raw: string): TerrainPref {
  const v = JSON.parse(raw) as Partial<TerrainPref>;
  const ex = v.exaggeration;
  return { on: v.on === true, exaggeration: ex === 1 || ex === 2 ? ex : 1.5 };
}

function readLidar(raw: string): LidarPref {
  const v = JSON.parse(raw) as Partial<LidarPref>;
  const o = typeof v.opacity === "number" && Number.isFinite(v.opacity) ? v.opacity : 0.6;
  return {
    on: v.on === true,
    style: v.style === "slope" ? "slope" : "relief",
    opacity: Math.min(1, Math.max(0.2, o)),
  };
}

function readPlaces(raw: string): PlacesPref {
  const v = JSON.parse(raw) as Partial<PlacesPref>;
  const kinds = { ...ALL_PLACE_KINDS };
  for (const k of PLACE_KINDS) if (v.kinds?.[k] === false) kinds[k] = false;
  return { on: v.on === true, kinds };
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

/**
 * Where a pref lives (step 1, PR 4): a profile-scoped key (the parcels, settings, views: lib/client/profileKv.ts
 * PROFILE_KEYS) in the current profile's documents, hydrated before the app renders; a device key in localStorage.
 */
function store(key: string): KeyValueStore | null {
  if (isSharedKey(key)) return sharedKv();
  if (isProfileKey(key)) return activeKv();
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function getPref<K extends keyof Prefs>(key: K, from: KeyValueStore | null = store(key)): Prefs[K] {
  try {
    const raw = from?.getItem(key);
    const value = raw == null ? DEFAULTS[key] : CODEC[key].read(raw);
    return key === "ps.parcels"
      ? (ranked(namesOnce(value as Prefs["ps.parcels"], from), from) as Prefs[K])
      : value;
  } catch {
    return DEFAULTS[key];
  }
}

/**
 * Once per browser (owner, #133), the first time the store is read: parcels kept before they had names take theirs
 * from their notes ("Name: …", lib/client/parcelStore.ts nameFromNotes), where their name is empty. Saved back with a
 * flag, so a name cleared on purpose later isn't filled again. Here, so it runs before any page reads the parcels.
 */
function namesOnce(s: ParcelStore | null, kv: KeyValueStore | null): ParcelStore | null {
  if (getPref("ps.namesFromNotes", kv)) return s;
  const next = s && withNamesFromNotes(s);
  if (next && next !== s) setPref("ps.parcels", next, kv);
  setPref("ps.namesFromNotes", true, kv);
  return next;
}

/**
 * Every History parcel ranked in My order (WF3; lib/client/myOrder.ts withRanks), on every read: one kept before WF3
 * goes to the bottom. Saved back when that changed anything.
 */
function ranked(s: ParcelStore | null, kv: KeyValueStore | null): ParcelStore | null {
  const next = s && withRanks(s);
  if (next && next !== s) setPref("ps.parcels", next, kv);
  return next;
}

export function setPref<K extends keyof Prefs>(
  key: K,
  value: Prefs[K],
  to: KeyValueStore | null = store(key),
): void {
  try {
    to?.setItem(key, CODEC[key].write(value));
  } catch {
    /* storage unavailable: the preference just doesn't persist */
  }
  if (key === "ps.parcels") {
    parcelWrites++;
    announceParcels(value as Prefs["ps.parcels"]);
  }
  // The asks and takes (step 6), and which takes I've seen (6b): heard by the list's badge, its rows and the parcel's
  // take, whether written here or arriving by a sync.
  if ((key === "ps.household" || key === "ps.seenTakes") && typeof window !== "undefined")
    queueMicrotask(() => window.dispatchEvent(new Event(HOUSEHOLD_WRITTEN)));
}

/** The window event after the household's asks and takes are written (step 6). */
export const HOUSEHOLD_WRITTEN = "ps:household";

let parcelWrites = 0;
/** How many times the parcels have been written on this page: a holder that read them can tell it missed one. */
export const parcelsWritten = (): number => parcelWrites;

/**
 * The parcels written, heard by whoever holds a copy (step 4b): the map stays mounted behind the other tabs, so Your
 * list's edits reach it, and a run that finishes behind a tab reaches the list. After the write, in a microtask, so a
 * write made while a page reads (the ranks and names above) doesn't set state in the middle of a render.
 */
const PARCELS_WRITTEN = "ps:parcels-written";

function announceParcels(value: Prefs["ps.parcels"]): void {
  if (typeof window === "undefined") return;
  queueMicrotask(() => window.dispatchEvent(new CustomEvent(PARCELS_WRITTEN, { detail: value })));
}

export function onParcelsWritten(l: (store: Prefs["ps.parcels"]) => void): () => void {
  const h = (e: Event) => l((e as CustomEvent<Prefs["ps.parcels"]>).detail);
  window.addEventListener(PARCELS_WRITTEN, h);
  return () => window.removeEventListener(PARCELS_WRITTEN, h);
}
