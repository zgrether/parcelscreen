/** The Terrain section (proto L1461–1472). */
import { compass, fmt } from "../format";
import type { PartialScreenResult } from "../screen/types";
import type { FactRow } from "./facts";
import { onMap, said, type Heading, type Part } from "./parts";

export const terrainHeading: Heading = { title: "Terrain", slug: "terrain", help: "h-terrain" };

/** The suitability overlay's colours (proto L1470). */
export const TERRAIN_LEGEND = [
  { label: "house site", swatch: "#14502d" },
  { label: "shelf", swatch: "#467896" },
  { label: "garden patch", swatch: "#0a7870" },
  { label: "suitability low→high", swatch: "linear-gradient(90deg,#c83c3c,#b4b43c,#288c28)" },
] as const;

export interface TerrainView {
  rows: FactRow[];
  /** "Of N ac: … Cycle the overlay button on the map … DEM: … at 3.0 m." */
  diag: Part[];
}

/** Null until the terrain step has run. */
export function terrainView(r: PartialScreenResult): TerrainView | null {
  const t = r.terrain;
  if (!t) return null;
  const { houseMin, shelfMin, gardenMin } = r.params;
  const benches = r.benches ?? [];
  const b = benches[0];
  const rows: FactRow[] = [
    {
      label: "Elevation",
      value: `${fmt(t.elevMinFt)}–${fmt(t.elevMaxFt)} ft (mean ${fmt(t.elevMeanFt)})`,
      ...(r.demSource && r.demSource !== "USGS 3DEP"
        ? { note: `from ${r.demSource} — USGS 3DEP was unavailable` }
        : {}),
    },
    { label: "Relief across the parcel", value: `${fmt(t.reliefFt)} ft` },
    {
      label: "Height above local valley floor",
      value: `${fmt(t.heightAboveValleyFt)} ft (floor ${fmt(t.valleyFloorFt)} ft)`,
    },
    { label: "Slope, median / 90th pct", value: `${fmt(t.slopeMedDeg, 1)}° / ${fmt(t.slopeP90Deg, 1)}°` },
    { label: "Acres under 15% grade", value: `${fmt(t.acresUnder15, 1)} of ${fmt(r.acres, 1)}` },
    { label: "Acres over 25% grade", value: fmt(t.acresOver25, 1) },
    {
      label: "House sites found",
      value: `${benches.length} (${fmt(
        benches.reduce((a, x) => a + x.acres, 0),
        2,
      )} ac) · shelves ${r.shelves?.length ?? 0} · garden patches ${r.gardens?.length ?? 0}`,
    },
  ];
  if (b)
    rows.push({
      // "(relaxed)": nothing reached the house threshold, so the run lowered it (houseMinUsed).
      label: `Largest house site${(r.houseMinUsed ?? houseMin) < houseMin ? " (relaxed)" : ""}`,
      value: `${fmt(b.acres, 2)} ac at ${fmt(b.elevFt)} ft, faces ${compass(b.aspectDeg)}, ${fmt(b.slopeDeg, 1)}° slope, cell score ${fmt(b.score)}`,
    });
  if (r.road)
    rows.push({
      label: "Nearest road to bench",
      value: `${r.road.name}: ${r.road.riseFt >= 0 ? "climb" : "drop"} ${fmt(Math.abs(r.road.riseFt))} ft over ${fmt(r.road.runFt)} ft (${fmt(r.road.gradePct)}% straight-line)`,
    });
  const d = t.diag;
  return {
    rows,
    diag: [
      said(
        `Of ${fmt(d.totalAc, 1)} ac: ${fmt(d.houseAc, 1)} ac score ≥${houseMin} for a house, ${fmt(d.shelfAc, 1)} ac more ≥${shelfMin} (shelf grade), ${fmt(d.gardenAc, 1)} ac ≥${gardenMin} for a garden.`,
      ),
      onMap(" Cycle the overlay button on the map to see each surface."),
      said(` DEM: ${r.demSource ?? ""} at ${fmt(r.demResM ?? NaN, 1)} m.`),
    ],
  };
}
