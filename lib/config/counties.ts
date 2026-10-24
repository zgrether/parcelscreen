/**
 * County land-division rules (step 14, docs/plans/step-14-land-uses.md §4): what Divide reads, for the ten counties of
 * Zach's search. Researched 2026-10-23 from the ordinances themselves wherever they were online.
 *
 * Every fact carries its source (the ordinance and section), the date checked and a confidence word:
 * - "from the ordinance": read in the ordinance's own text;
 * - "from the county's summary": a county page, FAQ or agenda;
 * - "to confirm": inferred, from a third party, or not found.
 * A number is never guessed: when the ordinance doesn't give one, the value is null and the fact says so.
 *
 * Dated config: re-check a county when its row is a year old, or after a hearing its notes name.
 */

export type Confidence = "from the ordinance" | "from the county's summary" | "to confirm";

export interface Fact<T> {
  value: T;
  /** The plain-language rule, as the panel says it. */
  says: string;
  source: string;
  checked: string;
  confidence: Confidence;
}

export type StateCode = "VA" | "NC" | "TN";

export interface CountyRules {
  /** The county's 5-digit FIPS code. */
  fips: string;
  name: string;
  state: StateCode;
  /** The ordinance(s) that govern dividing rural land. */
  ordinance: Fact<string>;
  /** County-wide zoning. */
  zoning: Fact<boolean>;
  /** The district ordinary rural land falls in by default; null without zoning. */
  ruralDistrict: Fact<string | null>;
  /** Minimum acres for a new lot on its own well and septic; null when the ordinance gives none we could read. */
  minLotAc: Fact<number | null>;
  /** Mitchell's rule: the minimum by the lot's slope (percent), steepest band last. */
  minLotBySlope?: { maxPct: number; ac: number }[];
  /** Feet of road frontage each lot needs; null when none is required or none was found. */
  frontageFt: Fact<number | null>;
  /** Ways to divide the standard rules don't count: family divisions, private roads, large lots. Never added to N. */
  exceptions: Fact<string>[];
  /** When the county reviews a division as a subdivision, in words. */
  review: Fact<string>;
  /** Divisions where every lot is over this many acres aren't a "subdivision" at all (no plat review); null if none. */
  exemptOverAc: Fact<number | null>;
  /** A county rule on shooting near dwellings or roads; null when none was found. */
  discharge: Fact<string | null>;
  /** The county's zoning GIS layer, where there is one: the district at a point. */
  zoningLayer: { url: string; codeField: string; nameField: string } | null;
  /** Pending changes to re-check. */
  notes: string[];
}

const C = "2026-10-23";

// ---------- Virginia ----------

const FLOYD_LDO = "https://www.floydcova.gov/_files/ugd/db2c48_e0ac9cfe2fa748faa4de904e38540f3c.pdf";
const GRAYSON_ZO = "https://graysoncountyva.gov/DocumentCenter/View/257/Zoning-Ordinance-PDF";
const GRAYSON_SO = "https://graysoncountyva.gov/DocumentCenter/View/262/Subdivision-Ordinance--PDF";
const CARROLL_SO =
  "https://www.carrollcountyva.gov/Documents/Government/Building%20Official/Land%20Use/Subdivision_Ordinance_April_14_2014.pdf";
const PATRICK_SO = "https://www.co.patrick.va.us/DocumentCenter/View/181/Subdivision-Regulations-PDF";

// ---------- North Carolina ----------

const ASHE = "https://codelibrary.amlegal.com/codes/ashecounty/latest/ashecounty_nc/";
const ALLEGHANY_SO = "https://alleghanycounty-nc.gov/ordinances/1-451.pdf";
const ALLEGHANY_PRPO = "https://alleghanycounty-nc.gov/ordinances/1-324.pdf";
const AVERY_SO = "https://www.averycountync.gov/Clean%20Subdivision%202021.pdf";
const MITCHELL_SO =
  "https://www.mitchellcountync.gov/amendment-to-the-subdivision-ordinance-for-the-county-of-mitchell/";

// ---------- Tennessee ----------

