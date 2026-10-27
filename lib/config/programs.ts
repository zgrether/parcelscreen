/**
 * How it could pay (step 15, docs/plans/step-15-how-it-could-pay.md §3): the state and federal programs, carbon
 * programs, the hunting-lease range and our own working thresholds. Researched 2026-10-27.
 *
 * Every value is a `Sourced` fact: what it says, its source, the source's own date, the date checked and a confidence
 * word. The session that researched it couldn't open the official hosts (the network policy denied them), so every
 * figure was read from a search excerpt of the page named and is "to confirm" until someone opens the page (PR 1, §1).
 * `kind` keeps what the source is, so confirming one is a one-word change. A number is never guessed: when no source
 * gives one, the value is null and the fact says so.
 *
 * Dated config: re-check a program when its row is a year old, and Virginia's yearly limit after each Appropriation Act.
 */
import type { StateCode } from "./counties";

/** What the source is, as read: a statute, a state or federal agency, the program itself, a county, a third party. */
export type SourceKind = "statute" | "agency" | "program" | "county" | "third party" | "ours";

/**
 * "from the statute", "from the agency", "from the program", "from the county": read in the source's own text.
 * "to confirm": seen only in an excerpt, from a third party, or not found. "ours": a working figure of the app's own.
 */
export type PayConfidence =
  "from the statute" | "from the agency" | "from the program" | "from the county" | "to confirm" | "ours";

export interface Sourced<T> {
  value: T;
  /** The plain-language rule, as the panel says it. */
  says: string;
  source: string;
  kind: SourceKind;
  /** The source's own date, edition or tax year, as it states it ("2026", "TY2026", "current"). */
  asOf: string;
  checked: string;
  confidence: PayConfidence;
}

export const PAY_CHECKED = "2026-10-27";

/** A fact read from a search excerpt of its source: to confirm until the page itself is read. */
export const excerpt = <T>(
  value: T,
  says: string,
  source: string,
  kind: SourceKind,
  asOf: string,
): Sourced<T> => ({
  value,
  says,
  source,
  kind,
  asOf,
  checked: PAY_CHECKED,
  confidence: "to confirm",
});

/** A working figure of ours, where no official source sets one. */
const ours = <T>(value: T, says: string, source: string): Sourced<T> => ({
  value,
  says,
  source,
  kind: "ours",
  asOf: PAY_CHECKED,
  checked: PAY_CHECKED,
  confidence: "ours",
});

// ---------- Conservation easements ----------

const VA_512 = "https://law.lis.virginia.gov/vacode/title58.1/chapter3/section58.1-512/";
const VA_TAX_LPC = "https://www.tax.virginia.gov/land-preservation-tax-credit";
const VA_BUDGET = "https://budget.lis.virginia.gov/item/2026/2/HB30/Chapter/3/3-5.19/";
const VA_TRANSFER = "https://www.tax.virginia.gov/transferring-land-preservation-tax-credit";
const NC_15311 =
  "https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_105/GS_105-153.11.html";
const NC_DOR_CREDIT =
  "https://www.ncdor.gov/taxes-forms/individual-income-tax/personal-taxes-division-directives/nc-conservation-tax-credit";
const NC_2773 =
  "https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_105/GS_105-277.3.html";
const TN_GREENBELT =
  "https://comptroller.tn.gov/boards/state-board-of-equalization/sboe-services/greenbelt0.html";
const IRC_170 = "https://www.law.cornell.edu/uscode/text/26/170";

/** A state income-tax credit for donating a conservation easement: a share of its appraised value, with its limits. */
export interface EasementCredit {
  name: string;
  /** The credit as a percent of the easement's appraised (fair market) value. */
  ratePct: Sourced<number>;
  /** The most one donation earns, $; null when there's no such cap. */
  maxCredit: Sourced<number | null>;
  /** The most a taxpayer can use in one year, $; null when there's no yearly limit. */
  yearlyUse: Sourced<number | null>;
  carryYears: Sourced<number>;
  /** Whether unused credit can be sold, and how. */
  transfer: Sourced<string | null>;
  /** The last day a donation earns it, ISO; null for no end date. */
  donatedBy: Sourced<string | null>;
  /** Further rules, in words: the statewide cap, certification, deadlines. */
  notes: Sourced<string>[];
}

