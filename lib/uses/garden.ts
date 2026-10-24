/**
 * Garden, orchard, animals (step 14 §3.1). Yes: garden ground out of the frost pocket, or uses.pastureAc of open gentle
 * ground for animals. Water doesn't decide it (owner, after #312): the reason names where it would come from, a Spring,
 * Stream or Well mark, a year-round stream or a pond mapped on the parcel, else the well. Maybe: a garden in the frost
 * pocket, or uses.smallStockAc to pastureAc of open ground ("room for small stock"). No: no garden ground and under
 * smallStockAc open. Pure.
 */
import { SCREEN_CONSTANTS } from "../screen/config";
import type { Fact, UseAnswer, UsesInput } from "./types";
import { GARDEN, MISSING, SOURCE } from "./words";

const K = SCREEN_CONSTANTS.uses;
/** Below the thermal belt's lower edge, cold air pools: the frost scale's Pocket band (config bands.frostAboveFloorFt). */
const POCKET_BELOW_FT = SCREEN_CONSTANTS.bands.frostAboveFloorFt[0]!;

/** Where the water would come from, and the fact that says so. */
function waterOf({ result: r, marks }: Pick<UsesInput, "result" | "marks">): { says: string; fact: Fact } {
  const kinds = new Set(marks.map((m) => m.kind));
  const mark = kinds.has("spring")
    ? GARDEN.waterSpring
    : kinds.has("stream")
      ? GARDEN.waterStream
      : kinds.has("well")
        ? GARDEN.waterWell
        : null;
  if (mark) return { says: mark, fact: { label: GARDEN.waterLabel, value: mark, source: SOURCE.marks } };
  if (r.streams && r.streams.perennialFt > 0)
    return {
      says: GARDEN.streamOnParcel,
      fact: {
        label: GARDEN.waterLabel,
        value: GARDEN.waterNamed(GARDEN.streamOnParcel, r.streams.names),
        source: SOURCE.nhd,
      },
    };
  if (r.ponds && r.ponds.count > 0)
    return {
      says: GARDEN.pondOnParcel,
      fact: {
        label: GARDEN.waterLabel,
        value: GARDEN.waterNamed(GARDEN.pondOnParcel, r.ponds.names),
        source: SOURCE.nhdPonds,
      },
    };
  const says = r.streams ? GARDEN.fromWell : GARDEN.fromWellNotLoaded;
  return {
    says,
    fact: { label: GARDEN.waterLabel, value: says, ...(r.streams ? { source: SOURCE.nhd } : {}) },
  };
}

export function garden(input: UsesInput): UseAnswer {
  const { result: r } = input;
  const gardens = r.gardens;
  const warm = (gardens ?? []).filter((g) => g.aboveFt >= POCKET_BELOW_FT);
  const best = [...warm].sort((a, b) => b.acres - a.acres)[0] ?? null;
  const largest = [...(gardens ?? [])].sort((a, b) => b.acres - a.acres)[0] ?? null;
  const open = r.cover?.openGentleAc ?? null;
  const water = waterOf(input);

  const decides: Fact[] = [
    gardens
      ? { label: GARDEN.gardenLabel, value: largest ? GARDEN.garden(largest.acres) : GARDEN.noGarden }
      : { label: GARDEN.gardenLabel, value: MISSING.terrain },
    ...(largest
      ? [{ label: GARDEN.frostLabel, value: best ? GARDEN.outOfPocket : GARDEN.pocket, source: SOURCE.dem }]
      : []),
    water.fact,
    open !== null
      ? {
          label: GARDEN.openLabel,
          value: GARDEN.acres(open),
          source: SOURCE.nlcd,
          date: String(r.cover!.year),
        }
      : { label: GARDEN.openLabel, value: MISSING.cover("open ground") },
  ];
  const say = (answer: UseAnswer["answer"], reason: string): UseAnswer => ({ answer, reason, decides });

  if (!gardens) return say("maybe", MISSING.terrain);
  const pasture = open !== null && open >= K.pastureAc;
  if (best) {
    const yes = GARDEN.yes(best.acres, water.says);
    return say("yes", pasture ? `${yes}; ${GARDEN.animals(open)}` : yes);
  }
  if (pasture) return say("yes", GARDEN.yesAnimals(open, water.says));
  if (!largest && open !== null && open < K.smallStockAc) return say("no", GARDEN.none(K.smallStockAc));
  if (largest) return say("maybe", GARDEN.pocketOnly);
  if (open === null) return say("maybe", MISSING.cover("open ground"));
  return say("maybe", GARDEN.smallStock(open));
}
