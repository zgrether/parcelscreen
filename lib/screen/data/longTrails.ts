/**
 * Long rail-trails and greenways near the study region, and their access points (step 11, docs/plans/step-11-new-data.md
 * §2.6; checked 2026-10-21). Curated by hand from Virginia DCR (the New River Trail's directions, degree-minutes
 * converted), vacreepertrail.org and OpenStreetMap. The Blue Ridge Parkway is left out: it isn't a designated bike
 * route (NPS). A closed access point is left out until it reopens, so a screen's drives don't depend on the day it runs.
 */
export interface AccessPoint {
  name: string;
  lat: number;
  lon: number;
}

export interface LongTrail {
  name: string;
  miles: number;
  points: readonly AccessPoint[];
}

export const LONG_TRAILS: readonly LongTrail[] = [
  {
    name: "New River Trail",
    miles: 57,
    points: [
      { name: "Pulaski", lat: 37.04537, lon: -80.74924 },
      { name: "Draper", lat: 36.99926, lon: -80.74224 },
      { name: "Foster Falls", lat: 36.88416, lon: -80.85649 },
      { name: "Austinville", lat: 36.85088, lon: -80.91995 },
      { name: "Ivanhoe", lat: 36.83914, lon: -80.95375 },
      { name: "Fries", lat: 36.71511, lon: -80.97736 },
      { name: "Cliffview", lat: 36.68091, lon: -80.91821 },
      { name: "Galax", lat: 36.66819, lon: -80.92494 },
    ],
  },
  {
    name: "Virginia Creeper Trail",
    miles: 34,
    points: [
      { name: "Abingdon", lat: 36.70901, lon: -81.97131 },
      { name: "Watauga", lat: 36.67798, lon: -81.935 },
      { name: "Damascus", lat: 36.63453, lon: -81.79192 },
      // Whitetop Station (36.598, -81.62405) is left out: the upper section is closed until Mar 31, 2027
      // (vacreepertrail.org). Add it back then; it's about 4 mi from Mud Creek, so its expected.json will change.
    ],
  },
  {
    name: "Tweetsie Trail",
    miles: 9.6,
    points: [
      { name: "Johnson City", lat: 36.31525, lon: -82.33688 },
      { name: "Elizabethton", lat: 36.32363, lon: -82.20522 },
    ],
  },
  {
    name: "Huckleberry Trail",
    miles: 15,
    points: [
      { name: "Blacksburg", lat: 37.22639, lon: -80.4124 },
      { name: "Christiansburg", lat: 37.15208, lon: -80.4155 },
      { name: "Gateway Park", lat: 37.24264, lon: -80.46459 },
    ],
  },
  {
    name: "Mendota Trail",
    miles: 12.7,
    points: [
      { name: "Mendota", lat: 36.70401, lon: -82.3085 },
      { name: "Bristol", lat: 36.62035, lon: -82.19033 },
    ],
  },
  {
    name: "Roanoke River Greenway",
    miles: 19.8,
    points: [
      { name: "Green Hill Park", lat: 37.27741, lon: -80.10573 },
      { name: "Woodbridge", lat: 37.28502, lon: -80.08256 },
    ],
  },
];
