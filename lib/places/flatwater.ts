/**
 * Flatwater beyond NHD's lakes (#350, owner 10/26). NHD's large-scale waterbodies stop where a dam's pool still looks
 * like a river (the New River's Byllesby and Buck pools, Fontana's upper arms, the Tennessee River's mainstem lakes):
 * those reaches are NHD "StreamRiver" areas, so a launch on them read as a river. A launch the lakes didn't claim is
 * still flatwater when its own name says Lake, Reservoir or Pool, or it's on a known dam pool; never when it's tagged
 * whitewater, nor when its name says it's a river put-in, nor when it's below a dam on the tailwater side (by its name,
 * or a known tailwater: owner, #348, 10/26). A lake NHD measures under the launch still wins over a tailwater: below one
 * dam is often the next one's pool ("Nickajack, Below Dam" is on Guntersville Lake). Pure.
 */

/** A name that says the water is still: "Old 228 Fontana Lake Boat Ramp", "Saxapahaw Lake Access". */
const FLAT_NAME = /\b(lake|reservoir|pool)\b/i;
/** Not when the lake is only a creek's, a road's or a place's name: "Lake Creek access", "Lake Road put-in". */
const NOT_A_LAKE = /\blake\s+(creek|branch|run|river|drain|fork|road|rd|street|st|drive|dr|avenue|ave)\b/i;
/** A put-in by its name, whatever lake it's named for. */
const RIVER_NAME = /put[- ]?in|take[- ]?out|whitewater/i;
/** Below a dam by its name: "Tailwater Access", "Philpott Dam tailrace", "Below Dam ramp". */
const TAILWATER_NAME = /tail\s?water|tailrace|below (the )?dam/i;

/**
 * Launches below a dam whose names don't say so, by id, with the river they're on. Kept to a list, as the pools are:
 * telling a dam's two sides apart by position alone would also turn Fontana's Panel Branch and Lewellyn Branch,
 * a kilometre below Fontana Dam on Cheoah Lake, into river launches.
 */
export const KNOWN_TAILWATERS: Readonly<Record<string, string>> = {
  "ridb:233582": "Smith River", // Philpott Park, below Philpott Dam
};

/**
 * Launches on a dam's pool that NHD draws as river, by id, with the pool's name. The New River's Byllesby and Buck
 * pools have one public launch in the bake (OSM's unnamed access upstream of Byllesby dam); none above Fries dam.
 */
export const KNOWN_POOLS: Readonly<Record<string, string>> = {
  "osm:node/11766071164": "Byllesby Reservoir",
};

export interface FlatwaterInput {
  id: string;
  /** The source's own name, not one the bake made up from the water ("<river> access", "Boat launch"). */
  name?: string;
  whitewater?: true;
}

/** Whether a launch is below a dam, on its tailwater, and the river's name when the list gives one; else null. */
export function tailwaterOf(l: Pick<FlatwaterInput, "id" | "name">): { waterName?: string } | null {
  const river = KNOWN_TAILWATERS[l.id];
  if (river) return { waterName: river };
  return l.name && TAILWATER_NAME.test(l.name) ? {} : null;
}

/**
 * Whether a launch the lakes didn't claim is flatwater all the same, and the water's name when a known pool gives one:
 * `{ waterName: "Byllesby Reservoir" }`, `{}` (its name says so), or null (a river).
 */
export function flatwaterByName(l: FlatwaterInput): { waterName?: string } | null {
  if (l.whitewater || tailwaterOf(l)) return null;
  const pool = KNOWN_POOLS[l.id];
  if (pool) return { waterName: pool };
  const n = l.name;
  if (!n || !FLAT_NAME.test(n) || NOT_A_LAKE.test(n) || RIVER_NAME.test(n)) return null;
  return {};
}
