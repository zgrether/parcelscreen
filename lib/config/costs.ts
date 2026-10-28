/**
 * The cost to enjoy's unit rates (step 10, docs/plans/step-10-cost-to-enjoy.md §1): every rate a published low–high
 * range with its source, URL, the source's own date and the date it was checked. There is no builder quote. Regional
 * sources come first (NRCS Tennessee's FY2026 EQIP schedule, Appalachian Power's Virginia tariff, western-NC contractors'
 * price guides, co-op fee schedules, a Virginia builder's guide); national guides fill the gaps, labelled so.
 *
 * NRCS's schedule lists payment rates at 75% of typical cost: the cost here is the rate ÷ 0.75, our derivation. Rule 4
 * (CLAUDE.md): changing a default here is a declared numbers change, with its source.
 *
 * Settings → Costs edits them (low and high), kept as overrides in the profile's `ps.costs` (lib/client/costRates.ts).
 * They're never a run's input: the engine's own driveway estimate keeps `UserConfig.dw`.
 */

import { SCREEN_CONSTANTS } from "../screen/config";

export type CostKey =
  | "driveway.new"
  | "driveway.upgrade.improved"
  | "driveway.upgrade.pioneer"
  | "driveway.upgrade.uncleared"
  | "driveway.paving"
  | "track.pioneer"
  | "culvert"
  | "well.depthFt"
  | "well.perFt"
  | "well.pump"
  | "septic.conventional"
  | "septic.modified"
  | "septic.alternative"
  | "power.perFt"
  | "power.hookup"
  | "clearing"
  | "pad.flat"
  | "pad.sloped"
  | "pad.steep"
  | "easement.legal"
  | "split.survey"
  | "split.legal"
  | "split.road";

export type CostGroup = "driveway" | "water" | "power" | "site" | "legal" | "split";

export const COST_GROUPS: readonly { id: CostGroup; label: string }[] = [
  { id: "driveway", label: "Driveway and track" },
  { id: "water", label: "Water and septic" },
  { id: "power", label: "Power" },
  { id: "site", label: "Clearing and pad" },
  { id: "legal", label: "Legal" },
  // Step 15 (plan §3): a split's costs, for the break-even on a piece sold.
  { id: "split", label: "Splitting land" },
];

export interface CostSource {
  name: string;
  url: string;
  /** The source's own date or edition, as it states it ("2026", "Jan 2025", "undated"). */
  date: string;
  /** "regional (NC mountains)", "national", …: how near the Blue Ridge it is. */
  where: string;
}

export interface CostRate {
  key: CostKey;
  label: string;
  /** "$/ft", "$ each", "$/ac", "$ per site", "$", or "ft" for the well's depth. */
  unit: string;
  low: number;
  high: number;
  group: CostGroup;
  sources: readonly CostSource[];
  /** What's in it, and any derivation of ours. */
  note: string;
}

/** When every source below was opened and read (plan §1). */
export const COSTS_CHECKED = "2026-10-21";

const NRCS_TN: CostSource = {
  name: "NRCS Tennessee, FY2026 EQIP payment schedule",
  url: "https://www.nrcs.usda.gov/sites/default/files/2026-03/TN%20Payment%20Schedule_FY2026%20EQIP%20version_0.xlsx",
  date: "FY2026 (Mar 2026)",
  where: "regional (TN)",
};
const GL = (page: string, path: string): CostSource => ({
  name: `gradinglands.com, ${page}`,
  url: `https://gradinglands.com/${path}/`,
  date: "2026",
  where: "regional (NC mountains)",
});
const HOMEGUIDE = (page: string, path: string): CostSource => ({
  name: `HomeGuide, ${page}`,
  url: `https://homeguide.com/costs/${path}`,
  date: "2026",
  where: "national",
});
const MCMAHON: CostSource = {
  name: "McMahon Custom Homes, rural Virginia lots",
  url: "https://mcmahoncustomhomesllc.com/plumbing-and-septic-system-considerations-for-rural-virginia-lots/",
  date: "Oct 2025",
  where: "regional (VA Piedmont)",
};

