/** Soils (proto L1536–1546): each NRCS map unit inside the line, and each soil in it, in plain language. */
import { fmt } from "../format";
import { soilRead } from "../screen/soils";
import type { PartialScreenResult } from "../screen/types";
import { onMap, said, type Heading, type Part } from "./parts";

export const soilsHeading: Heading = {
  title: "Soils",
  sub: "what the ground will let you do",
  slug: "soils",
  help: "h-soils",
};

export interface SoilComponentView {
  name: string;
  /** "45% of this unit · prime farmland" */
  share: string;
  house: string;
  land: string;
  /** The raw ratings, small: drainage, septic, dwellings, roads, flooding, water table, bedrock, hydric. */
  ratings: string;
}

export interface SoilUnitView {
  name: string;
  /** The unit's colour on the map; null when the map-unit polygons didn't load. */
  color: string | null;
  /** "12.3 ac inside the line" */
  acres: string | null;
  components: SoilComponentView[];
}

export interface SoilsView {
  intro: Part[];
  units: SoilUnitView[];
  /** Shown when no unit has components. */
  none: string;
  /** The map-unit-scale caveat (Q4: help-only in the prototype, L322; here so the parcel page and PDF carry it). */
  scale: string;
}

const rated = (s: string | null | undefined, unrated = "unrated") => s || unrated;

/** Null until the soils step has run. */
export function soilsView(r: PartialScreenResult): SoilsView | null {
  const soils = r.soils;
  if (!soils) return null;
  // Units from the map-unit polygons; when those didn't load, from the components' own map-unit keys.
  const units = r.soilUnits?.length
    ? r.soilUnits.map((u) => ({
        mukey: u.mukey,
        muname: u.muname,
        acres: u.acres as number | null,
        color: u.color as string | null,
      }))
    : [
        ...new Map(
          soils.map((x) => [
            String(x.mukey),
            { mukey: String(x.mukey), muname: x.muname ?? "", acres: null, color: null },
          ]),
        ).values(),
      ];
  return {
    intro: [
      said("NRCS mapped the county into units"),
      onMap(" (dashed outlines on the map, hover for names)"),
      said(
        ". Each unit is a mix of soils they expect you'd find if you dug. Slope in the unit name tells you which part of the parcel it is.",
      ),
    ],
    units: units.flatMap((u) => {
      const comps = soils.filter((x) => String(x.mukey) === u.mukey);
      if (!comps.length) return [];
      return [
        {
          name: u.muname,
          color: u.color,
          acres: u.acres != null ? `${fmt(u.acres, 1)} ac inside the line` : null,
          components: comps.map((x) => {
            const read = soilRead(x, r.params.shallowBedrockCm);
            const rock = x.brockdepmin;
            return {
              name: x.compname ?? "",
              share: `${x.comppct_r || ""}% of this unit${read.prime ? " · prime farmland" : read.statewide ? " · farmland of statewide importance" : ""}`,
              house: read.house,
              land: read.land,
              ratings: `${rated(x.drainagecl || x.drclassdcd, "drainage unrated")}; septic “${rated(x.septic || x.engstafdcd)}”; house w/ basement “${rated(x.engdwbdcd)}”; no basement “${rated(x.engdwobdcd)}”; roads “${rated(x.englrsdcd)}”${
                x.flodfreqdcd ? `; flooding ${x.flodfreqdcd}` : ""
              }${x.wtdepannmin != null && x.wtdepannmin !== "" ? `; water table ≥${x.wtdepannmin} cm` : ""}; bedrock ${
                rock == null || rock === ""
                  ? "not recorded"
                  : Number(rock) >= 201
                    ? "deeper than 2 m"
                    : `${rock} cm`
              }${x.hydricrating ? `; hydric ${x.hydricrating}` : ""}`,
            };
          }),
        },
      ];
    }),
    none: "No soil components returned.",
    scale: "Map-unit lines are drawn at county scale, so a boundary can be 100 ft off on the ground.",
  };
}
