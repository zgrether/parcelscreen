/**
 * The rulebook, "What the grade means" (value-ranking.md §8; VR7): the same panels as the report card's, for both
 * grades, with every band on every scale and what each band means, and the rules each grade is built from. Every
 * number comes from config (the screen's constants and the user's Settings), so a changed cutoff or weight changes
 * the page; a test renders the page and checks that. Pure: the page draws this.
 */
import { compass, fmt } from "../format";
import { SCREEN_CONSTANTS } from "../screen/config";
import type { UserConfig } from "../screen/types";
import type { Curve } from "../screen/util";
import { DEFAULT_USER_CONFIG } from "../screen/config";
import type { GateKey, Person, RowKey } from "./card";
import { panelText, type PanelKey } from "./cardPanels";
import { MEANINGS, type Meaning } from "./meanings";
import { SCALE_IDS, scaleBands, type ScaleId, type ScaleName } from "./scales";

type Constants = typeof SCREEN_CONSTANTS;

export interface RuleScale {
  id: ScaleId;
  name: ScaleName;
  /** Each band's label, and what it means for you there. */
  bands: { label: string; meanings: Meaning[] }[];
}

export interface RulePanel {
  key: PanelKey;
  title: string;
  question: string;
  scales: RuleScale[];
  howScored: string;
}

/** One part of the homesite grade: its share of the points and how it's scored. */
export interface RulePart {
  key: string;
  label: string;
  /** Quality parts: the share of quality points, percent; cost parts: null. */
  weightPct: number | null;
  how: string;
}

export interface Rulebook {
  card: {
    /** The verdict panel's rules: the points per letter, the grade's cutoffs, the verdict. */
    verdict: RulePanel;
    weights: { key: RowKey; label: string; byPerson: Record<Person, number> }[];
    gates: RulePanel[];
    rows: RulePanel[];
  };
  homesite: {
    intro: string;
    quality: RulePart[];
    flood: string;
    grades: string;
    cost: RulePart[];
    tiers: string;
    overall: string;
  };
}

const PEOPLE: Person[] = ["zach", "julie"];
const GATES: GateKey[] = ["floodplain", "access", "easement", "septic"];
const ROWS: RowKey[] = ["elevation", "homesite", "sky", "room", "trails", "town", "garden"];

/** The scales each panel shows (as the report's panels do), by panel. */
const PANEL_SCALES: Partial<Record<PanelKey, ScaleName[]>> = {
  easement: ["Driveway"],
  septic: ["Septic"],
  elevation: ["Elevation"],
  homesite: ["Winter sun", "Facing", "Frost belt", "Slope as foundation"],
  sky: ["Sky"],
  room: ["Room to build"],
  trails: ["Trails"],
  town: ["Town and hospital"],
  garden: ["Garden"],
};

function ruleScale(name: ScaleName, C: Constants): RuleScale {
  const id = SCALE_IDS[name];
  return {
    id,
    name,
    bands: scaleBands(name, C.bands, C.card.rows.roomX).map((label, i) => ({
      label,
      meanings: MEANINGS[id][i] ?? [],
    })),
  };
}

function rulePanel(key: PanelKey, C: Constants): RulePanel {
  const t = panelText(key, C.card, C.build);
  return { key, ...t, scales: (PANEL_SCALES[key] ?? []).map((n) => ruleScale(n, C)) };
}

/**
 * "100 up to 6°, 75 at 10°, 50 at 14°, …": a curve's points in words, the leading points with the same value as one
 * ("100 up to 30° off", not "100 up to 0°, 100 at 30°"). Between the points the score runs in a straight line.
 */
function curveWords(pts: Curve, unit: string): string {
  let lead = 0;
  while (lead + 1 < pts.length && pts[lead + 1]![1] === pts[0]![1]) lead++;
  const [x0, y0] = pts[lead]!;
  return [
    `${fmt(y0)} up to ${fmt(x0)}${unit}`,
    ...pts.slice(lead + 1).map(([x, y]) => `${fmt(y)} at ${fmt(x)}${unit}`),
  ].join(", ");
}

const pct = (share: number) => fmt(share * 100);