export interface StateEasement {
  state: StateCode;
  /** Null: no state credit, said by `noCredit`. */
  credit: EasementCredit | null;
  noCredit: Sourced<string> | null;
  /** A property-tax benefit for land under an easement, where the state has one. */
  propertyTax: Sourced<string> | null;
}

export const STATE_EASEMENT: Readonly<Record<StateCode, StateEasement>> = {
  VA: {
    state: "VA",
    credit: {
      name: "Land Preservation Tax Credit",
      ratePct: excerpt(
        40,
        "40% of the fair market value of the donated easement, for donations from 2007 on (Va. Code §58.1-512)",
        VA_512,
        "statute",
        "current",
      ),
      maxCredit: excerpt(null, "No cap on one donation's credit found", VA_512, "statute", "current"),
      yearlyUse: excerpt(
        20000,
        "A taxpayer can use at most $20,000 a year, carryovers included (the Appropriation Act, from tax year 2024)",
        VA_BUDGET,
        "statute",
        "2026 Appropriation Act, item 3-5.19",
      ),
      carryYears: excerpt(
        10,
        "Unused credit carries forward 10 years (§58.1-512 C.1)",
        VA_512,
        "statute",
        "current",
      ),
      transfer: excerpt(
        "Transferable",
        "Unused credit can be sold; the buyer has the same yearly limit, and Virginia Tax charges a fee of 5% of the credit transferred (Form LPC-2)",
        VA_TRANSFER,
        "agency",
        "2025 forms",
      ),
      donatedBy: excerpt(null, "No end date", VA_512, "statute", "current"),
      notes: [
        excerpt(
          "$75 million a year statewide",
          "Virginia issues at most $75 million in credits a calendar year",
          VA_TAX_LPC,
          "agency",
          "current",
        ),
        excerpt(
          "DCR reviews credits of $1 million or more",
          "A credit of $1 million or more needs the Department of Conservation and Recreation to verify the conservation value",
          VA_TAX_LPC,
          "agency",
          "current",
        ),
        excerpt(
          "Apply by December 31 of the second year after recording",
          "Apply by December 31 of the second year after the year the easement was recorded",
          VA_TAX_LPC,
          "agency",
          "current",
        ),
      ],
    },
    noCredit: null,
    propertyTax: null,
  },
  NC: {
    state: "NC",
    credit: {
      name: "Conservation Tax Credit",
      ratePct: excerpt(
        25,
        "25% of the fair market value of donated land or a perpetual conservation easement (G.S. 105-153.11)",
        NC_15311,
        "statute",
        "2025",
      ),
      maxCredit: excerpt(
        250000,
        "At most $250,000 for an individual ($500,000 for a pass-through entity or corporation)",
        NC_15311,
        "statute",
        "2025",
      ),
      yearlyUse: excerpt(null, "No yearly use limit found", NC_DOR_CREDIT, "agency", "2025"),
      carryYears: excerpt(5, "Unused credit carries forward 5 years", NC_15311, "statute", "2025"),
      transfer: excerpt(null, "Not transferable (none found)", NC_DOR_CREDIT, "agency", "2025"),
      donatedBy: excerpt(
        "2026-12-31",
        "Only for donations made in 2025 and 2026: it ends for donations from January 1, 2027",
        NC_15311,
        "statute",
        "2025",
      ),
      notes: [
        excerpt(
          "$5 million a year statewide, pro-rated",
          "At most $5 million a year statewide ($3.25 million set aside for farm and forest land); pro-rated when claims exceed it",
          NC_DOR_CREDIT,
          "agency",
          "2025 (TA-25-1)",
        ),
        excerpt(
          "DNCR certifies the land",
          "The Department of Natural and Cultural Resources must certify the land: ask by January 15 after the donation",
          NC_DOR_CREDIT,
          "agency",
          "2025 (TA-25-1)",
        ),
      ],
    },
    noCredit: null,
    propertyTax: excerpt(
      "Present-use value without the production test",
      "Land under a qualifying conservation easement can keep present-use value without the production or income tests (G.S. 105-277.3)",
      NC_2773,
      "statute",
      "current (amended 2022)",
    ),
  },
  TN: {
    state: "TN",
    credit: null,
    noCredit: excerpt(
      "No state credit",
      "No state tax credit for conservation easements found; Tennessee has no income tax on wages",
      TN_GREENBELT,
      "agency",
      "current",
    ),
    propertyTax: excerpt(
      "Greenbelt open space",
      "Land of 3 acres or more under a perpetual conservation easement can be taxed at use value as Greenbelt open space (T.C.A. 67-5-1004(7))",
      TN_GREENBELT,
      "agency",
      "2022",
    ),
  },
};

