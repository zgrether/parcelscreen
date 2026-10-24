/**
 * Ride, ski, snowshoe from home (step 14 §3.1). Yes: open public land next door, or a long trail within uses.rideNearMi
 * by road (step 11's drive to it). Maybe: a long trail within uses.rideFarMi, or gentle ground for your own loop (the
 * trail estimate from uses.trailYesMi). No: neither. Every reason ends saying neighbours' corridors are private unless
 * they agree; snow cover isn't measured, and a fact says so. Pure.
 */
import { SCREEN_CONSTANTS } from "../screen/config";
import { LONG_TRAIL_DRIVES } from "../screen/longTrail";
import { adjoiningPublic } from "./common";
import type { Fact, UseAnswer, UsesInput } from "./types";
import { MISSING, RIDE, SOURCE } from "./words";

const K = SCREEN_CONSTANTS.uses;

export function ride({ result: r }: UsesInput): UseAnswer {
  const publicLand = adjoiningPublic(r);
  // As the card's row: the drive didn't answer, so no trail found isn't "none within reach".
  const lt = r.noResponse?.includes(LONG_TRAIL_DRIVES) ? undefined : r.longTrail;
  const loop = r.trails;
  const decides: Fact[] = [
    {
      label: RIDE.publicLabel,
      value: publicLand ?? (publicLand === null ? RIDE.none : MISSING.protected),
      source: SOURCE.padus,
    },
    {
      label: RIDE.longTrailLabel,
      value: lt
        ? RIDE.longTrailValue(lt.trail, lt.point, lt.mi)
        : lt === null
          ? RIDE.noLongTrail
          : MISSING.longTrail,
      ...(lt !== undefined ? { source: SOURCE.drives } : {}),
    },
    {
      label: RIDE.loopLabel,
      value: loop ? RIDE.loopValue(loop.miles) : MISSING.trails,
      source: SOURCE.lidar,
    },
    { label: RIDE.snowLabel, value: RIDE.snow },
  ];
  const say = (answer: UseAnswer["answer"], reason: string): UseAnswer => ({
    answer,
    reason: RIDE.withPrivate(reason),
    decides,
  });

  if (publicLand) return say("yes", RIDE.adjoins(publicLand));
  if (lt && lt.mi <= K.rideNearMi) return say("yes", RIDE.longTrail(lt.trail, lt.point, lt.mi));
  if (lt && lt.mi <= K.rideFarMi) return say("maybe", RIDE.longTrail(lt.trail, lt.point, lt.mi));
  if (loop && loop.miles >= K.trailYesMi) return say("maybe", RIDE.loop(loop.miles));
  // What didn't load could have been the yes: said, rather than a no.
  if (publicLand === undefined) return say("maybe", MISSING.protected);
  if (lt === undefined) return say("maybe", MISSING.longTrail);
  return say("no", RIDE.neither(lt ? lt.mi : null));
}
