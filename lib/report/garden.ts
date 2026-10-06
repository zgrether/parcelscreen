/** Where to garden (proto L1533–1535): the top garden patches, frost position first. */
import { compass, fmt } from "../format";
import { grade } from "../screen/score";
import type { PartialScreenResult } from "../screen/types";
import type { SiteCard } from "./facts";
import type { Heading } from "./parts";

// The prototype's "?" for this section opens the Terrain help (proto L1533).
export const gardenHeading: Heading = {
  title: "Where to garden",
  sub: "frost-safe, sunny, gentle, good dirt",
  slug: "where-to-garden",
  help: "h-terrain",
};

export interface GardenView {
  patches: SiteCard[];
  note: string;
}

/** Null when no garden patch was found. */
export function gardenView(r: PartialScreenResult): GardenView | null {
  if (!r.gardens?.length) return null;
  return {
    patches: r.gardens.slice(0, 3).map((g, i) => {
      const score = g.finalScore ?? g.score;
      return {
        marker: { text: `G${i + 1}`, style: i ? "garden-alt" : "garden-top" },
        title: `${fmt(g.acres, 2)} ac`,
        chips: [{ text: grade(score), kind: grade(score) }],
        summary: `${fmt(score)}/100 · ${fmt(g.elevFt)} ft, ${fmt(g.aboveFt)} ft above the valley floor · faces ${compass(g.aspectDeg)}, ${fmt(g.slopeDeg, 1)}° · ${g.soilNote || ""}${g.soil ? ` (${g.soil})` : ""}`,
        factors: [],
        items: [],
      };
    }),
    note: "Garden score weighs frost position heavily: cold air drains downhill on still clear nights and pools in the low ground, where the last spring frost comes weeks later and the first fall frost weeks earlier. Slope ≤6° and a southern face do the rest; soil drainage and NRCS farmland class adjust the score.",
  };
}