export const COST_RATES: readonly CostRate[] = [
  {
    key: "driveway.new",
    label: "Gravel driveway, new",
    unit: "$/ft",
    low: 24,
    high: 84,
    group: "driveway",
    sources: [GL("Driveway Grading & Gravel in WNC", "driveway-grading-and-gravel")],
    note: "$2–4 a sq ft gentle, $4–7 steep, at 12 ft wide (the × 12 is ours). HomeGuide gives $48–120/ft nationally.",
  },
  {
    key: "driveway.upgrade.improved",
    label: "Upgrade an improved (graveled) drive to a finished driveway",
    unit: "$/ft",
    low: 5,
    high: 12,
    group: "driveway",
    sources: [NRCS_TN],
    note: "Regrade and 2–4 in of gravel, 12 ft wide: NRCS 560 (gravel road) and 655 (shaping), ÷ 0.75. Our derivation.",
  },
  {
    key: "driveway.upgrade.pioneer",
    label: "Upgrade a pioneer track to a finished driveway",
    unit: "$/ft",
    low: 14,
    high: 25,
    group: "driveway",
    sources: [NRCS_TN],
    note: "6–8 in of base and surface, and shaping: NRCS 560 and 655, ÷ 0.75. Our derivation.",
  },
  {
    key: "driveway.upgrade.uncleared",
    label: "Upgrade an uncleared line to a finished driveway",
    unit: "$/ft",
    low: 21,
    high: 84,
    group: "driveway",
    sources: [NRCS_TN, GL("Driveway Grading & Gravel in WNC", "driveway-grading-and-gravel")],
    note: "About a new build: NRCS clearing, 655 steep trail and gravel, up to gradinglands' new rate. Our derivation.",
  },
  {
    key: "driveway.paving",
    label: "Paving steep stretches (on top of the gravel)",
    unit: "$/ft",
    low: 30,
    high: 84,
    group: "driveway",
    sources: [
      {
        name: "Fixr, Concrete Driveway Cost",
        url: "https://www.fixr.com/costs/concrete-driveway-paving",
        date: "Jan 2025",
        where: "national",
      },
      MCMAHON,
    ],
    note: "Two 2.5 ft concrete strips ($6–12 a sq ft) at the low end; full-width asphalt ($3–7 a sq ft × 12 ft) at the high.",
  },
  {
    key: "track.pioneer",
    label: "Pioneer track (cleared, graded, 4x4)",
    unit: "$/ft",
    low: 5,
    high: 18,
    group: "driveway",
    sources: [NRCS_TN],
    note: "NRCS 655 Forest Trails and Landings, ÷ 0.75: $5.27 a foot on gentle slopes to $17.84 on steep ones.",
  },
  {
    key: "culvert",
    label: "Driveway culvert, installed",
    unit: "$ each",
    low: 1200,
    high: 6000,
    group: "driveway",
    sources: [GL("Culvert Installation Cost in NC", "culvert-installation-cost")],
    note: "A 12–24 in pipe. NRCS 578 gives $2.2k–4.6k for 15–24 in.",
  },
  {
    key: "well.depthFt",
    label: "Typical Blue Ridge well depth",
    unit: "ft",
    low: 150,
    high: 400,
    group: "water",
    sources: [
      {
        name: "USGS WRI 00-4270, ground water in the New River basin (VA and NC)",
        url: "https://pubs.usgs.gov/wri/wri00-4270/",
        date: "2001",
        where: "regional (VA, NC)",
      },
    ],
    note: "Wells in the Blue Ridge run 50–400 ft, sometimes past 500. Virginia Cooperative Extension's Carroll Co. samples (2011–17) run 30–700 ft.",
  },
  {
    key: "well.perFt",
    label: "Drilled well, complete (drilling, casing, pump)",
    unit: "$/ft",
    low: 30,
    high: 80,
    group: "water",
    sources: [HOMEGUIDE("Well Drilling Cost", "well-drilling-cost")],
    note: "A national guide. Black Rabbit Construction (WNC) gives $8k–20k+ for 150–400+ ft.",
  },
  {
    key: "well.pump",
    label: "Pump and line for your well or spring",
    unit: "$",
    low: 400,
    high: 2500,
    group: "water",
    sources: [HOMEGUIDE("Well Drilling Cost", "well-drilling-cost")],
    note: "A well pump. No published figure for developing a spring, so a spring is priced the same.",
  },
  {
    key: "septic.conventional",
    label: "Septic, conventional",
    unit: "$",
    low: 3500,
    high: 15000,
    group: "water",
    sources: [HOMEGUIDE("Septic System Cost", "septic-tank-system-cost"), MCMAHON],
    note: "A gravity drainfield. Black Rabbit Construction (WNC) says $15k–40k.",
  },
  {
    key: "septic.modified",
    label: "Septic, modified (low-pressure, shallow)",
    unit: "$",
    low: 7000,
    high: 20000,
    group: "water",
    sources: [
      {
        name: "NC State Extension, Investigate Before You Invest",
        url: "https://content.ces.ncsu.edu/investigate-before-you-invest",
        date: "Apr 2025",
        where: "regional (NC)",
      },
      HOMEGUIDE("Septic System Cost", "septic-tank-system-cost"),
    ],
    note: 'Extension: a low-pressure pipe system "may cost twice as much" as a conventional one. Our derivation.',
  },
  {
    key: "septic.alternative",
    label: "Septic, alternative (mound, aerobic unit, drip)",
    unit: "$",
    low: 15000,
    high: 55000,
    group: "water",
    sources: [HOMEGUIDE("Septic System Cost", "septic-tank-system-cost"), MCMAHON],
    note: "Black Rabbit Construction (WNC) says $40k–80k+.",
  },
  {
    key: "power.perFt",
    label: "Overhead power line",
    unit: "$/ft",
    low: 0,
    high: 15,
    group: "power",
    sources: [
      {
        name: "Appalachian Power, Virginia SCC Tariff No. 28, sheets 3-13 and 3-14",
        url: "https://www.appalachianpower.com/lib/docs/cleanenergy/electric-cars/APCoStandardTariff28-January12025SUTUpdate.pdf",
        date: "eff. Jan 2025",
        where: "regional (VA)",
      },
      HOMEGUIDE("Cost to Run Power", "cost-to-run-power"),
    ],
    note: "Appalachian Power runs the first 1,000 ft free to a year-round home; $5–15/ft nationally beyond an allowance.",
  },
  {
    key: "power.hookup",
    label: "Service hookup: meter base and co-op fees",
    unit: "$",
    low: 575,
    high: 2500,
    group: "power",
    sources: [
      {
        name: "Blue Ridge Energy, New Service Checklist",
        url: "https://www.blueridgeenergy.com/resources/new-service-checklist",
        date: "undated",
        where: "regional (NC)",
      },
      {
        name: "Mountain Electric Cooperative, Deposits & Fees",
        url: "https://mountainelectric.com/services/residential/deposits-fees/",
        date: "eff. Oct 2015",
        where: "regional (TN)",
      },
      HOMEGUIDE("Cost to Run Power", "cost-to-run-power"),
    ],
    note: "A meter base ($500–2,100, national) and the co-op's fees ($75–383). The sum is ours.",
  },
  {
    key: "clearing",
    label: "Clearing wooded, steep ground",
    unit: "$/ac",
    low: 2500,
    high: 8500,
    group: "site",
    sources: [GL("Land Clearing Cost per Acre", "land-clearing-cost")],
    note: "Heavily wooded with stumps to steep ground with rough grading. NRCS 500 gives about $2.5k an acre.",
  },
  {
    key: "pad.flat",
    label: "House pad, flat site (under 4°)",
    unit: "$ per site",
    low: 6500,
    high: 11000,
    group: "site",
    sources: [GL("Building Pad Cost in NC", "building-pad-cost")],
    note: "Excavation, grading and compaction for the house.",
  },
  {
    key: "pad.sloped",
    label: "House pad, sloped site (4–10°)",
    unit: "$ per site",
    low: 11000,
    high: 18000,
    group: "site",
    sources: [GL("Building Pad Cost in NC", "building-pad-cost")],
    note: "Cut and fill.",
  },
  {
    key: "pad.steep",
    label: "House pad, steep site (over 10°)",
    unit: "$ per site",
    low: 18000,
    high: 35000,
    group: "site",
    sources: [GL("Building Pad Cost in NC", "building-pad-cost")],
    note: "With a retaining wall. Rock adds $3.5k–15k+.",
  },
  {
    key: "easement.legal",
    label: "Recorded access easement: attorney, survey and recording",
    unit: "$",
    low: 3200,
    high: 11000,
    group: "legal",
    sources: [
      {
        name: "LegalClarity, How Much Does a Driveway Easement Cost",
        url: "https://legalclarity.org/how-much-does-a-driveway-easement-cost/",
        date: "Apr 2026",
        where: "national",
      },
      {
        name: "Virginia Code §17.1-275 (recording fees)",
        url: "https://law.lis.virginia.gov/vacode/title17.1/chapter2/section17.1-275/",
        date: "current",
        where: "statutory (VA)",
      },
      {
        name: "NC General Statutes §161-10 (recording fees)",
        url: "https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_161/GS_161-10.html",
        date: "current",
        where: "statutory (NC)",
      },
    ],
    note: "Attorney $2k–5k, survey and plat $1.2k–5.5k, recording under $200. Not any payment to the neighbour.",
  },
  // Step 15 (plan §3, §4): researched 2026-10-27 from search excerpts, not opened (the network denied the hosts), so
  // each is to confirm; no regional surveyor or attorney publishes a fee page.
  {
    key: "split.survey",
    label: "Division survey and plat",
    unit: "$",
    low: 1200,
    high: 6000,
    group: "split",
    sources: [
      {
        name: "Fixr, Land Survey Cost (to confirm)",
        url: "https://www.fixr.com/costs/land-survey",
        date: "undated",
        where: "national",
      },
      {
        name: "LegalClarity, How Much Does a Driveway Easement Cost (survey and plat)",
        url: "https://legalclarity.org/how-much-does-a-driveway-easement-cost/",
        date: "Apr 2026",
        where: "national",
      },
    ],
    note: "A boundary survey of the new line and the plat the county reviews. Fixr gives about $6k for 40 ac with new markers; small lots run under $1k. The county's own plat fee is extra.",
  },
  {
    key: "split.legal",
    label: "Deed, attorney and recording",
    unit: "$",
    low: 500,
    high: 1500,
    group: "split",
    sources: [
      {
        name: "ContractsCounsel, Property Deed Pricing (to confirm)",
        url: "https://www.contractscounsel.com/m/property-deed-pricing",
        date: "undated",
        where: "national, by state",
      },
      {
        name: "Virginia Code §17.1-275 (recording fees)",
        url: "https://law.lis.virginia.gov/vacode/title17.1/chapter2/section17.1-275/",
        date: "current",
        where: "statutory (VA)",
      },
      {
        name: "NC General Statutes §161-10 (recording fees)",
        url: "https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_161/GS_161-10.html",
        date: "current",
        where: "statutory (NC)",
      },
    ],
    note: "An attorney's deed for the piece sold ($380–920 by state, from bids) and recording (VA $23 for 10 pages; NC $26 for 15). Not the transfer taxes, which the sale's closing settles.",
  },
  {
    key: "split.road",
    label: "Road to the sold piece",
    unit: "$",
    low: 0,
    high: 0,
    group: "split",
    sources: [GL("Driveway Grading & Gravel in WNC", "driveway-grading-and-gravel")],
    note: "None for a piece on a public road (ours). When it needs a road, type it: a gravel road runs $24–84 a foot (the new-driveway rate above).",
  },
];

