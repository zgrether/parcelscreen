/**
 * How it could pay, per county (step 15, docs/plans/step-15-how-it-could-pay.md §3): for each of the ten counties in
 * `counties.ts`, whether its use-value program takes forest land, the forest use values it publishes, its real-estate
 * tax rate and its campground rule. Researched 2026-10-27; every figure read from a search excerpt of the page named,
 * so "to confirm" (programs.ts says why). A number not found is null, never guessed.
 */
import { excerpt, type Sourced } from "./programs";

export interface CountyPay {
  fips: string;
  /**
   * Whether forest land can enter the county's use-value program: true, false (no program, or no forest class), or
   * null when not found. `says` names the classes it takes.
   */
  forestUseValue: Sourced<boolean | null>;
  /** The county's own forest use values, $/ac, low–high by class; null when it publishes none (the state's may apply). */
  forestPerAc: Sourced<{ low: number; high: number } | null>;
  /** The real-estate tax rate, $ per $100 of assessed value; null when not found. `asOf` is its tax year. */
  taxPer100: Sourced<number | null>;
  /** The county's rule on campgrounds, in words; null when none was found. */
  campground: Sourced<string | null>;
}

const LUVA = "https://luva.aaec.vt.edu/estimates/";
const NCDOR_RATES = "https://www.ncdor.gov/2025-2026-county-tax-rates-finalpdf/open";
const statewide = (state: string, url: string): Sourced<boolean | null> =>
  excerpt(true, `${state}'s program is statewide; forest land qualifies`, url, "statute", "current");
const noCampRule = (url: string) =>
  excerpt<string | null>(null, "No county rule on campgrounds found", url, "county", "current");
const NC_2773 =
  "https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_105/GS_105-277.3.html";
const TN_MANUAL =
  "https://www.comptroller.tn.gov/content/dam/cot/sboe/documents/rules-&-manuals/2024.10.GreenbeltManual.pdf";
const noCountyValues = (url: string) =>
  excerpt<{ low: number; high: number } | null>(
    null,
    "The county publishes no forest use values",
    url,
    "county",
    "current",
  );

