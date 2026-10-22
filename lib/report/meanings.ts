/**
 * "What it means for you" (value-ranking.md §6.2 (c); VR5 part 3): for each scale, the sentences for each band,
 * written once so the same band always says the same thing. Split by what it touches (solar, garden, house,
 * driveway) where that applies; a sentence with no label applies to the whole parcel. The tone follows the owner's
 * example: north-facing slopes keep ice on the driveway for days, which matters for whoever is home alone.
 *
 * Drafts for the owner's wording review (VR5 part 3). One list per band, in the scale's band order.
 */
import type { ScaleId } from "./scales";

/** "Near the house" (owner, #112): the facing is the house site's; the drive itself may face another way. */
export type MeaningFor = "Solar" | "Garden" | "House" | "Driveway" | "Near the house";

export interface Meaning {
  for?: MeaningFor;
  text: string;
}

const m = (forWhat: MeaningFor | undefined, text: string): Meaning =>
  forWhat ? { for: forWhat, text } : { text };

export const MEANINGS: Record<ScaleId, Meaning[][]> = {
  winterSun: [
    // Shaded
    [
      m(
        "Solar",
        "Panels here make little in December; put them on a sunnier part of the land, or lean on the grid in winter.",
      ),
      m("Garden", "Beds stay cold and wet into spring; cool-season greens do best."),
      m("House", "Passive solar won't carry the winter; plan on wood or a heat pump most days."),
    ],
    // Workable
    [
      m("Solar", "Panels earn their keep from spring to fall; December output is thin."),
      m("Garden", "A normal season, but the beds warm late; give the garden the sunniest corner."),
      m("House", "South windows help on clear days, but they won't heat the house on their own."),
    ],
    // Good
    [
      m("Solar", "A solid year-round array; winter output dips but holds up."),
      m("Garden", "Enough winter sun for a cold frame; beds warm early where the ground faces south."),
      m("House", "Passive-solar design pays here: south glass and thermal mass carry many winter days."),
    ],
    // Excellent
    [
      m("Solar", "As good as it gets in these mountains; panels keep producing through December."),
      m("Garden", "Early springs and a long season, with room for a cold frame or a greenhouse."),
      m(
        "House",
        "The site for a passive-solar house: sun through the south glass most of every December day.",
      ),
    ],
  ],
  facing: [
    // Ideal S–SE
    [
      m("Solar", "The roof and the panels face the sun without fighting the slope."),
      m(
        "House",
        "Morning sun warms the house early; the hot summer afternoon sun comes in at a glancing angle.",
      ),
      m("Near the house", "Snow and ice around the house melt off in a day or two."),
    ],
    // Fine
    [
      m("Solar", "A little off south: panels lose a few percent, which a slightly bigger array makes up."),
      m("House", "Good light, with the house turned toward south on its pad."),
      m("Near the house", "Snow clears around the house within a few days."),
    ],
    // Cool
    [
      m("Solar", "The slope tilts away from the winter sun; a ground mount aimed south beats the roof."),
      m("House", "Sun comes late on an east face and leaves early on a west one; the uphill rooms run cool."),
      m(
        "Near the house",
        "Shady spots near the house hold ice after a storm; keep grit and a spreader on hand.",
      ),
    ],
    // North-facing
    [
      m("Solar", "The slope hides the low winter sun; panels belong somewhere else on the land."),
      m("House", "Cool and damp, with little winter sun: pleasant in summer, costly to heat in winter."),
      m(
        "Near the house",
        "North-facing slopes keep ice on the driveway for days, which matters for whoever is home alone.",
      ),
    ],
  ],
  frost: [
    // Pocket
    [
      m(
        "Garden",
        "Cold air pools here on clear nights: expect late frosts in spring and early ones in fall.",
      ),
      m("House", "Foggy, frosty mornings, and the coldest nights on the land."),
    ],
    // Thermal belt
    [
      m(
        "Garden",
        "Cold air drains past on clear nights, so frost comes later in fall and leaves earlier in spring: the best place for fruit trees.",
      ),
      m("House", "Milder nights than the valley floor below."),
    ],
    // Exposed
    [
      m("Garden", "Above the warm belt: a shorter season than the slope below, and wind dries the beds."),
      m("House", "Open to the weather; plan for wind on the windows and the roof."),
    ],
    // Windy
    [
      m("Garden", "Wind and cold cut the season short; plant windbreaks first, then beds."),
      m("House", "Exposed to storms and gusts: build tight and anchor well. The views are the trade."),
    ],
  ],
  slope: [
    // Slab or crawl
    [m("House", "The simplest foundation, with little earthwork.")],
    // Walkout
    [
      m(
        "House",
        "The slope gives you a walkout basement or a garage under the house: more usable space for less than building it separately.",
      ),
    ],
    // Cut-fill and walls
    [
      m(
        "House",
        "Expect cut and fill with retaining walls: the pad costs real money before the house starts.",
      ),
    ],
    // Engineered piers
    [m("House", "Engineered piers or a stepped foundation; talk to an engineer before an offer.")],
  ],
  driveway: [
    // Easy
    [m("Driveway", "Gravel stays put, and most cars make it up year-round once it's plowed.")],
    // Good gravel
    [m("Driveway", "Gravel holds with water bars and culverts; plan on some grading every year or two.")],
    // Pave or regrade
    [m("Driveway", "Steep enough that gravel washes out: pave the steep stretches, or regrade the route.")],
    // Ice, washouts, fire access
    [
      m(
        "Driveway",
        "Steeper than many counties allow for a fire truck, and ice and washouts make it a winter problem; check the county's limit before an offer.",
      ),
    ],
  ],
  elevation: [
    // Valley
    [
      m("House", "Hot, humid summers and mild winters, with fog in the hollows."),
      m("Garden", "The longest season on this scale."),
    ],
    // Foothill
    [m("House", "Warm summers and short cold spells."), m("Garden", "A long season; most crops do well.")],
    // Mountain
    [
      m("House", "Cool summer nights and real winters, with snow a few times a year."),
      m("Garden", "A mountain season: set tender crops out late and pick them before the first fall frost."),
    ],
    // High
    [
      m("House", "Summers where you rarely need air conditioning; winters with snow on the drive."),
      m(
        "Garden",
        "A shorter season: set tomatoes and squash out late and pick quick varieties; greens, roots and apples thrive.",
      ),
    ],
  ],
  sky: [
    // Town glow
    [m(undefined, "A glow on the horizon; the Milky Way is faint or gone.")],
    // Rural
    [
      m(
        undefined,
        "Plenty of stars; the Milky Way shows on clear nights, away from the brightest direction.",
      ),
    ],
    // Dark
    [m(undefined, "A truly dark sky: the Milky Way is bright overhead on clear, moonless nights.")],
  ],
  room: [
    // Doesn't fit
    [
      m(
        "House",
        "The house, garage, turnaround and septic field don't fit on the gentle ground: build smaller, or build into the slope.",
      ),
    ],
    // Tight
    [m("House", "It all fits, just: little room to move the house or add a shop later.")],
    // Enough
    [m("House", "Room for the build, with some choice in where the house sits.")],
    // Roomy
    [m("House", "Room for the build, plus a shop, a barn or a second garden.")],
    // Spacious
    [m("House", "Plenty of gentle ground: room for outbuildings, pasture and a guest house later.")],
  ],
  trails: [
    // At the edge
    [m(undefined, "Public land at your boundary, or a trailhead a few minutes away.")],
    // A short drive
    [m(undefined, "A trailhead a few minutes' drive away.")],
    // A drive
    [m(undefined, "Hiking takes a planned drive, not a walk out the door.")],
    // Far
    [m(undefined, "The nearest trails are a trip, not an afternoon.")],
  ],
  // Step 11 (plan §2.1): Town and hospital split in two; each keeps its half of the old sentences.
  town: [
    // Close
    [m(undefined, "Groceries nearby.")],
    // Practical
    [m(undefined, "Weekly shopping is an easy trip.")],
    // A haul
    [m(undefined, "Shopping is a planned trip: keep the pantry stocked.")],
    // Remote
    [m(undefined, "Groceries are a long drive: shop big, and keep a deep pantry.")],
  ],
  hospital: [
    // Close
    [m(undefined, "An ER nearby; an emergency is a short drive.")],
    // Practical
    [m(undefined, "The ER is within half an hour.")],
    // A haul
    [m(undefined, "An emergency is a long drive: keep the first-aid kit stocked.")],
    // Remote
    [
      m(
        undefined,
        "An ER is an hour or more away; think through who drives, and what you'd do in the first hour.",
      ),
    ],
  ],
  // The owner's wording (#114); each ends with "get a soil evaluation on the spot before an offer".
  septic: [
    // Conventional
    [
      m(
        undefined,
        "A standard gravel drainfield should work, the cheapest kind; a ‘somewhat limited’ rating can mean a larger field. Get a soil evaluation on the spot before an offer.",
      ),
    ],
    // Modified
    [
      m(
        undefined,
        "The soil needs help (slow drainage, slope or rock within a few feet): plan on a low-pressure or shallow-placed system, which costs more than a standard field. Get a soil evaluation on the spot before an offer.",
      ),
    ],
    // Alternative
    [
      m(
        undefined,
        "A high water table, rock near the surface or flooding rules out a standard field: an engineered system (mound, drip or treatment unit) costs much more and usually needs servicing every year. Get a soil evaluation on the spot before an offer.",
      ),
    ],
  ],
  garden: [
    // None
    // Wooded flat ground counts: the search reads the bare-earth lidar and the soil, not tree cover (owner, #128; §9.39).
    [
      m(
        "Garden",
        "No gentle, sunny ground for beds, even after clearing: terraces or raised beds on the slope.",
      ),
    ],
    // Kitchen garden
    [m("Garden", "Room for a kitchen garden: salad, herbs and a few rows.")],
    // Market garden
    [m("Garden", "Room to grow most of your vegetables, with some to share or sell.")],
    // Small farm
    [m("Garden", "Room for a small farm: an orchard, a big garden, maybe livestock.")],
  ],
};

/** The sentences for a scale's band, or none. */
export const meaningsFor = (id: ScaleId, band: number | null): Meaning[] =>
  band === null ? [] : (MEANINGS[id][band] ?? []);
