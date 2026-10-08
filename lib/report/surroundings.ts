/**
 * The sections about what's around the parcel: Floodplain (proto L1547), Public land within a mile (L1549)
 * and Getting there and getting out (L1551–1555).
 */
import { fmt } from "../format";
import { SCREEN_CONSTANTS } from "../screen/config";
import { M2FT } from "../screen/util";
import type { PartialScreenResult } from "../screen/types";
import type { RichItem } from "./facts";
import { onMap, said, type Heading, type Part } from "./parts";

export const floodHeading: Heading = { title: "Floodplain", slug: "floodplain", help: "h-flood" };
export const publicLandHeading: Heading = {
  title: "Public land within a mile",
  slug: "public-land-within-a-mile",
  help: "h-public",
};
export const gettingThereHeading: Heading = {
  title: "Getting there and getting out",
  slug: "getting-there-and-getting-out",
  help: "h-drives",
};

/** Null until the flood step has run. */
export function floodView(r: PartialScreenResult): RichItem | null {
  const f = r.flood;
  if (!f) return null;
  if (!f.mapped)
    return {
      text: "FEMA has no flood mapping here. Unmapped is not the same as safe — walk the drainages after rain.",
    };
  return f.sfha
    ? {
        strong: `${fmt(f.sfhaAcres, 1)} acres`,
        text: ` in a Special Flood Hazard Area (zones ${f.zones.join(", ")}).`,
      }
    : {
        text: `FEMA has mapped this area; nothing on the parcel is in a Special Flood Hazard Area (${f.zones.join(", ") || "zone X"}).`,
      };
}

export interface PublicUnitView {
  name: string;
  /** "(USFS, National Forest)" */
  meta: string;
  /** "adjoins the boundary" (bold) or "1,240 ft away" */
  where: { text: string; strong: boolean };
  access: string;
}

const ACCESS: Record<string, string> = { OA: "open", RA: "restricted", XA: "closed", UK: "unknown" };

export interface PublicLandView {
  units: PublicUnitView[];
  none: string;
  caveat: string;
  /** The nearest land open to visitors beyond the mile (follow-up 23), or null. */
  beyond: string | null;
}

type Unit = NonNullable<PartialScreenResult["protected"]>[number];

/**
 * Within the mile: what the 1,600 m query found (follow-up 23). Units from the wider query are always measured
 * beyond it (lib/screen/padus.ts), so the distance alone tells them apart, and old results have none.
 */
const withinMile = (u: Unit): boolean =>
  u.adjoins || u.distFt == null || u.distFt <= SCREEN_CONSTANTS.padus.searchM * M2FT;

/**
 * The nearest land open to visitors beyond the mile, as one sentence (owner, 2026-10-08): only when nothing
 * open is within the mile and the wider query found something. Appended after the caveat (rule 7).
 */
function beyondMile(units: readonly Unit[]): string | null {
  if (units.some((u) => withinMile(u) && u.access === "OA")) return null;
  const open = units.filter((u) => !withinMile(u) && u.access === "OA").sort((a, b) => a.distFt! - b.distFt!);
  if (!open.length) return null;
  // PAD-US often lists one unit twice, once with its manager unknown: at the same distance, name the copy
  // whose manager is known.
  const atNearest = open.filter((u) => u.distFt! - open[0]!.distFt! < 1);
  const nearest = atNearest.find((u) => managerName(u.manager) !== UNKNOWN_MANAGER) ?? open[0]!;
  const mi = (nearest.distFt! / 5280).toFixed(1);
  return `Nearest public land open to visitors beyond a mile: ${nearest.name || "Unnamed"} (${managerName(nearest.manager)}), ${mi} mi straight-line.`;
}

const UNKNOWN_MANAGER = "manager unknown";

/**
 * PAD-US manager codes (`Mang_Name`) as agency names: the service's own coded-value domain (Fee_Managers_PADUS,
 * read 2026-10-08), with USFS as "U.S. Forest Service" (owner's example) and the unknown kinds as "manager
 * unknown". The wider query stores the local manager name (`Loc_Mang`) when PAD-US has one and the code
 * otherwise; the line never prints a bare code (owner, 2026-10-08).
 */
