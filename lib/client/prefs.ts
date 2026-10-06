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
}

export interface Prefs {
  "ps.base": string;
  "ps.view": MapView | null;
  "ps.dim": boolean;
  "ps.lines": boolean;
  "ps.omode": "house" | "garden" | "slope" | "off";
  "ps.sheet": number | null;
  "ps.open": Record<string, boolean>;
  /** New in the port (step 13d): the parcel being worked on and the house, kept across a refresh. */
  "ps.current": CurrentParcel | null;
  /** Step 13e: the open parcel and History. Replaces ps.current, which converts on first read. */
  "ps.parcels": ParcelStore | null;
  /** Step 13e-5: the Info panel's tab, so it reopens on the last one used. */
  "ps.infoTab": "layers" | "notes";
}

const DEFAULTS: Prefs = {
  "ps.base": "state",
  "ps.view": null,
  "ps.dim": true,
  "ps.lines": true,
  "ps.omode": "house",
  "ps.sheet": null,
  "ps.open": {},
  "ps.current": null,
  "ps.parcels": null,
  "ps.infoTab": "layers",
};

/** How each key is stored: the prototype kept flags as "1"/"0" and the rest as plain strings or JSON. */
const CODEC: { [K in keyof Prefs]: { read(raw: string): Prefs[K]; write(v: Prefs[K]): string } } = {
  "ps.base": { read: (r) => r, write: (v) => v },
  "ps.view": { read: (r) => JSON.parse(r) as MapView, write: (v) => JSON.stringify(v) },
  "ps.dim": { read: (r) => r !== "0", write: (v) => (v ? "1" : "0") },
  "ps.lines": { read: (r) => r !== "0", write: (v) => (v ? "1" : "0") },
  "ps.omode": { read: (r) => r as Prefs["ps.omode"], write: (v) => v },
  "ps.sheet": { read: (r) => +r || null, write: (v) => String(Math.round(v ?? 0)) },
  "ps.open": { read: (r) => JSON.parse(r) as Record<string, boolean>, write: (v) => JSON.stringify(v) },
  "ps.current": { read: readCurrentParcel, write: writeCurrentParcel },
  "ps.parcels": { read: readParcelStore, write: (v) => (v ? writeParcelStore(v) : "null") },
  "ps.infoTab": { read: (r) => (r === "notes" ? "notes" : "layers"), write: (v) => v },
};

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