export const COUNTY_PAY: readonly CountyPay[] = [
  // ---------- Virginia ----------
  {
    fips: "51063",
    forestUseValue: excerpt(
      false,
      "Floyd's land use program takes farm and horticultural land only, not forest",
      "https://luva.aaec.vt.edu/locality/floyd/",
      "agency",
      "TY2026",
    ),
    forestPerAc: noCountyValues("https://luva.aaec.vt.edu/locality/floyd/"),
    taxPer100: excerpt(0.44, "$0.44 per $100", "https://www.floydcova.gov/commissioner", "county", "2025"),
    campground: noCampRule("https://library.municode.com/va/floyd_county/codes/code_of_ordinances"),
  },
  {
    fips: "51077",
    forestUseValue: excerpt(false, "Grayson has no land use program", LUVA, "agency", "TY2026"),
    forestPerAc: noCountyValues(LUVA),
    taxPer100: excerpt(
      0.58,
      "$0.58 per $100",
      "https://www.graysoncountyva.gov/201/Treasurers-Office",
      "county",
      "2025",
    ),
    campground: excerpt(
      "A special use permit in the Rural Farm district",
      "A campground (3 or more campsites) needs a special use permit in the Rural Farm district (Zoning Ordinance §3-11)",
      "https://graysoncountyva.gov/wp-content/uploads/2024/07/BoS-6-13-24-Minutes.pdf",
      "county",
      "2024-06-13",
    ),
  },
  {
    fips: "51035",
    forestUseValue: excerpt(
      true,
      "Carroll's land use program takes farm, horticultural and forest land",
      "https://carrollcountyva.gov/government/commissioner_of_the_revenue/special_assessment_land_program.php",
      "county",
      "current",
    ),
    forestPerAc: excerpt(
      { low: 230, high: 405 },
      "Hardwood forest $230 to $405 an acre by productivity class (pine to $966; non-productive $75)",
      "https://vtluva.wpenginepowered.com/wp-content/uploads/2025/09/Brochure_Carroll.pdf",
      "agency",
      "TY2026",
    ),
    taxPer100: excerpt(
      0.49,
      "$0.49 per $100",
      "https://carrollcountyva.gov/government/commissioner_of_the_revenue/county_tax_rates.php",
      "county",
      "FY2026",
    ),
    campground: noCampRule("https://www.ecode360.com/16060008"),
  },
  {
    fips: "51141",
    forestUseValue: excerpt(false, "Patrick has no land use program", LUVA, "agency", "TY2026"),
    forestPerAc: noCountyValues(LUVA),
    taxPer100: excerpt(
      0.73,
      "$0.73 per $100",
      "https://www.co.patrick.va.us/166/Taxes",
      "county",
      "FY2026-27",
    ),
    campground: noCampRule("https://www.co.patrick.va.us/"),
  },
  // ---------- North Carolina: Present-Use Value is statewide ----------
  {
    fips: "37009",
    forestUseValue: statewide("North Carolina", NC_2773),
    forestPerAc: noCountyValues("https://codelibrary.amlegal.com/codes/ashecounty/latest/ashecounty_nc/"),
    taxPer100: excerpt(0.44, "$0.44 per $100", NCDOR_RATES, "agency", "FY2025-26"),
    campground: excerpt(
      "A Planning Board permit for a travel trailer park",
      "A travel trailer (RV) park needs a permit from the Planning Board (county code, travel trailer parks, §154.04)",
      "https://codelibrary.amlegal.com/codes/ashecounty/latest/ashecounty_nc/0-0-0-2452",
      "county",
      "amended 2023-09-18",
    ),
  },
  {
    fips: "37005",
    forestUseValue: statewide("North Carolina", NC_2773),
    forestPerAc: noCountyValues("https://alleghanycounty-nc.gov/"),
    taxPer100: excerpt(
      0.597,
      "$0.597 per $100 (a revaluation takes effect in 2027)",
      NCDOR_RATES,
      "agency",
      "FY2025-26",
    ),
    campground: noCampRule("https://alleghanycounty-nc.gov/"),
  },
  {
    fips: "37011",
    forestUseValue: statewide("North Carolina", NC_2773),
    forestPerAc: noCountyValues("https://www.averycountync.gov/"),
    taxPer100: excerpt(0.4, "$0.40 per $100", NCDOR_RATES, "agency", "FY2025-26"),
    campground: noCampRule("https://www.averycountync.gov/"),
  },
  {
    fips: "37121",
    forestUseValue: statewide("North Carolina", NC_2773),
    forestPerAc: noCountyValues("https://www.mitchellcountync.gov/"),
    taxPer100: excerpt(0.56, "$0.56 per $100", NCDOR_RATES, "agency", "FY2025-26"),
    campground: noCampRule("https://www.mitchellcountync.gov/"),
  },
  // ---------- Tennessee: Greenbelt is statewide; the rate is per $100 of assessed value (25% of appraised) ----------
  {
    fips: "47019",
    forestUseValue: statewide("Tennessee", TN_MANUAL),
    forestPerAc: noCountyValues("https://cartercountytn.gov/"),
    taxPer100: excerpt(
      1.1571,
      "$1.1571 per $100 of assessed value (the certified rate after the 2026 reappraisal)",
      "https://www.wjhl.com/news/carter-county-tax-rate-to-drop-47-after-reappraisal/",
      "third party",
      "2026",
    ),
    campground: noCampRule("https://cartercountytn.gov/services/planning___zoning/"),
  },
  {
    fips: "47091",
    forestUseValue: statewide("Tennessee", TN_MANUAL),
    forestPerAc: noCountyValues("https://www.johnsoncountytn.gov/"),
    taxPer100: excerpt(
      null,
      "Not found from the county or the Comptroller (a third-party page gives $2.21)",
      "https://comptroller.tn.gov/content/dam/cot/pa/documents/tax-aggregate-reports/2025TaxAggregateReport.pdf",
      "agency",
      "2025",
    ),
    campground: noCampRule("https://www.johnsoncountytn.gov/"),
  },
];

export const countyPayOf = (fips: string): CountyPay | null =>
  COUNTY_PAY.find((c) => c.fips === fips) ?? null;
