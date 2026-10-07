/**
 * Per-browser UI preferences in localStorage, under the prototype's keys. Storage can be missing or throw
 * (private windows, blocked site data), so every read falls back to the default and every write is
 * best-effort.
 */
import { readCurrentParcel, writeCurrentParcel, type CurrentParcel } from "./currentParcel";
import { readParcelStore, writeParcelStore, type ParcelStore } from "./parcelStore";

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
  fan: boolean;
  soils: boolean;
  trailheads: boolean;
  driveway: boolean;
}
const ALL_OVERLAYS: OverlayPrefs = { pins: true, fan: true, soils: true, trailheads: true, driveway: true };

export interface TerrainPref {
  on: boolean;
  exaggeration: 1 | 1.5 | 2;
}

export interface Prefs {
  "ps.base": string;
  "ps.view": MapView | null;
  "ps.dim": boolean;
  "ps.lines": boolean;
  "ps.omode": "house" | "garden" | "slope" | "off";
  "ps.open": Record<string, boolean>;
  /** New in the port (step 13d): the parcel being worked on and the house, kept across a refresh. */
  "ps.current": CurrentParcel | null;
  /** Step 13e: the open parcel and History. Replaces ps.current, which converts on first read. */
  "ps.parcels": ParcelStore | null;
  /** Step 13e-5: the Info panel's tab, so it reopens on the last one used. */
  "ps.infoTab": "layers" | "notes";
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
}

const DEFAULTS: Prefs = {
  "ps.base": "state",
  "ps.view": null,
  // Off by default (owner, 13e-5 review); the prototype started dimmed.
  "ps.dim": false,
  "ps.lines": true,
  "ps.omode": "house",
  "ps.open": {},
  "ps.current": null,
  "ps.parcels": null,
  "ps.infoTab": "layers",
  "ps.terrain": { on: false, exaggeration: 1.5 },
  "ps.hillshade": null,
  "ps.contours": null,
  "ps.overlays": ALL_OVERLAYS,
};

/** How each key is stored: the prototype kept flags as "1"/"0" and the rest as plain strings or JSON. */
const CODEC: { [K in keyof Prefs]: { read(raw: string): Prefs[K]; write(v: Prefs[K]): string } } = {
  "ps.base": { read: (r) => r, write: (v) => v },
  "ps.view": { read: (r) => JSON.parse(r) as MapView, write: (v) => JSON.stringify(v) },
  "ps.dim": { read: (r) => r !== "0", write: (v) => (v ? "1" : "0") },
  "ps.lines": { read: (r) => r !== "0", write: (v) => (v ? "1" : "0") },
  "ps.omode": { read: (r) => r as Prefs["ps.omode"], write: (v) => v },
  "ps.open": { read: (r) => JSON.parse(r) as Record<string, boolean>, write: (v) => JSON.stringify(v) },
  "ps.current": { read: readCurrentParcel, write: writeCurrentParcel },
  "ps.parcels": { read: readParcelStore, write: (v) => (v ? writeParcelStore(v) : "null") },
  "ps.infoTab": { read: (r) => (r === "notes" ? "notes" : "layers"), write: (v) => v },
  "ps.terrain": { read: readTerrain, write: (v) => JSON.stringify(v) },
  "ps.hillshade": { read: (r) => r !== "0", write: (v) => (v ? "1" : "0") },
  "ps.contours": { read: (r) => r !== "0", write: (v) => (v ? "1" : "0") },
  "ps.overlays": {
    // Unknown or missing keys read as shown, so an overlay added later starts visible.
    read: (r) => ({ ...ALL_OVERLAYS, ...(JSON.parse(r) as Partial<OverlayPrefs>) }),
    write: (v) => JSON.stringify(v),
  },
};

function readTerrain(raw: string): TerrainPref {
  const v = JSON.parse(raw) as Partial<TerrainPref>;
  const ex = v.exaggeration;
  return { on: v.on === true, exaggeration: ex === 1 || ex === 2 ? ex : 1.5 };
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function store(): KeyValueStore | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function getPref<K extends keyof Prefs>(key: K, from: KeyValueStore | null = store()): Prefs[K] {
  try {
    const raw = from?.getItem(key);
    return raw == null ? DEFAULTS[key] : CODEC[key].read(raw);
  } catch {
    return DEFAULTS[key];
  }
}

export function setPref<K extends keyof Prefs>(
  key: K,
  value: Prefs[K],
  to: KeyValueStore | null = store(),
): void {
  try {
    to?.setItem(key, CODEC[key].write(value));
  } catch {
    /* storage unavailable: the preference just doesn't persist */
  }
}