/** A rate's range. */
export interface Range {
  low: number;
  high: number;
}
export type Rates = Record<CostKey, Range>;

export const DEFAULT_RATES: Rates = Object.fromEntries(
  COST_RATES.map((r) => [r.key, { low: r.low, high: r.high }]),
) as Rates;

export const rateOf = (key: CostKey): CostRate => COST_RATES.find((r) => r.key === key)!;

/**
 * The cost's own assumptions (plan §2, §9 Q4–Q5), labelled as ours wherever they're shown.
 */
export const COST_ASSUMPTIONS = {
  /** A small campsite cleared, acres. */
  campsiteAc: 0.1,
  /** The house site cleared (house, yard and septic field), acres. */
  houseSiteAc: 0.5,
  /** A track to a Campsite mark off the route: its straight part × this for the turns. */
  trackTurns: 1.2,
  /** A route's stretch this close to a drawn line, m, runs along it. */
  onLineM: 15,
  /** A Well, Spring, Septic permit or Clearing mark this close to the site, ft, serves it. */
  nearMarkFt: 500,
  /** A site's slope, degrees, at which its pad is sloped, then steep. */
  padSlopedDeg: 4,
  padSteepDeg: 10,
} as const;

/**
 * Paving steep stretches (owner, #255 review, 10/21): on by default, where the route's 30 m grade passes `abovePct` (the
 * screen's paveAbovePct, 12%). Paving is on top of the gravel, which is its base. Off, steep stretches stay gravel: no
 * paving cost, and the breakdown notes the upkeep. Settings → Costs edits both.
 */
export interface Paving {
  on: boolean;
  abovePct: number;
}
export const DEFAULT_PAVING: Paving = { on: true, abovePct: SCREEN_CONSTANTS.driveway.paveAbovePct };
/** The threshold's editable range, %. */
export const PAVING_PCT = { min: 5, max: 25 } as const;

/** Everything Settings → Costs keeps: the rates and the paving choice. */
export interface CostSettings {
  rates: Rates;
  paving: Paving;
}
export const DEFAULT_COST_SETTINGS: CostSettings = { rates: DEFAULT_RATES, paving: DEFAULT_PAVING };
