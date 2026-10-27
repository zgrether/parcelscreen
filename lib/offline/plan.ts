/**
 * What Save offline downloads for a parcel, and about how much it weighs (step 14e, docs/plans/step-14e-offline.md
 * §4.2). Pure: the layers come in as an argument (components/Map/offlineLayers.ts), so this doesn't reach into the
 * map's modules.
 *
 * The box is the parcel's bounds grown by a quarter mile. Each layer that allows saving gives every tile in the box at
 * its zooms (a state's aerial only where its bounds reach); parcel lines give each service's zoom-14 tiles at both
 * the map's details; places give the index and the cells within 0.6° of the parcel.
 */
import { tilesFor, type Detail } from "@/lib/geo/parcelTiles";
import type { Bounds } from "@/lib/geo/parcels";
import { growBox, tilesInBox, tileUrl, type LonLatBox } from "./tiles";

/** A quarter mile, in metres. */
export const SAVE_MARGIN_M = 402;
/** The places cells within this many degrees of the parcel's centre: about 60 km, the near step's reach. */
export const PLACES_REACH_DEG = 0.6;
/** A parcel-line tile from a service outside the parcel's state: an empty answer. */
const EMPTY_ANSWER_BYTES = 1024;

/** What a layer gives the planner (a slice of components/Map/offlineLayers.ts's OfflineLayer). */
export interface SaveLayer {
  id: string;
  template: string | null;
  save: { minZoom: number; maxZoom: number } | null;
  bounds: LonLatBox | null;
  typicalBytes: number;
}

/** One request Save offline makes. */
export type SaveItem =
  | { kind: "get"; layer: string; url: string; bytes: number }
  | {
      kind: "parcel";
      layer: "parcel-lines";
      serviceUrl: string;
      tile: { x: number; y: number; bounds: Bounds };
      detail: Detail;
      bytes: number;
    };

export interface SavePlan {
  box: LonLatBox;
  items: SaveItem[];
  /** About how many bytes: each item's layer's average on this device, else its typical size. */
  bytes: number;
}

export interface SaveInput {
  /** The parcel's own bounds. */
  parcel: LonLatBox;
  layers: readonly SaveLayer[];
  /** The parcel-line services the map asks, each with whether the parcel's state is its own. */
  parcelServices: readonly { url: string; inState: boolean }[];
  /** The places files: `/places/v1`, its folders, and the cells the index says exist (by folder). */
  places: { path: string; cells: Readonly<Record<string, readonly string[]>> } | null;
  /** This device's average bytes a tile, by layer, where it has some. */
  averages: Readonly<Record<string, number>>;
}

const overlaps = (a: LonLatBox, b: LonLatBox): boolean =>
  a.west <= b.east && b.west <= a.east && a.south <= b.north && b.south <= a.north;

export function planSave(input: SaveInput): SavePlan {
  const box = growBox(input.parcel, SAVE_MARGIN_M);
  const items: SaveItem[] = [];
  const size = (layer: SaveLayer | undefined, id: string): number =>
    input.averages[id] ?? layer?.typicalBytes ?? 0;

  for (const l of input.layers) {
    if (!l.template || !l.save || (l.bounds && !overlaps(l.bounds, box))) continue;
    for (let z = l.save.minZoom; z <= l.save.maxZoom; z++)
      for (const t of tilesInBox(box, z))
        items.push({ kind: "get", layer: l.id, url: tileUrl(l.template, t), bytes: size(l, l.id) });
  }

  const lines = input.layers.find((l) => l.id === "parcel-lines");
  for (const s of input.parcelServices)
    for (const tile of tilesFor(box))
      for (const detail of ["coarse", "fine"] as const)
        items.push({
          kind: "parcel",
          layer: "parcel-lines",
          serviceUrl: s.url,
          tile,
          detail,
          bytes: s.inState ? size(lines, "parcel-lines") : EMPTY_ANSWER_BYTES,
        });

  if (input.places) {
    const places = input.layers.find((l) => l.id === "places");
    const lat = (box.south + box.north) / 2;
    const lon = (box.west + box.east) / 2;
    const near = new Set<string>();
    for (let a = Math.floor(lat - PLACES_REACH_DEG); a <= Math.floor(lat + PLACES_REACH_DEG); a++)
      for (let o = Math.floor(lon - PLACES_REACH_DEG); o <= Math.floor(lon + PLACES_REACH_DEG); o++)
        near.add(`${a}_${o}`);
    items.push({
      kind: "get",
      layer: "places",
      url: `${input.places.path}/index.json`,
      bytes: size(places, "places"),
    });
    for (const [folder, cells] of Object.entries(input.places.cells))
      for (const c of cells)
        if (near.has(c))
          items.push({
            kind: "get",
            layer: "places",
            url: `${input.places.path}/${folder}/${c}.json`,
            bytes: size(places, "places"),
          });
  }

  return { box, items, bytes: items.reduce((n, i) => n + i.bytes, 0) };
}

/** "About 25 MB": rounded up to 5 MB, never less than 5. */
export function aboutMb(bytes: number): number {
  const mb = bytes / (1024 * 1024);
  return Math.max(5, Math.ceil(mb / 5) * 5);
}