const CARTER_PZ = "https://cartercountytn.gov/services/planning___zoning/";
const CARTER_ZR = "https://www.landwatch.com/api/documents/4106159075/TAYLORTOWNRDZONING.pdf";
const JOHNSON_NEW = "https://www.johnsoncountytn.gov/newcomer-information";
const TCA_SUBDIVISION = "https://www.franklincotn.us/assets/pdfs/subdivision_definition.pdf";
const CTAS_PLATS = "https://ctas.tennessee.edu/node/607/printable/pdf";

const fact = <T>(value: T, says: string, source: string, confidence: Confidence): Fact<T> => ({
  value,
  says,
  source,
  checked: C,
  confidence,
});
const noShootingRule = (source: string) =>
  fact<string | null>(null, "No county rule on shooting near dwellings found.", source, "to confirm");

export const COUNTIES: readonly CountyRules[] = [
  {
    fips: "51063",
    name: "Floyd",
    state: "VA",
    ordinance: fact(
      "Land Division Ordinance",
      "Land Division Ordinance (effective 2026-01-01)",
      FLOYD_LDO,
      "from the ordinance",
    ),
    zoning: fact(
      false,
      "No county zoning",
      "https://library.municode.com/va/floyd_county/codes/code_of_ordinances?nodeId=PTIILADECO",
      "from the ordinance",
    ),
    ruralDistrict: fact(null, "No districts: no county zoning", FLOYD_LDO, "from the ordinance"),
    minLotAc: fact(
      2,
      "A standard lot is 2 ac (no public water or sewer; Table 4-2-0)",
      FLOYD_LDO,
      "from the ordinance",
    ),
    frontageFt: fact(
      100,
      "Each standard lot needs 100 ft of road frontage (Table 4-2-0)",
      FLOYD_LDO,
      "from the ordinance",
    ),
    exceptions: [
      fact(
        "Large lots",
        "Lots of 25 ac or more need no frontage when a right-of-way at least 50 ft wide serves them (§4-1)",
        FLOYD_LDO,
        "from the ordinance",
      ),
      fact(
        "Family division",
        "A family division: lots of 1 ac with 50 ft of frontage or a 20 ft right-of-way, one per family member, kept 3 years (§4-5)",
        FLOYD_LDO,
        "from the ordinance",
      ),
      fact(
        "Private division road",
        "A private division road owned by an owners' association serves at most 10 parcels, on a 50 ft right-of-way (§6-2)",
        FLOYD_LDO,
        "from the ordinance",
      ),
    ],
    review: fact(
      "Agent approves",
      "The county's agent approves every plat, at most 10 new lots per plat; a new or private road makes it a major division (§2-1, §4-0)",
      FLOYD_LDO,
      "from the ordinance",
    ),
    exemptOverAc: fact(null, "No size exempts a division from review", FLOYD_LDO, "from the ordinance"),
    discharge: fact(
      "No firearm hunting on or within 100 yards of a primary or secondary highway (§10-111)",
      "No firearm hunting on or within 100 yards of a primary or secondary highway (county code §10-111)",
      "https://dwr.virginia.gov/hunting/regulations/local-ordinances/all-local-ordinances",
      "to confirm",
    ),
    zoningLayer: null,
    notes: [
      "A joint hearing on 2026-09-22 considered changes to family divisions and private roads; re-check.",
    ],
  },
  {
    fips: "51077",
    name: "Grayson",
    state: "VA",
    ordinance: fact(
      "Zoning and Subdivision Ordinances",
      "Zoning Ordinance (amended 2024-09-12) and Subdivision Ordinance (amended 2014-05-08)",
      GRAYSON_ZO,
      "from the ordinance",
    ),
    zoning: fact(true, "County zoning outside the towns", GRAYSON_ZO, "from the ordinance"),
    ruralDistrict: fact(
      "RF",
      "Rural Farm (RF) is the rural district (§4-6); assumed where the zoning map isn't read",
      GRAYSON_ZO,
      "to confirm",
    ),
    minLotAc: fact(
      0.688,
      "Rural Farm lots are at least 30,000 sq ft, 0.69 ac (§4-6.3)",
      GRAYSON_ZO,
      "from the ordinance",
    ),
    frontageFt: fact(
      100,
      "Subdivision lots need 100 ft of frontage, or a 40 ft right-of-way where there's none (§9-2)",
      GRAYSON_SO,
      "from the ordinance",
    ),
    exceptions: [
      fact(
        "Farm division",
        "A farm division: up to 4 parcels of at least 10 ac each, approved by staff (§6-6)",
        GRAYSON_SO,
        "from the ordinance",
      ),
      fact(
        "Family division",
        "A family division: one lot per family member, approved by staff, meeting zoning (§6-5)",
        GRAYSON_SO,
        "from the ordinance",
      ),
      fact(
        "Private street",
        "A Class II private street: a 40 ft easement, 20 ft surfaced, at most 17% grade (§9-6)",
        GRAYSON_SO,
        "from the ordinance",
      ),
      fact(
        "Right-of-way instead of frontage",
        "A lot without frontage can use a 40 ft right-of-way (§9-2); a house needs 30 ft of frontage on a state road or a 30 ft deeded right-of-way (zoning §3-7)",
        GRAYSON_ZO,
        "from the ordinance",
      ),
    ],
    review: fact(
      "Planning Commission from 2 lots",
      "Staff approve a single division (one parcel into two), a farm or family division; other subdivisions go to the Planning Commission (§6-10, §6-11)",
      GRAYSON_SO,
      "from the ordinance",
    ),
    exemptOverAc: fact(null, "No size exempts a division from review", GRAYSON_SO, "from the ordinance"),
    discharge: noShootingRule(
      "https://dwr.virginia.gov/hunting/regulations/local-ordinances/all-local-ordinances",
    ),
    zoningLayer: {
      url: "https://www.webgis.net/arcgis/rest/services/VA/GraysonCo_WebGIS1/MapServer/21",
      codeField: "ZONECODE",
      nameField: "ZONING",
    },
    notes: [],
  },
  {
    fips: "51035",
    name: "Carroll",
    state: "VA",
    ordinance: fact(
      "Subdivision of Land (Ch. 216)",
      "Subdivision of Land, Ch. 216 (amended 2014-04-14)",
      CARROLL_SO,
      "from the ordinance",
    ),
    zoning: fact(
      false,
      "No county zoning (airport zoning only)",
      "https://ecode360.com/CA1276",
      "from the ordinance",
    ),
    ruralDistrict: fact(
      null,
      "No districts: no county zoning",
      "https://ecode360.com/CA1276",
      "from the ordinance",
    ),
    minLotAc: fact(
      0.75,
      "A lot without public water or sewer is at least 0.75 ac (§216-29C)",
      CARROLL_SO,
      "from the ordinance",
    ),
    frontageFt: fact(
      null,
      "No frontage length in the ordinance: lots must reach a state road where a driveway could be built, 80 ft wide at the setback line (§216-27, §216-28A)",
      CARROLL_SO,
      "to confirm",
    ),
    exceptions: [
      fact(
        "Flag lots",
        "Flag lots: a pole at least 20 ft wide, a lot of at least 1.5 ac, at most 3 per division (§216-4)",
        CARROLL_SO,
        "from the ordinance",
      ),
      fact(
        "Family subdivision",
        "A family subdivision on a 20 ft right-of-way, kept by the family member 2 years (§216-30)",
        CARROLL_SO,
        "from the ordinance",
      ),
    ],
    review: fact(
      "Agent up to 4 lots",
      "The agent approves up to 4 new lots on an existing state road with no new road; others go to the Planning Commission (§216-14)",
      CARROLL_SO,
      "from the ordinance",
    ),
    exemptOverAc: fact(
      null,
      "Every division is a subdivision; lots over 5 ac have lighter plat rules (§216-28D)",
      CARROLL_SO,
      "from the ordinance",
    ),
    discharge: noShootingRule("https://ecode360.com/CA1276"),
    zoningLayer: null,
    notes: [],
  },
  {
    fips: "51141",
    name: "Patrick",
    state: "VA",
    ordinance: fact(
      "Subdivision Ordinance",
      "Subdivision Ordinance (revised 2005-05-09)",
      PATRICK_SO,
      "from the ordinance",
    ),
    zoning: fact(
      false,
      "No county zoning (three industrial and lake sites only)",
      "https://www.co.patrick.va.us/165/Ordinances",
      "from the county's summary",
    ),
    ruralDistrict: fact(
      null,
      "No districts: no county zoning",
      "https://www.co.patrick.va.us/165/Ordinances",
      "from the county's summary",
    ),
    minLotAc: fact(
      1,
      "A lot is at least 1 ac (0.5 ac with public water and sewer; Art. 7)",
      PATRICK_SO,
      "from the ordinance",
    ),
    frontageFt: fact(
      50,
      "Each lot needs 50 ft on a street, or on a private roadway with deeded access to one (Art. 5)",
      PATRICK_SO,
      "from the ordinance",
    ),
    exceptions: [
      fact(
        "Family conveyance",
        "A family conveyance: one lot per family member for the owner's lifetime, on a 20 ft right-of-way (Art. 4)",
        PATRICK_SO,
        "from the ordinance",
      ),
    ],
    review: fact(
      "Staff for single lots",
      "Staff approve single-lot conveyances and family plats; other subdivisions go to the Planning Commission (Art. 7)",
      PATRICK_SO,
      "from the ordinance",
    ),
    exemptOverAc: fact(
      2,
      "Only a lot or remainder under 2 ac makes a division a subdivision (Art. 4)",
      PATRICK_SO,
      "from the ordinance",
    ),
    discharge: fact(
      "No hunting with a firearm within 25 ft of a primary or secondary highway",
      "No hunting with a firearm within 25 ft of a primary or secondary highway (1984 ordinance)",
      "https://www.co.patrick.va.us/DocumentCenter/View/137/Firearms-Hunting-Near-Primary-and-Secondary-Highways-PDF",
      "from the ordinance",
    ),
    zoningLayer: null,
    notes: ["A 2026-09-28 hearing considered raising the 2 ac threshold to 5 ac; re-check."],
  },
  // ---------- North Carolina ----------
  {
    fips: "37009",
    name: "Ashe",
    state: "NC",
    ordinance: fact(
      "Residential Subdivisions (Ch. 156)",
      "Residential Subdivisions, Ch. 156 (amended 2026-07-20)",
      ASHE,
      "from the ordinance",
    ),
    zoning: fact(false, "No county zoning", `${ASHE}0-0-0-1692`, "from the ordinance"),
    ruralDistrict: fact(
      null,
      "No districts: no county zoning (watershed areas apply)",
      `${ASHE}0-0-0-2648`,
      "from the ordinance",
    ),
    minLotAc: fact(
      1,
      "A lot is at least 1 ac (half an acre with community water and sewer; §156.45)",
      `${ASHE}0-0-0-3043`,
      "from the ordinance",
    ),
    frontageFt: fact(
      45,
      "Each lot needs 45 ft of frontage on a state-maintained or private road (40 ft on a cul-de-sac; §156.46)",
      `${ASHE}0-0-0-3096`,
      "from the ordinance",
    ),
    exceptions: [
      fact(
        "Family division",
        "A family division to lineal kin isn't a subdivision; resale within 3 years counts (§156.06)",
        `${ASHE}0-0-0-2889`,
        "from the ordinance",
      ),
      fact(
        "Private road",
        "A private road built to county standard: 45 ft right-of-way, at most 15% grade on gravel (§156.46)",
        `${ASHE}0-0-0-3096`,
        "from the ordinance",
      ),
    ],
    review: fact(
      "Staff up to 7 lots",
      "Staff approve up to 7 lots with no road; 8 or more lots, or any road, go to the Planning Board (§156.36)",
      `${ASHE}0-0-0-8100`,
      "from the ordinance",
    ),
    exemptOverAc: fact(
      10,
      "Divisions where every lot is over 10 ac with no new right-of-way aren't a subdivision (§156.06)",
      `${ASHE}0-0-0-2889`,
      "from the ordinance",
    ),
    discharge: fact(
      "No hunting from a state road's right-of-way or shooting across one",
      "No hunting from a state road's right-of-way or shooting across one (local act SL 1977-13)",
      "https://www.ncleg.gov/EnactedLegislation/SessionLaws/HTML/1977-1978/SL1977-13.html",
      "from the ordinance",
    ),
    zoningLayer: null,
    notes: ["The watershed ordinance's lot sizes (§155.32) weren't readable; watershed areas may need more."],
  },
  {
    fips: "37005",
    name: "Alleghany",
    state: "NC",
    ordinance: fact(
      "Land Subdivision Ordinance",
      "Land Subdivision Ordinance (2008) and Property Rights Protection Ordinance (2006)",
      ALLEGHANY_SO,
      "from the ordinance",
    ),
    zoning: fact(
      false,
      "No zoning districts: one Open District with conditional uses",
      ALLEGHANY_PRPO,
      "from the ordinance",
    ),
    ruralDistrict: fact(
      "Open District",
      "The Open District covers the county outside Sparta",
      ALLEGHANY_PRPO,
      "from the ordinance",
    ),
    minLotAc: fact(
      0.75,
      "A lot is at least 0.75 ac (1 ac along high-quality waters; Art. 5, Art. 8)",
      ALLEGHANY_SO,
      "from the ordinance",
    ),
    frontageFt: fact(null, "No frontage length found in the ordinance", ALLEGHANY_SO, "to confirm"),
    exceptions: [
      fact(
        "Private driveway",
        "A private driveway may serve up to 5 lots in a minor subdivision, with a maintenance agreement (Art. 8)",
        ALLEGHANY_SO,
        "from the ordinance",
      ),
      fact(
        "Family subdivision",
        "A first conveyance from owner to child isn't a subdivision, and may use a private driveway (Art. 5)",
        ALLEGHANY_SO,
        "from the ordinance",
      ),
    ],
    review: fact(
      "Planner up to 5 lots",
      "The county planner approves up to 5 lots with no road; 6 or more, or a road, go to the commissioners (Art. 5)",
      ALLEGHANY_SO,
      "from the ordinance",
    ),
    exemptOverAc: fact(
      10,
      "Divisions where every lot is over 10 ac with no new right-of-way aren't a subdivision (Art. 5)",
      ALLEGHANY_SO,
      "from the ordinance",
    ),
    discharge: noShootingRule("https://alleghanycounty-nc.gov/alleghany-county-online-ordinances/"),
    zoningLayer: null,
    notes: [],
  },
  {
    fips: "37011",
    name: "Avery",
    state: "NC",
    ordinance: fact(
      "Subdivision Ordinance",
      "Subdivision Ordinance (amended 2021-06-07)",
      AVERY_SO,
      "from the ordinance",
    ),
    zoning: fact(
      false,
      "No county zoning",
      "https://www.averycountync.gov/departments/ordinance_page/index.php",
      "from the county's summary",
    ),
    ruralDistrict: fact(
      null,
      "No districts: no county zoning (watershed areas apply)",
      "https://www.averycountync.gov/departments/ordinance_page/index.php",
      "from the county's summary",
    ),
    minLotAc: fact(
      0.75,
      "A lot on its own well and septic is at least 32,670 sq ft, 0.75 ac (§404.2)",
      AVERY_SO,
      "from the ordinance",
    ),
    frontageFt: fact(
      70,
      "Each lot needs 70 ft of frontage (40 ft on a cul-de-sac or curve; §404.2)",
      AVERY_SO,
      "from the ordinance",
    ),
    exceptions: [
      fact(
        "Panhandle lot",
        "A panhandle lot reaches the road by a 35 ft strip up to 300 ft long (§404.2)",
        AVERY_SO,
        "from the ordinance",
      ),
      fact(
        "Private street",
        "A private street: 20 ft travel surface, a 25–60 ft right-of-way by size, at most 18% grade (§405.1)",
        AVERY_SO,
        "from the ordinance",
      ),
      fact(
        "Family subdivision",
        "A family subdivision by gift or to an heir is exempt (§304)",
        AVERY_SO,
        "from the ordinance",
      ),
    ],
    review: fact(
      "Administrator under 10 lots",
      "The administrator reviews special (under 3 lots) and minor (3–10 lots) subdivisions; more than 10 lots with a new right-of-way is major (§502)",
      AVERY_SO,
      "from the ordinance",
    ),
    exemptOverAc: fact(
      10,
      "Divisions where every lot is over 10 ac with no new right-of-way aren't a subdivision (§501)",
      AVERY_SO,
      "from the ordinance",
    ),
    discharge: noShootingRule("https://www.averycountync.gov/departments/ordinance_page/index.php"),
    zoningLayer: null,
    notes: [],
  },
  {
    fips: "37121",
    name: "Mitchell",
    state: "NC",
    ordinance: fact(
      "Subdivision Ordinance",
      "Subdivision Ordinance (amended 2023-07-10)",
      MITCHELL_SO,
      "from the ordinance",
    ),
    zoning: fact(
      false,
      "No county zoning found (the zoning map shows town districts only)",
      "https://mapping.mitchellcountync.gov/arcgis/rest/services",
      "to confirm",
    ),
    ruralDistrict: fact(
      null,
      "No districts found outside the towns",
      "https://mapping.mitchellcountync.gov/arcgis/rest/services",
      "to confirm",
    ),
    minLotAc: fact(
      1,
      "A lot without sewer is at least 1 ac where it's 15% or flatter, more on steeper ground (Art. XI)",
      MITCHELL_SO,
      "from the ordinance",
    ),
    minLotBySlope: [
      { maxPct: 15, ac: 1 },
      { maxPct: 25, ac: 1.5 },
      { maxPct: 35, ac: 2 },
    ],
    frontageFt: fact(null, "No frontage length found in the ordinance", MITCHELL_SO, "to confirm"),
    exceptions: [
      fact(
        "Family division",
        "A family division (parent and child, grandparent and grandchild, siblings) is exempt (Art. V)",
        MITCHELL_SO,
        "from the ordinance",
      ),
      fact(
        "Private road",
        "A private road (4 or more homes): a 30 ft right-of-way, 20 ft wide, at most 15% grade (Art. VII)",
        MITCHELL_SO,
        "from the ordinance",
      ),
    ],
    review: fact(
      "Review Board from 6 lots",
      "Six or more lots is a subdivision the Review Board approves, counting earlier divisions within 5 years (Art. V)",
      MITCHELL_SO,
      "from the ordinance",
    ),
    exemptOverAc: fact(
      3,
      "Divisions where every lot is over 3 ac with no new right-of-way are exempt (Art. V)",
      MITCHELL_SO,
      "from the ordinance",
    ),
    discharge: noShootingRule("https://www.mitchellcountync.gov/ordinances/"),
    zoningLayer: null,
    notes: ["Over 35% slope a lot needs an engineer's stamped plans (Art. XI)."],
  },
  // ---------- Tennessee ----------
  {
    fips: "47019",
    name: "Carter",
    state: "TN",
    ordinance: fact(
      "Zoning Resolution",
      "Zoning Resolution (amended 2016-04-18) and subdivision regulations",
      CARTER_PZ,
      "from the county's summary",
    ),
    zoning: fact(true, "County zoning outside the cities", CARTER_PZ, "from the county's summary"),
    ruralDistrict: fact(
      "A-1",
      "A-1 Agriculture is the rural district; which applies to a parcel needs the zoning map",
      CARTER_PZ,
      "to confirm",
    ),
    minLotAc: fact(
      0.344,
      "A house lot is at least 15,000 sq ft (0.34 ac); the health department may require more for a septic system",
      CARTER_ZR,
      "to confirm",
    ),
    frontageFt: fact(40, "A house lot must abut at least 40 ft of public street", CARTER_ZR, "to confirm"),
    exceptions: [
      fact(
        "Five acres and up",
        "Under state law, lots of 5 ac or more that need no new street or utility aren't a subdivision (TCA 13-3-401)",
        TCA_SUBDIVISION,
        "from the county's summary",
      ),
    ],
    review: fact(
      "Planning commission",
      "The regional planning commission reviews subdivisions; small plats (5 lots with no new street) can be signed by its secretary (TCA 13-3-402)",
      CTAS_PLATS,
      "from the county's summary",
    ),
    exemptOverAc: fact(
      5,
      "Lots of 5 ac or more with no new street or utility aren't a subdivision (TCA 13-3-401)",
      TCA_SUBDIVISION,
      "from the county's summary",
    ),
    discharge: noShootingRule(CARTER_PZ),
    zoningLayer: null,
    notes: [
      "The zoning resolution's text isn't online from the county; its figures come from a copy and are to confirm.",
    ],
  },
  {
    fips: "47091",
    name: "Johnson",
    state: "TN",
    ordinance: fact(
      "Subdivision regulations",
      "Johnson County Regional Planning Commission's subdivision regulations (not online)",
      JOHNSON_NEW,
      "from the county's summary",
    ),
    zoning: fact(false, "No county zoning, and no building permit", JOHNSON_NEW, "from the county's summary"),
    ruralDistrict: fact(null, "No districts: no county zoning", JOHNSON_NEW, "from the county's summary"),
    minLotAc: fact(
      null,
      "No minimum lot size found online; septic approval (TDEC) decides",
      JOHNSON_NEW,
      "to confirm",
    ),
    frontageFt: fact(null, "No frontage rule found online", JOHNSON_NEW, "to confirm"),
    exceptions: [
      fact(
        "Five acres and up",
        "Under state law, lots of 5 ac or more that need no new street or utility aren't a subdivision (TCA 13-3-401)",
        TCA_SUBDIVISION,
        "from the county's summary",
      ),
      fact(
        "Private road",
        "The planning commission approves private-road subdivisions of up to 5 lots",
        "https://www.johnsoncountytn.gov/_files/ugd/02f3a5_0c32e37879694e229b101d02c35b9211.pdf",
        "from the county's summary",
      ),
    ],
    review: fact(
      "Planning commission",
      "The regional planning commission approves subdivisions; each new lot needs a proven water supply (2026-03-02)",
      "https://www.johnsoncountytn.gov/_files/ugd/02f3a5_5f6b998f8225424289d58c870662ba2d.pdf",
      "from the ordinance",
    ),
    exemptOverAc: fact(
      5,
      "Lots of 5 ac or more with no new street or utility aren't a subdivision (TCA 13-3-401)",
      TCA_SUBDIVISION,
      "from the county's summary",
    ),
    discharge: noShootingRule(JOHNSON_NEW),
    zoningLayer: null,
    notes: [],
  },
];

