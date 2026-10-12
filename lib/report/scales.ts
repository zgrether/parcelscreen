/**
 * The panels' banded scales (value-ranking.md §6.2 (b); VR5 part 2): a scale in everyday words, with this parcel's
 * band marked and its value beside the marker. Band edges are config (`SCREEN_CONSTANTS.bands`, and the card's own
 * cutoffs for Room to build); the words are here. "What it means for you" (c) comes next. Pure: the rulebook (VR7)
 * reuses it.
 */
import { compass, fmt } from "../format";
import { SCREEN_CONSTANTS } from "../screen/config";
import type { PartialScreenResult } from "../screen/types";
import { buildSite, footprintFt2, type Card, type Letter } from "./card";
import type { PanelKey } from "./cardPanels";
import { M2FT, M2_PER_ACRE } from "../screen/util";

/** Each scale's key, for the sentences that go with its bands (lib/report/meanings.ts). */
export const SCALE_IDS = {
  "Winter sun": "winterSun",
  Facing: "facing",
  "Frost belt": "frost",
  "Slope as foundation": "slope",
  Driveway: "driveway",
  Elevation: "elevation",
  Sky: "sky",
  "Room to build": "room",
  Trails: "trails",
  "Town and hospital": "town",
  Garden: "garden",
} as const;
export type ScaleName = keyof typeof SCALE_IDS;
export type ScaleId = (typeof SCALE_IDS)[ScaleName];

export interface Scale {
  id: ScaleId;
  name: ScaleName;
  bands: string[];
  /** This parcel's band, or null when there's nothing to place on the scale. */
  at: number | null;
  /** The value at the marker: "8.3 h", "faces SSE". */
  value: string;
  /** A small note under the marker: the driveway's raw-ground reading when it's built to less (owner, #111). */
  note?: string;
}

type Bands = typeof SCREEN_CONSTANTS.bands;
const FT2_PER_ACRE = M2_PER_ACRE * M2FT * M2FT;

/** The band `v` falls in, given each band's lower edge after the first. */
const bandOf = (v: number, edges: readonly number[]): number => edges.filter((e) => v >= e).length;
/** The same, for bands that include their upper edge (§6.2's driveway: "Easy ≤ 8%"). */
const bandUpTo = (v: number, edges: readonly number[]): number => edges.filter((e) => v > e).length;

/**
 * The grade the scored driveway is built to (owner, #111): the limit it was routed to (the "no practical drive"
 * alternative's, when it's scored on that), or the ground's own reading over 30 m where that's gentler. The raw
 * reading stays in the panel's detail.
 */
export function drivewayDesign(r: PartialScreenResult): { designPct: number; rawPct: number } | null {
  const d = r.driveway;
  const route = d && (d.overLimit ?? d.routes[0]);
  if (!route) return null;
  const limitPct = d.practical?.scoredOn === "steeper" ? d.practical.steeperPct : route.maxGrade * 100;
  const rawPct = route.metrics.maxGradePct;
  return { designPct: Math.min(rawPct, limitPct), rawPct };
}

/** A no-break space, and a word joiner either side of a range's dash: a label never wraps inside "3–5 h". */
const NBSP = "\u00a0";
const range = (a: string, b: string) => `${a}\u2060–\u2060${b}`;

/**
 * Band labels with their edges from config: "Shaded under 3 h", "Workable 3–5 h", …, "Excellent 7+ h". A unit
 * stays with its number (owner, #111).
 */
function ranged(
  words: readonly string[],
  edges: readonly number[],
  unit: string,
  f = (v: number) => fmt(v),
  first = "under",
): string[] {
  unit = unit.replace(/^ /, NBSP);
  return words.map((w, i) =>
    i === 0
      ? `${w} ${first} ${f(edges[0]!)}${unit}`
      : i === words.length - 1
        ? `${w} ${f(edges[i - 1]!)}${unit.startsWith(NBSP) ? `+${unit}` : `${unit}+`}`
        : `${w} ${range(f(edges[i - 1]!), f(edges[i]!))}${unit}`,
  );
}

const scale = (name: ScaleName, bands: string[], at: number | null, value: string): Scale => ({
  id: SCALE_IDS[name],
  name,
  bands,
  at,
  value,
});

/** Ideal S–SE, Fine either side of it, Cool east or west, else north-facing (§6.2). */
function facingBand(aspectDeg: number, B: Bands): number {
  const within = ([a, b]: readonly number[]) => aspectDeg >= a! && aspectDeg <= b!;
  return within(B.facingDeg.ideal) ? 0 : within(B.facingDeg.fine) ? 1 : within(B.facingDeg.cool) ? 2 : 3;
}

/** Trails and Town are graded on two measures each, so their scales place the row's grade. */
const byGrade = (g: Letter | null): number | null =>
  g === null ? null : g === "A" ? 0 : g === "B" ? 1 : g === "C" ? 2 : 3;