/** The federal income-tax deduction for a donated easement (IRC §170(h)), in one line. */
export const FEDERAL_EASEMENT = {
  agiPct: excerpt(
    50,
    "Deductible up to 50% of your adjusted gross income a year",
    IRC_170,
    "statute",
    "current",
  ),
  farmerPct: excerpt(
    100,
    "Up to 100% for a qualified farmer or rancher (more than half of gross income from farming)",
    IRC_170,
    "statute",
    "current",
  ),
  carryYears: excerpt(15, "The excess carries forward 15 years", IRC_170, "statute", "current"),
} as const;

// ---------- Use-value taxation ----------

/** A state's use-value program: its name, minimums, the rollback when the use changes, and how land is assessed. */
export interface StateUseValue {
  state: StateCode;
  name: string;
  forestMinAc: Sourced<number>;
  /** Farm land's minimum, for open land (its own tests apply). */
  farmMinAc: Sourced<number>;
  /** Whether a county must adopt it (Virginia) or every county has it (North Carolina, Tennessee). */
  countyOptIn: Sourced<boolean>;
  rollback: Sourced<string>;
  /** Rules the screen can't see: ownership years, a management plan, the application. */
  requirements: Sourced<string>[];
  /** Assessed value as a share of appraised value: the tax rate applies to the assessed value. */
  assessedShare: Sourced<number>;
  /** Forest use values per acre the state publishes for the whole region ($/ac, low–high by class); null if none. */
  forestPerAc: Sourced<{ low: number; high: number } | null>;
}

const VA_3233 = "https://law.lis.virginia.gov/vacode/title58.1/chapter32/section58.1-3233/";
const VA_3231 = "https://law.lis.virginia.gov/vacode/title58.1/chapter32/section58.1-3231/";
const VA_3237 = "https://law.lis.virginia.gov/vacode/title58.1/chapter32/section58.1-3237/";
const NC_2774 =
  "https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_105/GS_105-277.4.html";
const NC_FS_PUV = "https://www.ncagr.gov/divisions/nc-forest-service/managing-your-forest/puv";
const NC_UVAB = "https://www.ncdor.gov/2026-uvab-manualpdf/open";
const TN_MANUAL =
  "https://www.comptroller.tn.gov/content/dam/cot/sboe/documents/rules-&-manuals/2024.10.GreenbeltManual.pdf";
const TN_1008 = "https://law.justia.com/codes/tennessee/title-67/chapter-5/part-10/section-67-5-1008/";
const TN_TAXBILL =
  "https://comptroller.tn.gov/office-functions/pa/property-taxes/how-to-figure-your-tax-bill.html";

