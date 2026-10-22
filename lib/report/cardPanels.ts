/**
 * The report card's slide-in panels (value-ranking.md §6.2; VR5): each one's title, its plain question (a), and its
 * "How it's scored" line (d), generated from the card's config so a changed cutoff or weight changes the line. The
 * banded scale (b) and "What it means for you" (c) come next. Pure: the rulebook page (VR7) reuses it.
 */
import { fmt } from "../format";
import { SCREEN_CONSTANTS } from "../screen/config";
import { defaultNamedRubric } from "../rubric/default";
import type { NamedRubric, Rubric } from "../rubric/types";
import { verdictLines } from "../rubric/grade";
import { weightsOf } from "../rubric/weights";
import { CLIMATE_SOURCES } from "./climate";
import { climateWords } from "../rubric/words";
import { MAYBE_CAPS, footprintFt2, type CardConfig, type GateKey, type RowKey } from "./card";

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
  driveway: true,
  trails: true,
  town: true,
  hospital: true,
  garden: true,
  climate: true,
  budget: true,
  cost: true,
};
export const PANEL_KEYS = Object.keys(PANELS) as PanelKey[];

/** The panel's section on the rulebook page: its id there, and the link from the panel's "How it's scored". */
export const ruleAnchor = (key: PanelKey): string => `rule-${key}`;
export const rulebookHref = (key: PanelKey): string => `/help#${ruleAnchor(key)}`;

export interface PanelText {
  title: string;
  question: string;
  howScored: string;
}

const KM_PER_MI = 1.609344;
/** Whole miles: the Trails cutoffs are round miles (owner, #118 review). */
const mi = (km: number) => fmt(km / KM_PER_MI);
/** "weight 25" for one rubric; "weight 25 (Mine) / 10 (Julie)" for several: each rubric's weight on the row, by name. */
const weightOf = (rubrics: readonly NamedRubric[], row: RowKey): string =>
  rubrics.length === 1
    ? `weight ${weightsOf(rubrics[0]!.rubric)[row]}`
    : "weight " + rubrics.map((nr) => `${weightsOf(nr.rubric)[row]} (${nr.name})`).join(" / ");

/** "A at 3,000 ft and up, B from 2,500, C from 2,000, D from 1,500" */
const ladder = (edges: readonly string[], first: string, then: string): string =>
  edges.map((e, i) => `${"ABCD"[i]} ${i ? then : first} ${e}`).join(", ");