export const PADUS_MANAGERS: Readonly<Record<string, string>> = {
  TVA: "Tennessee Valley Authority",
  BLM: "Bureau of Land Management",
  BOEM: "Bureau of Ocean Energy Management",
  USBR: "Bureau of Reclamation",
  FWS: "U.S. Fish and Wildlife Service",
  USFS: "U.S. Forest Service",
  DOD: "Department of Defense",
  USACE: "Army Corps of Engineers",
  DOE: "Department of Energy",
  NPS: "National Park Service",
  NRCS: "Natural Resources Conservation Service",
  ARS: "Agricultural Research Service",
  BIA: "Bureau of Indian Affairs",
  NOAA: "National Oceanic and Atmospheric Administration",
  BPA: "Bonneville Power Administration",
  OTHF: "Other or Unknown Federal Land",
  TRIB: "American Indian Lands",
  SPR: "State Park and Recreation",
  SDC: "State Department of Conservation",
  SLB: "State Land Board",
  SFW: "State Fish and Wildlife",
  SDNR: "State Department of Natural Resources",
  SDOL: "State Department of Land",
  OTHS: "Other or Unknown State Land",
  REG: "Regional Agency Land",
  RWD: "Regional Water Districts",
  CITY: "City Land",
  CNTY: "County Land",
  UNKL: "Other or Unknown Local Government",
  NGO: "Non-Governmental Organization",
  PVT: "Private",
  JNT: "Joint",
  OTHR: "Other",
  UNK: UNKNOWN_MANAGER,
  DESG: UNKNOWN_MANAGER,
  VI: "U.S. Virgin Islands Government",
  AS: "American Samoa Government",
  GU: "Guam Government",
  MP: "Mariana Islands Government",
  PR: "Puerto Rico Government",
  FM: "Federated States of Micronesia Government",
  MH: "Marshall Islands Government",
  PW: "Palau Government",
  UM: "U.S. Minor Outlying Islands Government",
};

/** A manager as the report names it: a local name as it is, a code as its agency, nothing as "manager unknown". */
export function managerName(m: string | null | undefined): string {
  const v = m?.trim();
  if (!v) return UNKNOWN_MANAGER;
  if (PADUS_MANAGERS[v]) return PADUS_MANAGERS[v]!;
  return /^[A-Z]{2,5}$/.test(v) ? UNKNOWN_MANAGER : v; // an unlisted code is still a bare code
}

/** Null until the public-land step has run. */
export function publicLandView(r: PartialScreenResult): PublicLandView | null {
  if (!r.protected) return null;
  return {
    units: r.protected.filter(withinMile).map((u) => ({
      name: u.name || "Unnamed",
      meta: `(${u.manager || ""}, ${u.type || ""})`,
      where: u.adjoins
        ? { text: "adjoins the boundary", strong: true }
        : { text: u.distFt != null ? `${fmt(u.distFt)} ft away` : "nearby", strong: false },
      access: ACCESS[u.access ?? ""] ?? (u.access || "unknown"),
    })),
    none: "None. All your buffer is land you buy.",
    caveat:
      "Conservation easements on private land are not in this layer and don't count — you can't walk on them.",
    beyond: beyondMile(r.protected),
  };
}

export interface GettingThereView {
  drives: { label: string; name: string; value: string }[];
  /** Null when the near step didn't run. */
  grocers: { name: string; mi: string }[] | null;
  /** "3 (green dots on map; nearest 1.2 mi)" */
  trailheads: { count: string; more: Part[] } | null;
  notes: string[];
  caveat: string;
}

/** Null until the drive or near step has run. */
export function gettingThereView(r: PartialScreenResult): GettingThereView | null {
  if (!r.drives && !r.near) return null;
  const n = r.near;
  return {
    drives: (r.drives ?? []).map((d) => ({
      label: d.label,
      name: d.name,
      value: `${d.min} min, ${d.mi} mi`,
    })),
    grocers: n ? n.grocers.map((g) => ({ name: g.name, mi: `${fmt(g.km * 0.621, 0)} mi` })) : null,
    trailheads: n
      ? {
          count: String(n.trailheadCount),
          more:
            n.trailheadCount && n.trailheads[0]
              ? [
                  said(" ("),
                  onMap("green dots on map; "),
                  said(`nearest ${fmt(n.trailheads[0].km * 0.621, 1)} mi)`),
                ]
              : [],
        }
      : null,
    notes: [r.nearNote, r.roadNote].filter((x): x is string => !!x),
    caveat:
      "Drive times from OSRM's public router — fine for comparing parcels, not for catching a flight. Places come from OpenStreetMap data (via Photon); trailhead counts undercount national forest access. Roads from the Census Bureau's TIGER lines.",
  };
}