export const STATE_USE_VALUE: Readonly<Record<StateCode, StateUseValue>> = {
  VA: {
    state: "VA",
    name: "land use assessment",
    forestMinAc: excerpt(
      20,
      "Forest land needs 20 acres (Va. Code §58.1-3233)",
      VA_3233,
      "statute",
      "current",
    ),
    farmMinAc: excerpt(
      5,
      "Farm and horticultural land needs 5 acres (§58.1-3233)",
      VA_3233,
      "statute",
      "current",
    ),
    countyOptIn: excerpt(
      true,
      "Each county chooses by ordinance whether to offer it, and for which classes (§58.1-3231)",
      VA_3231,
      "statute",
      "current",
    ),
    rollback: excerpt(
      "5 years plus interest",
      "If the use changes, the taxes saved in the 5 most recent tax years come due, with simple interest at the county's rate (§58.1-3237)",
      VA_3237,
      "statute",
      "current",
    ),
    requirements: [
      excerpt(
        "Apply to the commissioner of the revenue",
        "Apply to the county's commissioner of the revenue, who may ask for a forest management plan",
        VA_3233,
        "statute",
        "current",
      ),
    ],
    assessedShare: excerpt(
      1,
      "Virginia assesses real estate at 100% of fair market value (Va. Code §58.1-3201)",
      "https://law.lis.virginia.gov/vacode/title58.1/chapter32/section58.1-3201/",
      "statute",
      "current",
    ),
    forestPerAc: excerpt(null, "Each county adopts its own values", VA_3231, "statute", "current"),
  },
  NC: {
    state: "NC",
    name: "Present-Use Value",
    forestMinAc: excerpt(
      20,
      "Forest land needs one tract of at least 20 acres in actual production (G.S. 105-277.3)",
      NC_2773,
      "statute",
      "current",
    ),
    farmMinAc: excerpt(
      10,
      "Farm land needs 10 acres in production, with an income test (G.S. 105-277.3)",
      NC_2773,
      "statute",
      "current",
    ),
    countyOptIn: excerpt(
      false,
      "A state classification every county applies; no county opt-in found",
      NC_2773,
      "statute",
      "current",
    ),
    rollback: excerpt(
      "3 years plus interest",
      "If the land leaves the program, the deferred taxes for that year and the 3 before come due, with interest (G.S. 105-277.4)",
      NC_2774,
      "statute",
      "current",
    ),
    requirements: [
      excerpt(
        "Owned 4 years",
        "You (or a relative) must have owned the land for the 4 years before January 1 of the year you apply",
        NC_FS_PUV,
        "agency",
        "current",
      ),
      excerpt(
        "A written forest management plan",
        "A written sound forest management plan for producing and selling forest products, in place before January 1",
        NC_2773,
        "statute",
        "current",
      ),
    ],
    assessedShare: excerpt(
      1,
      "North Carolina appraises at true value as of the county's last reappraisal (G.S. 105-283)",
      "https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_105/GS_105-283.html",
      "statute",
      "current",
    ),
    forestPerAc: excerpt(
      { low: 55, high: 395 },
      "The Mountains' forest use values run $55 to $395 an acre by productivity class (2026 Use-Value Manual, MLRA 130)",
      NC_UVAB,
      "agency",
      "2026",
    ),
  },
  TN: {
    state: "TN",
    name: "Greenbelt",
    forestMinAc: excerpt(
      15,
      "Forest land needs 15 acres, in one tract or two in the same county (Greenbelt Manual)",
      TN_MANUAL,
      "agency",
      "Oct 2024",
    ),
    farmMinAc: excerpt(
      15,
      "Farm land needs 15 acres, woodland included (Greenbelt Manual)",
      TN_MANUAL,
      "agency",
      "Oct 2024",
    ),
    countyOptIn: excerpt(
      false,
      "State law, run by each county's assessor; no county opt-in found",
      TN_MANUAL,
      "agency",
      "Oct 2024",
    ),
    rollback: excerpt(
      "3 years",
      "If the use changes, the taxes saved in the last 3 years come due (5 for open space; T.C.A. 67-5-1008)",
      TN_1008,
      "statute",
      "current",
    ),
    requirements: [
      excerpt(
        "Apply to the county assessor",
        "Apply to the county assessor of property; forest land may need a forest plan",
        TN_MANUAL,
        "agency",
        "Oct 2024",
      ),
    ],
    assessedShare: excerpt(
      0.25,
      "Tennessee assesses farm and residential land at 25% of its appraised value",
      TN_TAXBILL,
      "agency",
      "current",
    ),
    forestPerAc: excerpt(
      null,
      "Use values are set by the state's Division of Property Assessments and aren't published online",
      TN_MANUAL,
      "agency",
      "Oct 2024",
    ),
  },
};

// ---------- Forest carbon ----------

export interface CarbonProgram {
  name: string;
  url: string;
  /** The states it enrolls in, with any region within them. */
  states: Sourced<readonly StateCode[]>;
  minForestAc: Sourced<number>;
  contract: Sourced<string>;
}

const FFCP = "https://familyforestcarbon.org/get-started";

/** Programs open to small family forests in VA, NC or TN today. CORE Carbon (40 ac) and NCX weren't confirmed open. */
export const CARBON_PROGRAMS: readonly CarbonProgram[] = [
  {
    name: "Family Forest Carbon Program",
    url: FFCP,
    states: excerpt(
      ["VA", "NC", "TN"],
      "Enrolls in western Virginia, western North Carolina and all of Tennessee",
      FFCP,
      "program",
      "undated (live page)",
    ),
    minForestAc: excerpt(
      30,
      "30 acres or more of naturally regenerating (not planted) forest, with the right to harvest",
      FFCP,
      "program",
      "undated (live page)",
    ),
    contract: excerpt(
      "20 years",
      "A 20-year practice contract: grow older forests (deferred harvest) or enhance your woods (limited harvest)",
      "https://www.nature.org/en-us/newsroom/family-forest-carbon-program-opens-to-small-landowners-tnc-vt/",
      "program",
      "2022",
    ),
  },
];