export const countyByFips = (fips: string): CountyRules | null =>
  COUNTIES.find((c) => c.fips === fips) ?? null;

/**
 * The way to divide without subdivision review, where the county has one (owner, #311): Divide's first number. Each is the
 * county's own rule, read from the facts above: Grayson's farm division (staff approve it, §6-6); the exemption North
 * Carolina's statute gives lots over 10 ac with no new right-of-way (Mitchell's over 3 ac); Tennessee's for lots of 5 ac
 * or more with no new street or utility; Patrick's for divisions with no lot or remainder under 2 ac. Floyd and Carroll
 * review every division.
 */
export interface NoReviewRoute {
  /** The county's term, as Divide names it: "a farm division approved by staff". */
  term: string;
  /** Each lot's least size: at least this (`inclusive`), or over it. */
  lotAc: number;
  inclusive: boolean;
  /** The most lots it allows, when it caps them (Grayson's farm division: 4 parcels). */
  maxLots: number | null;
  says: string;
  source: string;
  checked: string;
  confidence: Confidence;
}

const route = (
  term: string,
  lotAc: number,
  inclusive: boolean,
  maxLots: number | null,
  says: string,
  source: string,
  confidence: Confidence,
): NoReviewRoute => ({ term, lotAc, inclusive, maxLots, says, source, checked: C, confidence });

