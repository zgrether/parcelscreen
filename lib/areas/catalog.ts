/**
 * The area catalog's thirty areas (step 13, docs/plans/step-13-area-catalog.md §2): each is a name, a two-line
 * description of the place and the recipe for its outline. Nothing here is a number that can go stale (§1): heights,
 * drives and skies are the profiler's, refreshed monthly.
 *
 * An outline is the union of Census county subdivisions (`units`, by county FIPS and the subdivision's name, "*" for
 * the whole county), trimmed by hand where the area is smaller than its subdivision (`keep`: a box edge or a circle),
 * less any towns (`minus`: incorporated places, by state FIPS and name). `pnpm areas:outlines` builds them into
 * lib/areas/data/outlines.json. No imports: the outline script reads this file directly.
 */

export interface AreaKeep {
  latMin?: number;
  latMax?: number;
  lonMin?: number;
  lonMax?: number;
  /** [lat, lon, miles]. */
  circle?: readonly [number, number, number];
}

export interface AreaDef {
  /** Also the area file's name: public/areas/v1/<id>.json. */
  id: string;
  name: string;
  /** Two short lines about the place: its landmarks and character, never a number. */
  description: readonly [string, string];
  units: Readonly<Record<string, readonly string[] | "*">>;
  /** Subdivisions left out of a "*" county. */
  unitsLess?: Readonly<Record<string, readonly string[]>>;
  keep?: AreaKeep;
  minus?: readonly (readonly [state: string, place: string])[];
}

