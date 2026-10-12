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
import { septicClass, soilUnder, type SepticClass } from "./derived";

const SEPTIC_CLASSES: readonly SepticClass[] = ["Conventional", "Modified", "Alternative"];

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
  Septic: "septic",
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
  /**
   * Where the row's grades start along the scale (#118 review: Elevation's C sits inside Foothill): `at` in bands, 0 at
   * the scale's left end, 1 at the first edge, 1.5 halfway across the second band.
   */
  marks?: { at: number; label: string }[];
}

/** A slope in degrees as a grade, and a grade as degrees (display only; scoring reads one or the other). */
const RAD = Math.PI / 180;
export const degToPct = (deg: number): number => Math.tan(deg * RAD) * 100;
export const pctToDeg = (pct: number): number => Math.atan(pct / 100) / RAD;

/** Where `v` sits along a scale with these edges, in bands (Scale.marks). */
function positionOf(v: number, edges: readonly number[]): number {
  const b = edges.filter((e) => v >= e).length;
  const lower = edges[b - 1],
    upper = edges[b];
  if (lower === undefined) return upper === undefined ? 0 : Math.max(0, 1 - (upper - v) / upper);
  return upper === undefined ? b : b + (v - lower) / (upper - lower);
}

/** The Elevation scale's grade marks: each grade's lower edge from the card's cutoffs (A, B, C, D). */
export function elevationMarks(
  B: Bands = SCREEN_CONSTANTS.bands,
  cutoffs: readonly number[] = SCREEN_CONSTANTS.card.rows.elevationFt,
): { at: number; label: string }[] {
  return cutoffs.map((v, i) => ({
    at: positionOf(v, B.elevationFt),
    label: `${"ABCD"[i]} ${fmt(v)}${NBSP}ft`,
  }));
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

/** Band labels in two units: "Walkout 4–10° (7–18%)", "Engineered piers 16°+ (29%+)". */
function dualRanged(
  words: readonly string[],
  edges: readonly number[],
  a: (v: number) => string,
  aUnit: string,
  b: (v: number) => string,
  bUnit: string,
  first = "under",
): string[] {
  return words.map((w, i) => {
    if (i === 0) return `${w} ${first} ${a(edges[0]!)}${aUnit} (${b(edges[0]!)}${bUnit})`;
    const lo = edges[i - 1]!;
    if (i === words.length - 1) return `${w} ${a(lo)}${aUnit}+ (${b(lo)}${bUnit}+)`;
    const hi = edges[i]!;
    return `${w} ${range(a(lo), a(hi))}${aUnit} (${range(b(lo), b(hi))}${bUnit})`;
  });
}

/** The rulebook's fuller labels (scaleBands' `detail`), or null where the short ones already carry the numbers. */
function detailed(name: ScaleName, B: Bands, target: number): string[] | null {
  const deg = (v: number) => fmt(v),
    pct = (v: number) => fmt(v);
  switch (name) {
    case "Slope as foundation":
      return dualRanged(
        ["Slab or crawl", "Walkout", "Cut-fill and walls", "Engineered piers"],
        B.slopeDeg,
        deg,
        "°",
        (v) => fmt(degToPct(v)),
        "%",
      );
    case "Driveway":
      return dualRanged(
        ["Easy", "Good gravel", "Pave or regrade", "Ice, washouts, fire access"],
        B.drivewayPct,
        pct,
        "%",
        (v) => fmt(pctToDeg(v), 1),
        "°",
        "up to",
      );
    case "Facing": {
      // Degrees off the target the site's facing is scored from: lower bearings are east of it, higher west.
      const off = ([lo, hi]: readonly number[]) => {
        const east = target - lo!,
          west = hi! - target;
        return east === west
          ? `within ${fmt(east)}° of ${fmt(target)}°`
          : `to ${fmt(east)}° east or ${fmt(west)}° west of ${fmt(target)}°`;
      };
      return [
        `Ideal S–SE: ${off(B.facingDeg.ideal)}`,
        `Fine: ${off(B.facingDeg.fine)}`,
        `Cool: ${off(B.facingDeg.cool)}`,
        "North-facing: beyond that",
      ];
    }
    case "Frost belt":
      return ranged(
        ["Pocket", "Thermal belt", "Exposed", "Windy"],
        B.frostAboveFloorFt,
        " ft above the valley floor",
      );
    case "Sky":
      return ranged(["Town glow", "Rural", "Dark"], B.skyMag, " mag/arcsec²", (v) => fmt(v, 1));
    default:
      return null;
  }
}

/**
 * Each scale's bands in words, with their edges from config, without a parcel (the rulebook, VR7). The panels'
 * scales use the same labels.
 */
export function scaleBands(
  name: ScaleName,
  B: Bands = SCREEN_CONSTANTS.bands,
  roomX = SCREEN_CONSTANTS.card.rows.roomX,
  /**
   * The rulebook's fuller labels (#118 review): the numbers each band's scoring uses where the short labels have none
   * (Facing in degrees off the target, Frost in feet above the valley floor, Sky in mag/arcsec²), and slopes in both
   * degrees and percent. The report's panels keep the short labels.
   */
  detail?: { aspectTargetDeg: number },
): string[] {
  if (detail) {
    const d = detailed(name, B, detail.aspectTargetDeg);
    if (d) return d;
  }
  switch (name) {
    case "Winter sun":
      return ranged(["Shaded", "Workable", "Good", "Excellent"], B.winterSunH, " h");
    case "Facing":
      return ["Ideal S–SE", "Fine", "Cool", "North-facing"];
    case "Frost belt":
      return [
        "Pocket",
        `Thermal belt ${range(fmt(B.frostAboveFloorFt[0]!), fmt(B.frostAboveFloorFt[1]!))}${NBSP}ft`,
        "Exposed",
        "Windy",
      ];
    case "Slope as foundation":
      return ranged(["Slab or crawl", "Walkout", "Cut-fill and walls", "Engineered piers"], B.slopeDeg, "°");
    case "Driveway":
      return ranged(
        ["Easy", "Good gravel", "Pave or regrade", "Ice, washouts, fire access"],
        B.drivewayPct,
        "%",
        undefined,
        "up to",
      );
    case "Elevation":
      return ranged(["Valley", "Foothill", "Mountain", "High"], B.elevationFt, " ft");
    case "Sky":
      return ["Town glow", "Rural", "Dark"];
    case "Room to build": {
      // The card's own cutoffs, from Doesn't fit up (§6.2: the row's multiples, no acre bands).
      const edges = [...roomX].reverse();
      return [
        "Doesn't fit",
        ...ranged(["Tight", "Enough", "Roomy", "Spacious"], edges.slice(1), "×", String),
      ];
    }
    case "Trails":
      return ["At the edge", "A short drive", "A drive", "Far"];
    case "Town and hospital":
      return ["Close", "Practical", "A haul", "Remote"];
    case "Garden":
      return ["None", "Kitchen garden", "Market garden", "Small farm"];
    case "Septic":
      return [...SEPTIC_CLASSES];
  }
}

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
          scaleBands("Winter sun", B),
          bandOf(site.sunH, B.winterSunH),
          `${fmt(site.sunH, 1)} h`,
        ),
        scale(
          "Facing",
          scaleBands("Facing", B),
          facingBand(site.aspectDeg, B),
          `faces ${compass(site.aspectDeg)}`,
        ),
        scale(
          "Frost belt",
          scaleBands("Frost belt", B),
          above === null ? null : bandOf(above, B.frostAboveFloorFt),
          above === null ? "" : `${fmt(above)} ft above the valley floor`,
        ),
        scale(
          "Slope as foundation",
          scaleBands("Slope as foundation", B),
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
        scaleBands("Driveway", B),
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
        {
          ...scale(
            "Elevation",
            scaleBands("Elevation", B),
            bandOf(s.elevFt, B.elevationFt),
            `${fmt(s.elevFt)} ft`,
          ),
          // Where each grade starts (#118 review): C's 2,000 ft is inside Foothill.
          marks: elevationMarks(B),
        },
      ];
    }
    case "sky":
      return r.sky
        ? [
            scale(
              "Sky",
              scaleBands("Sky", B),
              bandOf(r.sky.mag, B.skyMag),
              `${fmt(r.sky.mag, 2)} mag/arcsec²`,
            ),
          ]
        : [];
    case "room": {
      // Site #1's gentle ground near the house (v4), over the whole footprint: the row's own measure.
      const s = r.sites?.[0];
      if (!s) return [];
      const x = s.fit === "fits" ? s.gentleNearAc / (footprintFt2() / FT2_PER_ACRE) : 0;
      const edges = [...SCREEN_CONSTANTS.card.rows.roomX].reverse();
      return [
        scale(
          "Room to build",
          scaleBands("Room to build", B),
          bandOf(x, edges),
          `${fmt(x, x < 10 ? 1 : 0)}×`,
        ),
      ];
    }
    case "septic": {
      // Site #1's own soil (§5.3); the gate is the parcel-wide rule.
      const soil = site ? soilUnder(r, site.ll) : null;
      const cls = soil ? septicClass(soil) : null;
      if (!soil || !cls) return [];
      const sc = scale(
        "Septic",
        scaleBands("Septic", B),
        SEPTIC_CLASSES.indexOf(cls),
        `${soil.compname}: ${(soil.septic || soil.engstafdcd || "").toLowerCase()}`,
      );
      // Reconciles the class with the original reading, which says "alternative" for any very limited soil (owner,
      // #114): a modified system may work, but budget for an alternative until the soil evaluation.
      if (cls !== "Modified") return [sc];
      const rock =
        soil.brockdepmin != null && soil.brockdepmin !== ""
          ? ` with rock at ${fmt(+soil.brockdepmin)} cm`
          : "";
      return [
        {
          ...sc,
          note: `NRCS rates this soil very limited;${rock ? `${rock},` : ""} a modified system (shallow-placed or low-pressure) may work. Budget for an alternative system until a soil evaluation on the spot says otherwise.`,
        },
      ];
    }
    case "trails": {
      const g = row("trails")?.grade ?? null;
      return [scale("Trails", scaleBands("Trails", B), byGrade(g), g ?? "")];
    }
    case "town": {
      const g = row("town")?.grade ?? null;
      return [scale("Town and hospital", scaleBands("Town and hospital", B), byGrade(g), g ?? "")];
    }
    case "garden": {
      if (!r.gardens) return [];
      const largest = r.gardens.length ? Math.max(...r.gardens.map((g) => g.acres)) : 0;
      return [
        scale(
          "Garden",
          scaleBands("Garden", B),
          r.gardens.length ? bandOf(largest, B.gardenAc.slice(1)) + 1 : 0,
          r.gardens.length ? `${fmt(largest, 2)} ac` : "no garden",
        ),
      ];
    }
    default:
      return [];
  }
}
