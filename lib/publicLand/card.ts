/**
 * Map layers › Public land's words and its tap card (roadmap step 16, docs/plans/step-16-public-lands.md §4, §8): every
 * unit under the tap, largest first, duplicates of one name merged (the record with a known manager wins), up to three.
 * The manager and designation are named as the report names them (lib/report/surroundings.ts). Pure.
 */
import { buffer, booleanIntersects } from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { designationName, managerName } from "../report/surroundings";
import { SCREEN_CONSTANTS } from "../screen/config";
import { accessOf, categoryOf, type Access, type Category } from "./classify";
import type { PadusUnit } from "./source";

export const PUBLIC_LAND_WORDS = {
  toggle: "Public land",
  legend: {
    forest: "National forest",
    park: "National park (and the Blue Ridge Parkway)",
    state: "State parks and forests",
    game: "State game lands and WMAs",
    other: "Other public or conserved land",
    easement: "Conservation easement (private land)",
  } satisfies Record<Category, string>,
  accessHeading: "Public access",
  access: { solid: "Open", hatched: "Restricted or not recorded", outline: "Closed" },
  info: "Who manages the land and whether it's open, from USGS PAD-US 4.1: the same data the grade's public land uses. Access can lag; check with the manager.",
  zoomIn: "Zoom in to see public land",
  failed: "Some public land didn't load",
  attribution: "Public land: USGS PAD-US 4.1",
  adjoins: "Adjoins this parcel",
  noManager: "Manager not recorded",
  easement: "Private land under a conservation easement; no public access unless stated",
  heldBy: (holder: string) => `Held by ${holder}`,
  sourceDate: (date: string) => `PAD-US source date: ${date}`,
  more: (n: number) => `and ${n} more`,
  overlap: (n: number) => `${n} records overlap here, each with its own access:`,
  caveat: "USGS PAD-US 4.1. Boundaries and access can lag; check with the manager.",
} as const;

const ACCESS_LINE: Record<Access, string> = {
  open: "Open to the public",
  restricted: "Restricted access (permit or season)",
  closed: "Closed to the public",
  unknown: "Public access not recorded",
};

/** Units shown in one card before "and n more". */
export const CARD_MAX = 3;

export interface CardUnit {
  name: string;
  /** "U.S. Forest Service", a local manager's name, or "Manager not recorded". */
  manager: string;
  /** The access line, or for an easement its holder. */
  access: string;
  designation: string;
  sourceDate: string | null;
  adjoins: boolean;
  easement: boolean;
}

export interface Card {
  units: CardUnit[];
  more: number;
}

/** "2024/10/06" as "2024-10-06". */
const isoDate = (d: string | null | undefined): string | null => {
  const m = d?.trim().match(/^(\d{4})[/-](\d{2})[/-](\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

/** A federal unit by its agency; anyone else by PAD-US's local manager name when it has one, else its agency. */
function managerOf(u: PadusUnit): string {
  const local = u.Mang_Type !== "FED" ? u.Loc_Mang?.trim() : "";
  const name = managerName(local || u.Mang_Name);
  return name === "manager unknown" ? PUBLIC_LAND_WORDS.noManager : name;
}

const known = (u: PadusUnit) => !!u.Mang_Name && u.Mang_Name !== "UNK";

/** Whether a unit is within the engine's adjoining distance (20 m) of the open parcel. */
export function adjoinsParcel(
  unit: Feature<Polygon | MultiPolygon>,
  parcel: Feature<Polygon | MultiPolygon>,
): boolean {
  const grown = buffer(parcel, SCREEN_CONSTANTS.padus.adjoinsBufferKm, { units: "kilometers" });
  return !!grown && booleanIntersects(grown, unit);
}

/**
 * The card for the units under a tap. `features` are the units' whole outlines (the layer's own, not the map's tiled
 * copies); `parcel` is the open parcel, if any.
 */
export function publicLandCard(
  features: readonly Feature<Polygon | MultiPolygon, PadusUnit>[],
  parcel: Feature<Polygon | MultiPolygon> | null,
): Card {
  const byName = new Map<string, Feature<Polygon | MultiPolygon, PadusUnit>[]>();
  for (const f of features) {
    const key = `${f.properties.Unit_Nm ?? ""}|${f.properties.FeatClass ?? ""}`;
    byName.set(key, [...(byName.get(key) ?? []), f]);
  }
  const merged = [...byName.values()].map((group) => {
    const best = group.find((f) => known(f.properties)) ?? group[0]!;
    const acres = Math.max(...group.map((f) => f.properties.GIS_Acres ?? 0));
    return { best, group, acres };
  });
  merged.sort((a, b) => b.acres - a.acres);
  const units = merged.slice(0, CARD_MAX).map(({ best, group }): CardUnit => {
    const u = best.properties;
    const easement = categoryOf(u) === "easement";
    const holder = u.EsmtHldr?.trim() || u.Loc_Mang?.trim();
    return {
      name: u.Unit_Nm?.trim() || "Unnamed",
      manager: managerOf(u),
      access: easement
        ? holder
          ? PUBLIC_LAND_WORDS.heldBy(holder)
          : PUBLIC_LAND_WORDS.easement
        : ACCESS_LINE[accessOf(u)],
      designation: designationName(u.Des_Tp),
      sourceDate: isoDate(u.Src_Date),
      adjoins: !!parcel && group.some((f) => adjoinsParcel(f, parcel)),
      easement,
    };
  });
  return { units, more: Math.max(0, merged.length - CARD_MAX) };
}

/** A card unit as its lines: name, manager, access, designation, the date, then "Adjoins this parcel". */
export function unitLines(u: CardUnit): string[] {
  return [
    u.name,
    u.manager,
    u.access,
    ...(u.easement && u.access !== PUBLIC_LAND_WORDS.easement ? [PUBLIC_LAND_WORDS.easement] : []),
    u.designation,
    ...(u.sourceDate ? [PUBLIC_LAND_WORDS.sourceDate(u.sourceDate)] : []),
    ...(u.adjoins ? [PUBLIC_LAND_WORDS.adjoins] : []),
  ];
}