export function scalesFor(
  panel: PanelKey,
  r: PartialScreenResult,
  card: Card,
  B: Bands = SCREEN_CONSTANTS.bands,
): Scale[] {
  const site = r.sites?.[0];
  const row = (k: string) => card.rows.find((x) => x.key === k);
  switch (panel) {
    case "homesite": {
      if (!site) return [];
      const floor = r.terrain?.valleyFloorFt;
      const above = floor === undefined ? null : site.elevFt - floor;
      return [
        scale(
          "Winter sun",
          ranged(["Shaded", "Workable", "Good", "Excellent"], B.winterSunH, " h"),
          bandOf(site.sunH, B.winterSunH),
          `${fmt(site.sunH, 1)} h`,
        ),
        scale(
          "Facing",
          ["Ideal S–SE", "Fine", "Cool", "North-facing"],
          facingBand(site.aspectDeg, B),
          `faces ${compass(site.aspectDeg)}`,
        ),
        scale(
          "Frost belt",
          [
            "Pocket",
            `Thermal belt ${range(fmt(B.frostAboveFloorFt[0]!), fmt(B.frostAboveFloorFt[1]!))}${NBSP}ft`,
            "Exposed",
            "Windy",
          ],
          above === null ? null : bandOf(above, B.frostAboveFloorFt),
          above === null ? "" : `${fmt(above)} ft above the valley floor`,
        ),
        scale(
          "Slope as foundation",
          ranged(["Slab or crawl", "Walkout", "Cut-fill and walls", "Engineered piers"], B.slopeDeg, "°"),
          bandOf(site.slopeDeg, B.slopeDeg),
          `${fmt(site.slopeDeg, 1)}°`,
        ),
      ];
    }
    case "easement": {
      const g = drivewayDesign(r);
      if (!g) return [];
      const built = g.designPct < g.rawPct;
      const sc = scale(
        "Driveway",
        ranged(
          ["Easy", "Good gravel", "Pave or regrade", "Ice, washouts, fire access"],
          B.drivewayPct,
          "%",
          undefined,
          "up to",
        ),
        bandUpTo(g.designPct, B.drivewayPct),
        built ? `built to ${fmt(g.designPct)}%` : `${fmt(g.rawPct, 1)}% over 30 m`,
      );
      return [
        built
          ? {
              ...sc,
              note: `${fmt(g.rawPct, 1)}% on the raw ground over 30 m; a built road grades out 1–4 points.`,
            }
          : sc,
      ];
    }
    case "elevation": {
      const s = buildSite(r);
      if (!s || s.elevFt === null) return [];
      return [
        scale(
          "Elevation",
          ranged(["Valley", "Foothill", "Mountain", "High"], B.elevationFt, " ft"),
          bandOf(s.elevFt, B.elevationFt),
          `${fmt(s.elevFt)} ft`,
        ),
      ];
    }
    case "sky":
      return r.sky
        ? [
            scale(
              "Sky",
              ["Town glow", "Rural", "Dark"],
              bandOf(r.sky.mag, B.skyMag),
              `${fmt(r.sky.mag, 2)} mag/arcsec²`,
            ),
          ]
        : [];
    case "room": {
      if (!r.terrain) return [];
      const x = r.terrain.acresUnder15 / (footprintFt2() / FT2_PER_ACRE);
      // The card's own cutoffs, from Doesn't fit up (§6.2: the row's multiples, no acre bands).
      const edges = [...SCREEN_CONSTANTS.card.rows.roomX].reverse();
      return [
        scale(
          "Room to build",
          ["Doesn't fit", ...ranged(["Tight", "Enough", "Roomy", "Spacious"], edges.slice(1), "×", String)],
          bandOf(x, edges),
          `${fmt(x, x < 10 ? 1 : 0)}×`,
        ),
      ];
    }
    case "trails": {
      const g = row("trails")?.grade ?? null;
      return [scale("Trails", ["At the edge", "A short drive", "A drive", "Far"], byGrade(g), g ?? "")];
    }
    case "town": {
      const g = row("town")?.grade ?? null;
      return [scale("Town and hospital", ["Close", "Practical", "A haul", "Remote"], byGrade(g), g ?? "")];
    }
    case "garden": {
      if (!r.gardens) return [];
      const largest = r.gardens.length ? Math.max(...r.gardens.map((g) => g.acres)) : 0;
      return [
        scale(
          "Garden",
          ["None", "Kitchen garden", "Market garden", "Small farm"],
          r.gardens.length ? bandOf(largest, B.gardenAc.slice(1)) + 1 : 0,
          r.gardens.length ? `${fmt(largest, 2)} ac` : "no garden",
        ),
      ];
    }
    default:
      return [];
  }
}