const NC_EXEMPT = (ac: number, section: string, source: string) =>
  route(
    "an exempt division with no new right-of-way",
    ac,
    false,
    null,
    `A division where every lot is over ${ac} ac, with no new right-of-way, isn't a subdivision (${section})`,
    source,
    "from the ordinance",
  );
const TN_EXEMPT = route(
  "an exempt division with no new street or utility",
  5,
  true,
  null,
  "Lots of 5 ac or more with no new street or utility aren't a subdivision (TCA 13-3-401)",
  TCA_SUBDIVISION,
  "from the county's summary",
);

const NO_REVIEW: Readonly<Record<string, NoReviewRoute | null>> = {
  "51063": null, // Floyd: the agent approves every plat
  "51077": route(
    "a farm division approved by staff",
    10,
    true,
    4,
    "A farm division: up to 4 parcels of at least 10 ac each, approved by staff (§6-6)",
    GRAYSON_SO,
    "from the ordinance",
  ),
  "51035": null, // Carroll: every division is a subdivision
  "51141": route(
    "a division with no lot or remainder under 2 ac",
    2,
    true,
    null,
    "Only a lot or remainder under 2 ac makes a division a subdivision (Art. 4)",
    PATRICK_SO,
    "from the ordinance",
  ),
  "37009": NC_EXEMPT(10, "§156.06", `${ASHE}0-0-0-2889`),
  "37005": NC_EXEMPT(10, "Art. 5", ALLEGHANY_SO),
  "37011": NC_EXEMPT(10, "§501", AVERY_SO),
  "37121": NC_EXEMPT(3, "Art. V", MITCHELL_SO),
  "47019": TN_EXEMPT,
  "47091": TN_EXEMPT,
};

