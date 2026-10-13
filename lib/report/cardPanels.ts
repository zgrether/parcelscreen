/**
 * The report card's slide-in panels (value-ranking.md §6.2; VR5): each one's title, its plain question (a), and its
 * "How it's scored" line (d), generated from the card's config so a changed cutoff or weight changes the line. The
 * banded scale (b) and "What it means for you" (c) come next. Pure: the rulebook page (VR7) reuses it.
 */
import { fmt } from "../format";
import { SCREEN_CONSTANTS } from "../screen/config";
import { MAYBE_CAPS, footprintFt2, type CardConfig, type GateKey, type Person, type RowKey } from "./card";

export type PanelKey = "verdict" | GateKey | RowKey | "cost";

/** Every panel. A record, so a new PanelKey doesn't compile until it's listed, and the rulebook test then wants its section. */
const PANELS: Record<PanelKey, true> = {
  verdict: true,
  floodplain: true,
  access: true,
  easement: true,
  septic: true,
  elevation: true,
  homesite: true,
  sky: true,
  room: true,
  trails: true,
  town: true,
  garden: true,
  cost: true,
};
export const PANEL_KEYS = Object.keys(PANELS) as PanelKey[];

/** The panel's section on the rulebook page: its id there, and the link from the panel's "How it's scored". */
export const ruleAnchor = (key: PanelKey): string => `rule-${key}`;
export const rulebookHref = (key: PanelKey): string => `/rulebook#${ruleAnchor(key)}`;

export interface PanelText {
  title: string;
  question: string;
  howScored: string;
}

const KM_PER_MI = 1.609344;
/** Whole miles: the Trails cutoffs are round miles (owner, #118 review). */
const mi = (km: number) => fmt(km / KM_PER_MI);
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
  /** The rulebook's: slopes in both degrees and percent (#118 review). The report's panels keep one unit. */
  opts: { bothSlopeUnits?: boolean } = {},
): PanelText {
  const R = K.rows;
  const gentle = SCREEN_CONSTANTS.terrain.gentleGradePct;
  const gentleText = opts.bothSlopeUnits
    ? `${gentle}% (${fmt((Math.atan(gentle / 100) * 180) / Math.PI, 1)}°) or less`
    : `${gentle}% or less`;
  switch (key) {
    case "verdict":
      return {
        title: "Grade and verdict",
        question: "Is this parcel worth a closer look?",
        howScored:
          `The grade is the weighted average of the rows (A ${K.points.A}, B ${K.points.B}, C ${K.points.C}, D ${K.points.D}, F ${K.points.F}): ` +
          `A from ${K.gradeCutoffs[0]}, B from ${K.gradeCutoffs[1]}, C from ${K.gradeCutoffs[2]}, D from ${K.gradeCutoffs[3]}. ` +
          `Contender at ${K.verdict.contender} and up with at most ${K.verdict.contenderMaxWarns} warning; ` +
          `Pass with any failed dealbreaker or a grade under ${K.verdict.pass}; Maybe otherwise. ` +
          // Appended (#118 review; rule 7): the caps cardFor applies, from the same list.
          `A parcel is at most a Maybe when ${MAYBE_CAPS.incomplete} or when ${MAYBE_CAPS.checkFirst}.`,
      };
    case "floodplain":
      return {
        title: "Floodplain",
        question: "Could the house or the driveway flood?",
        howScored:
          "Fails when the build site is in a FEMA Special Flood Hazard Area; a flood zone elsewhere on the parcel is noted. " +
          // Appended (#118 review; rule 7): floodplain()'s warn and unknown cases (card.ts).
          "Warns when a flood zone touches the build site's ground or the driveway's route. When FEMA has no flood mapping here, or the flood map didn't load, it's unknown, not a pass.",
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
          "Passes when the scored driveway stays on the parcel; warns when it needs an easement, or when no practical drive fits the budget; fails when no practical route is found. An easement you drew across neighbouring land that the driveway uses warns until it's verified as a legal right-of-way, and so does an existing drive it starts from that's steeper than your veto.",
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
        howScored: `Gentle ground (${gentleText}) within ${fmt(build.drainfieldWithinFt)} ft of where the house goes on site #1, against the build footprint, ${fmt(footprintFt2(build))} ft²: ${ladder(
          R.roomX.slice(0, 3).map((v) => `${v}×`),
          "at",
          "from",
        )}, D when it fits; an F when the build doesn't fit on any homesite; ${weightOf(K, "room")}.`,
      };
    case "trails":
      return {
        title: "Trails and public land",
        question: "How close is the woods we can walk in?",
        howScored:
          `A when the parcel adjoins open public land or a trailhead is within ${mi(R.trailheadKm[0]!)} mi; B with open public land within a mile, or a trailhead within ${mi(R.trailheadKm[1]!)} mi; C within ${mi(R.trailheadKm[2]!)} mi; D within ${mi(R.trailheadKm[3]!)} mi (straight line); ${weightOf(K, "trails")}. ` +
          // Appended (rule 7; follow-up 54, owner #123): the drive minutes, with the straight line as the fallback.
          `By road: the quickest drive from where the driveway meets the road to one of the ${SCREEN_CONSTANTS.drive.trailheadCandidates} nearest trailheads, to its parking where OpenStreetMap tags one: A within ${R.trailheadMin[0]} min, B within ${R.trailheadMin[1]}, C within ${R.trailheadMin[2]}, D within ${R.trailheadMin[3]}. The straight-line distances above count only when the drive times didn't load.`,
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