export function panelText(
  key: PanelKey,
  K: CardConfig = SCREEN_CONSTANTS.card,
  build = SCREEN_CONSTANTS.build,
  /**
   * The rulebook's: slopes in both degrees and percent (#118 review). The report's panels keep one unit. `rubric`:
   * whose points, cutoffs and verdict lines the Grade and verdict panel quotes (the config's without one); `rubrics`:
   * whose weights the rows quote (the profile's; the default rubric alone without them).
   */
  opts: { bothSlopeUnits?: boolean; rubric?: Rubric; rubrics?: readonly NamedRubric[] } = {},
): PanelText {
  const R = K.rows;
  const V = opts.rubric ?? K;
  const rubrics = opts.rubrics ?? [defaultNamedRubric(K)];
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
          `The grade is the weighted average of the rows (A ${V.points.A}, B ${V.points.B}, C ${V.points.C}, D ${V.points.D}, F ${V.points.F}): ` +
          `A from ${V.gradeCutoffs[0]}, B from ${V.gradeCutoffs[1]}, C from ${V.gradeCutoffs[2]}, D from ${V.gradeCutoffs[3]}. ` +
          // The verdict lines are letter edges (step 3, §9.51; the numbers replaced under rule 7, owner 10/17).
          `Contender at ${verdictLines(V).contender} and up with at most ${V.verdict.contenderMaxWarns} warning; ` +
          `Not for us with any failed dealbreaker or a grade under ${verdictLines(V).pass}; Maybe otherwise. ` +
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
          "Warns when no soil on the parcel rates better than very limited; never fails, because a soil evaluation on the spot decides. A septic permit you mark passes it, with a reminder to get a copy.",
      };
    case "elevation":
      return {
        title: "Elevation at the build site",
        question: "Is the build site high enough for the climate and the views we want?",
        howScored: `${ladder(
          R.elevationFt.map((v) => `${fmt(v)} ft`),
          "at",
          "from",
        ).replace(" ft,", " ft and up,")}; ${weightOf(rubrics, "elevation")}.`,
      };
    case "homesite":
      return {
        title: "Best homesite",
        question: "Is there a good place to build?",
        // Step 7 (§9.43: it read "Site #1's quality grade", superseded by the best site).
        howScored: `The quality grade of your best homesite (the site your priorities rank first), from its sun, facing, frost, slope and sky; what it costs to build there breaks ties but isn't graded here; ${weightOf(rubrics, "homesite")}.`,
      };
    case "sky":
      return {
        title: "Night sky",
        question: "How dark is it overhead?",
        howScored: `${ladder(
          R.skyMag.map((v) => `${fmt(v, 1)}`),
          "at",
          "from",
        )} mag/arcsec² at the zenith (higher is darker); ${weightOf(rubrics, "sky")}.`,
      };
    case "room":
      return {
        title: "Room to build",
        question:
          "Does the whole build fit on gentle ground: the house, the garage, the turnaround and the septic field with its reserve?",
        howScored: `Gentle ground (${gentleText}) within ${fmt(build.drainfieldWithinFt)} ft of where the house goes on your best homesite, against the build footprint, ${fmt(footprintFt2(build))} ft²: ${ladder(
          R.roomX.slice(0, 3).map((v) => `${v}×`),
          "at",
          "from",
        )}, D when it fits; an F when the build doesn't fit on any homesite; ${weightOf(rubrics, "room")}.`,
      };
    case "driveway":
      // Step 7 (plan §3): new text.
      return {
        title: "Driveway",
        question: "How steep is the drive up to the house?",
        howScored: `The steepest grade on the driveway to the build site, over 30 m: ${ladder(
          R.drivewayPct.map((v) => `${fmt(v)}%`),
          "up to",
          "up to",
        )}; an F when no route reaches it or no practical drive does. Its length is shown, not graded: its cost is Cost to enjoy's; ${weightOf(rubrics, "driveway")}.`,
      };
    case "trails":
      return {
        title: "Trails and public land",
        question: "How close is the woods we can walk in?",
        howScored:
          `A when the parcel adjoins open public land or a trailhead is within ${mi(R.trailheadKm[0]!)} mi; B with open public land within a mile, or a trailhead within ${mi(R.trailheadKm[1]!)} mi; C within ${mi(R.trailheadKm[2]!)} mi; D within ${mi(R.trailheadKm[3]!)} mi (straight line); ${weightOf(rubrics, "trails")}. ` +
          // Appended (rule 7; follow-up 54, owner #123): the drive minutes, with the straight line as the fallback.
          `By road: the quickest drive from where the driveway meets the road to one of the ${SCREEN_CONSTANTS.drive.trailheadCandidates} nearest trailheads, to its parking where OpenStreetMap tags one: A within ${R.trailheadMin[0]} min, B within ${R.trailheadMin[1]}, C within ${R.trailheadMin[2]}, D within ${R.trailheadMin[3]}. The straight-line distances above count only when the drive times didn't load.`,
      };
    // Step 11 (plan §2.1): the ER is Hospital's own panel now; Town keeps the groceries.
    case "town":
      return {
        title: "Town and groceries",
        question: "How far to groceries?",
        howScored: `The drive to the nearest grocery: A within ${R.groceryMin[0]} min, B within ${R.groceryMin[1]}, C within ${R.groceryMin[2]}, D within ${R.groceryMin[3]}; ${weightOf(rubrics, "town")}.`,
      };
    case "hospital":
      return {
        title: "Hospital",
        question: "How far to an emergency room?",
        howScored: `The drive to the nearest hospital, its ER where it has one: A within ${R.erMin[0]} min, B within ${R.erMin[1]}, C within ${R.erMin[2]}, D within ${R.erMin[3]}; ${weightOf(rubrics, "hospital")}.`,
      };
    case "garden":
      return {
        title: "Garden ground",
        question: "Is there ground to grow food on?",
        howScored: `A for a garden of ${fmt(R.gardenAc[0]!, 2)} ac or more on prime or statewide-important farmland; B from ${fmt(R.gardenAc[1]!, 2)} ac, C from ${fmt(R.gardenAc[2]!, 2)} ac, D for any garden; ${weightOf(rubrics, "garden")}.`,
      };
    case "climate": {
      const jan = R.janLowF.map((v) => `${fmt(v)} °F`);
      const jul = R.julHighF.map((v) => `${fmt(v)} °F`);
      return {
        title: "Climate",
        question: "How cold are the winters, and how hot the summers, where we'd build?",
        howScored:
          `At your best homesite, the worse of two 30-year normals: January's mean low (A from ${jan[0]}, B from ${jan[1]}, C from ${jan[2]}, D from ${jan[3]}) and July's mean high (A up to ${jul[0]}, B up to ${jul[1]}, C up to ${jul[2]}, D up to ${jul[3]}); your limits: ${climateWords(R)}. Snowfall and frost-free days are shown, not graded; ${weightOf(rubrics, "climate")}. ` +
          `Sources: ${CLIMATE_SOURCES}`,
      };
    }
    case "budget": {
      const B = K.budgetBands.map((x) => `${fmt(x * 100)}%`);
      return {
        title: "Within budget",
        question: "Does it fit what you'd spend?",
        howScored:
          `Ready to camp and Ready to build, all in, against your budgets from the questions; the worse of the two counts. ` +
          `As something you really want or would like: A when the high end of the range is within ${B[0]} of the budget, B within ${B[1]}, C within ${B[2]}, D within ${B[3]}, F above; ${weightOf(rubrics, "budget")}. ` +
          `As a must have: it passes when the high end is within the budget, asks you to check first when the range straddles it, and fails when even the low end is over. ` +
          `Without an asking price it isn't graded.`,
      };
    }
    case "cost":
      return {
        title: "Cost to enjoy",
        question: "What will it cost to camp here, then to build and live here?",
        howScored:
          // Step 10: priced (the sentence before it, "Not priced yet…", is replaced: its promise is kept).
          "Ready to camp and Ready to build, all in, from published low–high rates (Settings → Costs): the land, a legal way in, a pioneer track and a campsite, then the finished driveway, paving, culverts, well, septic, power, clearing and the house pad. Your lines and marks lower it. Each budget you gave marks its line: under it, straddling it, or over it.",
      };
  }
}
