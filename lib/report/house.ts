/** The existing house section (proto L1500–1505): the house scored like a site, and how it compares. */
import { compass, fmt } from "../format";
import type { PartialScreenResult } from "../screen/types";
import { factorsOf, type RichItem, type SiteCard } from "./facts";
import type { Heading } from "./parts";

export const houseHeading: Heading = {
  title: "The existing house",
  sub: "as sited",
  slug: "the-existing-house",
  help: "h-house",
};

export type HouseView =
  /** The bulls-eye is off the elevation window. */
  { outside: true } | { outside: false; card: SiteCard; comparison: string };

/** Null when no house is marked. */
export function houseView(r: PartialScreenResult): HouseView | null {
  const x = r.house;
  if (!x) return null;
  if ("outside" in x) return { outside: true };
  const items: RichItem[] = [];
  if (x.veto)
    items.push({
      strong: `Bottomland: ${x.veto}.`,
      text: " NRCS would not have put a house here; ask about water in the crawlspace and where the drainfield actually is.",
    });
  if (x.inSFHA)
    items.push({
      strong: "Inside a FEMA flood zone.",
      text: " Flood insurance will be required with a mortgage.",
    });
  items.push(...x.why.map((w) => ({ text: w })));
  items.push({
    text: `Slope at the house ${fmt(x.slopeDeg ?? NaN, 1)}°, faces ${compass(x.aspectDeg ?? NaN)}${
      x.onBench ? `, on a ${fmt(x.benchAcres ?? NaN, 1)}-ac bench` : ", not on a bench the terrain scan found"
    }`,
  });
  const best = r.sites?.[0];
  return {
    outside: false,
    card: {
      marker: { text: "⌖", style: "alt" },
      title: "As sited",
      chips: [
        { text: `${x.qGrade || x.grade} site`, kind: x.qGrade || x.grade },
        { text: `${x.costTier || "—"} to build`, kind: "cost" },
      ],
      summary: `overall ${x.score} · ${fmt(x.elevFt ?? NaN)} ft elevation · ${x.ll[0].toFixed(5)}, ${x.ll[1].toFixed(5)}${x.inside ? "" : " · outside the boundary"}`,
      factors: factorsOf(x.q),
      items,
    },
    comparison: best
      ? best.score > x.score + 8
        ? `The builder left ${best.score - x.score} points on the table: open site #1 scores ${best.score}. Worth seeing whether that spot is usable for a second building or a future rebuild.`
        : best.score < x.score - 3
          ? "The house is on the best ground the parcel has — it out-scores every open bench."
          : `The house sits about as well as the best open site (${best.score}).`
      : "No open bench to compare against.",
  };
}