// ---------- Hunting lease ----------

/**
 * A yearly lease's $/acre: the nearest extension figure found (Maryland, 2021). Virginia's, NC's and Tennessee's own
 * surveys are from 1985 and 1998, too old to quote. Always "low" confidence in the panel.
 */
export const HUNTING_LEASE: Sourced<{ low: number; high: number }> = excerpt(
  { low: 3, high: 10 },
  "Yearly deer and turkey leases commonly run $3 to $10 an acre (University of Maryland Extension; no current VA, NC or TN survey found)",
  "https://extension.umd.edu/sites/extension.umd.edu/files/2021-03/RES_07HuntingLease.pdf",
  "agency",
  "Mar 2021",
);

// ---------- Working thresholds ----------

/**
 * The thresholds the options read. Each says where it comes from; "ours" where no official source sets it (plan §8,
 * §12 Q7). None of them reaches the grade.
 */
export const PAY_THRESHOLDS = {
  /** Under this, a land trust looks for a designated conservation resource, not forest alone (VOF, secondhand). */
  easementSmallAc: excerpt(
    50,
    "Easements under 50 acres must add to a designated conservation resource (Virginia Outdoors Foundation's guidelines, as quoted in the press)",
    "https://www.vof.org/resources/frequently-asked-questions/",
    "third party",
    "current",
  ),
  easementForestPct: ours(
    50,
    "Half the parcel or more in forest counts as a conservation value (ours)",
    PAY_CHECKED,
  ),
  /** Public land or the Blue Ridge Parkway this near counts toward an easement's value (a viewshed is a land trust's call). */
  nearPublicMi: ours(
    1,
    "Public land or the Parkway within a mile (ours; a land trust judges the view)",
    PAY_CHECKED,
  ),
  leaseMinAc: ours(
    50,
    "50 acres or more to lease for hunting (ours; no extension minimum found)",
    PAY_CHECKED,
  ),
  timberMinAc: excerpt(
    10,
    "A logger typically needs 10 to 20 acres to take on a harvest (USDA Forest Service, Southern Research Station)",
    "https://research.fs.usda.gov/srs/yardtrees",
    "agency",
    "updated 2025-01-30",
  ),
  timberNoneAc: ours(2, "Under 2 acres of forest is too little to sell (ours)", PAY_CHECKED),
  /** Carbon's Maybe: forest acres within this share below a program's minimum. */
  carbonNearPct: ours(20, "Within 20% of a program's minimum (ours)", PAY_CHECKED),
} as const;

/** The break-even's assumed defaults (plan §4, §12 Q5): labelled "assumed" and editable. */
export const BREAK_EVEN_DEFAULTS = {
  years: ours(2, "2 years held (assumed)", PAY_CHECKED),
  ratePct: ours(7, "7% a year interest (assumed)", PAY_CHECKED),
} as const;

/** The consulting forester's cruise (VDOF): there's no timber number without one. */
export const TIMBER_CRUISE: Sourced<string> = excerpt(
  "Get a cruise from a consulting forester",
  "Hire a consulting forester to cruise and value the timber before any sale; never sell timber without an appraisal (Virginia Department of Forestry)",
  "https://dof.virginia.gov/forest-management-health/landowner-assistance/selling-timber/get-started-selling-timber",
  "agency",
  "undated",
);

/** The state health rules a campground answers to, beside the county's own. */
export const STATE_CAMPGROUND: Readonly<Record<StateCode, Sourced<string | null>>> = {
  VA: excerpt(
    "A health department permit for 3 or more campsites",
    "A campground of 3 or more campsites needs a Virginia Department of Health permit, applied for 30 days before opening (12VAC5-450)",
    "https://law.lis.virginia.gov/admincode/title12/agency5/chapter450/",
    "statute",
    "current",
  ),
  NC: excerpt(
    null,
    "No general state campground rule found (summer camps and primitive camps have their own)",
    "https://ehs.dph.ncdhhs.gov/docs/rules/SummerCamps-15ANCAC18A-1000.pdf",
    "agency",
    "current",
  ),
  TN: excerpt(
    "Organized camps need a state permit",
    "Organized camps need a Department of Health permit (Tenn. Comp. R. & Regs. 1200-01-05); whether a campground for paying visitors is one is to confirm",
    "https://www.tn.gov/health/health-program-areas/eh-program/eh-camps.html",
    "agency",
    "current",
  ),
};
