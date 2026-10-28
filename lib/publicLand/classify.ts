/**
 * Who manages a PAD-US unit and whether it's open, as Map layers › Public land draws it (roadmap step 16,
 * docs/plans/step-16-public-lands.md §3.1). The manager comes from PAD-US's agency, then its designation, then the
 * unit's name: many records carry an unknown manager (Pond Mountain Game Land is "UNK", designation "State Other").
 * First match wins. Pure.
 */
import type { PadusUnit } from "./source";

export const CATEGORIES = ["forest", "park", "state", "game", "other", "easement"] as const;
export type Category = (typeof CATEGORIES)[number];

export type Access = "open" | "restricted" | "closed" | "unknown";

/** Each category's colour (fill and outline). */
export const CATEGORY_COLOR: Record<Category, string> = {
  forest: "#2f6b3a",
  park: "#8a5a2b",
  state: "#1f7f86",
  game: "#b07d12",
  other: "#5d6f8c",
  easement: "#b0307a",
};

const GAME = /\bgame lands?\b|wildlife management area|\bWMA\b/i;
const STATE_PARK = /\bstate (park|forest|recreation area|natural area)\b/i;
const STATE_DESIGNATIONS = new Set(["SP", "SREC", "SRMA", "SW"]);
const STATE_AGENCIES = new Set(["SPR", "SDC", "SDNR", "SDOL"]);

export function categoryOf(u: PadusUnit): Category {
  const agency = u.Mang_Name ?? "";
  const des = u.Des_Tp ?? "";
  const name = u.Unit_Nm ?? "";
  if (u.FeatClass === "Easement") return "easement";
  if (agency === "SFW" || GAME.test(name)) return "game";
  if (agency === "USFS" || des === "NF" || des === "NG") return "forest";
  if (agency === "NPS" || des === "NP" || des === "NM" || des === "NLS" || des === "NT") return "park";
  if (STATE_DESIGNATIONS.has(des) || STATE_PARK.test(name)) return "state";
  if (STATE_AGENCIES.has(agency) && des.startsWith("S")) return "state";
  return "other";
}

export function accessOf(u: PadusUnit): Access {
  switch (u.Pub_Access) {
    case "OA":
      return "open";
    case "RA":
      return "restricted";
    case "XA":
      return "closed";
    default:
      return "unknown";
  }
}

/** How the access is drawn: a fill, a hatch, or the outline only. */
export type AccessStyle = "solid" | "hatched" | "outline";
export const accessStyle = (a: Access): AccessStyle =>
  a === "open" ? "solid" : a === "closed" ? "outline" : "hatched";