/** The rulebook for these constants and Settings. */
export function rulebook(C: Constants = SCREEN_CONSTANTS, cfg: UserConfig = DEFAULT_USER_CONFIG): Rulebook {
  const S = C.score,
    SU = C.suitability,
    D = C.driveway,
    W = S.weights;
  const fr = SU.frostHouse;
  const [m0, m1] = C.sky.magRange;
  const aspect = SU.aspectCurve;
  const quality: RulePart[] = [
    {
      key: "sun",
      label: "December sun",
      weightPct: W.sun * 100,
      how: `The share of December's daylight with the sun above the skyline (after the Settings' ${fmt(cfg.canopyDeg)}° canopy allowance), from 0 to 100. Over ${pct(S.sunGoodShare)}% reads "good", over ${pct(S.sunOkShare)}% "acceptable".`,
    },
    {
      key: "aspect",
      label: "Facing",
      weightPct: W.aspect * 100,
      how: `By how far the ground faces from ${fmt(S.siteAspectTargetDeg)}° (${compass(S.siteAspectTargetDeg)}): ${curveWords(aspect, "° off")}. Ground flatter than ${fmt(SU.flatBelowDeg)}° faces every way and scores ${fmt(aspect[0]![1])}.`,
    },
    {
      key: "frost",
      label: "Frost position",
      weightPct: W.frost * 100,
      how: `By height above the valley floor, where cold air pools: ${fmt(fr.atFloor)} on the floor, ${fmt(fr.full)} from ${fmt(cfg.thermalMinFt)} ft (Settings) to ${fmt(fr.beltTopFt)} ft above it, ${fmt(fr.exposed)} from ${fmt(fr.exposedFt)} ft, where it's exposed.`,
    },
    {
      key: "slope",
      label: "Slope",
      weightPct: W.slope * 100,
      how: `The cost of a level pad: ${curveWords(SU.slopeHouse, "°")}.`,
    },
    {
      key: "sky",
      label: "Night sky",
      weightPct: W.sky * 100,
      how: `From 0 at ${fmt(m0, 1)} to 100 at ${fmt(m1, 1)} mag/arcsec² overhead; up to ${fmt(C.sky.domePenaltyMax)} less for a light dome to the south; ${fmt(C.sky.coreBlockedPenalty)} less when a ridge hides the Milky Way's core, ${fmt(C.sky.coreLowPenalty)} less when it clears the ridge by under ${fmt(C.sky.coreLowDeg)}°; ${fmt(S.skyIfMissing)} when the sky didn't load.`,
    },
  ];
  const DC = S.drivewayCost;
  const cost: RulePart[] = [
    {
      key: "septic",
      label: "Septic",
      weightPct: null,
      how: `By NRCS's septic rating: ${fmt(S.septic.fine)} not limited, ${fmt(S.septic.workable)} somewhat limited, ${fmt(S.septic.poor)} very limited, ${fmt(S.septic.unrated)} unrated.`,
    },
    {
      key: "foundation",
      label: "Foundation",
      weightPct: null,
      how: `By NRCS's rating for dwellings without basements: ${fmt(S.foundation.fine)} not limited, ${fmt(S.foundation.workable)} somewhat limited, ${fmt(S.foundation.poor)} very limited, ${fmt(S.foundation.unrated)} unrated.`,
    },
    {
      key: "rock",
      label: "Rock",
      weightPct: null,
      how: `Up to ${fmt(S.rock)}: in full with bedrock at ${fmt(S.rockDepthCm.full)} cm or shallower, none at ${fmt(S.rockDepthCm.none)} cm or deeper, or with no bedrock reported.`,
    },
    {
      key: "pad",
      label: "House pad",
      weightPct: null,
      how: `By slope: ${curveWords(S.pad, "°")}; ${fmt(S.compactPad)} for a compact site's cut pad.`,
    },
    {
      key: "driveway",
      label: "Driveway",
      weightPct: null,
      how: `From the routed driveway's cost: ${fmt(DC.k)} × ln(1 + cost ÷ $${fmt(DC.c0)}); ${fmt(DC.easement)} more when it needs an easement; when it needs more than the grade limit (Settings: ${fmt(cfg.roadMaxGradePct)}%), ${fmt(D.overLimitPtsPerPct)} more a percent over it up to ${fmt(D.practicalMaxPct)}%, rising to ${fmt(D.overLimitMaxPts)} at ${fmt(D.overLimitMaxAtPct)}%; at most ${fmt(DC.max)}. A route steeper than the veto (Settings: ${fmt(cfg.roadVetoGradePct)}% over ${fmt(D.gradeWindowsM.headline)} m) can't be chosen.`,
    },
  ];
  const [gA, gB, gC, gD] = S.grades.map(([v]) => v);
  const [t1, t2, t3] = S.costTiers.map(([v]) => v);
  return {
    card: {
      verdict: rulePanel("verdict", C),
      weights: ROWS.map((key) => ({
        key,
        label: panelText(key, C.card, C.build).title,
        byPerson: Object.fromEntries(PEOPLE.map((p) => [p, C.card.weights[p][key]])) as Record<
          Person,
          number
        >,
      })),
      gates: GATES.map((k) => rulePanel(k, C)),
      rows: ROWS.map((k) => rulePanel(k, C)),
    },
    homesite: {
      intro:
        "The homesite grade picks and orders the build sites; it never grades the parcel. Each site gets two numbers: its quality, which money can't change, and what it costs to build there.",
      quality,
      flood: `A site inside a FEMA flood zone keeps ${pct(S.sfhaQualityFactor)}% of its quality.`,
      grades: `Quality grades: A from ${fmt(gA!)}, B from ${fmt(gB!)}, C from ${fmt(gC!)}, D from ${fmt(gD!)}, F under that.`,
      cost,
      tiers: `Build cost tiers: $ under ${fmt(t1!)}, $$ under ${fmt(t2!)}, $$$ under ${fmt(t3!)}, $$$$ above.`,
      overall: `The sites are ranked by ${pct(S.overall.quality)}% quality and ${pct(S.overall.cost)}% build cost (100 less its points).`,
    },
  };
}