export const AREAS: readonly AreaDef[] = [
  {
    id: "grayson-highlands",
    name: "Grayson Highlands (Volney, Troutdale)",
    description: [
      "High pastures and balds under Mount Rogers and Grayson Highlands State Park.",
      "Troutdale, Volney and Mouth of Wilson, along US 58.",
    ],
    units: { "51077": ["Wilson Creek district"] },
    keep: { lonMin: -81.58 },
  },
  {
    id: "whitetop-konnarock",
    name: "Whitetop and Konnarock",
    description: [
      "Virginia's highest land, around Whitetop Mountain and the top of the Virginia Creeper Trail.",
      "Small mountain communities inside the Mount Rogers National Recreation Area.",
    ],
    units: { "51077": ["Wilson Creek district"], "51173": ["Rye Valley district"] },
    keep: { lonMax: -81.58 },
  },
  {
    id: "independence-fries",
    name: "Independence and Fries",
    description: [
      "Rolling farmland along the New River, between Independence and the old mill town of Fries.",
      "The New River Trail starts in Fries.",
    ],
    units: { "51077": ["Elk Creek district", "Providence district", "Old Town district"] },
  },
  {
    id: "floyd",
    name: "Floyd",
    description: [
      "A plateau county along the Blue Ridge Parkway, known for its music and crafts.",
      "Floyd is its one town; the rest is farms and woods.",
    ],
    units: { "51063": "*" },
  },
  {
    id: "hillsville-fancy-gap",
    name: "Hillsville and Fancy Gap",
    description: [
      "Carroll County's high ground, from Hillsville to Fancy Gap on the Blue Ridge Parkway.",
      "Interstate 77 climbs the Blue Ridge here.",
    ],
    units: { "51035": ["Sulphur Springs district", "Piper Gap district", "Fancy Gap district"] },
  },
  {
    id: "meadows-of-dan",
    name: "Meadows of Dan",
    description: [
      "Farmland on top of the Blue Ridge, along the Parkway near Mabry Mill.",
      "Patrick County's plateau, above the escarpment and Stuart.",
    ],
    units: { "51141": ["Blue Ridge district"] },
    keep: { latMin: 36.69 },
  },
  {
    id: "sugar-grove-marion",
    name: "Sugar Grove and Marion",
    description: [
      "The north side of Mount Rogers, from Sugar Grove to Marion.",
      "Hungry Mother State Park and the I-81 valley.",
    ],
    units: { "51173": ["Rye Valley district", "Park district", "Royal Oak district"] },
    keep: { lonMin: -81.58 },
  },
  {
    id: "damascus",
    name: "Damascus",
    description: [
      "Trail Town, where the Virginia Creeper Trail and the Appalachian Trail meet.",
      "Valleys and ridges south of Abingdon, along the Tennessee line.",
    ],
    units: { "51191": ["Taylor district"] },
  },
  {
    id: "burkes-garden",
    name: "Burkes Garden",
    description: [
      "A high limestone bowl inside a ring of mountain, with one road in.",
      "Farms and quiet; little land comes up for sale.",
    ],
    units: { "51185": ["Southern district"] },
    keep: { circle: [37.09, -81.335, 3.4] },
  },
  {
    id: "highland",
    name: "Highland County (Monterey)",
    description: [
      "Virginia's least-populated county: ridges and valleys along the West Virginia line.",
      "Monterey, and the Bullpasture and Cowpasture valleys.",
    ],
    units: { "51091": "*" },
  },
  {
    id: "bath",
    name: "Bath County",
    description: [
      "The George Washington National Forest, Lake Moomaw, and the Warm and Hot Springs.",
      "Much of the county is forest; private land is in the valleys.",
    ],
    units: { "51017": "*" },
  },
  {
    id: "nelson-highlands",
    name: "Nelson highlands (Montebello)",
    description: [
      "The Blue Ridge's eastern slopes, from Montebello to Wintergreen and Nellysford.",
      "The Parkway and the Appalachian Trail along the crest.",
    ],
    units: { "51125": ["West district", "Central district"] },
  },
  {
    id: "blacksburg-outskirts",
    name: "Blacksburg outskirts",
    description: [
      "The countryside around Blacksburg and Christiansburg, outside the towns themselves.",
      "Virginia Tech's town, with the Huckleberry Trail.",
    ],
    units: {
      "51121": ["District A-01", "District C-01", "District E-01", "District F-01", "District G-01"],
    },
    minus: [
      ["51", "Blacksburg"],
      ["51", "Christiansburg"],
    ],
  },
  {
    id: "sparta",
    name: "Sparta",
    description: [
      "Alleghany County, on the Blue Ridge Parkway and the New River.",
      "Sparta is the county seat; Stone Mountain State Park is just south.",
    ],
    units: { "37005": "*" },
  },
  {
    id: "ashe",
    name: "Ashe County (West Jefferson, Lansing)",
    description: [
      "Farm country along the New River, from West Jefferson and Jefferson to Lansing.",
      "Mount Jefferson stands over the county seat.",
    ],
    units: { "37009": "*" },
  },
  {
    id: "boone-blowing-rock",
    name: "Boone and Blowing Rock",
    description: [
      "The High Country's hub: Boone and Appalachian State, and Blowing Rock on the Parkway.",
      "Watauga County, less its Valle Crucis corner.",
    ],
    units: { "37189": "*" },
    unitsLess: { "37189": ["Laurel Creek township"] },
  },
  {
    id: "banner-elk-beech",
    name: "Banner Elk and Beech Mountain",
    description: [
      "Banner Elk, Beech Mountain and the ski slopes, with Valle Crucis below.",
      "The high corner where Avery and Watauga counties meet.",
    ],
    units: {
      "37011": [
        "Banner Elk township",
        "Beech Mountain township",
        "Elk Park township",
        "Heaton township",
        "Cranberry township",
        "Linville township",
      ],
      "37189": ["Laurel Creek township"],
    },
  },
  {
    id: "spruce-pine",
    name: "Spruce Pine and Little Switzerland",
    description: [
      "Mining and craft country around Spruce Pine, near the Blue Ridge Parkway.",
      "Little Switzerland's Mitchell County side.",
    ],
    units: { "37121": ["Grassy Creek township", "Snow Creek township", "Cane Creek township"] },
  },
  {
    id: "burnsville-celo",
    name: "Burnsville and Celo",
    description: [
      "Yancey County, under the Black Mountains and Mount Mitchell.",
      "Burnsville, and the South Toe valley around Celo.",
    ],
    units: { "37199": "*" },
  },
  {
    id: "madison",
    name: "Madison County (Mars Hill, Hot Springs)",
    description: [
      "The French Broad and Laurel valleys, from Mars Hill to Hot Springs.",
      "The Appalachian Trail runs through Hot Springs.",
    ],
    units: { "37115": "*" },
  },
  {
    id: "north-buncombe",
    name: "North Buncombe (Weaverville, Barnardsville)",
    description: [
      "The valleys north of Asheville, around Weaverville and Barnardsville.",
      "Reems Creek and Big Ivy, under the Craggies.",
    ],
    units: { "37021": ["Reems Creek township", "Ivy township", "Flat Creek township"] },
  },
  {
    id: "haywood-highlands",
    name: "Haywood highlands (Waynesville)",
    description: [
      "The mountains around Waynesville and Maggie Valley, between the Smokies and the Parkway.",
      "Haywood County's southern and western high ground.",
    ],
    units: {
      "37087": [
        "Waynesville township",
        "Ivy Hill township",
        "Jonathan Creek township",
        "Pigeon township",
        "East Fork township",
        "Cecil township",
      ],
    },
  },
  {
    id: "brevard-pisgah",
    name: "Brevard and Pisgah",
    description: [
      "Transylvania County: Brevard, the Pisgah National Forest and its waterfalls.",
      "Mountain biking, and the French Broad's headwaters.",
    ],
    units: { "37175": "*" },
  },
  {
    id: "highlands-cashiers",
    name: "Highlands and Cashiers",
    description: [
      "A high plateau around Highlands, Cashiers and Lake Glenville.",
      "Granite domes and old summer communities.",
    ],
    units: { "37113": ["Highlands township"], "37099": ["Cashiers township", "Hamburg township"] },
  },
  {
    id: "franklin-otto",
    name: "Franklin and Otto",
    description: [
      "The Little Tennessee valley around Franklin and Otto.",
      "The Nantahala National Forest and the Appalachian Trail to the west.",
    ],
    units: {
      "37113": [
        "Franklin township",
        "Smithbridge township",
        "Cartoogechaye township",
        "Millshoal township",
        "Cowee township",
        "Ellijay township",
        "Sugarfork township",
      ],
    },
  },
  {
    id: "roan-mountain",
    name: "Roan Mountain",
    description: [
      "The Doe River valley under the Roan Highlands.",
      "Roan Mountain State Park, and the Appalachian Trail along the state line.",
    ],
    units: { "47019": ["District 2"] },
  },
  {
    id: "shady-valley-mountain-city",
    name: "Shady Valley and Mountain City",
    description: [
      "Johnson County, from Mountain City to Shady Valley.",
      "The Cherokee National Forest, and the road over to Damascus.",
    ],
    units: { "47091": ["District 1", "District 2", "District 3", "District 5", "District 6", "District 7"] },
  },
  {
    id: "butler-watauga-lake",
    name: "Butler and Watauga Lake",
    description: [
      "Watauga Lake and the valleys around Butler and Hampton.",
      "The Cherokee National Forest on every side.",
    ],
    units: { "47091": ["District 4"], "47019": ["District 6"] },
  },
  {
    id: "unicoi-erwin",
    name: "Unicoi and Erwin",
    description: [
      "Unicoi County, along the Nolichucky River and Interstate 26.",
      "Erwin and Unicoi, with Unaka Mountain and the Appalachian Trail.",
    ],
    units: { "47171": "*" },
  },
  {
    id: "cosby",
    name: "Cosby",
    description: [
      "The quiet side of the Smokies, around Cosby and Hartford.",
      "The Pigeon River, and the national park's northern edge.",
    ],
    units: { "47029": ["District 5", "District 1"] },
  },
];