/** The county's way to divide without subdivision review; null where every division is reviewed. */
export const noReviewRoute = (county: CountyRules): NoReviewRoute | null => NO_REVIEW[county.fips] ?? null;

/** The minimum lot for a parcel, by its slope where the county's rule depends on it (Mitchell). */
export function minLotFor(county: CountyRules, slopePct: number | null): number | null {
  const bands = county.minLotBySlope;
  if (!bands || slopePct === null) return county.minLotAc.value;
  return bands.find((b) => slopePct <= b.maxPct)?.ac ?? null;
}

// ---------- State hunting basics (Hunt) ----------

export interface StateHunting {
  state: StateCode;
  license: Fact<string>;
  sunday: Fact<string>;
  orange: Fact<string>;
  distances: Fact<string>;
}

export const STATE_HUNTING: Readonly<Record<StateCode, StateHunting>> = {
  VA: {
    state: "VA",
    license: fact(
      "Landowners and their family need no license on their own land",
      "Landowners, their spouses, children, grandchildren and parents need no license on their own land (Va. Code §29.1-301)",
      "https://law.lis.virginia.gov/vacode/title29.1/chapter3/section29.1-301/",
      "from the ordinance",
    ),
    sunday: fact(
      "Allowed on private land with permission",
      "Sunday hunting on private land is allowed with the landowner's permission, not within 200 yards of a place of worship (§29.1-521)",
      "https://law.lis.virginia.gov/vacode/title29.1/chapter5/section29.1-521/",
      "from the ordinance",
    ),
    orange: fact(
      "Blaze orange or pink in firearms deer seasons",
      "Blaze orange or pink (a hat, upper-body clothing or 100 sq in) in firearms deer seasons (§29.1-530.1)",
      "https://law.lis.virginia.gov/vacode/title29.1/chapter5/section29.1-530.1/",
      "from the ordinance",
    ),
    distances: fact(
      "Never in or across a road",
      "No shooting in or across a road or its right-of-way (§18.2-286)",
      "https://law.lis.virginia.gov/vacode/title18.2/chapter7/section18.2-286/",
      "from the ordinance",
    ),
  },
  NC: {
    state: "NC",
    license: fact(
      "Landholders and family need no license on their own land",
      "The landholder, spouse and dependents under 18 living with them need no license on land they hold (G.S. 113-276)",
      "https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_113/GS_113-276.html",
      "from the ordinance",
    ),
    sunday: fact(
      "Allowed on private land, not 9:30–12:30",
      "Sunday hunting on private land with written permission, not from 9:30 a.m. to 12:30 p.m., and not within 500 yards of a place of worship (G.S. 103-2)",
      "https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_103/GS_103-2.html",
      "from the ordinance",
    ),
    orange: fact(
      "Hunter orange with firearms (landholders exempt on their land)",
      "Hunter orange when hunting game with firearms; landholders and family on their own land are exempt (G.S. 113-291.8)",
      "https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_113/GS_113-291.8.html",
      "from the ordinance",
    ),
    distances: fact(
      "No statewide distance from dwellings found",
      "No statewide distance from dwellings or roads found; some counties have local acts",
      "https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_14/GS_14-269.2.html",
      "to confirm",
    ),
  },
  TN: {
    state: "TN",
    license: fact(
      "Farmland owners and family need no license on their own land",
      "Resident owners, spouses and children need no license on their own farmland; carry the signed exemption (TCA 70-2-204)",
      "https://www.tn.gov/twra/license-sales.html",
      "from the county's summary",
    ),
    sunday: fact(
      "No statewide ban found",
      "No statewide ban on Sunday hunting found",
      "https://www.tn.gov/twra/guide/hunting-regulations.html",
      "to confirm",
    ),
    orange: fact(
      "Fluorescent orange or pink for big game (landowners on their land exempt)",
      "500 sq in of fluorescent orange or pink for big game (not archery-only or turkey); landowners on their own land are exempt",
      "https://www.tn.gov/twra/hunting/big-game.html",
      "from the county's summary",
    ),
    distances: fact(
      "Never from or across a public road",
      "No hunting from or across a public road or its right-of-way",
      "https://www.tn.gov/twra/guide/hunting-regulations.html",
      "from the county's summary",
    ),
  },
};
