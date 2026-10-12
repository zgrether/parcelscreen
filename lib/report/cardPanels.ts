/**
 * The report card's slide-in panels (value-ranking.md §6.2; VR5): each one's title, its plain question (a), and its
 * "How it's scored" line (d), generated from the card's config so a changed cutoff or weight changes the line. The
 * banded scale (b) and "What it means for you" (c) come next. Pure: the rulebook page (VR7) reuses it.
 */
import { fmt } from "../format";
import { SCREEN_CONSTANTS } from "../screen/config";
import { footprintFt2, type CardConfig, type GateKey, type Person, type RowKey } from "./card";

export type PanelKey = "verdict" | GateKey | RowKey | "cost";

export interface PanelText {
  title: string;
  question: string;
  howScored: string;
}

const KM_PER_MI = 1.609344;
const mi = (km: number) => fmt(km / KM_PER_MI, 1);
const PEOPLE: Record<Person, string> = { zach: "Zach", julie: "Julie" };

/** "weight 25 (Zach) / 10 (Julie)" */
const weightOf = (K: CardConfig, row: RowKey): string =>
  "weight " + (Object.keys(PEOPLE) as Person[]).map((p) => `${K.weights[p][row]} (${PEOPLE[p]})`).join(" / ");

/** "A at 3,000 ft and up, B from 2,500, C from 2,000, D from 1,500" */
const ladder = (edges: readonly string[], first: string, then: string): string =>
  edges.map((e, i) => `${"ABCD"[i]} ${i ? then : first} ${e}`).join(", ");

export function panelText(
  key: PanelKey,
  K: CardConfig = SCREEN_CONSTANTS.card,
  build = SCREEN_CONSTANTS.build,
): PanelText {
  const R = K.rows;
  switch (key) {
    case "verdict":
      return {
        title: "Grade and verdict",
        question: "Is this parcel worth a closer look?",
        howScored:
          `The grade is the weighted average of the rows (A ${K.points.A}, B ${K.points.B}, C ${K.points.C}, D ${K.points.D}, F ${K.points.F}): ` +
          `A from ${K.gradeCutoffs[0]}, B from ${K.gradeCutoffs[1]}, C from ${K.gradeCutoffs[2]}, D from ${K.gradeCutoffs[3]}. ` +
          `Contender at ${K.verdict.contender} and up with at most ${K.verdict.contenderMaxWarns} warning; ` +
          `Pass with any failed dealbreaker or a grade under ${K.verdict.pass}; Maybe otherwise.`,
      };
    case "floodplain":
      return {
        title: "Floodplain",
        question: "Could the house or the driveway flood?",
        howScored:
          "Fails when the build site is in a FEMA Special Flood Hazard Area; a flood zone elsewhere on the parcel is noted.",
      };
    case "access":
      return {
        title: "Legal road access",
        question: "Can you drive onto the land from a public road?",
        howScored: `Passes with frontage on a road; warns when the driveway has to start from the nearest road point; fails with no road within ${fmt(SCREEN_CONSTANTS.driveway.fallbackMaxM / 1000 / KM_PER_MI, 2)} mi of the boundary. A driveway that starts from a line you drew warns until it's verified as a legal right-of-way.`,
      };
    case "easement":
      return {
        title: "Easement needed",
        question: "Can the driveway stay on your own land?",
        howScored:
          "Passes when the scored driveway stays on the parcel; warns when it needs an easement, or when no practical drive fits the budget; fails when no practical route is found. An easement you drew across neighbouring land that the driveway uses warns until it's verified as a legal right-of-way.",
      };
    case "septic":
      return {
        title: "Septic",
        question: "Will the ground take a septic field?",
        howScored:
          "Warns when no soil on the parcel rates better than very limited; never fails, because a soil evaluation on the spot decides.",
      };
    case "elevation":
      return {
        title: "Elevation at the build site",
        question: "Is the build site high enough for the climate and the views we want?",
        howScored: `${ladder(
          R.elevationFt.map((v) => `${fmt(v)} ft`),
          "at",
          "from",
        ).replace(" ft,", " ft and up,")}; ${weightOf(K, "elevation")}.`,
      };
    case "homesite":
      return {
        title: "Best homesite",
        question: "Is there a good place to build?",
        howScored: `Site #1's quality grade, from its sun, facing, frost, slope and sky; what it costs to build there picks the site but isn't graded here; ${weightOf(K, "homesite")}.`,
      };
    case "sky":
      return {
        title: "Night sky",
        question: "How dark is it overhead?",
        howScored: `${ladder(
          R.skyMag.map((v) => `${fmt(v, 1)}`),
          "at",
          "from",
        )} mag/arcsec² at the zenith (higher is darker); ${weightOf(K, "sky")}.`,
      };
    case "room":
      return {
        title: "Room to build",
        question:
          "Does the whole build fit on gentle ground: the house, the garage, the turnaround and the septic field with its reserve?",
        howScored: `Gentle ground (15% or less) within ${fmt(build.drainfieldWithinFt)} ft of where the house goes on site #1, against the build footprint, ${fmt(footprintFt2(build))} ft²: ${ladder(
          R.roomX.slice(0, 3).map((v) => `${v}×`),
          "at",
          "from",
        )}, D when it fits; an F when the build doesn't fit on any homesite; ${weightOf(K, "room")}.`,
      };
    case "trails":
      return {
        title: "Trails and public land",
        question: "How close is the woods we can walk in?",
        howScored: `A when the parcel adjoins open public land or a trailhead is within ${mi(R.trailheadKm[0]!)} mi; B with open public land within a mile, or a trailhead within ${mi(R.trailheadKm[1]!)} mi; C within ${mi(R.trailheadKm[2]!)} mi; D within ${mi(R.trailheadKm[3]!)} mi (straight line); ${weightOf(K, "trails")}.`,
      };
    case "town":
      return {
        title: "Town and hospital",
        question: "How far to groceries, and to an emergency room?",
        howScored: `The worse of the two drives: an ER within ${R.erMin[0]} min and a grocery within ${R.groceryMin[0]} for an A; ${R.erMin[1]} and ${R.groceryMin[1]} for a B; ${R.erMin[2]} and ${R.groceryMin[2]} for a C; ${R.erMin[3]} and ${R.groceryMin[3]} for a D; ${weightOf(K, "town")}.`,
      };
    case "garden":
      return {
        title: "Garden ground",
        question: "Is there ground to grow food on?",
        howScored: `A for a garden of ${fmt(R.gardenAc[0]!, 2)} ac or more on prime or statewide-important farmland; B from ${fmt(R.gardenAc[1]!, 2)} ac, C from ${fmt(R.gardenAc[2]!, 2)} ac, D for any garden; ${weightOf(K, "garden")}.`,
      };
    case "cost":
      return {
        title: "Cost to enjoy",
        question: "What will it cost to camp here, then to build and live here?",
        howScored:
          "Pending: the stages (purchase, camping, ready to build, home) are priced once the unit costs are calibrated.",
      };
  }
}
