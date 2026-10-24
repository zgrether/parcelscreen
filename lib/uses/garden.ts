/**
 * Garden, orchard, animals (step 14 §3.1). Yes: garden ground out of the frost pocket with water (a Spring, Stream or
 * Well mark, or a year-round stream inside), or uses.pastureAc of open gentle ground for animals, with water. Maybe: a
 * garden in the frost pocket or without water, or uses.smallStockAc to pastureAc of open ground ("room for small
 * stock"). No: no garden ground and under smallStockAc open. Pure.
 */
import { SCREEN_CONSTANTS } from "../screen/config";
import type { Fact, UseAnswer, UsesInput } from "./types";
import { GARDEN, MISSING, SOURCE } from "./words";

const K = SCREEN_CONSTANTS.uses;
/** Below the thermal belt's lower edge, cold air pools: the frost scale's Pocket band (config bands.frostAboveFloorFt). */
const POCKET_BELOW_FT = SCREEN_CONSTANTS.bands.frostAboveFloorFt[0]!;

export function garden({ result: r, marks }: UsesInput): UseAnswer {
  const gardens = r.gardens;
  const warm = (gardens ?? []).filter((g) => g.aboveFt >= POCKET_BELOW_FT);
  const best = [...warm].sort((a, b) => b.acres - a.acres)[0] ?? null;
  const largest = [...(gardens ?? [])].sort((a, b) => b.acres - a.acres)[0] ?? null;
  const open = r.cover?.openGentleAc ?? null;
  // Water: what the household marked, then the year-round streams NHD maps inside the parcel.
  const kinds = new Set(marks.map((m) => m.kind));
  const marked = kinds.has("spring") || kinds.has("stream") || kinds.has("well");
  const yearRound = r.streams && r.streams.perennialFt > 0 ? r.streams : null;
  const water = kinds.has("spring")
    ? GARDEN.waterSpring
    : kinds.has("stream")
      ? GARDEN.waterStream
      : kinds.has("well")
        ? GARDEN.waterWell
        : yearRound
          ? GARDEN.waterMapped(yearRound.names)
          : null;
  const waterUnknown = water === null && !r.streams;

  const decides: Fact[] = [
    gardens
      ? { label: GARDEN.gardenLabel, value: largest ? GARDEN.garden(largest.acres) : GARDEN.noGarden }
      : { label: GARDEN.gardenLabel, value: MISSING.terrain },
    ...(largest
      ? [{ label: GARDEN.frostLabel, value: best ? GARDEN.outOfPocket : GARDEN.pocket, source: SOURCE.dem }]
      : []),
    {
      label: GARDEN.waterLabel,
      value: water ?? (waterUnknown ? MISSING.streams : GARDEN.noWaterFound),
      ...(marked ? { source: SOURCE.marks } : r.streams ? { source: SOURCE.nhd } : {}),
    },
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
  if (best && water) {
    const yes = GARDEN.yes(best.acres, water);
    return say("yes", pasture ? `${yes}; ${GARDEN.animals(open)}` : yes);
  }
  if (pasture && water) return say("yes", GARDEN.yesAnimals(open, water));
  if (!largest && open !== null && open < K.smallStockAc) return say("no", GARDEN.none(K.smallStockAc));
  if (best) return say("maybe", waterUnknown ? GARDEN.waterUnknown : GARDEN.noWater);
  if (largest) return say("maybe", GARDEN.pocketOnly);
  if (open === null) return say("maybe", MISSING.cover("open ground"));
  if (pasture) return say("maybe", waterUnknown ? GARDEN.animalsWaterUnknown : GARDEN.animalsNoWater);
  return say("maybe", GARDEN.smallStock(open));
}
